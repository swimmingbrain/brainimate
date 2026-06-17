import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { arrangeSelection, groupSelection, reorder, ungroupSelection } from './commands';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { selection } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';

function rect(name: string, x = 0) {
  return makePathItem(name, rectPath(-10, -10, 20, 20), defaultStyle(), translate(x, 0));
}

function names(): string[] {
  return editor.layerItems(editor.doc.layers[0]).map((it) => it.name);
}

describe('group and arrange', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
  });

  it('groups the selection where the top item was and ungroups it again', () => {
    const layer = editor.activeLayer()!;
    const [a, b, c, d] = [rect('a'), rect('b', 50), rect('c', 100), rect('d', 150)];
    editor.insertItems(layer.id, [a, b, c, d], 'Add');
    selection.set(new Set([a.id, c.id]));
    groupSelection();
    expect(names()).toEqual(['b', 'Group', 'd']);
    const group = editor.layerItems(editor.doc.layers[0])[1];
    expect(group.type === 'group' && group.children.map((it) => it.name)).toEqual(['a', 'c']);
    expect(get(selection).has(group.id)).toBe(true);

    editor.updateItem(group.id, (g) => (g.transform = translate(5, 5)), 'Move');
    ungroupSelection();
    expect(names()).toEqual(['b', 'a', 'c', 'd']);
    const c2 = editor.itemById(c.id)!;
    expect(c2.transform[4]).toBe(105);
    expect(c2.transform[5]).toBe(5);
    expect(get(selection).size).toBe(2);
    editor.undo();
    editor.undo();
    editor.undo();
    expect(names()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reorders picked items within their list', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    reorder(list, new Set(['b']), 'forward');
    expect(list.map((it) => it.id).join('')).toBe('acbd');
    reorder(list, new Set(['b', 'a']), 'front');
    expect(list.map((it) => it.id).join('')).toBe('cdab');
    reorder(list, new Set(['b']), 'back');
    expect(list.map((it) => it.id).join('')).toBe('bcda');
    reorder(list, new Set(['d']), 'backward');
    expect(list.map((it) => it.id).join('')).toBe('bdca');
  });

  it('arranges the selected items in one undo step', () => {
    const layer = editor.activeLayer()!;
    const [a, b, c] = [rect('a'), rect('b'), rect('c')];
    editor.insertItems(layer.id, [a, b, c], 'Add');
    selection.set(new Set([a.id]));
    arrangeSelection('front');
    expect(names()).toEqual(['b', 'c', 'a']);
    arrangeSelection('backward');
    expect(names()).toEqual(['b', 'a', 'c']);
    editor.undo();
    expect(names()).toEqual(['b', 'c', 'a']);
  });
});
