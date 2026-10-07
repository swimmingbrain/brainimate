import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor, historyState, makeDoc } from './editor';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { activeLayer, dirty, docName, frame, selection, stageSize } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';
import { insertKeyframe } from '$lib/anim/timeline';

function rect(x = 0) {
  return makePathItem('Rectangle', rectPath(-10, -10, 20, 20), defaultStyle(), translate(x, 0));
}

describe('editor', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
  });

  it('starts with one layer holding one empty keyframe', () => {
    const layers = editor.doc.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('Layer 1');
    expect(layers[0].keyframes).toHaveLength(1);
    expect(layers[0].length).toBe(1);
  });

  it('says whether a commit changed the document', () => {
    const layer = editor.activeLayer()!;
    expect(editor.commit('Rename', (d) => void (d.layers[0].name = 'Ink'))).toBe(true);
    expect(editor.commit('Rename', (d) => void (d.layers[0].name = 'Ink'))).toBe(false);
    // an equal value in a new object is no change either
    const keys = editor.doc.layers[0].keyframes;
    expect(editor.commit('Same', (d) => void (d.layers[0].keyframes = JSON.parse(JSON.stringify(keys))))).toBe(false);
    expect(editor.undo()).toBe('Rename');
    expect(editor.layerById(layer.id)!.name).toBe('Layer 1');
  });

  it('inserts an item, selects it and undoes it', () => {
    const layer = editor.activeLayer()!;
    const item = rect();
    editor.insertItem(layer.id, item);
    expect(editor.layerItems(editor.doc.layers[0])).toHaveLength(1);
    expect(get(selection).has(item.id)).toBe(true);
    editor.undo();
    expect(editor.layerItems(editor.doc.layers[0])).toHaveLength(0);
    expect(get(selection).size).toBe(0);
    editor.redo();
    expect(editor.itemById(item.id)).not.toBeNull();
  });

  it('adds a keyframe first when auto key is on and the frame is not one', () => {
    const layer = editor.activeLayer()!;
    const item = rect();
    editor.insertItem(layer.id, item);
    frame.set(5);
    editor.insertItem(layer.id, rect(50));
    const after = editor.doc.layers[0];
    expect(after.keyframes.map((k) => k.frame)).toEqual([0, 5]);
    expect(after.keyframes[0].items).toHaveLength(1);
    expect(after.keyframes[1].items).toHaveLength(2);
    expect(after.length).toBe(6);
    editor.undo();
    expect(editor.doc.layers[0].keyframes).toHaveLength(1);
    frame.set(0);
  });

  it('updates and removes items at the current frame', () => {
    const layer = editor.activeLayer()!;
    const item = rect();
    editor.insertItem(layer.id, item);
    editor.updateItem(item.id, (it) => (it.opacity = 0.5), 'Opacity');
    expect(editor.itemById(item.id)!.opacity).toBe(0.5);
    editor.removeItems([item.id]);
    expect(editor.itemById(item.id)).toBeNull();
    editor.undo();
    editor.undo();
    expect(editor.itemById(item.id)!.opacity).toBe(1);
  });

  it('commits the preview as one step', () => {
    const layer = editor.activeLayer()!;
    const item = rect();
    editor.insertItem(layer.id, item);
    const moved = { ...item, transform: translate(40, 30) };
    editor.preview.set(item.id, moved);
    expect(editor.worldMatrixOf(item.id)[4]).toBe(40);
    expect(editor.itemById(item.id, false)!.transform[4]).toBe(0);
    editor.commitPreview('Move');
    expect(editor.preview.size).toBe(0);
    expect(editor.itemById(item.id)!.transform[4]).toBe(40);
    expect(editor.history.undoLabel).toBe('Move');
  });

  it('measures the selection in world space', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [rect(0), rect(100)], 'Add');
    const b = editor.selectionBounds();
    expect(b).toEqual({ minX: -10, minY: -10, maxX: 110, maxY: 10 });
  });
});

describe('editing a tween', () => {
  // a rect going from x 0 on frame 0 to x 100 on frame 10
  function tween(): string {
    const layer = editor.activeLayer()!;
    const item = rect(0);
    editor.insertItem(layer.id, item);
    editor.commit('Keyframe', (d) => {
      insertKeyframe(d.layers[0], 10);
    });
    frame.set(10);
    editor.updateItem(item.id, (it) => (it.transform = translate(100, 0)), 'Move');
    editor.commit('Tween', (d) => {
      d.layers[0].keyframes[0].tween = { ease: 'linear' };
    });
    frame.set(5);
    return item.id;
  }

  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
  });

  it('shows the in between state', () => {
    const id = tween();
    expect(editor.itemById(id)!.transform[4]).toBeCloseTo(50);
  });

  it('keys the in between state first with auto key on', () => {
    const id = tween();
    editor.updateItem(id, (it) => (it.opacity = 0.5), 'Opacity');
    const keys = editor.doc.layers[0].keyframes;
    expect(keys.map((k) => k.frame)).toEqual([0, 5, 10]);
    expect(keys[1].items[0].transform[4]).toBeCloseTo(50);
    expect(keys[1].items[0].opacity).toBe(0.5);
    expect(keys[1].tween?.ease).toBe('linear');
    frame.set(0);
  });

  it('moves the keyframe the tween starts from with auto key off', () => {
    const id = tween();
    setGroup('timeline', { autoKey: false });
    const shown = editor.itemById(id)!;
    editor.preview.set(id, { ...shown, transform: translate(60, 20) });
    editor.commitPreview('Move');
    const keys = editor.doc.layers[0].keyframes;
    expect(keys.map((k) => k.frame)).toEqual([0, 10]);
    expect(keys[0].items[0].transform[4]).toBeCloseTo(10);
    expect(keys[0].items[0].transform[5]).toBeCloseTo(20);
    expect(keys[1].items[0].transform[4]).toBeCloseTo(100);
    setGroup('timeline', { autoKey: true });
    frame.set(0);
  });
});

describe('loading a document', () => {
  it('takes over the document, clears the history and the dirty flag', () => {
    editor.newDoc(800, 600, 24);
    editor.insertItem(editor.activeLayer()!.id, rect());
    const doc = makeDoc(320, 240, 12);
    doc.name = 'Loaded';
    editor.loadDoc(doc);
    expect(editor.doc).toBe(doc);
    expect(get(historyState).canUndo).toBe(false);
    expect(get(dirty)).toBe(false);
    expect(get(activeLayer)).toBe(doc.layers[0].id);
    expect(get(stageSize)).toEqual({ width: 320, height: 240, background: '#ffffff' });
  });

  it('gives a document without layers one to draw on', () => {
    const doc = makeDoc(320, 240, 12);
    doc.layers = [];
    editor.loadDoc(doc);
    expect(editor.doc.layers).toHaveLength(1);
  });

  it('renames without an undo step', () => {
    editor.newDoc(800, 600, 24);
    editor.setName('Walk');
    expect(editor.doc.name).toBe('Walk');
    expect(get(docName)).toBe('Walk');
    expect(get(historyState).canUndo).toBe(false);
  });
});
