import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import {
  copySelectedFrames,
  createTween,
  insertBlankKeyframes,
  insertFrames,
  insertKeyframes,
  moveSelectedKeyframes,
  pasteSelectedFrames,
  removeFrames,
  removeTween
} from './commands';
import { addFolder, addLayer, addRigLayer, deleteLayer, duplicateLayer, moveLayerTo } from './layers';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { itemsAt } from '$lib/render/frame';
import { activeLayer, dialog, frame, frameClipboard, frameSelection } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';

function rect(x = 0) {
  return makePathItem('Rectangle', rectPath(-10, -10, 20, 20), defaultStyle(), translate(x, 0));
}

function first() {
  return editor.doc.layers[0];
}

function frames() {
  return first().keyframes.map((k) => k.frame);
}

describe('frame commands', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
    frameSelection.set(null);
    frameClipboard.set(null);
    frame.set(0);
  });

  it('keys the playhead and goes on to the next frame on a keyframe', () => {
    editor.insertItem(first().id, rect());
    frame.set(11);
    insertKeyframes();
    expect(frames()).toEqual([0, 11]);
    expect(first().length).toBe(12);
    insertKeyframes();
    expect(frames()).toEqual([0, 11, 12]);
    expect(get(frame)).toBe(12);
    insertBlankKeyframes();
    expect(frames()).toEqual([0, 11, 12, 13]);
    expect(first().keyframes[3].items).toHaveLength(0);
  });

  it('inserts and removes as many frames as are picked, in one undo step each', () => {
    const id = first().id;
    frame.set(9);
    insertFrames();
    expect(first().length).toBe(10);
    frameSelection.set({ layers: [id], from: 2, to: 4 });
    insertFrames();
    expect(first().length).toBe(13);
    removeFrames();
    expect(first().length).toBe(10);
    editor.undo();
    expect(first().length).toBe(13);
  });

  it('tweens the picked span and removes the tween again', () => {
    const item = rect(0);
    editor.insertItem(first().id, item);
    frame.set(10);
    insertKeyframes();
    editor.updateItem(item.id, (it) => (it.transform = translate(100, 0)), 'Move');
    frameSelection.set({ layers: [first().id], from: 3, to: 3 });
    createTween();
    expect(first().keyframes[0].tween?.ease).toBe('linear');
    expect(itemsAt(first(), 5)[0].transform[4]).toBeCloseTo(50);
    removeTween();
    expect(first().keyframes[0].tween).toBeNull();
  });

  it('copies frames to another layer with new ids', () => {
    const item = rect(0);
    editor.insertItem(first().id, item);
    frame.set(4);
    insertKeyframes();
    frameSelection.set({ layers: [first().id], from: 0, to: 5 });
    copySelectedFrames();
    addLayer();
    const other = get(activeLayer)!;
    frameSelection.set({ layers: [other], from: 10, to: 10 });
    pasteSelectedFrames();
    const pasted = editor.doc.layers.find((l) => l.id === other)!;
    expect(pasted.keyframes.map((k) => k.frame)).toEqual([0, 10, 14]);
    // the copied layer ended at frame 5, so the paste does too
    expect(pasted.length).toBe(15);
    expect(pasted.keyframes[1].items[0].id).not.toBe(item.id);
    expect(get(frameSelection)).toEqual({ layers: [other], from: 10, to: 15 });
  });

  it('drags keyframes along and leaves copies with alt', () => {
    editor.insertItem(first().id, rect());
    frame.set(5);
    insertKeyframes();
    frameSelection.set({ layers: [first().id], from: 5, to: 5 });
    moveSelectedKeyframes(3, false);
    expect(frames()).toEqual([0, 8]);
    expect(get(frameSelection)?.from).toBe(8);
    moveSelectedKeyframes(4, true);
    expect(frames()).toEqual([0, 8, 12]);
  });
});

describe('layer commands', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    frame.set(0);
  });

  it('adds folders and rig layers above the active layer', () => {
    addFolder();
    addRigLayer();
    expect(editor.doc.layers.map((l) => l.type)).toEqual(['normal', 'folder', 'rig']);
    expect(editor.doc.layers[1].name).toBe('Folder 1');
    expect(editor.doc.layers[2].bones).toEqual([]);
  });

  it('moves a layer into a folder and deletes the folder with it', () => {
    const layer = first().id;
    addLayer();
    addFolder();
    const folder = get(activeLayer)!;
    moveLayerTo(layer, folder, 'into');
    expect(editor.doc.layers.find((l) => l.id === layer)?.parent).toBe(folder);
    deleteLayer(folder);
    // a folder with layers asks first
    const asked = get(dialog);
    expect(asked?.kind).toBe('confirm');
    expect(editor.doc.layers).toHaveLength(3);
    if (asked?.kind === 'confirm') asked.onconfirm();
    dialog.set(null);
    expect(editor.doc.layers).toHaveLength(1);
    editor.undo();
    expect(editor.doc.layers).toHaveLength(3);
  });

  it('asks before a layer goes when the preferences say so', () => {
    addLayer();
    const id = get(activeLayer)!;
    setGroup('general', { confirmDelete: true });
    deleteLayer(id);
    expect(get(dialog)?.kind).toBe('confirm');
    expect(editor.doc.layers).toHaveLength(2);
    dialog.set(null);
    setGroup('general', { confirmDelete: false });
    deleteLayer(id);
    expect(get(dialog)).toBeNull();
    expect(editor.doc.layers).toHaveLength(1);
    setGroup('general', { confirmDelete: true });
  });

  it('keeps the last drawing layer', () => {
    addFolder();
    deleteLayer(first().id);
    expect(editor.doc.layers).toHaveLength(2);
  });

  it('duplicates a layer with new item ids that still match across keyframes', () => {
    const item = rect();
    editor.insertItem(first().id, item);
    frame.set(3);
    insertKeyframes();
    duplicateLayer(first().id);
    const copy = editor.doc.layers[1];
    expect(copy.name).toBe('Layer 1 copy');
    const ids = copy.keyframes.map((k) => k.items[0].id);
    expect(ids[0]).not.toBe(item.id);
    expect(ids[0]).toBe(ids[1]);
  });
});
