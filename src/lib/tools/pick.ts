import { get } from 'svelte/store';
import type { Item, Layer, Mat, Vec } from '$lib/core/types';
import { identity, multiply, scaleFactor } from '$lib/core/mat';
import { STROKE_TOLERANCE, hitInside, hitItem, hitTest } from '$lib/core/hit';
import { expand, intersects, type Box } from '$lib/core/bbox';
import { itemBounds } from '$lib/core/items';
import { buildGrid, queryGrid, type SpatialGrid } from '$lib/core/grid';
import { MAX_NESTING, instanceSlices, stageOffset } from '$lib/render/frame';
import type { Rig } from '$lib/rig/bones';
import { editor } from '$lib/editor/editor';
import { selection } from '$lib/stores/app';

// how far past its bounds an item still counts as hit: half its stroke and more, the letters of a text
function reach(item: Item, depth = 0): number {
  const s = scaleFactor(item.transform);
  switch (item.type) {
    case 'path':
      return item.style.stroke ? item.style.width * (item.style.scaleStroke ? s : 1) : 0;
    case 'text':
      return item.size * 0.3 * s;
    case 'group': {
      let r = 0;
      for (const child of item.children) r = Math.max(r, reach(child, depth));
      return r * Math.max(1, s);
    }
    case 'instance': {
      if (depth >= MAX_NESTING) return 0;
      let r = 0;
      for (const slice of instanceSlices(item, stageOffset(item.id))) {
        for (const child of slice.items) r = Math.max(r, reach(child, depth + 1));
      }
      return r * Math.max(1, s);
    }
    default:
      return 0;
  }
}

interface LayerIndex {
  rig: Rig | null;
  items: Item[];
  grid: SpatialGrid;
}

// the boxes of what a layer shows, keyed by its items at the frame: an edit or another frame brings a
// new list and the grid is made again, a hover only asks it
const indexes = new WeakMap<Item[], LayerIndex>();

function layerIndex(layer: Layer): LayerIndex {
  const raw = editor.layerItems(layer);
  const rig = editor.rig();
  let index = indexes.get(raw);
  if (!index || index.rig !== rig) {
    const items = editor.shownItems(layer);
    const boxes = items.map((it) => expand(itemBounds(it, it.transform), reach(it)));
    index = { rig, items, grid: buildGrid(boxes) };
    indexes.set(raw, index);
  }
  return index;
}

// the items of a layer whose box comes near p, topmost first. the box already holds the stroke, the
// radius covers the few screen pixels a thin line gets on top
function nearItems(layer: Layer, p: Vec, zoom: number, factor: number): Item[] {
  const { items, grid } = layerIndex(layer);
  return queryGrid(grid, p.x, p.y, (STROKE_TOLERANCE * factor) / zoom).map((i) => items[i]);
}

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
    for (const item of nearItems(layer, p, zoom, factor)) {
      if (!item.locked && hitInside(item, item.transform, p, zoom, factor)) return rest(item);
    }
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
    for (const item of nearItems(layer, p, zoom, factor)) {
      const hit = deepHit([item], identity(), p, zoom, factor);
      if (hit) return rest(hit);
    }
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
