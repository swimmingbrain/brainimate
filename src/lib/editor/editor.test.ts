import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { frame, selection } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';

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
