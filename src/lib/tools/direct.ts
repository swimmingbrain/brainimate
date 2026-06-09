import { get } from 'svelte/store';
import type { Anchor, Mat, PathData, PathItem, Vec } from '$lib/core/types';
import { applyPoint, applyVector, invert } from '$lib/core/mat';
import { contains, fromPoints } from '$lib/core/bbox';
import { bendSegment, copyPath, removeAnchor, segmentCubic } from '$lib/core/path';
import { hitAnchor, hitSegment, pointerFactor, strokeTolerance } from '$lib/core/hit';
import { editor, hover } from '$lib/editor/editor';
import { select } from '$lib/editor/selection';
import { overlayState } from '$lib/render/overlay';
import { anchorSelection, selection, toolCursor } from '$lib/stores/app';
import { pickItem } from './pick';
import { BEND_CURSOR } from './cursors';
import { toolBase, type Tool, type ToolEvent } from './tool';

const DRAG = 3;
const END_T = 0.02;

type Picked = { itemId: string; index: number };

type Action =
  | { kind: 'anchors' }
  | { kind: 'handle'; item: PathItem; world: Mat; index: number; part: 'in' | 'out' }
  | { kind: 'bend'; item: PathItem; world: Mat; index: number; t: number }
  | { kind: 'marquee'; add: boolean };

function selectedPaths(): PathItem[] {
  return editor.selectedItems(false).filter((it): it is PathItem => it.type === 'path');
}

function isPicked(itemId: string, index: number): boolean {
  return get(anchorSelection).some((a) => a.itemId === itemId && a.index === index);
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

function reset() {
  action = null;
  start = null;
  dragging = false;
  overlayState.marquee = null;
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

  for (const item of selectedPaths()) {
    const world = editor.worldMatrixOf(item.id);
    const hit = hitAnchor(item.path, world, e, e.zoom, factor, (i) => isPicked(item.id, i));
    if (!hit) continue;
    if (hit.part === 'anchor') {
      const one = { itemId: item.id, index: hit.index };
      if (e.shift) {
        const list = get(anchorSelection);
        const rest = list.filter((a) => a.itemId !== item.id || a.index !== hit.index);
        anchorSelection.set(isPicked(item.id, hit.index) ? rest : [...list, one]);
      } else if (!isPicked(item.id, hit.index)) {
        anchorSelection.set([one]);
      }
      action = { kind: 'anchors' };
    } else {
      action = { kind: 'handle', item, world, index: hit.index, part: hit.part };
    }
    return;
  }

  for (const item of selectedPaths()) {
    const world = editor.worldMatrixOf(item.id);
    const seg = hitSegment(item.path, world, e, e.zoom, strokeTolerance(item, world, e.zoom, factor));
    if (!seg) continue;
    const next = (seg.index + 1) % item.path.anchors.length;
    anchorSelection.set([
      { itemId: item.id, index: seg.index },
      { itemId: item.id, index: next }
    ]);
    if (seg.t > END_T && seg.t < 1 - END_T) action = { kind: 'bend', item, world, index: seg.index, t: seg.t };
    else action = { kind: 'anchors' };
    return;
  }

  const hit = pickItem(e, e.zoom, factor);
  if (hit) {
    select([hit.id]);
    anchorSelection.set([]);
    return;
  }
  action = { kind: 'marquee', add: e.shift };
}

function drag(e: ToolEvent) {
  if (!action || !start) return;
  const delta = { x: e.x - start.x, y: e.y - start.y };
  switch (action.kind) {
    case 'marquee':
      overlayState.marquee = fromPoints([start, e]);
      editor.markOverlay();
      return;
    case 'anchors': {
      const byItem = new Map<string, number[]>();
      for (const a of get(anchorSelection)) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a.index]);
      for (const [id, indices] of byItem) {
        const item = editor.itemById(id, false);
        if (!item || item.type !== 'path') continue;
        const d = applyVector(invert(editor.worldMatrixOf(id)), delta);
        const path = copyPath(item.path);
        for (const i of indices) {
          if (!path.anchors[i]) continue;
          path.anchors[i].x += d.x;
          path.anchors[i].y += d.y;
        }
        editor.preview.set(id, { ...item, path });
      }
      break;
    }
    case 'handle': {
      const { item, world, index, part } = action;
      const local = applyPoint(invert(world), e);
      const path = copyPath(item.path);
      const a = path.anchors[index];
      setHandle(a, part, local.x - a.x, local.y - a.y, e.alt);
      editor.preview.set(item.id, { ...item, path });
      break;
    }
    case 'bend': {
      const { item, world, index, t } = action;
      const d = applyVector(invert(world), delta);
      const c = segmentCubic(item.path, index);
      const path = copyPath(item.path);
      bendSegment(path, index, t, c[1], c[2], d, e.alt);
      editor.preview.set(item.id, { ...item, path });
      break;
    }
  }
  editor.markAll();
}

// anchors of the editable paths inside the marquee, their items get selected too
function finishMarquee(add: boolean) {
  const box = overlayState.marquee;
  if (!box) return;
  const picked: Picked[] = add ? [...get(anchorSelection)] : [];
  const ids = new Set<string>(add ? get(selection) : []);
  for (const layer of editor.currentLayers()) {
    if (!editor.isEditable(layer)) continue;
    for (const item of editor.layerItems(layer)) {
      if (item.type !== 'path' || item.locked || !item.visible) continue;
      item.path.anchors.forEach((a, index) => {
        if (!contains(box, applyPoint(item.transform, a))) return;
        if (!picked.some((p) => p.itemId === item.id && p.index === index)) picked.push({ itemId: item.id, index });
        ids.add(item.id);
      });
    }
  }
  selection.set(ids);
  anchorSelection.set(picked);
}

function deleteAnchors() {
  const byItem = new Map<string, number[]>();
  for (const a of get(anchorSelection)) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a.index]);
  const emptied: string[] = [];
  editor.commit('Delete anchors', (draft) => {
    for (const [id, indices] of byItem) {
      const found = editor.draftFind(draft, id);
      if (!found || found.item.type !== 'path') continue;
      const path = found.item.path;
      for (const i of [...indices].sort((a, b) => b - a)) removeAnchor(path, i);
      // a single point is not a path anymore
      if (path.anchors.length < 2) {
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
      const hit = pickItem(e, e.zoom, factor);
      if (get(hover) !== (hit?.id ?? null)) hover.set(hit?.id ?? null);
      let cursor = 'default';
      for (const item of selectedPaths()) {
        const world = editor.worldMatrixOf(item.id);
        if (hitAnchor(item.path, world, e, e.zoom, factor)) break;
        if (hitSegment(item.path, world, e, e.zoom, strokeTolerance(item, world, e.zoom, factor))) {
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
      const hit = hitAnchor(item.path, editor.worldMatrixOf(item.id), e, e.zoom, factor);
      if (!hit || hit.part !== 'anchor') continue;
      editor.commit('Convert anchor', (draft) => {
        const found = editor.draftFind(draft, item.id);
        if (found && found.item.type === 'path') toggleKind(found.item.path, hit.index);
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
    }
  },

  deactivate() {
    if (start) cancel();
    hover.set(null);
  }
};
