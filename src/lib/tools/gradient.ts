import { get } from 'svelte/store';
import type { Mat, Paint, PathItem, TextItem, Vec } from '$lib/core/types';
import { applyPoint, invert } from '$lib/core/mat';
import { snapAngle } from '$lib/core/vec';
import { cloneItem, localBounds } from '$lib/core/items';
import { pointerFactor } from '$lib/core/hit';
import { convertPaint, fitGradient, gradientEnds, isFitted, isGradient, type Gradient } from '$lib/core/gradient';
import { rgba } from '$lib/core/style';
import { editor, hover } from '$lib/editor/editor';
import { clearSelection, select } from '$lib/editor/selection';
import { styledItems } from '$lib/editor/commands';
import { clearSnap, snapEvent } from '$lib/editor/snap';
import { activeStop, colorTarget, fillPaint, strokePaint, toolCursor, view } from '$lib/stores/app';
import { showDockTab } from '$lib/stores/workspace';
import { pickItem } from './pick';
import { toolBase, type Tool, type ToolEvent } from './tool';

// screen pixels
const HANDLE_REACH = 7;
const DRAG = 3;
const LINE_COLOR = '#ffffff';
const LINE_EDGE = 'rgba(0, 0, 0, 0.65)';
const ACCENT = '#d19a66';

type Styled = PathItem | TextItem;

type Drag =
  | { kind: 'new'; item: Styled; world: Mat; from: Vec }
  | { kind: 'end'; item: Styled; world: Mat; paint: Gradient; which: 0 | 1 }
  | { kind: 'stop'; item: Styled; world: Mat; paint: Gradient; index: number };

let drag: Drag | null = null;
let start: ToolEvent | null = null;
let moved = false;

function target(): 'fill' | 'stroke' {
  return get(colorTarget);
}

function current(): Styled | null {
  return styledItems()[0] ?? null;
}

// the gradient the item shows, a gradient that was never placed is laid across its bounds
function shownGradient(item: Styled): Gradient | null {
  const p = item.style[target()];
  if (!isGradient(p)) return null;
  return isFitted(p) ? p : fitGradient(p, localBounds(item));
}

// the colors a new gradient vector starts with
function stopsFor(item: Styled): Gradient['stops'] {
  const own = item.style[target()];
  if (isGradient(own)) return own.stops.map((s) => ({ ...s }));
  const store = get(target() === 'fill' ? fillPaint : strokePaint);
  if (isGradient(store)) return store.stops.map((s) => ({ ...s }));
  return (convertPaint(own, 'linear') as Gradient).stops;
}

// the two ends in world space and the stops along the line between them
function handles(item: Styled, world: Mat, g: Gradient) {
  const [a, b] = gradientEnds(g).map((p) => applyPoint(world, p));
  const stops = g.stops.map((s) => ({ x: a.x + (b.x - a.x) * s.t, y: a.y + (b.y - a.y) * s.t }));
  return { a, b, stops };
}

function near(p: Vec, q: Vec, e: ToolEvent): boolean {
  return Math.hypot(p.x - q.x, p.y - q.y) * e.zoom <= HANDLE_REACH * pointerFactor(e.pointerType);
}

function withPaint(item: Styled, paint: Paint): Styled {
  const copy = cloneItem(item);
  copy.style[target()] = paint;
  return copy;
}

// a linear gradient between two world points, or a radial one around the first when the item has one
function vectorPaint(item: Styled, world: Mat, from: Vec, to: Vec): Gradient {
  const inv = invert(world);
  const a = applyPoint(inv, from);
  const b = applyPoint(inv, to);
  const stops = stopsFor(item);
  const own = item.style[target()];
  if (own?.type === 'radial') {
    const r = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-3);
    return { type: 'radial', stops, cx: a.x, cy: a.y, r, fx: a.x, fy: a.y };
  }
  return { type: 'linear', stops, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function moveEnd(g: Gradient, which: 0 | 1, p: Vec): Gradient {
  if (g.type === 'linear') return which === 0 ? { ...g, x1: p.x, y1: p.y } : { ...g, x2: p.x, y2: p.y };
  if (which === 0) {
    // the middle moves and takes the focus with it
    return { ...g, cx: p.x, cy: p.y, fx: g.fx + p.x - g.cx, fy: g.fy + p.y - g.cy };
  }
  return { ...g, r: Math.max(Math.hypot(p.x - g.cx, p.y - g.cy), 1e-3) };
}

function setCursor(c: string) {
  if (get(toolCursor) !== c) toolCursor.set(c);
}

function down(e: ToolEvent) {
  start = e;
  moved = false;
  drag = null;
  const item = current();
  if (!item) {
    const hit = pickItem(e, e.zoom, pointerFactor(e.pointerType));
    if (hit && (hit.type === 'path' || hit.type === 'text')) select([hit.id]);
    else clearSelection();
    return;
  }
  const world = editor.worldMatrixOf(item.id);
  const g = shownGradient(item);
  if (g) {
    const h = handles(item, world, g);
    const stop = h.stops.findIndex((p) => near(p, e, e));
    if (stop >= 0) {
      activeStop.set(stop);
      showDockTab('color');
      drag = { kind: 'stop', item, world, paint: g, index: stop };
      return;
    }
    if (near(h.b, e, e)) {
      drag = { kind: 'end', item, world, paint: g, which: 1 };
      return;
    }
    if (near(h.a, e, e)) {
      drag = { kind: 'end', item, world, paint: g, which: 0 };
      return;
    }
  }
  const from = snapEvent(e, { exclude: [item.id], show: true });
  drag = { kind: 'new', item, world, from: { x: from.x, y: from.y } };
}

function move(e: ToolEvent) {
  if (!drag || !start) {
    if (get(hover)) hover.set(null);
    const item = current();
    const g = item ? shownGradient(item) : null;
    let cursor = 'crosshair';
    if (item && g) {
      const h = handles(item, editor.worldMatrixOf(item.id), g);
      if ([h.a, h.b, ...h.stops].some((p) => near(p, e, e))) cursor = 'move';
    }
    setCursor(cursor);
    return;
  }
  if (!moved && Math.hypot(e.sx - start.sx, e.sy - start.sy) < DRAG) return;
  moved = true;
  const d = drag;
  const inv = invert(d.world);
  let paint: Gradient;
  if (d.kind === 'new') {
    let to: Vec = snapEvent(e, { exclude: [d.item.id], show: true });
    if (e.shift) to = snapAngle(d.from, to);
    paint = vectorPaint(d.item, d.world, d.from, to);
  } else if (d.kind === 'end') {
    let to: Vec = snapEvent(e, { exclude: [d.item.id], show: true });
    // shift keeps the line at 45 degree steps around the other end
    const other = applyPoint(d.world, gradientEnds(d.paint)[d.which === 0 ? 1 : 0]);
    if (e.shift) to = snapAngle(other, to);
    paint = moveEnd(d.paint, d.which, applyPoint(inv, to));
  } else {
    const h = handles(d.item, d.world, d.paint);
    const dx = h.b.x - h.a.x;
    const dy = h.b.y - h.a.y;
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((e.x - h.a.x) * dx + (e.y - h.a.y) * dy) / len)) : 0;
    paint = { ...d.paint, stops: d.paint.stops.map((s, i) => (i === d.index ? { ...s, t } : { ...s })) };
  }
  editor.preview.set(d.item.id, withPaint(d.item, paint));
  editor.markAll();
}

function up() {
  clearSnap();
  if (drag && moved) editor.commitPreview(drag.kind === 'stop' ? 'Move gradient stop' : 'Gradient');
  else editor.clearPreview();
  drag = null;
  start = null;
  moved = false;
}

// the line between the ends, a square at the start, a circle at the end and diamonds for the stops
function drawOverlay(ctx: CanvasRenderingContext2D) {
  const item = current();
  if (!item) return;
  const shown = (editor.preview.get(item.id) as Styled | undefined) ?? item;
  const g = shownGradient(shown);
  if (!g) return;
  const z = get(view).zoom;
  const world = editor.worldMatrixOf(item.id);
  const h = handles(shown, world, g);
  if (g.type === 'radial') {
    ctx.setLineDash([4 / z, 3 / z]);
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    ctx.arc(h.a.x, h.a.y, Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const [color, width] of [
    [LINE_EDGE, 3],
    [LINE_COLOR, 1]
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width / z;
    ctx.beginPath();
    ctx.moveTo(h.a.x, h.a.y);
    ctx.lineTo(h.b.x, h.b.y);
    ctx.stroke();
  }
  const r = 4 / z;
  ctx.lineWidth = 1 / z;
  ctx.fillStyle = LINE_COLOR;
  ctx.strokeStyle = LINE_EDGE;
  ctx.fillRect(h.a.x - r, h.a.y - r, r * 2, r * 2);
  ctx.strokeRect(h.a.x - r, h.a.y - r, r * 2, r * 2);
  ctx.beginPath();
  ctx.arc(h.b.x, h.b.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const picked = get(activeStop);
  g.stops.forEach((s, i) => {
    const p = h.stops[i];
    const k = 5 / z;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - k);
    ctx.lineTo(p.x + k, p.y);
    ctx.lineTo(p.x, p.y + k);
    ctx.lineTo(p.x - k, p.y);
    ctx.closePath();
    ctx.fillStyle = rgba(s.color, 1);
    ctx.fill();
    ctx.lineWidth = (i === picked ? 2 : 1) / z;
    ctx.strokeStyle = i === picked ? ACCENT : LINE_COLOR;
    ctx.stroke();
  });
}

export const gradientTool: Tool = {
  ...toolBase('gradient'),

  down,

  move,

  up,

  key(e) {
    if (e.key === 'Escape' && drag) {
      e.preventDefault();
      drag = null;
      start = null;
      clearSnap();
      editor.clearPreview();
    }
  },

  drawOverlay,

  activate() {
    setCursor('crosshair');
    editor.markOverlay();
  },

  deactivate() {
    if (drag) editor.clearPreview();
    drag = null;
    start = null;
    clearSnap();
  }
};
