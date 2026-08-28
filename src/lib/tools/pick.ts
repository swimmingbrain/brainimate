import { get } from 'svelte/store';
import type { Item, Mat, Vec } from '$lib/core/types';
import { identity, multiply } from '$lib/core/mat';
import { hitItem, hitTest } from '$lib/core/hit';
import { intersects, type Box } from '$lib/core/bbox';
import { itemBounds } from '$lib/core/items';
import { editor } from '$lib/editor/editor';
import { selection } from '$lib/stores/app';

// hits are tested on the items as they show, bound ones bent by the rig, the tools get the document item
function rest(item: Item | null): Item | null {
  return item ? (editor.itemById(item.id, false) ?? item) : null;
}

// the topmost item under p on the layers that can be edited, a group counts as one item
export function pickItem(p: Vec, zoom: number, factor: number): Item | null {
  const layers = editor.currentLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!editor.isEditable(layer)) continue;
    const hit = hitTest(editor.shownItems(layer), identity(), p, zoom, factor);
    if (hit) return rest(hit);
  }
  return null;
}

// top level items whose bounds touch the box, like a marquee in intersect mode
export function itemsInBox(box: Box): string[] {
  const ids: string[] = [];
  for (const layer of editor.currentLayers()) {
    if (!editor.isEditable(layer)) continue;
    for (const item of editor.shownItems(layer)) {
      if (item.locked || !item.visible) continue;
      if (intersects(box, itemBounds(item, item.transform))) ids.push(item.id);
    }
  }
  return ids;
}

function deepHit(items: Item[], parent: Mat, p: Vec, zoom: number, factor: number): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.locked || !item.visible) continue;
    const m = multiply(parent, item.transform);
    if (item.type === 'group') {
      const inner = deepHit(item.children, m, p, zoom, factor);
      if (inner) return inner;
    } else if (hitItem(item, m, p, zoom, factor)) {
      return item;
    }
  }
  return null;
}

// the topmost item under p inside any group, the direct selection reaches into groups
export function pickDeep(p: Vec, zoom: number, factor: number): Item | null {
  const layers = editor.currentLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!editor.isEditable(layer)) continue;
    const hit = deepHit(editor.shownItems(layer), identity(), p, zoom, factor);
    if (hit) return rest(hit);
  }
  return null;
}

// the items under p from the top level one down through its groups to the innermost
export function pickChain(p: Vec, zoom: number, factor: number): Item[] {
  const top = pickItem(p, zoom, factor);
  if (!top) return [];
  const chain = [top];
  let current: Item = editor.shownItem(top.id) ?? top;
  let m = editor.shownWorld(top.id);
  while (current.type === 'group') {
    const child = hitTest(current.children, m, p, zoom, factor);
    if (!child) break;
    chain.push(rest(child) ?? child);
    m = multiply(m, child.transform);
    current = child;
  }
  return chain;
}

// a group counts as one item, until a double click entered it: then its children are picked one by one
export function pickForSelect(p: Vec, zoom: number, factor: number): Item | null {
  const chain = pickChain(p, zoom, factor);
  if (chain.length === 0) return null;
  const sel = get(selection);
  for (let i = chain.length - 1; i >= 0; i--) if (sel.has(chain[i].id)) return chain[i];
  for (let i = chain.length - 2; i >= 0; i--) {
    const g = chain[i];
    if (g.type === 'group' && g.children.some((c) => sel.has(c.id))) return chain[i + 1];
  }
  return chain[0];
}
