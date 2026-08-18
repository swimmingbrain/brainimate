import { get, writable } from 'svelte/store';
import type { Paint, TextItem, Vec } from '$lib/core/types';
import { translate } from '$lib/core/mat';
import { makeTextItem } from '$lib/core/items';
import { clonePaint, defaultStyle, paintColor, solid } from '$lib/core/style';
import { DEFAULT_FONT, loadFont } from '$lib/core/fonts';
import { addToast, fillPaint, selection, strokePaint } from '$lib/stores/app';
import { editor } from './editor';

// the text item being typed into, the stage shows the inline editor on it and leaves it out
export const textEditing = writable<string | null>(null);

// what new text starts with, the last text the properties changed sets it
export const textDefaults = writable({ font: DEFAULT_FONT, size: 36, weight: 400, italic: false });

// the fill chip, unless it would vanish on the stage, then the stroke chip, then black
function textFill(): Paint {
  const fill = get(fillPaint);
  if (fill && paintColor(fill) !== editor.doc.bg) return clonePaint(fill)!;
  const stroke = get(strokePaint);
  if (stroke && paintColor(stroke) !== editor.doc.bg) return clonePaint(stroke)!;
  return solid('#000000');
}

// an empty text item at p on the active layer, typing starts right away. width makes box text
export function createText(p: Vec, width: number | null = null): string | null {
  const layer = editor.activeLayer();
  if (!layer || !editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return null;
  }
  const d = get(textDefaults);
  const item = makeTextItem('', d.font, d.size, defaultStyle(textFill(), null), translate(p.x, p.y), width);
  item.weight = d.weight;
  item.italic = d.italic;
  void loadFont(d.font, d.weight, d.italic);
  editor.insertItem(layer.id, item, 'Add text');
  startTextEdit(item.id);
  return item.id;
}

// pasted words become point text, centered on at
export function placeText(text: string, at: Vec): string | null {
  const layer = editor.activeLayer();
  if (!layer || !editor.isEditable(layer)) {
    addToast(editor.lockReason(layer), 'warning');
    return null;
  }
  const d = get(textDefaults);
  const item = makeTextItem(text, d.font, d.size, defaultStyle(textFill(), null), translate(at.x, at.y));
  item.weight = d.weight;
  item.italic = d.italic;
  item.align = 'center';
  item.name = text.trim().split('\n')[0].slice(0, 24) || 'Text';
  void loadFont(d.font, d.weight, d.italic);
  editor.insertItem(layer.id, item, 'Paste text');
  return item.id;
}

export function startTextEdit(id: string): boolean {
  const item = editor.itemById(id, false);
  if (item?.type !== 'text') return false;
  const layer = editor.layerOfItem(id);
  if (!layer || !editor.isEditable(layer) || item.locked) return false;
  selection.set(new Set([id]));
  textEditing.set(id);
  editor.markAll();
  return true;
}

// every change while typing folds into one undo step per text
export function typeText(id: string, text: string) {
  const item = editor.itemById(id, false);
  if (item?.type !== 'text' || item.text === text) return;
  editor.updateItem(
    id,
    (it) => {
      if (it.type === 'text') it.text = text;
    },
    'Type',
    `type-${id}`
  );
}

// text left empty goes away
export function endTextEdit() {
  const id = get(textEditing);
  if (!id) return;
  textEditing.set(null);
  const item = editor.itemById(id, false) as TextItem | null;
  if (item?.type === 'text' && item.text.trim() === '') editor.removeItems([id], 'Remove empty text');
  editor.markAll();
}
