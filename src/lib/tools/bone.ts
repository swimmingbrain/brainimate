import { get } from 'svelte/store';
import type { Vec } from '$lib/core/types';
import { snapAngle } from '$lib/core/vec';
import { scaleFactor } from '$lib/core/mat';
import { pointerFactor } from '$lib/core/hit';
import { editor } from '$lib/editor/editor';
import { addRigBone, autoBind, canEditRig } from '$lib/editor/rig';
import { clearSnap, snapEvent } from '$lib/editor/snap';
import { JOINT_TOLERANCE, hitJoint, jointsOf, type Joint } from '$lib/rig/bones';
import { JOINT_RADIUS } from '$lib/render/bones';
import { overlayState } from '$lib/render/overlay';
import { PREVIEW_COLOR } from './draw';
import { boneSelection, toolCursor, view } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import BoneOptions from './options/BoneOptions.svelte';
import { toolBase, type Tool, type ToolEvent } from './tool';

// screen pixels before a press turns into a drag, a drag draws a bone from where it started
const DRAG = 4;
// a bone shorter than this many screen pixels is a slip, not a bone
const MIN_BONE = 3;
const STEP = Math.PI / 12;

// the chain being drawn: the joint the next bone grows from and the bones it made so far
interface Chain {
  // the bone the next one hangs on, null for a new root
  parent: string | null;
  point: Vec;
  added: string[];
}

let chain: Chain | null = null;
let press: ToolEvent | null = null;
let pointer: ToolEvent | null = null;

// the joints of the rig layers that can take bones, to grow a branch from
function jointAt(e: ToolEvent): Joint | null {
  const rig = editor.rig();
  if (!rig) return null;
  const layers = editor.currentLayers().filter((l) => l.type === 'rig' && canEditRig(l));
  const bones = layers.flatMap((l) => l.bones);
  const tol = (JOINT_TOLERANCE * pointerFactor(e.pointerType)) / e.zoom;
  return hitJoint(jointsOf(bones, rig.world), e, tol);
}

// a joint's bone start hangs a branch on the bone's parent, a free tip on the bone itself
function startFrom(j: Joint): Chain {
  return { parent: j.end === 'tip' ? j.bone.id : j.bone.parent, point: j.point, added: [] };
}

// where the next joint lands: on a joint that is hit, snapped, or at 15 degree steps with shift
function nextPoint(e: ToolEvent): Vec {
  const j = jointAt(e);
  if (j && (!chain || j.point.x !== chain.point.x || j.point.y !== chain.point.y)) return j.point;
  const p = snapEvent(e, { show: true });
  return chain && e.shift ? snapAngle(chain.point, p, STEP) : p;
}

function addTo(to: Vec, e: ToolEvent) {
  if (!chain) return;
  const d = Math.hypot(to.x - chain.point.x, to.y - chain.point.y) * e.zoom;
  if (d < MIN_BONE) return;
  const made = addRigBone(chain.parent, chain.point, to);
  if (!made) {
    chain = null;
    return;
  }
  chain = { parent: made.boneId, point: to, added: [...chain.added, made.boneId] };
}

// escape, enter or another tool end the chain, auto bind ties the drawings it reaches to its bones
function endChain() {
  const done = chain;
  chain = null;
  press = null;
  clearSnap();
  editor.markOverlay();
  if (!done || done.added.length === 0) return;
  if (get(preferences).rig.autoBind) autoBind(done.added);
}

function setHover(e: ToolEvent | null) {
  const j = e && !chain ? jointAt(e) : null;
  const next = j ? { bone: j.bone.id, end: j.end } : null;
  const was = overlayState.joint;
  if (was?.bone !== next?.bone || was?.end !== next?.end) {
    overlayState.joint = next;
    editor.markOverlay();
  }
  const cursor = j ? 'pointer' : 'crosshair';
  if (get(toolCursor) !== cursor) toolCursor.set(cursor);
}

function drawOverlay(ctx: CanvasRenderingContext2D) {
  if (!chain) return;
  // the overlay draws in the space of the timeline being edited
  const zoom = get(view).zoom * scaleFactor(editor.base());
  const r = JOINT_RADIUS / zoom;
  const from = chain.point;
  ctx.save();
  if (pointer && !press) {
    const to = nextPoint(pointer);
    const l = Math.hypot(to.x - from.x, to.y - from.y);
    if (l > 0) {
      // a faint bone where the next click puts it
      const a = Math.atan2(to.y - from.y, to.x - from.x);
      const w = Math.max(2.5, Math.min(7, l * zoom * 0.12)) / zoom;
      ctx.beginPath();
      ctx.moveTo(from.x - Math.sin(a) * w, from.y + Math.cos(a) * w);
      ctx.lineTo(to.x, to.y);
      ctx.lineTo(from.x + Math.sin(a) * w, from.y - Math.cos(a) * w);
      ctx.arc(from.x, from.y, w, a - Math.PI / 2, a - (Math.PI * 3) / 2, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(209, 154, 102, 0.3)';
      ctx.fill();
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      ctx.strokeStyle = PREVIEW_COLOR;
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // the joint the chain grows from, before its first bone it is all there is
  ctx.fillStyle = PREVIEW_COLOR;
  ctx.strokeStyle = '#111113';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.arc(from.x, from.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const boneTool: Tool = {
  ...toolBase('bone'),
  options: BoneOptions,

  down(e) {
    if (e.button !== 0) return;
    press = e;
    pointer = e;
    if (!chain) {
      const j = jointAt(e);
      chain = j ? startFrom(j) : { parent: null, point: snapEvent(e, { show: true }), added: [] };
      if (j) boneSelection.set(j.bone.id);
    } else {
      addTo(nextPoint(e), e);
    }
    editor.markOverlay();
  },

  move(e) {
    pointer = e;
    if (!press) setHover(e);
    editor.markOverlay();
  },

  up(e) {
    const p = press;
    press = null;
    pointer = e;
    clearSnap();
    // a press dragged out draws a bone to where it was let go
    if (p && chain && Math.hypot(e.sx - p.sx, e.sy - p.sy) >= DRAG) addTo(nextPoint(e), e);
    editor.markOverlay();
  },

  key(e) {
    if (!chain) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      endChain();
    }
  },

  drawOverlay,

  activate() {
    toolCursor.set('crosshair');
  },

  deactivate() {
    endChain();
    pointer = null;
    overlayState.joint = null;
  }
};
