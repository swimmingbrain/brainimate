import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { createText, endTextEdit, placeText, textEditing, typeText } from './text';
import { selection } from '$lib/stores/app';

function texts() {
  return editor.layerItems(editor.doc.layers[0]).filter((it) => it.type === 'text');
}

describe('typing text', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    textEditing.set(null);
  });

  it('starts typing into new point text and folds the typing into one undo step', () => {
    const id = createText({ x: 10, y: 20 })!;
    expect(get(textEditing)).toBe(id);
    expect(get(selection)).toEqual(new Set([id]));
    typeText(id, 'H');
    typeText(id, 'Hi');
    expect(texts()[0].type === 'text' && texts()[0].text).toBe('Hi');
    expect(texts()[0].transform.slice(4)).toEqual([10, 20]);
    editor.undo();
    expect(texts()[0].type === 'text' && texts()[0].text).toBe('');
    endTextEdit();
  });

  it('makes box text with a width', () => {
    const id = createText({ x: 0, y: 0 }, 120)!;
    const item = editor.itemById(id);
    expect(item?.type === 'text' && item.width).toBe(120);
    endTextEdit();
  });

  it('takes text left empty away when typing ends', () => {
    createText({ x: 0, y: 0 });
    endTextEdit();
    expect(get(textEditing)).toBeNull();
    expect(texts()).toHaveLength(0);
  });

  it('places pasted words as centered point text', () => {
    placeText('two words', { x: 400, y: 300 });
    const item = texts()[0];
    expect(item.type === 'text' && [item.text, item.align, item.width]).toEqual(['two words', 'center', null]);
    expect(item.name).toBe('two words');
  });
});
