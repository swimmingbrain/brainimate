import { get, writable } from 'svelte/store';
import type { Item } from '$lib/core/types';
import { cloneItem, withNewIds } from '$lib/core/items';
import { multiply, translate } from '$lib/core/mat';
import { addToast } from '$lib/stores/app';
import { editor } from './editor';

// copies only live in this tab, other apps could not read our items anyway
let entries: Item[] = [];
// each paste lands a little further off, so stacked pastes stay visible
let pasteCount = 0;

const OFFSET = 10;

export const hasClipboard = writable(false);

export function copy(): number {
  const items = editor.selectedItems(false);
  if (items.length === 0) return 0;
  // a child inside a group goes out with its group transforms baked in
  entries = items.map((item) => {
    const c = cloneItem(item);
    c.transform = multiply(editor.parentMatrixOf(item.id), item.transform);
    return c;
  });
  pasteCount = 0;
  hasClipboard.set(true);
  return entries.length;
}

export function cut() {
  const ids = editor.selectedItems(false).map((it) => it.id);
  if (copy() > 0) editor.removeItems(ids, 'Cut');
}

function placeCopies(items: Item[], offset: number, label: string) {
  const layer = editor.activeLayer();
  if (!layer) return;
  if (!editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return;
  }
  const copies = items.map((item) => {
    const c = withNewIds(item);
    c.transform = multiply(translate(offset, offset), c.transform);
    return c;
  });
  editor.insertItems(layer.id, copies, label);
}

export function paste() {
  if (entries.length === 0) return;
  pasteCount++;
  placeCopies(entries, OFFSET * pasteCount, 'Paste');
}

export function pasteInPlace() {
  if (entries.length === 0) return;
  placeCopies(entries, 0, 'Paste in place');
}

export function duplicate() {
  const items = editor.selectedItems(false).map((item) => {
    const c = cloneItem(item);
    c.transform = multiply(editor.parentMatrixOf(item.id), item.transform);
    return c;
  });
  if (items.length > 0) placeCopies(items, OFFSET, 'Duplicate');
}

export function clipboardSize(): number {
  return get(hasClipboard) ? entries.length : 0;
}
