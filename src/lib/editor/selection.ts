import { get } from 'svelte/store';
import type { Item, Mat, Vec } from '$lib/core/types';
import { applyPoint, invert, multiply, translate } from '$lib/core/mat';
import { boxHeight, boxWidth, isEmpty } from '$lib/core/bbox';
import { cloneItem, localBounds } from '$lib/core/items';
import { activeLayer, selection } from '$lib/stores/app';
import { editor } from './editor';

export function select(ids: string[]) {
  selection.set(new Set(ids));
  const last = ids[ids.length - 1];
  const layer = last ? editor.layerOfItem(last) : null;
  if (layer) activeLayer.set(layer.id);
}

export function toggleSelect(id: string) {
  const next = new Set(get(selection));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selection.set(next);
  const layer = editor.layerOfItem(id);
  if (layer && next.has(id)) activeLayer.set(layer.id);
}

export function addToSelection(ids: string[]) {
  selection.set(new Set([...get(selection), ...ids]));
}

export function clearSelection() {
  if (get(selection).size > 0) selection.set(new Set());
}

export function isSelected(id: string): boolean {
  return get(selection).has(id);
}

// every unlocked item on the visible, unlocked layers at this frame
export function selectAll() {
  const ids: string[] = [];
  for (const layer of editor.currentLayers()) {
    if (!editor.isEditable(layer)) continue;
    for (const item of editor.layerItems(layer)) if (!item.locked && item.visible) ids.push(item.id);
  }
  selection.set(new Set(ids));
}

// the box the handles sit on: m maps (0..w, 0..h) to world. one item keeps its own rotation,
// several items get the plain box around all of them
export interface SelectionFrame {
  m: Mat;
  w: number;
  h: number;
}

export function selectionFrame(): SelectionFrame | null {
  const ids = [...get(selection)];
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    const item = editor.itemById(ids[0]);
    if (!item) return null;
    const b = localBounds(item);
    if (isEmpty(b)) return null;
    return { m: multiply(editor.worldMatrixOf(ids[0]), translate(b.minX, b.minY)), w: boxWidth(b), h: boxHeight(b) };
  }
  const b = editor.selectionBounds();
  if (isEmpty(b)) return null;
  return { m: translate(b.minX, b.minY), w: boxWidth(b), h: boxHeight(b) };
}

// in box units, clockwise from the top left: nw, n, ne, e, se, s, sw, w
export const HANDLE_UNITS: Vec[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 0.5 },
  { x: 1, y: 1 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0.5 }
];

export function framePoint(f: SelectionFrame, u: Vec): Vec {
  return applyPoint(f.m, { x: u.x * f.w, y: u.y * f.h });
}

export function frameHandles(f: SelectionFrame): Vec[] {
  return HANDLE_UNITS.map((u) => framePoint(f, u));
}

// copies of the selected items with the world matrix m applied on top, for the preview
export function transformedSelection(m: Mat, base: Map<string, Item>): Map<string, Item> {
  const out = new Map<string, Item>();
  for (const [id, item] of base) {
    const parent = editor.parentMatrixOf(id);
    const copy = cloneItem(item);
    copy.transform = multiply(invert(parent), multiply(m, multiply(parent, item.transform)));
    out.set(id, copy);
  }
  return out;
}

// the selected items as they are in the document, the start of every drag
export function selectionSnapshot(): Map<string, Item> {
  const out = new Map<string, Item>();
  for (const item of editor.selectedItems(false)) out.set(item.id, item);
  return out;
}

export function transformSelection(m: Mat, label: string, key?: string) {
  const moved = transformedSelection(m, selectionSnapshot());
  if (moved.size === 0) return;
  editor.updateItems(
    [...moved.keys()],
    (item) => {
      item.transform = moved.get(item.id)!.transform;
    },
    label,
    key
  );
}

// each item moves by its own world offset, all in one undo step
export function translateItems(moves: Map<string, Vec>, label: string, key?: string) {
  if (moves.size === 0) return;
  const next = new Map<string, Mat>();
  for (const [id, d] of moves) {
    const item = editor.itemById(id, false);
    if (!item) continue;
    const parent = editor.parentMatrixOf(id);
    next.set(id, multiply(invert(parent), multiply(translate(d.x, d.y), multiply(parent, item.transform))));
  }
  editor.updateItems(
    [...next.keys()],
    (item) => {
      item.transform = next.get(item.id)!;
    },
    label,
    key
  );
}

export function nudge(dx: number, dy: number) {
  transformSelection(translate(dx, dy), 'Nudge', 'nudge');
}

export function deleteSelection() {
  const ids = editor.selectedItems(false).map((it) => it.id);
  editor.removeItems(ids, 'Delete');
}
