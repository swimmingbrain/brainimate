import type { Item, Mat, PathData, PathItem, Vec } from './types';
import type { Ctx2D } from './style';
import { applyPoint, invert, multiply, scaleFactor } from './mat';
import { contains, expand } from './bbox';
import { contours, itemBounds, localBounds } from './items';
import { nearestSegment, transformPath } from './path';
import { shapePath2D } from '$lib/render/pathcache';

// screen pixels, doubled for fingers and pens
export const ANCHOR_TOLERANCE = 6;
export const HANDLE_TOLERANCE = 5;

let shared: Ctx2D | null = null;

// one tiny context for every isPointInPath call, it is never drawn to
function hitContext(): Ctx2D | null {
  if (shared) return shared;
  if (typeof OffscreenCanvas !== 'undefined') shared = new OffscreenCanvas(1, 1).getContext('2d');
  else if (typeof document !== 'undefined') shared = document.createElement('canvas').getContext('2d');
  return shared;
}

export function pointerFactor(pointerType: string): number {
  return pointerType === 'touch' || pointerType === 'pen' ? 2 : 1;
}

// half the width of the band around a stroke that counts as a hit, in screen pixels
export function strokeTolerance(item: PathItem, m: Mat, zoom: number, factor = 1): number {
  const s = item.style.scaleStroke ? scaleFactor(m) : 1;
  const width = item.style.stroke ? item.style.width : 0;
  return Math.max(4, (width * s * zoom) / 2 + 2) * factor;
}

function hitPath(item: PathItem, m: Mat, p: Vec, zoom: number, factor: number): boolean {
  const ctx = hitContext();
  if (!ctx || item.path.anchors.length === 0) return false;
  const local = applyPoint(invert(m), p);
  const shape = shapePath2D(item.path, item.subpaths);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (item.style.fill && ctx.isPointInPath(shape, local.x, local.y)) return true;
  // the band is measured on screen, so it is converted back into local units
  const s = Math.max(scaleFactor(m), 1e-9);
  ctx.lineWidth = (2 * strokeTolerance(item, m, zoom, factor)) / (zoom * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx.isPointInStroke(shape, local.x, local.y);
}

// m is the item's world matrix, its own transform included
export function hitItem(item: Item, m: Mat, p: Vec, zoom: number, factor = 1): boolean {
  if (!item.visible) return false;
  // cheap box test first, grown by the stroke band so an edge hit is not thrown away
  const pad = item.type === 'path' ? strokeTolerance(item, m, zoom, factor) / zoom : 0;
  if (item.type !== 'group' && !contains(expand(itemBounds(item, m), pad), p)) return false;
  switch (item.type) {
    case 'path':
      return hitPath(item, m, p, zoom, factor);
    case 'group':
      for (let i = item.children.length - 1; i >= 0; i--) {
        const child = item.children[i];
        if (hitItem(child, multiply(m, child.transform), p, zoom, factor)) return true;
      }
      return false;
    case 'text':
    case 'image':
      return contains(localBounds(item), applyPoint(invert(m), p));
    default:
      return false;
  }
}

// topmost first, parent is the matrix around the list (identity for keyframe items)
export function hitTest(
  items: Item[],
  parent: Mat,
  p: Vec,
  zoom: number,
  factor = 1,
  skip?: (item: Item) => boolean
): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.locked || (skip && skip(item))) continue;
    if (hitItem(item, multiply(parent, item.transform), p, zoom, factor)) return item;
  }
  return null;
}

export interface AnchorHit {
  index: number;
  part: 'anchor' | 'in' | 'out';
}

// anchors win over handles, a handle that sits on its anchor cannot be grabbed
export function hitAnchor(
  path: PathData,
  m: Mat,
  p: Vec,
  zoom: number,
  factor = 1,
  showHandles: (index: number) => boolean = () => false
): AnchorHit | null {
  let best: AnchorHit | null = null;
  let bestD = (ANCHOR_TOLERANCE * factor) / zoom;
  for (let i = 0; i < path.anchors.length; i++) {
    const w = applyPoint(m, path.anchors[i]);
    const d = Math.hypot(w.x - p.x, w.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = { index: i, part: 'anchor' };
    }
  }
  if (best) return best;
  bestD = (HANDLE_TOLERANCE * factor) / zoom;
  for (let i = 0; i < path.anchors.length; i++) {
    const a = path.anchors[i];
    if (!showHandles(i)) continue;
    for (const part of ['in', 'out'] as const) {
      const hx = part === 'in' ? a.ix : a.ox;
      const hy = part === 'in' ? a.iy : a.oy;
      if (hx === 0 && hy === 0) continue;
      const w = applyPoint(m, { x: a.x + hx, y: a.y + hy });
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = { index: i, part };
      }
    }
  }
  return best;
}

// the segment under p within tolerance screen pixels, t is on the segment
export function hitSegment(
  path: PathData,
  m: Mat,
  p: Vec,
  zoom: number,
  tolerance: number
): { index: number; t: number; d: number; point: Vec } | null {
  const hit = nearestSegment(transformPath(path, m), p);
  if (!hit || hit.d * zoom > tolerance) return null;
  return hit;
}

export interface ContourHit extends AnchorHit {
  sub: number;
}

// an anchor or handle on any contour of the item, the outline first
export function hitContours(
  item: PathItem,
  m: Mat,
  p: Vec,
  zoom: number,
  factor = 1,
  showHandles: (sub: number, index: number) => boolean = () => false
): ContourHit | null {
  const list = contours(item);
  // anchors of every contour come before any handle
  for (let sub = 0; sub < list.length; sub++) {
    const hit = hitAnchor(list[sub], m, p, zoom, factor);
    if (hit) return { ...hit, sub };
  }
  for (let sub = 0; sub < list.length; sub++) {
    const hit = hitAnchor(list[sub], m, p, zoom, factor, (i) => showHandles(sub, i));
    if (hit) return { ...hit, sub };
  }
  return null;
}

// the closest segment of any contour within tolerance screen pixels
export function hitItemSegment(
  item: PathItem,
  m: Mat,
  p: Vec,
  zoom: number,
  tolerance: number
): { sub: number; index: number; t: number; d: number; point: Vec } | null {
  let best: { sub: number; index: number; t: number; d: number; point: Vec } | null = null;
  contours(item).forEach((c, sub) => {
    const hit = hitSegment(c, m, p, zoom, tolerance);
    if (hit && (!best || hit.d < best.d)) best = { ...hit, sub };
  });
  return best;
}

// p lies in the filled area of the path, holes left out, an open path counts as closed by a straight line
export function insideShape(item: PathItem, m: Mat, p: Vec): boolean {
  const ctx = hitContext();
  if (!ctx || item.path.anchors.length < 3) return false;
  const local = applyPoint(invert(m), p);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.isPointInPath(shapePath2D(item.path, item.subpaths), local.x, local.y);
}
