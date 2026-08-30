import { get } from 'svelte/store';
import type { Anchor, Mat, PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, applyVector, invert } from '$lib/core/mat';
import { snapAngle } from '$lib/core/vec';
import { contains, fromPoints } from '$lib/core/bbox';
import { bendSegment, copyPath, removeAnchor, segmentCubic } from '$lib/core/path';
import { contourOf, contours, setContour, withContour } from '$lib/core/items';
import { restContour } from '$lib/rig/skin';
import { hitContours, hitItemSegment, pointerFactor, strokeTolerance } from '$lib/core/hit';
import { editor, hover } from '$lib/editor/editor';
import { addToSelection, select } from '$lib/editor/selection';
import { overlayState } from '$lib/render/overlay';
import { clearSnap, snapEvent, snapPoint } from '$lib/editor/snap';
import { anchorSelection, selection, toolCursor, type AnchorRef } from '$lib/stores/app';
import { pickDeep } from './pick';
import { BEND_CURSOR } from './cursors';
import { toolBase, type Tool, type ToolEvent } from './tool';

const DRAG = 3;
const END_T = 0.02;

// item is the path as it shows, bent when it is bound to bones, rest the one in the document
type Action =
  | { kind: 'anchors' }
  | { kind: 'handle'; item: PathItem; rest: PathItem; world: Mat; sub: number; index: number; part: 'in' | 'out' }
  | { kind: 'bend'; item: PathItem; rest: PathItem; world: Mat; sub: number; index: number; t: number }
  | { kind: 'marquee'; add: boolean };

function selectedPaths(): PathItem[] {
  return editor.selectedItems(false).filter((it): it is PathItem => it.type === 'path');
}

// a bound path is edited the way it shows, anchors and handles sit where the bones bent them
function shownPath(item: PathItem): PathItem {
  const shown = editor.shownItem(item.id);
  return shown?.type === 'path' ? shown : item;
}

// a contour edited as it shows, put back into a copy of the document item through the bones
function restCopy(rest: PathItem, sub: number, path: PathData): PathItem {
  const rig = editor.rig();
  if (!rig || !rest.skin || rest.skin.rigid) return withContour(rest, sub, path);
  return withContour(rest, sub, restContour(rest, editor.parentMatrixOf(rest.id), rig, sub, path));
}

function same(a: AnchorRef, b: AnchorRef): boolean {
  return a.itemId === b.itemId && a.sub === b.sub && a.index === b.index;
}

function isPicked(ref: AnchorRef): boolean {
  return get(anchorSelection).some((a) => same(a, ref));
}

// every anchor of every contour of the item
function allAnchors(item: PathItem): AnchorRef[] {
  return contours(item).flatMap((c, sub) => c.anchors.map((_, index) => ({ itemId: item.id, sub, index })));
}

function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

// the other handle follows by the anchor kind: mirrored, in line, or left alone
function setHandle(a: Anchor, part: 'in' | 'out', x: number, y: number, breakIt: boolean) {
  if (breakIt) a.kind = 'corner';
  const ox = part === 'in' ? a.ox : a.ix;
  const oy = part === 'in' ? a.oy : a.iy;
  let nx = ox;
  let ny = oy;
  if (a.kind === 'symmetric') {
    nx = -x;
    ny = -y;
  } else if (a.kind === 'smooth') {
    const l = len(ox, oy);
    const d = len(x, y);
    if (d > 0) {
      nx = (-x / d) * l;
      ny = (-y / d) * l;
    }
  }
  if (part === 'in') {
    a.ix = x;
    a.iy = y;
    a.ox = nx;
    a.oy = ny;
  } else {
    a.ox = x;
    a.oy = y;
    a.ix = nx;
    a.iy = ny;
  }
}

// corner becomes smooth with handles along the line between the neighbors, smooth becomes a plain corner
function toggleKind(path: PathData, index: number) {
  const a = path.anchors[index];
  if (a.kind !== 'corner') {
    a.kind = 'corner';
    a.ix = a.iy = a.ox = a.oy = 0;
    return;
  }
  const n = path.anchors.length;
  const prev = index > 0 || path.closed ? path.anchors[(index - 1 + n) % n] : null;
  const next = index < n - 1 || path.closed ? path.anchors[(index + 1) % n] : null;
  const from: Vec = prev ?? a;
  const to: Vec = next ?? a;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = len(dx, dy);
  if (d === 0) return;
  const lin = prev ? len(a.x - prev.x, a.y - prev.y) / 3 : 0;
  const lout = next ? len(next.x - a.x, next.y - a.y) / 3 : 0;
  a.kind = 'smooth';
  a.ix = (-dx / d) * lin;
  a.iy = (-dy / d) * lin;
  a.ox = (dx / d) * lout;
  a.oy = (dy / d) * lout;
}

let action: Action | null = null;
let start: ToolEvent | null = null;
let dragging = false;
// the world point under the pointer that snaps while anchors move, the grabbed anchor itself
let grab: Vec | null = null;

function reset() {
  action = null;
  start = null;
  dragging = false;
  grab = null;
  overlayState.marquee = null;
  clearSnap();
}

function cancel() {
  editor.clearPreview();
  reset();
  editor.markAll();
}

function down(e: ToolEvent) {
  reset();
  start = e;
  const factor = pointerFactor(e.pointerType);

  for (const rest of selectedPaths()) {
    const item = shownPath(rest);
    const world = editor.shownWorld(item.id);
    const picked = (sub: number, index: number) => isPicked({ itemId: item.id, sub, index });
    const hit = hitContours(item, world, e, e.zoom, factor, picked);
    if (!hit) continue;
    if (hit.part === 'anchor') {
      const one = { itemId: item.id, sub: hit.sub, index: hit.index };
      const a = contourOf(item, hit.sub)?.anchors[hit.index];
      if (a) grab = applyPoint(world, a);
      if (e.shift) {
        const list = get(anchorSelection);
        anchorSelection.set(isPicked(one) ? list.filter((a) => !same(a, one)) : [...list, one]);
      } else if (!isPicked(one)) {
        anchorSelection.set([one]);
      }
      action = { kind: 'anchors' };
    } else {
      action = { kind: 'handle', item, rest, world, sub: hit.sub, index: hit.index, part: hit.part };
    }
    return;
  }

  for (const rest of selectedPaths()) {
    const item = shownPath(rest);
    const world = editor.shownWorld(item.id);
    const seg = hitItemSegment(item, world, e, e.zoom, strokeTolerance(item, world, e.zoom, factor));
    if (!seg) continue;
    pickSegment(item, rest, world, seg.sub, seg.index, seg.t, e.shift);
    return;
  }

  // a path that is not selected yet, inside groups too
  const hit = pickDeep(e, e.zoom, factor);
  if (hit) {
    if (e.shift) addToSelection([hit.id]);
    else select([hit.id]);
    if (hit.type !== 'path') {
      anchorSelection.set([]);
      return;
    }
    const shown = shownPath(hit);
    const world = editor.shownWorld(hit.id);
    const seg = hitItemSegment(shown, world, e, e.zoom, strokeTolerance(shown, world, e.zoom, factor));
    if (seg) {
      pickSegment(shown, hit, world, seg.sub, seg.index, seg.t, e.shift);
      return;
    }
    // inside the fill every anchor is picked, so a drag moves the whole path
    grab = { x: e.x, y: e.y };
    const all = allAnchors(hit);
    anchorSelection.set(e.shift ? [...get(anchorSelection), ...all] : all);
    action = { kind: 'anchors' };
    return;
  }
  action = { kind: 'marquee', add: e.shift };
}

// a click on a segment picks the anchors at both ends, a drag on it bends the curve
function pickSegment(item: PathItem, rest: PathItem, world: Mat, sub: number, index: number, t: number, add: boolean) {
  const n = contourOf(item, sub)?.anchors.length ?? 1;
  const both = [
    { itemId: item.id, sub, index },
    { itemId: item.id, sub, index: (index + 1) % n }
  ];
  anchorSelection.set(add ? [...get(anchorSelection), ...both] : both);
  if (t > END_T && t < 1 - END_T) action = { kind: 'bend', item, rest, world, sub, index, t };
  else action = { kind: 'anchors' };
}

// a copy of the document item with the picked anchors moved by d in its local space, a bound path moves
// them where they show and back through its bones
function movedAnchors(rest: PathItem, refs: AnchorRef[], d: Vec): PathItem {
  const item = shownPath(rest);
  let out = rest;
  for (const sub of new Set(refs.map((r) => r.sub))) {
    const c = contourOf(item, sub);
    if (!c) continue;
    const path = copyPath(c);
    for (const r of refs) {
      const a = r.sub === sub ? path.anchors[r.index] : null;
      if (!a) continue;
      a.x += d.x;
      a.y += d.y;
    }
    out = restCopy(out, sub, path);
  }
  return out;
}

function drag(e: ToolEvent) {
  if (!action || !start) return;
  let delta = { x: e.x - start.x, y: e.y - start.y };
  switch (action.kind) {
    case 'marquee':
      overlayState.marquee = fromPoints([start, e]);
      editor.markOverlay();
      return;
    case 'anchors': {
      const byItem = pickedByItem();
      if (grab) {
        const to = { x: grab.x + delta.x, y: grab.y + delta.y };
        const snapped = snapPoint(to, { zoom: e.zoom, exclude: byItem.keys(), show: true });
        delta = { x: snapped.x - grab.x, y: snapped.y - grab.y };
      }
      for (const [id, refs] of byItem) {
        const item = editor.itemById(id, false);
        if (!item || item.type !== 'path') continue;
        const d = applyVector(invert(editor.shownWorld(id)), delta);
        editor.preview.set(id, movedAnchors(item, refs, d));
      }
      break;
    }
    case 'handle': {
      const { item, rest, world, sub, index, part } = action;
      const c = contourOf(item, sub);
      if (!c) return;
      const path = copyPath(c);
      const a = path.anchors[index];
      // shift keeps the handle at 45 degree steps around its anchor
      let local = applyPoint(invert(world), snapEvent(e, { exclude: [item.id], show: true }));
      if (e.shift) local = snapAngle(a, local);
      setHandle(a, part, local.x - a.x, local.y - a.y, e.alt);
      editor.preview.set(item.id, restCopy(rest, sub, path));
      break;
    }
    case 'bend': {
      const { item, rest, world, sub, index, t } = action;
      const c = contourOf(item, sub);
      if (!c) return;
      const d = applyVector(invert(world), delta);
      const cubic = segmentCubic(c, index);
      const path = copyPath(c);
      bendSegment(path, index, t, cubic[1], cubic[2], d, e.alt);
      editor.preview.set(item.id, restCopy(rest, sub, path));
      break;
    }
  }
  editor.markAll();
}

// anchors of the editable paths inside the marquee, their items get selected too
function finishMarquee(add: boolean) {
  const box = overlayState.marquee;
  if (!box) return;
  const picked: AnchorRef[] = add ? [...get(anchorSelection)] : [];
  const ids = new Set<string>(add ? get(selection) : []);
  for (const layer of editor.currentLayers()) {
    if (!editor.isEditable(layer)) continue;
    for (const item of editor.shownItems(layer)) {
      if (item.type !== 'path' || item.locked || !item.visible) continue;
      contours(item).forEach((c, sub) => {
        c.anchors.forEach((a, index) => {
          if (!contains(box, applyPoint(item.transform, a))) return;
          const ref = { itemId: item.id, sub, index };
          if (!picked.some((p) => same(p, ref))) picked.push(ref);
          ids.add(item.id);
        });
      });
    }
  }
  selection.set(ids);
  anchorSelection.set(picked);
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};

function pickedByItem(): Map<string, AnchorRef[]> {
  const byItem = new Map<string, AnchorRef[]>();
  for (const a of get(anchorSelection)) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a]);
  return byItem;
}

// arrow keys move the picked anchors in world pixels, quick presses undo together
function nudgeAnchors(dx: number, dy: number) {
  const moved = new Map<string, { item: PathItem; subs: number[] }>();
  for (const [id, refs] of pickedByItem()) {
    const item = editor.itemById(id, false);
    if (item?.type !== 'path') continue;
    const d = applyVector(invert(editor.shownWorld(id)), { x: dx, y: dy });
    moved.set(id, { item: movedAnchors(item, refs, d), subs: [...new Set(refs.map((r) => r.sub))] });
  }
  editor.commit(
    'Nudge anchors',
    (draft) => {
      for (const [id, { item, subs }] of moved) {
        const found = editor.draftFind(draft, id);
        if (!found || found.item.type !== 'path') continue;
        for (const sub of subs) {
          const c = contourOf(item, sub);
          if (c) setContour(found.item, sub, copyPath(c));
        }
      }
    },
    'nudge-anchors'
  );
}

function deleteAnchors() {
  const byItem = pickedByItem();
  const emptied: string[] = [];
  editor.commit('Delete anchors', (draft) => {
    for (const [id, refs] of byItem) {
      const found = editor.draftFind(draft, id);
      if (!found || found.item.type !== 'path') continue;
      const item = found.item;
      // the last subpaths first, so the numbers of the others stay right
      const subs = [...new Set(refs.map((r) => r.sub))].sort((a, b) => b - a);
      for (const sub of subs) {
        const c = contourOf(item, sub);
        if (!c) continue;
        const indices = refs.filter((r) => r.sub === sub).map((r) => r.index);
        for (const i of indices.sort((a, b) => b - a)) removeAnchor(c, i);
        // a hole needs three anchors to stay a closed ring
        if (sub > 0 && c.anchors.length < 3) item.subpaths.splice(sub - 1, 1);
      }
      // a single point is not a path anymore
      if (item.path.anchors.length < 2) {
        found.list.splice(found.index, 1);
        emptied.push(id);
      }
    }
  });
  anchorSelection.set([]);
  if (emptied.length > 0) selection.set(new Set([...get(selection)].filter((id) => !emptied.includes(id))));
}

export const directTool: Tool = {
  ...toolBase('direct'),

  down,

  move(e) {
    if (!start) {
      const factor = pointerFactor(e.pointerType);
      const hit = pickDeep(e, e.zoom, factor);
      if (get(hover) !== (hit?.id ?? null)) hover.set(hit?.id ?? null);
      let cursor = 'default';
      for (const rest of selectedPaths()) {
        const item = shownPath(rest);
        const world = editor.shownWorld(item.id);
        if (hitContours(item, world, e, e.zoom, factor)) break;
        if (hitItemSegment(item, world, e, e.zoom, strokeTolerance(item, world, e.zoom, factor))) {
          cursor = BEND_CURSOR;
          break;
        }
      }
      if (get(toolCursor) !== cursor) toolCursor.set(cursor);
      return;
    }
    if (!action) return;
    if (!dragging) {
      if (Math.hypot(e.sx - start.sx, e.sy - start.sy) < DRAG) return;
      dragging = true;
      hover.set(null);
    }
    drag(e);
  },

  up() {
    if (action && dragging) {
      if (action.kind === 'marquee') finishMarquee(action.add);
      else if (action.kind === 'anchors') editor.commitPreview('Move anchors');
      else if (action.kind === 'handle') editor.commitPreview('Move handle');
      else editor.commitPreview('Bend');
    } else if (action?.kind === 'marquee' && !action.add) {
      anchorSelection.set([]);
      selection.set(new Set());
    }
    reset();
    editor.markAll();
  },

  // a double click on an anchor turns a corner smooth and a smooth one into a corner
  dblclick(e) {
    const factor = pointerFactor(e.pointerType);
    for (const item of selectedPaths()) {
      const hit = hitContours(shownPath(item), editor.shownWorld(item.id), e, e.zoom, factor);
      if (!hit || hit.part !== 'anchor') continue;
      editor.commit('Convert anchor', (draft) => {
        const found = editor.draftFind(draft, item.id);
        const c = found && found.item.type === 'path' ? contourOf(found.item, hit.sub) : null;
        if (c) toggleKind(c, hit.index);
      });
      return;
    }
  },

  key(e) {
    if (e.key === 'Escape' && start) {
      e.preventDefault();
      cancel();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && get(anchorSelection).length > 0) {
      e.preventDefault();
      deleteAnchors();
      return;
    }
    const dir = ARROWS[e.key];
    if (dir && !e.ctrlKey && !e.metaKey && !e.altKey && get(anchorSelection).length > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudgeAnchors(dir[0] * step, dir[1] * step);
    }
  },

  deactivate() {
    if (start) cancel();
    hover.set(null);
  }
};
