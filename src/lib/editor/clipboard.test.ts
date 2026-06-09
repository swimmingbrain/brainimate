import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { copy, cut, duplicate, paste, pasteInPlace } from './clipboard';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { selection } from '$lib/stores/app';

function items() {
  return editor.layerItems(editor.doc.layers[0]);
}

describe('clipboard', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    const item = makePathItem('Rectangle', rectPath(-5, -5, 10, 10), defaultStyle(), translate(100, 100));
    editor.insertItem(editor.activeLayer()!.id, item);
  });

  it('pastes copies with new ids, each one a bit further off', () => {
    const original = items()[0];
    copy();
    paste();
    paste();
    const all = items();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((it) => it.id)).size).toBe(3);
    expect(all[1].transform[4]).toBe(110);
    expect(all[2].transform[4]).toBe(120);
    expect(get(selection).has(all[2].id)).toBe(true);
    expect(get(selection).has(original.id)).toBe(false);
  });

  it('pastes in place and duplicates with an offset', () => {
    copy();
    pasteInPlace();
    expect(items()[1].transform[4]).toBe(100);
    duplicate();
    expect(items()).toHaveLength(3);
    expect(items()[2].transform[4]).toBe(110);
  });

  it('cuts as one undo step', () => {
    cut();
    expect(items()).toHaveLength(0);
    editor.undo();
    expect(items()).toHaveLength(1);
  });
});
