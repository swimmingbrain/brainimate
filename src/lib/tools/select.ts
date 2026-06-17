import { get } from 'svelte/store';
import type { Item, Mat, PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, applyVector, around, invert, multiply, rotate, scale, translate } from '$lib/core/mat';
import { snapAngle } from '$lib/core/vec';
import { fromPoints } from '$lib/core/bbox';
import { withNewIds } from '$lib/core/items';
import { bendSegment, copyPath, insertAnchor, segmentCubic } from '$lib/core/path';
import { hitAnchor, hitSegment, pointerFactor, strokeTolerance } from '$lib/core/hit';
import { editor, hover } from '$lib/editor/editor';
import {
  HANDLE_UNITS,
  addToSelection,
  clearSelection,
  frameHandles,
  framePoint,
  isSelected,
  select,
  selectionFrame,
  selectionSnapshot,
  toggleSelect,
  transformedSelection,
  type SelectionFrame
} from '$lib/editor/selection';
import { HANDLE_SIZE, overlayState } from '$lib/render/overlay';
import { selection, toolCursor } from '$lib/stores/app';
import { itemsInBox, pickChain, pickForSelect } from './pick';
import { BEND_CURSOR, CORNER_CURSOR, ROTATE_CURSOR, resizeCursor } from './cursors';
import { toolBase, type Tool, type ToolEvent, type ToolId } from './tool';

// screen pixels the pointer travels before a click turns into a drag
const DRAG = 3;
// how far outside a corner of the handle box the rotate cursor shows, screen pixels
const ROTATE_ZONE = 18;
// t this close to an end moves the anchor instead, the bend weights blow up there
const END_T = 0.02;

type Action =
  | { kind: 'marquee'; add: boolean }
  | { kind: 'move' }
  | { kind: 'scale'; handle: number; frame: SelectionFrame }
  | { kind: 'rotate'; pivot: Vec }
  | { kind: 'bend'; item: PathItem; world: Mat; index: number; t: number }
  | { kind: 'anchor'; item: PathItem; path: PathData; world: Mat; index: number }
  | { kind: 'split'; item: PathItem; world: Mat; index: number; t: number };

function handleAt(f: SelectionFrame, e: ToolEvent, factor: number): number {
  const reach = ((HANDLE_SIZE / 2 + 2) * factor) / e.zoom;
  const handles = frameHandles(f);
  for (let i = 0; i < handles.length; i++) {
    if (Math.hypot(handles[i].x - e.x, handles[i].y - e.y) <= reach) return i;
  }
  return -1;
}

function insideFrame(f: SelectionFrame, p: Vec): boolean {
  const u = applyPoint(invert(f.m), p);
  return u.x >= 0 && u.x <= f.w && u.y >= 0 && u.y <= f.h;
}

// just outside one of the four corners, not on its handle
function inRotateZone(f: SelectionFrame, e: ToolEvent, factor: number): boolean {
  if (insideFrame(f, e)) return false;
  const handles = frameHandles(f);
  for (const i of [0, 2, 4, 6]) {
    const d = Math.hypot(handles[i].x - e.x, handles[i].y - e.y) * e.zoom;
    if (d <= ROTATE_ZONE * factor) return true;
  }
  return false;
}

function handleCursor(f: SelectionFrame, index: number): string {
  const c = framePoint(f, { x: 0.5, y: 0.5 });
  const h = frameHandles(f)[index];
  return resizeCursor((Math.atan2(h.y - c.y, h.x - c.x) * 180) / Math.PI);
}

// scales in the box space of the frame, anchored on the opposite handle or the middle with alt
function scaleMatrix(f: SelectionFrame, handle: number, start: Vec, e: ToolEvent): Mat {
  const hu = HANDLE_UNITS[handle];
  const au = e.alt ? { x: 0.5, y: 0.5 } : { x: 1 - hu.x, y: 1 - hu.y };
  const inv = invert(f.m);
  const now = applyPoint(inv, e);
  const then = applyPoint(inv, start);
  const ax = au.x * f.w;
  const ay = au.y * f.h;
  const hx = hu.x * f.w;
  const hy = hu.y * f.h;
  // the handle follows the pointer by the distance moved, so grabbing it a bit off center does not jump
  const cx = hx + now.x - then.x;
  const cy = hy + now.y - then.y;
  let sx = hu.x !== 0.5 && Math.abs(hx - ax) > 1e-9 ? (cx - ax) / (hx - ax) : 1;
  let sy = hu.y !== 0.5 && Math.abs(hy - ay) > 1e-9 ? (cy - ay) / (hy - ay) : 1;
  if (e.shift) {
    if (hu.x === 0.5) sx = Math.abs(sy);
    else if (hu.y === 0.5) sy = Math.abs(sx);
    else {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = Math.sign(sx || 1) * s;
      sy = Math.sign(sy || 1) * s;
    }
  }
  // a zero scale would make the items vanish for good
  if (Math.abs(sx) < 1e-3) sx = 1e-3 * Math.sign(sx || 1);
  if (Math.abs(sy) < 1e-3) sy = 1e-3 * Math.sign(sy || 1);
  const s = multiply(translate(ax, ay), multiply(scale(sx, sy), translate(-ax, -ay)));
  return multiply(f.m, multiply(s, inv));
}

// the select tool and free transform share this, free transform will add skew later
export function createSelectTool(id: ToolId): Tool {
  let action: Action | null = null;
  let start: ToolEvent | null = null;
  let dragging = false;
  // the selected items as the document had them when the drag began
  let base = new Map<string, Item>();
  // alt drag copies, drawn and added on top of their layers
  let copies: { layerId: string; item: Item }[] | null = null;
  // an unselected path under a click that only selects it if the pointer does not move
  let clickItem: string | null = null;

  function setCursor(c: string) {
    if (get(toolCursor) !== c) toolCursor.set(c);
  }

  function reset() {
    action = null;
    start = null;
    dragging = false;
    base = new Map();
    copies = null;
    clickItem = null;
    overlayState.marquee = null;
  }

  function cancel() {
    editor.clearPreview();
    reset();
    editor.markAll();
  }

  function hoverAt(e: ToolEvent) {
    const factor = pointerFactor(e.pointerType);
    const f = get(selection).size > 0 ? selectionFrame() : null;
    if (f) {
      const h = handleAt(f, e, factor);
      if (h >= 0) {
        hover.set(null);
        setCursor(handleCursor(f, h));
        return;
      }
      if (inRotateZone(f, e, factor)) {
        hover.set(null);
        setCursor(ROTATE_CURSOR);
        return;
      }
    }
    const hit = pickForSelect(e, e.zoom, factor);
    if (get(hover) !== (hit?.id ?? null)) hover.set(hit?.id ?? null);
    if (!hit) return setCursor('default');
    if (isSelected(hit.id) || hit.type !== 'path') return setCursor('move');
    const world = editor.worldMatrixOf(hit.id);
    if (hitAnchor(hit.path, world, e, e.zoom, factor)) return setCursor(CORNER_CURSOR);
    if (hitSegment(hit.path, world, e, e.zoom, strokeTolerance(hit, world, e.zoom, factor))) {
      return setCursor(e.ctrl ? CORNER_CURSOR : BEND_CURSOR);
    }
    setCursor('move');
  }

  function down(e: ToolEvent) {
    reset();
    start = e;
    const factor = pointerFactor(e.pointerType);
    const f = get(selection).size > 0 ? selectionFrame() : null;
    if (f) {
      const h = handleAt(f, e, factor);
      if (h >= 0) {
        action = { kind: 'scale', handle: h, frame: f };
        base = selectionSnapshot();
        return;
      }
      if (inRotateZone(f, e, factor)) {
        action = { kind: 'rotate', pivot: framePoint(f, { x: 0.5, y: 0.5 }) };
        base = selectionSnapshot();
        return;
      }
    }

    const hit = pickForSelect(e, e.zoom, factor);
    if (!hit) {
      action = { kind: 'marquee', add: e.shift };
      if (!e.shift) clearSelection();
      return;
    }
    if (e.shift) {
      toggleSelect(hit.id);
      if (isSelected(hit.id)) {
        action = { kind: 'move' };
        base = selectionSnapshot();
      }
      return;
    }
    if (isSelected(hit.id)) {
      action = { kind: 'move' };
      base = selectionSnapshot();
      return;
    }

    // an unselected path: its edge bends, its anchors move, ctrl on the edge pulls a corner
    if (hit.type === 'path') {
      const world = editor.worldMatrixOf(hit.id);
      const tol = strokeTolerance(hit, world, e.zoom, factor);
      const seg = hitSegment(hit.path, world, e, e.zoom, tol);
      const anchor = hitAnchor(hit.path, world, e, e.zoom, factor);
      clickItem = hit.id;
      if (e.ctrl && seg) {
        action = { kind: 'split', item: hit, world, index: seg.index, t: seg.t };
        return;
      }
      if (anchor && anchor.part === 'anchor') {
        action = { kind: 'anchor', item: hit, path: hit.path, world, index: anchor.index };
        return;
      }
      if (seg) {
        if (seg.t < END_T || seg.t > 1 - END_T) {
          const n = hit.path.anchors.length;
          const index = seg.t < 0.5 ? seg.index : (seg.index + 1) % n;
          action = { kind: 'anchor', item: hit, path: hit.path, world, index };
        } else {
          action = { kind: 'bend', item: hit, world, index: seg.index, t: seg.t };
        }
        return;
      }
    }

    // inside a fill, the item is selected right away and a drag moves it
    clickItem = null;
    select([hit.id]);
    action = { kind: 'move' };
    base = selectionSnapshot();
  }

  function beginDrag(e: ToolEvent) {
    hover.set(null);
    if (!action) return;
    if (action.kind === 'move' && (start?.alt || e.alt)) {
      copies = [];
      for (const [id, item] of base) {
        const layer = editor.layerOfItem(id);
        if (!layer) continue;
        // a child of a group is copied out to the layer with the group transforms baked in
        const copy = withNewIds(item);
        copy.transform = multiply(editor.parentMatrixOf(id), item.transform);
        copies.push({ layerId: layer.id, item: copy });
      }
    }
    if (action.kind === 'split') {
      // the new corner has no handles, so the bend is sharp
      const path = copyPath(action.item.path);
      const index = insertAnchor(path, action.index, action.t);
      const a = path.anchors[index];
      a.ix = a.iy = a.ox = a.oy = 0;
      a.kind = 'corner';
      action = { kind: 'anchor', item: action.item, path, world: action.world, index };
    }
  }

  function drag(e: ToolEvent) {
    if (!action || !start) return;
    switch (action.kind) {
      case 'marquee':
        overlayState.marquee = fromPoints([start, e]);
        editor.markOverlay();
        return;
      case 'move': {
        const end = e.shift ? snapAngle(start, e) : e;
        const m = translate(end.x - start.x, end.y - start.y);
        if (copies) {
          editor.previewAdded = copies.map((c) => ({
            layerId: c.layerId,
            item: { ...c.item, transform: multiply(m, c.item.transform) }
          }));
        } else {
          editor.preview = transformedSelection(m, base);
        }
        break;
      }
      case 'scale':
        editor.preview = transformedSelection(scaleMatrix(action.frame, action.handle, start, e), base);
        break;
      case 'rotate': {
        const p = action.pivot;
        let a = Math.atan2(e.y - p.y, e.x - p.x) - Math.atan2(start.y - p.y, start.x - p.x);
        if (e.shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        editor.preview = transformedSelection(around(rotate(a), p), base);
        break;
      }
      case 'bend': {
        const { item, world, index, t } = action;
        const d = applyVector(invert(world), { x: e.x - start.x, y: e.y - start.y });
        const c = segmentCubic(item.path, index);
        const path = copyPath(item.path);
        bendSegment(path, index, t, c[1], c[2], d, e.alt);
        editor.preview.set(item.id, { ...item, path });
        break;
      }
      case 'anchor': {
        const { item, world, index } = action;
        const d = applyVector(invert(world), { x: e.x - start.x, y: e.y - start.y });
        const path = copyPath(action.path);
        path.anchors[index].x += d.x;
        path.anchors[index].y += d.y;
        editor.preview.set(item.id, { ...item, path });
        break;
      }
      default:
        return;
    }
    editor.markAll();
  }

  function finish() {
    if (!action || !start) return;
    switch (action.kind) {
      case 'marquee': {
        const box = overlayState.marquee;
        const ids = box ? itemsInBox(box) : [];
        if (action.add) addToSelection(ids);
        else select(ids);
        break;
      }
      case 'move':
        if (copies) {
          const ids = editor.previewAdded.map((c) => c.item.id);
          editor.commitPreview('Duplicate');
          select(ids);
        } else {
          editor.commitPreview('Move');
        }
        break;
      case 'scale':
        editor.commitPreview('Scale');
        break;
      case 'rotate':
        editor.commitPreview('Rotate');
        break;
      case 'bend':
        editor.commitPreview('Bend');
        break;
      case 'anchor':
        editor.commitPreview(action.path === action.item.path ? 'Move anchor' : 'Add corner');
        break;
    }
  }

  return {
    ...toolBase(id),

    down,

    move(e) {
      if (!action || !start) {
        if (!start) hoverAt(e);
        return;
      }
      if (!dragging) {
        if (Math.hypot(e.sx - start.sx, e.sy - start.sy) < DRAG) return;
        dragging = true;
        beginDrag(e);
      }
      drag(e);
    },

    up() {
      if (!start) return;
      if (dragging) finish();
      else if (clickItem) select([clickItem]);
      reset();
      editor.markAll();
    },

    // a double click enters a group one level, the item inside it under the pointer gets selected
    dblclick(e) {
      const chain = pickChain(e, e.zoom, pointerFactor(e.pointerType));
      const sel = get(selection);
      let deepest = -1;
      chain.forEach((item, i) => {
        if (sel.has(item.id)) deepest = i;
      });
      const next = chain[deepest + 1];
      if (next && deepest >= 0) select([next.id]);
    },

    key(e) {
      if (e.key === 'Escape' && start) {
        e.preventDefault();
        cancel();
      }
    },

    activate() {
      setCursor('default');
    },

    deactivate() {
      if (start) cancel();
      hover.set(null);
    }
  };
}

export const selectionTool = createSelectTool('select');
export const transformTool = createSelectTool('transform');
