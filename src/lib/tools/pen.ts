import { get } from 'svelte/store';
import type { PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, applyVector, invert } from '$lib/core/mat';
import { copyPath, hasHandles, inPoint, insertAnchor, makeAnchor, outPoint, removeAnchor } from '$lib/core/path';
import { continueFrom, nextPoint, pullHandles, retractHandles, retractOut } from '$lib/core/handles';
import { hitAnchor, hitSegment, pointerFactor, strokeTolerance } from '$lib/core/hit';
import { makePathItem } from '$lib/core/items';
import { editor, hover } from '$lib/editor/editor';
import { select } from '$lib/editor/selection';
import { worldAnchor, worldHandle } from '$lib/render/overlay';
import { anchorSelection, selection, toolCursor, view } from '$lib/stores/app';
import { PEN_CURSORS } from './cursors';
import { directTool } from './direct';
import { PREVIEW_COLOR, currentStyle, drawingLayer, setPreviewStroke } from './draw';
import { toolBase, type Tool, type ToolEvent } from './tool';

// screen pixels before a press turns into a handle drag
const DRAG = 3;
// a segment hit this close to an anchor is the anchor, not a new point
const END_T = 0.02;

type Target =
  | { kind: 'start' }
  | { kind: 'draw' }
  | { kind: 'close' }
  | { kind: 'continue'; id: string; index: number }
  | { kind: 'add'; id: string; index: number; t: number }
  | { kind: 'remove'; id: string; index: number }
  | { kind: 'convert'; id: string; index: number };

// one press of the pen: the working copy of the path and the anchor whose handles a drag pulls
interface Gesture {
  item: PathItem;
  // set while the path is new and not in the document yet
  layerId: string | null;
  path: PathData;
  index: number;
  // out: only the out handle follows the pointer, the in handle stays as it is
  mode: 'symmetric' | 'out';
  label: string;
  start: ToolEvent;
  last: Vec;
  // the press changed the path by itself, even without a drag
  changed: boolean;
  dragging: boolean;
  broken: boolean;
  // closing ends the path once committed
  end: boolean;
}

let drawingId: string | null = null;
let gesture: Gesture | null = null;
// a ctrl press goes to the direct selection tool until the pointer comes up
let direct = false;
let pointer: ToolEvent | null = null;
let spaceDown = false;

function selectedPaths(): PathItem[] {
  return editor.selectedItems(false).filter((it): it is PathItem => it.type === 'path');
}

// the open path being drawn, undo or a click elsewhere can take it away
function drawingItem(): PathItem | null {
  if (!drawingId) return null;
  const item = editor.itemById(drawingId, false);
  if (!item || item.type !== 'path' || item.path.closed || !get(selection).has(drawingId)) {
    drawingId = null;
    return null;
  }
  return item;
}

function toLocal(id: string, p: Vec): Vec {
  return applyPoint(invert(editor.worldMatrixOf(id)), p);
}

function targetAt(e: ToolEvent): Target {
  const factor = pointerFactor(e.pointerType);
  const drawing = drawingItem();
  if (drawing) {
    const n = drawing.path.anchors.length;
    const hit = hitAnchor(drawing.path, editor.worldMatrixOf(drawing.id), e, e.zoom, factor);
    if (hit) {
      if (hit.index === 0 && n > 1) return { kind: 'close' };
      if (hit.index === n - 1 || e.alt) return { kind: 'convert', id: drawing.id, index: hit.index };
      return { kind: 'remove', id: drawing.id, index: hit.index };
    }
  }
  const paths = selectedPaths();
  for (const item of paths) {
    if (item.id === drawing?.id) continue;
    const hit = hitAnchor(item.path, editor.worldMatrixOf(item.id), e, e.zoom, factor);
    if (!hit) continue;
    const n = item.path.anchors.length;
    if (!drawing && !item.path.closed && (hit.index === 0 || hit.index === n - 1)) {
      return { kind: 'continue', id: item.id, index: hit.index };
    }
    if (e.alt) return { kind: 'convert', id: item.id, index: hit.index };
    return { kind: 'remove', id: item.id, index: hit.index };
  }
  for (const item of paths) {
    const world = editor.worldMatrixOf(item.id);
    const seg = hitSegment(item.path, world, e, e.zoom, strokeTolerance(item, world, e.zoom, factor));
    if (seg && seg.t > END_T && seg.t < 1 - END_T) return { kind: 'add', id: item.id, index: seg.index, t: seg.t };
  }
  return drawing ? { kind: 'draw' } : { kind: 'start' };
}

function setCursor(c: string) {
  if (get(toolCursor) !== c) toolCursor.set(c);
}

function updateCursor(e: ToolEvent) {
  if (e.ctrl) return;
  if (get(hover)) hover.set(null);
  setCursor(PEN_CURSORS[targetAt(e).kind]);
}

// the handles of this anchor show while it is the one being drawn
function pick(id: string, index: number) {
  anchorSelection.set([{ itemId: id, index }]);
}

function begin(e: ToolEvent, item: PathItem, path: PathData, index: number, mode: Gesture['mode'], label: string) {
  gesture = {
    item,
    layerId: null,
    path,
    index,
    mode,
    label,
    start: e,
    last: { x: e.x, y: e.y },
    changed: true,
    dragging: false,
    broken: false,
    end: false
  };
}

function showGesture() {
  const g = gesture;
  if (!g) return;
  if (g.layerId) editor.previewAdded = [{ layerId: g.layerId, item: { ...g.item, path: g.path } }];
  else editor.preview.set(g.item.id, { ...g.item, path: g.path });
  editor.markAll();
}

function startPath(e: ToolEvent) {
  const layer = drawingLayer();
  if (!layer) return;
  const path: PathData = { anchors: [makeAnchor(e.x, e.y)], closed: false };
  const item = makePathItem('Path', path, currentStyle());
  begin(e, item, copyPath(path), 0, 'symmetric', 'Draw path');
  gesture!.layerId = layer.id;
  anchorSelection.set([]);
  showGesture();
}

function removePoint(id: string, index: number) {
  const drawing = id === drawingId;
  let gone = false;
  editor.commit('Delete anchor point', (draft) => {
    const found = editor.draftFind(draft, id);
    if (!found || found.item.type !== 'path') return;
    removeAnchor(found.item.path, index);
    // a lone point is no path, unless it is the start of the one being drawn
    if (found.item.path.anchors.length < (drawing ? 1 : 2)) {
      found.list.splice(found.index, 1);
      gone = true;
    }
  });
  if (gone) {
    if (drawing) drawingId = null;
    anchorSelection.set([]);
  } else if (drawing) {
    const item = drawingItem();
    if (item) pick(id, item.path.anchors.length - 1);
  }
}

function addPoint(id: string, index: number, t: number) {
  editor.commit('Add anchor point', (draft) => {
    const found = editor.draftFind(draft, id);
    if (found && found.item.type === 'path') insertAnchor(found.item.path, index, t);
  });
  const item = drawingItem();
  if (item) pick(item.id, item.path.anchors.length - 1);
}

function down(e: ToolEvent) {
  pointer = e;
  if (e.ctrl) {
    direct = true;
    directTool.down?.(e);
    return;
  }
  const t = targetAt(e);
  switch (t.kind) {
    case 'start':
      startPath(e);
      return;
    case 'remove':
      removePoint(t.id, t.index);
      return;
    case 'add':
      addPoint(t.id, t.index, t.t);
      return;
    case 'draw': {
      const item = drawingItem()!;
      const path = copyPath(item.path);
      const world = editor.worldMatrixOf(item.id);
      const last = applyPoint(world, path.anchors[path.anchors.length - 1]);
      const p = toLocal(item.id, nextPoint(last, e, e.shift));
      path.anchors.push(makeAnchor(p.x, p.y));
      begin(e, item, path, path.anchors.length - 1, 'symmetric', 'Add anchor');
      break;
    }
    case 'close': {
      const item = drawingItem()!;
      const path = copyPath(item.path);
      path.closed = true;
      begin(e, item, path, 0, 'symmetric', 'Close path');
      gesture!.end = true;
      break;
    }
    case 'continue': {
      const item = editor.itemById(t.id, false) as PathItem;
      const path = copyPath(item.path);
      const index = continueFrom(path, t.index);
      drawingId = item.id;
      begin(e, item, path, index, 'out', 'Continue path');
      gesture!.changed = t.index === 0 && path.anchors.length > 1;
      break;
    }
    case 'convert': {
      const item = editor.itemById(t.id, false) as PathItem;
      const path = copyPath(item.path);
      const a = path.anchors[t.index];
      // the last anchor of the path being drawn loses only its out handle, the drawn curve stays
      const last = t.id === drawingId && t.index === path.anchors.length - 1;
      const had = last ? a.ox !== 0 || a.oy !== 0 : hasHandles(a);
      if (last) retractOut(a);
      else retractHandles(a);
      begin(e, item, path, t.index, last ? 'out' : 'symmetric', 'Convert anchor');
      gesture!.changed = had;
      break;
    }
  }
  if (gesture) {
    pick(gesture.item.id, gesture.index);
    showGesture();
  }
}

function drag(e: ToolEvent) {
  const g = gesture;
  if (!g) return;
  if (!g.dragging) {
    if (Math.hypot(e.sx - g.start.sx, e.sy - g.start.sy) < DRAG) return;
    g.dragging = true;
  }
  const inv = invert(g.layerId ? g.item.transform : editor.worldMatrixOf(g.item.id));
  const a = g.path.anchors[g.index];
  if (spaceDown) {
    // space held moves the anchor with its handles instead of pulling them
    const d = applyVector(inv, { x: e.x - g.last.x, y: e.y - g.last.y });
    a.x += d.x;
    a.y += d.y;
  } else {
    if (e.alt && g.mode === 'symmetric') g.broken = true;
    pullHandles(a, applyPoint(inv, e), g.broken || g.mode === 'out', e.shift);
  }
  g.last = { x: e.x, y: e.y };
  showGesture();
}

function up(e: ToolEvent) {
  pointer = e;
  if (direct) {
    direct = false;
    directTool.up?.(e);
    return;
  }
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
    editor.updateItem(
      g.item.id,
      (item) => {
        if (item.type === 'path') item.path = g.path;
      },
      g.label
    );
  }
  editor.clearPreview();
  if (g.end) {
    endPath();
    return;
  }
  drawingId = g.item.id;
  select([g.item.id]);
  pick(g.item.id, g.path.anchors.length - 1);
}

// enter, escape, another tool or a click elsewhere end the path, a lone point is dropped
function endPath() {
  const item = drawingItem();
  drawingId = null;
  anchorSelection.set([]);
  if (item && item.path.anchors.length < 2) editor.removeItems([item.id], 'Delete stray point');
  editor.markOverlay();
}

function cancelGesture() {
  gesture = null;
  editor.clearPreview();
}

function removeLast() {
  const item = drawingItem();
  if (!item) return;
  removePoint(item.id, item.path.anchors.length - 1);
}

function onkeyup(e: KeyboardEvent) {
  if (e.key === ' ') spaceDown = false;
  if (e.key === 'Control' && pointer) updateCursor({ ...pointer, ctrl: false });
}

function drawOverlay(ctx: CanvasRenderingContext2D) {
  const zoom = get(view).zoom;
  const g = gesture;
  if (g?.layerId) {
    // a brand new path is not selected yet, so its first anchor is drawn here
    const a = g.path.anchors[0];
    worldHandle(ctx, a, inPoint(a), PREVIEW_COLOR, zoom);
    worldHandle(ctx, a, outPoint(a), PREVIEW_COLOR, zoom);
    worldAnchor(ctx, a, a.kind === 'corner', true, PREVIEW_COLOR, zoom);
    return;
  }
  const drawing = drawingItem();
  if (!drawing || g || !pointer || pointer.ctrl || direct) return;
  const t = targetAt(pointer);
  if (t.kind !== 'draw' && t.kind !== 'close') return;
  const world = editor.worldMatrixOf(drawing.id);
  const anchors = drawing.path.anchors;
  const last = anchors[anchors.length - 1];
  const from = applyPoint(world, last);
  const c1 = applyPoint(world, outPoint(last));
  let to = nextPoint(from, pointer, pointer.shift);
  let c2 = to;
  if (t.kind === 'close') {
    to = applyPoint(world, anchors[0]);
    c2 = applyPoint(world, inPoint(anchors[0]));
  }
  setPreviewStroke(ctx, drawing.style, zoom);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
  ctx.stroke();
}

export const penTool: Tool = {
  ...toolBase('pen'),
  cursor: PEN_CURSORS.start,

  down,

  move(e) {
    if (direct) {
      directTool.move?.(e);
      return;
    }
    if (gesture) {
      drag(e);
      return;
    }
    pointer = e;
    if (e.ctrl) directTool.move?.(e);
    else updateCursor(e);
  },

  up,

  key(e) {
    if (e.key === ' ') {
      spaceDown = true;
      return;
    }
    if (e.key === 'Control') {
      setCursor('default');
      return;
    }
    if (e.key === 'Escape' && gesture) {
      e.preventDefault();
      cancelGesture();
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

  activate() {
    window.addEventListener('keyup', onkeyup);
    setCursor(PEN_CURSORS.start);
  },

  deactivate() {
    window.removeEventListener('keyup', onkeyup);
    if (gesture) cancelGesture();
    if (direct) {
      direct = false;
      directTool.deactivate?.();
    }
    endPath();
    spaceDown = false;
    pointer = null;
  }
};
