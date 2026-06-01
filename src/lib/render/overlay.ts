import { get } from 'svelte/store';
import type { Item, Mat, PathItem, Vec } from '$lib/core/types';
import { applyPoint, multiply } from '$lib/core/mat';
import { corners, isEmpty, type Box } from '$lib/core/bbox';
import { localBounds } from '$lib/core/items';
import { path2D } from './pathcache';
import { editor, hover } from '$lib/editor/editor';
import { frameHandles, framePoint, selectionFrame } from '$lib/editor/selection';
import { activeTool, anchorSelection, selection, type View } from '$lib/stores/app';

export const HANDLE_SIZE = 7;
export const ANCHOR_SIZE = 7;
export const HANDLE_DOT = 6;

// what the tools ask the overlay to show besides the selection
export const overlayState: {
  // world rect being dragged out
  marquee: Box | null;
  // hides the handle box while a tool does something where it would be in the way
  hideFrame: boolean;
} = { marquee: null, hideFrame: false };

export interface OverlayColors {
  accent: string;
}

// screen = view * world, in css pixels, the context already holds the dpr
function screenMatrix(v: View, world: Mat): Mat {
  return multiply([v.zoom, 0, 0, v.zoom, v.panX, v.panY], world);
}

function toScreen(v: View, p: Vec): Vec {
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

function screenPath(item: PathItem, m: Mat): Path2D {
  const p = new Path2D();
  p.addPath(path2D(item.path), { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
  return p;
}

// the shape of an item for highlights: its path, or the box of anything else
function outlineItem(ctx: CanvasRenderingContext2D, item: Item, m: Mat) {
  if (item.type === 'path') {
    if (item.path.anchors.length > 0) ctx.stroke(screenPath(item, m));
    return;
  }
  const b = localBounds(item);
  if (isEmpty(b)) return;
  const pts = corners(b).map((p) => applyPoint(m, p));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

function layerColor(id: string, fallback: string): string {
  return editor.layerOfItem(id)?.color ?? fallback;
}

function drawFrame(ctx: CanvasRenderingContext2D, v: View, accent: string) {
  const f = selectionFrame();
  if (!f) return;
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ].map((u) => toScreen(v, framePoint(f, u)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();

  const half = HANDLE_SIZE / 2;
  ctx.fillStyle = '#ffffff';
  for (const h of frameHandles(f)) {
    const p = toScreen(v, h);
    const x = Math.round(p.x - half) + 0.5;
    const y = Math.round(p.y - half) + 0.5;
    ctx.fillRect(x, y, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
    ctx.strokeRect(x, y, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
  }
}

function drawAnchors(ctx: CanvasRenderingContext2D, v: View, item: PathItem, world: Mat, color: string) {
  const m = screenMatrix(v, world);
  const picked = new Set(
    get(anchorSelection)
      .filter((a) => a.itemId === item.id)
      .map((a) => a.index)
  );
  const half = ANCHOR_SIZE / 2;
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;

  // handles of the picked anchors, under the anchor glyphs
  for (const index of picked) {
    const a = item.path.anchors[index];
    if (!a) continue;
    const p = applyPoint(m, a);
    for (const [hx, hy] of [
      [a.ix, a.iy],
      [a.ox, a.oy]
    ]) {
      if (hx === 0 && hy === 0) continue;
      const h = applyPoint(m, { x: a.x + hx, y: a.y + hy });
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.x, h.y, HANDLE_DOT / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  item.path.anchors.forEach((a, i) => {
    const p = applyPoint(m, a);
    ctx.fillStyle = picked.has(i) ? color : '#ffffff';
    ctx.beginPath();
    if (a.kind === 'corner') ctx.rect(Math.round(p.x - half) + 0.5, Math.round(p.y - half) + 0.5, ANCHOR_SIZE - 1, ANCHOR_SIZE - 1);
    else ctx.arc(p.x, p.y, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

// hover and selection outlines, the handle box, the marquee and anchors for the direct tool
export function drawOverlay(ctx: CanvasRenderingContext2D, v: View, dpr: number, colors: OverlayColors) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.setLineDash([]);
  const tool = get(activeTool);
  const sel = get(selection);
  const direct = tool === 'direct';

  const h = get(hover);
  if (h && !sel.has(h)) {
    const item = editor.itemById(h);
    if (item) {
      ctx.strokeStyle = layerColor(h, colors.accent);
      ctx.lineWidth = 2;
      outlineItem(ctx, item, screenMatrix(v, editor.worldMatrixOf(h)));
    }
  }

  for (const id of sel) {
    const item = editor.itemById(id);
    if (!item) continue;
    const color = layerColor(id, colors.accent);
    const world = editor.worldMatrixOf(id);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    outlineItem(ctx, item, screenMatrix(v, world));
    if (direct && item.type === 'path') drawAnchors(ctx, v, item, world, color);
  }

  if (!direct && !overlayState.hideFrame && sel.size > 0 && (tool === 'select' || tool === 'transform')) {
    drawFrame(ctx, v, colors.accent);
  }

  const mq = overlayState.marquee;
  if (mq && !isEmpty(mq)) {
    const a = toScreen(v, { x: mq.minX, y: mq.minY });
    const b = toScreen(v, { x: mq.maxX, y: mq.maxY });
    ctx.fillStyle = 'rgba(209, 154, 102, 0.08)';
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
    ctx.setLineDash([]);
  }
  ctx.restore();
}
