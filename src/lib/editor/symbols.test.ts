import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { InstanceItem } from '$lib/core/types';
import { editor } from './editor';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { frame, selection } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';
import { breakApart, groupSelection } from './commands';
import { convertToSymbol, editInstance, placeInstance } from './symbols';
import { select } from './selection';

// a 20 by 20 square around (x, y)
function square(x: number, y: number) {
  return makePathItem('Rectangle', rectPath(-10, -10, 20, 20), defaultStyle(), translate(x, y));
}

function stageItems() {
  return editor.layerItems(editor.currentLayers()[0]);
}

describe('convert to symbol', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
    frame.set(0);
  });

  it('moves the selection into a symbol around its middle and leaves an instance there', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100), square(200, 140)], 'Add');
    const before = editor.selectionBounds();
    const id = convertToSymbol('Ball', 'center')!;
    const symbol = editor.doc.symbols[id];
    expect(symbol.name).toBe('Ball');
    expect(symbol.kind).toBe('graphic');
    expect(symbol.layers).toHaveLength(1);
    const content = symbol.layers[0].keyframes[0].items;
    expect(content.map((it) => [it.transform[4], it.transform[5]])).toEqual([
      [-50, -20],
      [50, 20]
    ]);
    const items = stageItems();
    expect(items).toHaveLength(1);
    const instance = items[0] as InstanceItem;
    expect(instance.type).toBe('instance');
    expect(instance.symbol).toBe(id);
    expect([instance.transform[4], instance.transform[5]]).toEqual([150, 120]);
    expect(get(selection)).toEqual(new Set([instance.id]));
    expect(editor.selectionBounds()).toEqual(before);
  });

  it('puts the origin on the top left corner when asked', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100)], 'Add');
    const id = convertToSymbol('Box', 'topleft')!;
    const content = editor.doc.symbols[id].layers[0].keyframes[0].items;
    expect([content[0].transform[4], content[0].transform[5]]).toEqual([10, 10]);
    const instance = stageItems()[0];
    expect([instance.transform[4], instance.transform[5]]).toEqual([90, 90]);
  });

  it('gives the symbol items new ids and undoes in one step', () => {
    const layer = editor.activeLayer()!;
    const a = square(0, 0);
    editor.insertItems(layer.id, [a], 'Add');
    const id = convertToSymbol('A', 'center')!;
    expect(editor.doc.symbols[id].layers[0].keyframes[0].items[0].id).not.toBe(a.id);
    editor.undo();
    expect(editor.doc.symbols[id]).toBeUndefined();
    expect(stageItems().map((it) => it.id)).toEqual([a.id]);
  });

  it('keeps the place of an item inside a group', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100), square(300, 100)], 'Add');
    groupSelection();
    const group = stageItems()[0];
    editor.updateItem(group.id, (g) => (g.transform = translate(50, 0)), 'Move');
    const inner = group.type === 'group' ? group.children[1].id : '';
    select([inner]);
    const before = editor.selectionBounds();
    convertToSymbol('Inner', 'center');
    expect(editor.selectionBounds()).toEqual(before);
    const g = stageItems()[0];
    expect(g.type === 'group' && g.children[1].type).toBe('instance');
  });

  it('breaks an instance back into paths where they were', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100), square(200, 140)], 'Add');
    const before = editor.selectionBounds();
    convertToSymbol('Ball', 'center');
    breakApart();
    const items = stageItems();
    expect(items.map((it) => it.type)).toEqual(['path', 'path']);
    expect(editor.selectionBounds()).toEqual(before);
  });
});

describe('editing in place', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
    frame.set(0);
  });

  it('works on the symbol layers and changes every instance', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100)], 'Add');
    const id = convertToSymbol('Ball', 'center')!;
    const first = stageItems()[0].id;
    const second = placeInstance(id, { x: 400, y: 300 })!;
    expect(editInstance(first)).toBe(true);
    expect(editor.currentLayers()).toBe(editor.doc.symbols[id].layers);
    expect(editor.base()).toEqual(translate(100, 100));
    editor.insertItems(editor.activeLayer()!.id, [square(30, 0)], 'Add');
    expect(editor.doc.symbols[id].layers[0].keyframes[0].items).toHaveLength(2);
    editor.exitSymbol();
    expect(editor.currentLayers()).toBe(editor.doc.layers);
    expect(get(selection)).toEqual(new Set([first]));
    // both instances grew to the right by the new square
    expect(editor.itemWorldBounds(first).maxX).toBe(140);
    expect(editor.itemWorldBounds(second).maxX).toBe(440);
  });

  it('refuses an instance of the open symbol inside itself', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100)], 'Add');
    const id = convertToSymbol('Ball', 'center')!;
    editInstance(stageItems()[0].id);
    expect(placeInstance(id, { x: 0, y: 0 })).toBeNull();
    editor.exitSymbol();
  });

  it('closes the symbol when an undo takes it away', () => {
    const layer = editor.activeLayer()!;
    editor.insertItems(layer.id, [square(100, 100)], 'Add');
    convertToSymbol('Ball', 'center');
    editInstance(stageItems()[0].id);
    editor.undo();
    expect(editor.editStack).toHaveLength(0);
    expect(editor.currentLayers()).toBe(editor.doc.layers);
  });
});
