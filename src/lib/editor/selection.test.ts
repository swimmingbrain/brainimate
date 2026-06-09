import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { deleteSelection, frameHandles, nudge, selectAll, selectionFrame, toggleSelect } from './selection';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { multiply, rotate, translate } from '$lib/core/mat';
import { selection } from '$lib/stores/app';

describe('selection', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    const layer = editor.activeLayer()!.id;
    const a = makePathItem('Rectangle', rectPath(-10, -5, 20, 10), defaultStyle(), translate(50, 50));
    const b = makePathItem('Rectangle', rectPath(-10, -5, 20, 10), defaultStyle(), multiply(translate(200, 50), rotate(Math.PI / 2)));
    editor.insertItems(layer, [a, b], 'Add');
  });

  it('keeps the rotation of a single item in the handle box', () => {
    const [, b] = editor.layerItems(editor.doc.layers[0]);
    selection.set(new Set([b.id]));
    const f = selectionFrame()!;
    expect(f.w).toBeCloseTo(20);
    expect(f.h).toBeCloseTo(10);
    const nw = frameHandles(f)[0];
    expect(nw.x).toBeCloseTo(205);
    expect(nw.y).toBeCloseTo(40);
  });

  it('boxes several items along the axes', () => {
    selectAll();
    const f = selectionFrame()!;
    expect(f.w).toBeCloseTo(165);
    expect(f.h).toBeCloseTo(20);
  });

  it('nudges, toggles and deletes', () => {
    selectAll();
    nudge(5, 0);
    nudge(5, 0);
    expect(editor.history.length).toBe(2);
    const [a] = editor.layerItems(editor.doc.layers[0]);
    expect(a.transform[4]).toBe(60);
    toggleSelect(a.id);
    expect(get(selection).has(a.id)).toBe(false);
    deleteSelection();
    expect(editor.layerItems(editor.doc.layers[0])).toHaveLength(1);
  });
});
