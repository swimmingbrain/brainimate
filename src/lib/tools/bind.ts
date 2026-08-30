import { get } from 'svelte/store';
import type { Bone, Mat } from '$lib/core/types';
import { scaleFactor } from '$lib/core/mat';
import { pointerFactor } from '$lib/core/hit';
import { editor, hover } from '$lib/editor/editor';
import { canEditRig, setBoneRadius, toggleBind } from '$lib/editor/rig';
import { select } from '$lib/editor/selection';
import {
  BODY_TOLERANCE,
  JOINT_TOLERANCE,
  hitBody,
  hitJoint,
  jointsOf,
  originOf,
  segmentDistance,
  tipOf
} from '$lib/rig/bones';
import { overlayState } from '$lib/render/overlay';
import { addToast, boneSelection, selection, toolCursor } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import BindOptions from './options/BindOptions.svelte';
import { pickItem } from './pick';
import { toolBase, type Tool, type ToolEvent } from './tool';

// screen pixels around the edge of the picked bone's reach that grab it
const EDGE = 5;

// the bones of rig layers that show and are not locked, with their world matrices
function editableBones(): { bones: Bone[]; worlds: Map<string, Mat> } | null {
  const rig = editor.rig();
  if (!rig) return null;
  const bones = editor
    .currentLayers()
    .filter((l) => l.type === 'rig' && canEditRig(l))
    .flatMap((l) => l.bones);
  return { bones, worlds: rig.world };
}

function boneAt(e: ToolEvent): Bone | null {
  const r = editableBones();
  if (!r) return null;
  const f = pointerFactor(e.pointerType);
  const j = hitJoint(jointsOf(r.bones, r.worlds), e, (JOINT_TOLERANCE * f) / e.zoom);
  if (j) return j.bone;
  return hitBody(r.bones, r.worlds, e, (BODY_TOLERANCE * f) / e.zoom);
}

// the picked bone when the pointer is on the edge of its reach
function edgeAt(e: ToolEvent): { bone: Bone; scale: number } | null {
  const id = get(boneSelection);
  const r = editableBones();
  const bone = r?.bones.find((b) => b.id === id);
  const m = bone ? r!.worlds.get(bone.id) : null;
  if (!bone || !m) return null;
  const scale = scaleFactor(m);
  const { d } = segmentDistance(e, originOf(m), tipOf(m, bone));
  return Math.abs(d - bone.radius * scale) * e.zoom <= EDGE * pointerFactor(e.pointerType) ? { bone, scale } : null;
}

let drag: { bone: Bone; scale: number } | null = null;

function setCursor(c: string) {
  if (get(toolCursor) !== c) toolCursor.set(c);
}

export const bindTool: Tool = {
  ...toolBase('bind'),
  options: BindOptions,

  down(e) {
    if (e.button !== 0) return;
    const edge = edgeAt(e);
    if (edge) {
      drag = edge;
      return;
    }
    const bone = boneAt(e);
    if (bone) {
      boneSelection.set(bone.id);
      editor.markOverlay();
      return;
    }
    const item = pickItem(e, e.zoom, pointerFactor(e.pointerType));
    if (!item) {
      selection.set(new Set());
      return;
    }
    select([item.id]);
    const id = get(boneSelection);
    if (!id || !editor.findBone(id)) {
      addToast('Pick a bone first, then click the drawings it should move');
      return;
    }
    toggleBind(item.id, id, get(preferences).rig.bindMode);
  },

  move(e) {
    if (drag) {
      const m = editor.rig()?.world.get(drag.bone.id);
      if (!m) return;
      const { d } = segmentDistance(e, originOf(m), tipOf(m, drag.bone));
      setBoneRadius(drag.bone.id, d / Math.max(drag.scale, 1e-9));
      return;
    }
    if (edgeAt(e)) {
      hover.set(null);
      return setCursor('ew-resize');
    }
    if (boneAt(e)) {
      hover.set(null);
      return setCursor('pointer');
    }
    const item = pickItem(e, e.zoom, pointerFactor(e.pointerType));
    if (get(hover) !== (item?.id ?? null)) hover.set(item?.id ?? null);
    setCursor(item ? 'copy' : 'default');
  },

  up() {
    drag = null;
  },

  activate() {
    setCursor('pointer');
    overlayState.joint = null;
  },

  deactivate() {
    drag = null;
    hover.set(null);
  }
};
