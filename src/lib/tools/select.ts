import { get } from 'svelte/store';
import type { Item, Mat, PathData, PathItem, Skin, Vec } from '$lib/core/types';
import { applyPoint, applyVector, around, invert, multiply, rotate, scale, translate } from '$lib/core/mat';
import { snapAngle } from '$lib/core/vec';
import { fromPoints, isEmpty, translateBox, type Box } from '$lib/core/bbox';
import { contourOf, withContour, withNewIds } from '$lib/core/items';
import { insertWeights, restContour } from '$lib/rig/skin';
import { JOINT_TOLERANCE, hitJoint, jointsOf, poseOf, timelineBones, type Joint, type Pose } from '$lib/rig/bones';
import { rotateBone, solveChain } from '$lib/rig/ik';
import { canEditRig, commitPose, togglePin } from '$lib/editor/rig';
import { preferences } from '$lib/stores/preferences';
import { bendSegment, copyPath, insertAnchor, segmentCubic } from '$lib/core/path';
import { hitContours, hitItemSegment, pointerFactor, strokeTolerance } from '$lib/core/hit';
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
import { clearSnap, snapEvent, snapPoint } from '$lib/editor/snap';
import { addToast, boneSelection, selection, toolCursor } from '$lib/stores/app';
import { itemsInBox, pickChain, pickForSelect } from './pick';
import { editInstance } from '$lib/editor/symbols';
import { startTextEdit } from '$lib/editor/text';
import { BEND_CURSOR, CORNER_CURSOR, ROTATE_CURSOR, resizeCursor } from './cursors';
import { toolBase, type Tool, type ToolEvent, type ToolId } from './tool';
import SelectOptions from './options/SelectOptions.svelte';

// screen pixels the pointer travels before a click turns into a drag
const DRAG = 3;
// how far outside a corner of the handle box the rotate cursor shows, screen pixels
const ROTATE_ZONE = 18;
// t this close to an end moves the anchor instead, the bend weights blow up there
const END_T = 0.02;
// shift turns bones in steps of 15 degrees
const STEP = Math.PI / 12;

type Action =
  // a joint dragged: effector is the bone that reaches for the pointer at its point local, none for a root
  | {
      kind: 'pose';
      layerId: string;
      joint: Joint;
      start: Pose;
      effector: string | null;
      local: Vec;
      // the bend side of the chain, kept for the whole drag
      memo: { side?: number };
    }
  | { kind: 'marquee'; add: boolean }
  | { kind: 'move' }
  | { kind: 'scale'; handle: number; frame: SelectionFrame }
  | { kind: 'rotate'; pivot: Vec }
  // item is the path as it shows, bent when it is bound to bones, rest the one in the document
  | { kind: 'bend'; item: PathItem; rest: PathItem; world: Mat; sub: number; index: number; t: number }
  // path is the contour being edited, a new copy when a corner was pulled out of a segment
  | {
      kind: 'anchor';
      item: PathItem;
      rest: PathItem;
      path: PathData;
      world: Mat;
      sub: number;
      index: number;
      split: boolean;
      // the weights of a bound path with the new corner in them
      skin?: Skin | null;
    }
  | { kind: 'split'; item: PathItem; rest: PathItem; world: Mat; sub: number; index: number; t: number };

// a joint of a rig layer that shows and is not locked, the selection tool grabs those before anything else
function poseJointAt(e: ToolEvent): { joint: Joint; layerId: string } | null {
  if (!get(preferences).rig.showBones) return null;
  const rig = editor.rig();
  if (!rig) return null;
  const layers = editor.currentLayers().filter((l) => l.type === 'rig' && canEditRig(l));
  const bones = layers.flatMap((l) => l.bones);
  const joint = hitJoint(jointsOf(bones, rig.world), e, (JOINT_TOLERANCE * pointerFactor(e.pointerType)) / e.zoom);
  const layer = joint ? layers.find((l) => l.bones.includes(joint.bone)) : null;
  return joint && layer ? { joint, layerId: layer.id } : null;
}

function setJointHover(j: Joint | null) {
  const was = overlayState.joint;
  if (was?.bone === j?.bone.id && was?.end === j?.end) return;
  overlayState.joint = j ? { bone: j.bone.id, end: j.end } : null;
  editor.markOverlay();
}

// a contour edited the way it shows, put into a copy of the document item through the bones it is bound to
function restCopy(rest: PathItem, sub: number, path: PathData, skin?: Skin | null): PathItem {
  const base = skin !== undefined ? { ...rest, skin } : rest;
  const rig = editor.rig();
  if (!rig || !base.skin || base.skin.rigid) return withContour(base, sub, path);
  return withContour(base, sub, restContour(base, editor.parentMatrixOf(rest.id), rig, sub, path));
}

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
  // the bounds of what is moved, its edges and middle snap
  let startBox: Box | null = null;

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
    startBox = null;
    overlayState.marquee = null;
    clearSnap();
  }

  function cancel() {
    editor.clearPreview();
    reset();
    editor.markAll();
  }

  function hoverAt(e: ToolEvent) {
    const factor = pointerFactor(e.pointerType);
    const pj = poseJointAt(e);
    setJointHover(pj?.joint ?? null);
    if (pj) {
      hover.set(null);
      return setCursor('move');
    }
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
    const shown = editor.shownItem(hit.id) ?? hit;
    if (isSelected(hit.id) || shown.type !== 'path') return setCursor('move');
    const world = editor.shownWorld(hit.id);
    if (hitContours(shown, world, e, e.zoom, factor)) return setCursor(CORNER_CURSOR);
    if (hitItemSegment(shown, world, e, e.zoom, strokeTolerance(shown, world, e.zoom, factor))) {
      return setCursor(e.ctrl ? CORNER_CURSOR : BEND_CURSOR);
    }
    setCursor('move');
  }

  // a press on a joint picks its bone, a drag poses: the chain above reaches for the pointer, alt turns
  // only the bone the joint sits on, a root joint moves the whole rig
  function grabJoint(e: ToolEvent): boolean {
    const pj = poseJointAt(e);
    const rig = editor.rig();
    if (!pj || !rig) return false;
    const { joint, layerId } = pj;
    const bone = joint.bone;
    boneSelection.set(bone.id);
    let effector: string | null = null;
    let local: Vec = { x: 0, y: 0 };
    if (joint.end === 'tip') {
      effector = bone.id;
      local = { x: bone.length, y: 0 };
    } else if (bone.parent) {
      const p = poseOf(rig.pose, bone.id);
      effector = bone.parent;
      local = { x: bone.x + p.x, y: bone.y + p.y };
    }
    action = { kind: 'pose', layerId, joint, start: { ...rig.pose }, effector, local, memo: {} };
    editor.markOverlay();
    return true;
  }

  function down(e: ToolEvent) {
    reset();
    start = e;
    const factor = pointerFactor(e.pointerType);
    if (grabJoint(e)) return;
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
      if (!e.shift) {
        clearSelection();
        boneSelection.set(null);
      }
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
    // a bound path is grabbed where it shows, the edit goes back through its bones
    const shown = editor.shownItem(hit.id) ?? hit;
    if (hit.type === 'path' && shown.type === 'path') {
      const rest = hit;
      const item = shown;
      const world = editor.shownWorld(hit.id);
      const tol = strokeTolerance(item, world, e.zoom, factor);
      const seg = hitItemSegment(item, world, e, e.zoom, tol);
      const anchor = hitContours(item, world, e, e.zoom, factor);
      clickItem = hit.id;
      if (e.ctrl && seg) {
        action = { kind: 'split', item, rest, world, sub: seg.sub, index: seg.index, t: seg.t };
        return;
      }
      if (anchor && anchor.part === 'anchor') {
        const path = contourOf(item, anchor.sub)!;
        action = { kind: 'anchor', item, rest, path, world, sub: anchor.sub, index: anchor.index, split: false };
        return;
      }
      if (seg) {
        const path = contourOf(item, seg.sub)!;
        if (seg.t < END_T || seg.t > 1 - END_T) {
          const index = seg.t < 0.5 ? seg.index : (seg.index + 1) % path.anchors.length;
          action = { kind: 'anchor', item, rest, path, world, sub: seg.sub, index, split: false };
        } else {
          action = { kind: 'bend', item, rest, world, sub: seg.sub, index: seg.index, t: seg.t };
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
    if (action.kind === 'move') {
      const b = editor.selectionBounds();
      startBox = isEmpty(b) ? null : b;
    }
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
      const { item, rest, world, sub } = action;
      const path = copyPath(contourOf(item, sub)!);
      const index = insertAnchor(path, action.index, action.t);
      const a = path.anchors[index];
      a.ix = a.iy = a.ox = a.oy = 0;
      a.kind = 'corner';
      const skin = rest.skin ? insertWeights(rest, sub, action.index, action.t) : undefined;
      action = { kind: 'anchor', item, rest, path, world, sub, index, split: true, skin };
    }
  }

  function drag(e: ToolEvent) {
    if (!action || !start) return;
    switch (action.kind) {
      case 'pose': {
        const bones = timelineBones(editor.currentLayers());
        const { joint, effector, local } = action;
        const snap = e.shift ? STEP : 0;
        let pose: Pose;
        if (!effector) {
          // a pinned root stays where it is
          if (joint.bone.pinned) return;
          const p = poseOf(action.start, joint.bone.id);
          pose = { ...action.start, [joint.bone.id]: { ...p, x: p.x + e.x - start.x, y: p.y + e.y - start.y } };
        } else if (e.alt) {
          pose = rotateBone(bones, action.start, effector, joint.point, e, snap);
        } else {
          const limit = get(preferences).rig.chainLimit;
          const opts = { limit, memo: action.memo, snap };
          pose = solveChain(bones, action.start, effector, local, { x: e.x, y: e.y }, opts);
        }
        editor.posePreview = { layerId: action.layerId, pose };
        break;
      }
      case 'marquee':
        overlayState.marquee = fromPoints([start, e]);
        editor.markOverlay();
        return;
      case 'move': {
        let end: Vec = { x: e.x, y: e.y };
        if (startBox) {
          const box = translateBox(startBox, e.x - start.x, e.y - start.y);
          end = snapPoint(e, { zoom: e.zoom, box, exclude: base.keys(), show: true });
        }
        if (e.shift) end = snapAngle(start, end);
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
      case 'scale': {
        const to = snapEvent(e, { exclude: base.keys(), show: true });
        editor.preview = transformedSelection(scaleMatrix(action.frame, action.handle, start, to), base);
        break;
      }
      case 'rotate': {
        const p = action.pivot;
        let a = Math.atan2(e.y - p.y, e.x - p.x) - Math.atan2(start.y - p.y, start.x - p.x);
        if (e.shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        editor.preview = transformedSelection(around(rotate(a), p), base);
        break;
      }
      case 'bend': {
        const { item, rest, world, sub, index, t } = action;
        const contour = contourOf(item, sub)!;
        const d = applyVector(invert(world), { x: e.x - start.x, y: e.y - start.y });
        const c = segmentCubic(contour, index);
        const path = copyPath(contour);
        bendSegment(path, index, t, c[1], c[2], d, e.alt);
        editor.preview.set(item.id, restCopy(rest, sub, path));
        break;
      }
      case 'anchor': {
        const { item, rest, world, sub, index } = action;
        // the anchor itself lands on the snap, not the pointer
        const from = applyPoint(world, action.path.anchors[index]);
        const to = snapPoint(
          { x: from.x + e.x - start.x, y: from.y + e.y - start.y },
          { zoom: e.zoom, exclude: [item.id], show: true }
        );
        const d = applyVector(invert(world), { x: to.x - from.x, y: to.y - from.y });
        const path = copyPath(action.path);
        path.anchors[index].x += d.x;
        path.anchors[index].y += d.y;
        editor.preview.set(item.id, restCopy(rest, sub, path, action.skin));
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
      case 'pose': {
        const pose = editor.posePreview?.pose;
        editor.posePreview = null;
        if (pose) commitPose(action.layerId, pose);
        break;
      }
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
        editor.commitPreview(action.split ? 'Add corner' : 'Move anchor');
        break;
    }
  }

  return {
    ...toolBase(id),
    options: SelectOptions,

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

    // a double click enters a group one level, the item inside it under the pointer gets selected.
    // on an instance it opens the symbol in place, on the empty stage it goes back out of one
    dblclick(e) {
      // a double click on a joint pins it or lets it go
      const pj = poseJointAt(e);
      if (pj) {
        if (pj.joint.end === 'origin') togglePin(pj.joint.bone.id);
        else addToast('Pins go on the joints where bones start');
        return;
      }
      const chain = pickChain(e, e.zoom, pointerFactor(e.pointerType));
      if (chain.length === 0) {
        if (editor.editing()) editor.exitSymbol();
        return;
      }
      const sel = get(selection);
      let deepest = -1;
      chain.forEach((item, i) => {
        if (sel.has(item.id)) deepest = i;
      });
      const current = chain[Math.max(0, deepest)];
      if (current.type === 'instance') {
        editInstance(current.id);
        return;
      }
      if (current.type === 'text') {
        startTextEdit(current.id);
        return;
      }
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
      setJointHover(null);
    }
  };
}

export const selectionTool = createSelectTool('select');
export const transformTool = createSelectTool('transform');
