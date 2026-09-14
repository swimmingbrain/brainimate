import { get } from 'svelte/store';
import type { PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, invert } from '$lib/core/mat';
import { copyPath, inPoint, makeAnchor, outPoint, removeAnchor, segmentCubic } from '$lib/core/path';
import { pointAt } from '$lib/core/bezier';
import { setSmoothHandles } from '$lib/core/smooth';
import { hitContours, hitItemSegment, pointerFactor, strokeTolerance } from '$lib/core/hit';
import { contourOf, makePathItem, setContour, withContour } from '$lib/core/items';
import { editor, hover } from '$lib/editor/editor';
import { select } from '$lib/editor/selection';
import { worldAnchor } from '$lib/render/overlay';
import { anchorSelection, selection, toolCursor, view } from '$lib/stores/app';
import { clearSnap, snapEvent } from '$lib/editor/snap';
import { PEN_CURSORS } from './cursors';
import { PREVIEW_COLOR, currentStyle, drawingLayer, setPreviewStroke } from './draw';
import { toolBase, type Tool, type ToolEvent } from './tool';

const DRAG = 3;
const END_T = 0.02;

type Target =
  | { kind: 'start' }
  | { kind: 'draw' }
  | { kind: 'close' }
  | { kind: 'point'; id: string; sub: number; index: number }
  | { kind: 'insert'; id: string; sub: number; index: number; t: number };

interface Gesture {
  item: PathItem;
  layerId: string | null;
  // the contour being changed, 0 is the outline
  sub: number;
  path: PathData;
  index: number;
  label: string;
  start: ToolEvent;
  // where the point sat when the press began, the drag adds the pointer movement to it
  origin: Vec;
  changed: boolean;
  dragging: boolean;
  // the path being drawn goes on from this gesture
  drawing: boolean;
}

let drawingId: string | null = null;
let gesture: Gesture | null = null;
let pointer: ToolEvent | null = null;

function selectedPaths(): PathItem[] {
  return editor.selectedItems(false).filter((it): it is PathItem => it.type === 'path');
}

function drawingItem(): PathItem | null {
  if (!drawingId) return null;
  const item = editor.itemById(drawingId, false);
  if (!item || item.type !== 'path' || item.path.closed || !get(selection).has(drawingId)) {
    drawingId = null;
    return null;
  }
  return item;
}

// the curve through a point only depends on its neighbours, so only those get new handles
function refresh(path: PathData, index: number) {
  const n = path.anchors.length;
  for (const k of [index - 1, index, index + 1]) {
    if (!path.closed && (k < 0 || k >= n)) continue;
    const i = (k + n) % n;
    if (i === index || path.anchors[i].kind !== 'corner') setSmoothHandles(path, i);
  }
}

function targetAt(e: ToolEvent): Target {
  const factor = pointerFactor(e.pointerType);
  const drawing = drawingItem();
  const paths = selectedPaths();
  for (const item of paths) {
    const hit = hitContours(item, editor.worldMatrixOf(item.id), e, e.zoom, factor);
    if (!hit) continue;
    const first = hit.sub === 0 && hit.index === 0;
    if (item.id === drawing?.id && first && item.path.anchors.length > 2) return { kind: 'close' };
    return { kind: 'point', id: item.id, sub: hit.sub, index: hit.index };
  }
  for (const item of paths) {
    const world = editor.worldMatrixOf(item.id);
    const seg = hitItemSegment(item, world, e, e.zoom, strokeTolerance(item, world, e.zoom, factor));
    if (seg && seg.t > END_T && seg.t < 1 - END_T) {
      return { kind: 'insert', id: item.id, sub: seg.sub, index: seg.index, t: seg.t };
    }
  }
  return drawing ? { kind: 'draw' } : { kind: 'start' };
}

function setCursor(c: string) {
  if (get(toolCursor) !== c) toolCursor.set(c);
}

function updateCursor(e: ToolEvent) {
  const t = targetAt(e);
  if (t.kind === 'point') setCursor('move');
  else if (t.kind === 'close') setCursor(PEN_CURSORS.close);
  else if (t.kind === 'insert') setCursor(PEN_CURSORS.add);
  else setCursor(PEN_CURSORS.curve);
}

function showGesture() {
  const g = gesture;
  if (!g) return;
  if (g.layerId) editor.previewAdded = [{ layerId: g.layerId, item: { ...g.item, path: g.path } }];
  else editor.preview.set(g.item.id, withContour(g.item, g.sub, g.path));
  editor.markAll();
}

function begin(
  e: ToolEvent,
  item: PathItem,
  path: PathData,
  index: number,
  label: string,
  changed: boolean,
  sub = 0
) {
  const a = path.anchors[index];
  gesture = {
    item,
    layerId: null,
    sub,
    path,
    index,
    label,
    start: e,
    origin: { x: a.x, y: a.y },
    changed,
    dragging: false,
    drawing: item.id === drawingId && sub === 0
  };
  anchorSelection.set([{ itemId: item.id, sub, index }]);
  showGesture();
}

function toLocal(id: string, p: Vec): Vec {
  return applyPoint(invert(editor.worldMatrixOf(id)), p);
}

function commitPath(id: string, path: PathData, label: string, sub = 0) {
  editor.updateItem(
    id,
    (item) => {
      if (item.type === 'path') setContour(item, sub, path);
    },
    label
  );
}

function down(e: ToolEvent) {
  pointer = e;
  const t = targetAt(e);
  if (t.kind === 'start') {
    const layer = drawingLayer();
    if (!layer) return;
    const at = snapEvent(e, { show: true });
    const path: PathData = { anchors: [makeAnchor(at.x, at.y, 'smooth')], closed: false };
    const item = makePathItem('Path', path, currentStyle());
    begin(e, item, copyPath(path), 0, 'Draw path', true);
    gesture!.layerId = layer.id;
    gesture!.drawing = true;
    showGesture();
    return;
  }
  if (t.kind === 'close') {
    const item = drawingItem()!;
    const path = copyPath(item.path);
    path.closed = true;
    refresh(path, 0);
    refresh(path, path.anchors.length - 1);
    commitPath(item.id, path, 'Close path');
    endPath();
    return;
  }
  if (t.kind === 'draw') {
    const item = drawingItem()!;
    const path = copyPath(item.path);
    const p = toLocal(item.id, snapEvent(e, { show: true }));
    path.anchors.push(makeAnchor(p.x, p.y, 'smooth'));
    refresh(path, path.anchors.length - 1);
    begin(e, item, path, path.anchors.length - 1, 'Add point', true);
    return;
  }
  const item = editor.itemById(t.id, false) as PathItem;
  const contour = contourOf(item, t.sub);
  if (!contour) return;
  const path = copyPath(contour);
  if (t.kind === 'point') {
    begin(e, item, path, t.index, 'Move point', false, t.sub);
    return;
  }
  // a point on the segment, smooth, and the curve is rebuilt around it
  const at = pointAt(segmentCubic(path, t.index), t.t);
  path.anchors.splice(t.index + 1, 0, makeAnchor(at.x, at.y, 'smooth'));
  refresh(path, t.index + 1);
  begin(e, item, path, t.index + 1, 'Add point', true, t.sub);
}

function drag(e: ToolEvent) {
  const g = gesture;
  if (!g) return;
  if (!g.dragging) {
    if (Math.hypot(e.sx - g.start.sx, e.sy - g.start.sy) < DRAG) return;
    g.dragging = true;
  }
  const inv = invert(g.layerId ? g.item.transform : editor.worldMatrixOf(g.item.id));
  // a point of a path in the document does not snap to the rest of its own path
  const now = applyPoint(inv, snapEvent(e, { exclude: g.layerId ? [] : [g.item.id], show: true }));
  const then = applyPoint(inv, g.start);
  const a = g.path.anchors[g.index];
  a.x = g.origin.x + now.x - then.x;
  a.y = g.origin.y + now.y - then.y;
  refresh(g.path, g.index);
  showGesture();
}

function up(e: ToolEvent) {
  pointer = e;
  clearSnap();
  const g = gesture;
  gesture = null;
  if (!g) return;
  if (!g.changed && !g.dragging) {
    editor.clearPreview();
    return;
  }
  if (g.layerId) {
    editor.previewAdded = [];
    editor.insertItem(g.layerId, { ...g.item, path: g.path }, g.label);
  } else {
    editor.preview.delete(g.item.id);
    commitPath(g.item.id, g.path, g.label, g.sub);
  }
  editor.clearPreview();
  if (g.drawing) {
    drawingId = g.item.id;
    select([g.item.id]);
  }
  anchorSelection.set([{ itemId: g.item.id, sub: g.sub, index: g.index }]);
}

function endPath() {
  const item = drawingItem();
  drawingId = null;
  anchorSelection.set([]);
  if (item && item.path.anchors.length < 2) editor.removeItems([item.id], 'Delete stray point');
  editor.markOverlay();
}

// a double click turns a smooth point into a corner and back
function dblclick(e: ToolEvent) {
  const t = targetAt(e);
  if (t.kind !== 'point') return;
  const item = editor.itemById(t.id, false) as PathItem;
  const contour = contourOf(item, t.sub);
  if (!contour) return;
  const path = copyPath(contour);
  const a = path.anchors[t.index];
  a.kind = a.kind === 'corner' ? 'smooth' : 'corner';
  refresh(path, t.index);
  commitPath(item.id, path, 'Convert point', t.sub);
}

function removeLast() {
  const item = drawingItem();
  if (!item) return;
  const path = copyPath(item.path);
  removeAnchor(path, path.anchors.length - 1);
  if (path.anchors.length === 0) {
    editor.removeItems([item.id], 'Delete point');
    drawingId = null;
    return;
  }
  refresh(path, path.anchors.length - 1);
  commitPath(item.id, path, 'Delete point');
}

// the curve as it would be with the pointer as the next point
function drawOverlay(ctx: CanvasRenderingContext2D) {
  const zoom = get(view).zoom;
  const g = gesture;
  if (g?.layerId) {
    worldAnchor(ctx, g.path.anchors[0], false, true, PREVIEW_COLOR, zoom);
    return;
  }
  const drawing = drawingItem();
  if (!drawing || g || !pointer) return;
  const t = targetAt(pointer);
  if (t.kind !== 'draw' && t.kind !== 'close') return;
  const world = editor.worldMatrixOf(drawing.id);
  const path = copyPath(drawing.path);
  if (t.kind === 'draw') {
    const p = toLocal(drawing.id, pointer);
    path.anchors.push(makeAnchor(p.x, p.y, 'smooth'));
    refresh(path, path.anchors.length - 1);
  } else {
    path.closed = true;
    refresh(path, 0);
    refresh(path, path.anchors.length - 1);
  }
  const n = path.anchors.length;
  const from = t.kind === 'draw' ? Math.max(0, n - 3) : n - 2;
  const to = t.kind === 'draw' ? n - 1 : n;
  setPreviewStroke(ctx, drawing.style, zoom);
  ctx.beginPath();
  const first = applyPoint(world, path.anchors[from]);
  ctx.moveTo(first.x, first.y);
  for (let i = from; i < to; i++) {
    const a = path.anchors[i];
    const b = path.anchors[(i + 1) % n];
    const c1 = applyPoint(world, outPoint(a));
    const c2 = applyPoint(world, inPoint(b));
    const end = applyPoint(world, b);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
  }
  ctx.stroke();
}

export const curvatureTool: Tool = {
  ...toolBase('curvature'),
  cursor: PEN_CURSORS.curve,

  down,

  move(e) {
    if (gesture) {
      drag(e);
      return;
    }
    pointer = e;
    if (get(hover)) hover.set(null);
    updateCursor(e);
  },

  up,

  dblclick,

  key(e) {
    if (e.key === 'Escape' && gesture) {
      e.preventDefault();
      gesture = null;
      clearSnap();
      editor.clearPreview();
      return;
    }
    if (!drawingItem() || gesture) return;
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      endPath();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      removeLast();
    }
  },

  drawOverlay,

  followsPointer: () => drawingId !== null,

  activate() {

    setCursor(PEN_CURSORS.curve);
  },

  deactivate() {
    if (gesture) {
      gesture = null;
      clearSnap();
      editor.clearPreview();
    }
    endPath();
    pointer = null;
  }
};
