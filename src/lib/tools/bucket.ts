import { get } from 'svelte/store';
import type { Item, Mat, PathItem, Vec } from '$lib/core/types';
import { applyPoint, identity, multiply } from '$lib/core/mat';
import { clonePaint } from '$lib/core/style';
import { insideShape, pointerFactor } from '$lib/core/hit';
import { editor, hover } from '$lib/editor/editor';
import { fillPaint, strokePaint, strokeWidth, toolCursor, toolOptions } from '$lib/stores/app';
import { preferences, type BucketGap } from '$lib/stores/preferences';
import { pickDeep } from './pick';
import { BUCKET_CURSOR, INK_CURSOR } from './cursors';
import { toolBase, type Tool, type ToolEvent } from './tool';
import BucketOptions from './options/BucketOptions.svelte';

// screen pixels between the ends of an open path that still count as closed
export const GAPS: Record<BucketGap, number> = { none: 0, small: 3, medium: 6, large: 12 };

// closed, or open with its ends closer than the gap in world units
export function closedEnough(item: PathItem, m: Mat, gap: number): boolean {
  const a = item.path.anchors;
  if (item.path.closed) return a.length > 2;
  if (gap <= 0 || a.length < 3) return false;
  const s = applyPoint(m, a[0]);
  const e = applyPoint(m, a[a.length - 1]);
  return Math.hypot(s.x - e.x, s.y - e.y) < gap;
}

function inside(items: Item[], parent: Mat, p: Vec, gap: number): PathItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item.visible || item.locked) continue;
    const m = multiply(parent, item.transform);
    if (item.type === 'group') {
      const hit = inside(item.children, m, p, gap);
      if (hit) return hit;
    } else if (item.type === 'path' && closedEnough(item, m, gap) && insideShape(item, m, p)) {
      return item;
    }
  }
  return null;
}

// the topmost closed path around p on the layers that can be edited, inside groups too
export function fillTarget(p: Vec, zoom: number): PathItem | null {
  const gap = GAPS[get(preferences).drawing.bucketGap] / zoom;
  const layers = editor.currentLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!editor.isEditable(layer)) continue;
    const hit = inside(editor.shownItems(layer), identity(), p, gap);
    if (hit) return hit;
  }
  return null;
}

function strokeMode(e: { shift: boolean }): boolean {
  return e.shift || get(toolOptions).bucketMode === 'stroke';
}

function setCursor(e: { shift: boolean }) {
  const c = strokeMode(e) ? INK_CURSOR : BUCKET_CURSOR;
  if (get(toolCursor) !== c) toolCursor.set(c);
}

// the fill of the shape around the point, or with shift or in ink mode the stroke of the shape under it
function paint(e: ToolEvent) {
  if (strokeMode(e)) {
    const hit = pickDeep(e, e.zoom, pointerFactor(e.pointerType));
    if (!hit || (hit.type !== 'path' && hit.type !== 'text')) return;
    const stroke = clonePaint(get(strokePaint));
    const width = get(strokeWidth);
    editor.updateItem(
      hit.id,
      (item) => {
        if (item.type !== 'path' && item.type !== 'text') return;
        item.style.stroke = clonePaint(stroke);
        item.style.width = width;
      },
      'Ink bottle'
    );
    return;
  }
  const hit = fillTarget(e, e.zoom);
  if (!hit) return;
  const fill = clonePaint(get(fillPaint));
  editor.updateItem(
    hit.id,
    (item) => {
      if (item.type === 'path') item.style.fill = clonePaint(fill);
    },
    'Paint bucket'
  );
}

export const bucketTool: Tool = {
  ...toolBase('bucket'),
  cursor: BUCKET_CURSOR,

  down(e) {
    if (e.button === 0) paint(e);
  },

  move(e) {
    if (get(hover)) hover.set(null);
    setCursor(e);
  },

  activate() {
    setCursor({ shift: false });
  },

  options: BucketOptions
};
