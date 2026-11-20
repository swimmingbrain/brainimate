import type { CameraKey, Keyframe, Layer, Mat, Transition, TransitionKind } from '$lib/core/types';
import { multiply, rotate, scale, translate } from '$lib/core/mat';
import { applyEase } from './easing';
import { keyframeIndexAt, parentFolder } from '$lib/render/frame';

// the camera of the video. it is a layer of its own on the main timeline, its keyframes hold where it
// looks, how close and how it turns, tweens with the usual eases move it from one to the next. the
// export, the thumbnails and the camera view of the stage all ask these functions, so the video
// looks exactly like the preview. everything is worked out from the frame number alone: a handheld
// shake or the bob of walking is the same in every pass

export const TRANSITIONS: { kind: TransitionKind; label: string; frames: number }[] = [
  { kind: 'cut', label: 'Cut', frames: 0 },
  { kind: 'fade', label: 'Fade through color', frames: 12 },
  { kind: 'crossfade', label: 'Crossfade', frames: 12 },
  { kind: 'zoom', label: 'Zoom', frames: 10 },
  { kind: 'slide', label: 'Slide', frames: 10 },
  { kind: 'camera', label: 'Camera move', frames: 12 }
];

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 20;
export const MAX_PARALLAX = 4;

// the size of the stage of the open document, for a camera keyframe made where none was before. the
// editor sets it, like the library of symbols
const stage = { width: 1080, height: 1920 };

export function setCameraStage(width: number, height: number) {
  stage.width = width;
  stage.height = height;
}

export function cameraStage(): { width: number; height: number } {
  return { ...stage };
}

// the camera that shows the whole stage, as a stage without a camera layer looks
export function restCamera(width: number, height: number): CameraKey {
  return { x: width / 2, y: height / 2, zoom: 1, rotation: 0, shake: 0, bob: 0, transition: null };
}

export function makeTransition(kind: TransitionKind, fps = 24): Transition {
  const info = TRANSITIONS.find((t) => t.kind === kind) ?? TRANSITIONS[0];
  return { kind, duration: Math.max(0, Math.round((info.frames * fps) / 24)), color: '#000000', direction: 'left' };
}

export function cameraLayerOf(layers: Layer[]): Layer | null {
  return layers.find((l) => l.type === 'camera') ?? null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// zoom blends by its ratio, so a slow zoom looks even all the way instead of rushing at the start
export function mixCamera(a: CameraKey, b: CameraKey, t: number): CameraKey {
  if (t <= 0) return a;
  if (t >= 1) return { ...b, transition: a.transition };
  const za = Math.max(MIN_ZOOM, a.zoom);
  const zb = Math.max(MIN_ZOOM, b.zoom);
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    zoom: za * Math.pow(zb / za, t),
    rotation: lerp(a.rotation, b.rotation, t),
    shake: lerp(a.shake, b.shake, t),
    bob: lerp(a.bob, b.bob, t),
    transition: a.transition
  };
}

function keyCamera(k: Keyframe | undefined, rest: CameraKey): CameraKey {
  return k?.camera ?? rest;
}

// a new shot is cut to, except a camera move, which flies there over its frames
function cutsInto(next: Keyframe | undefined): boolean {
  const t = next?.camera?.transition;
  return !!t && t.kind !== 'camera';
}

// the keyframe values at frame, tweened between keyframes and held after the last one
export function cameraKeyAt(layer: Layer | null, frame: number, width: number, height: number): CameraKey {
  const rest = restCamera(width, height);
  if (!layer || layer.keyframes.length === 0) return rest;
  const i = keyframeIndexAt(layer, frame);
  if (i < 0) return rest;
  const key = layer.keyframes[i];
  const next = layer.keyframes[i + 1];
  const a = keyCamera(key, rest);
  if (!next || frame <= key.frame) return a;
  const b = keyCamera(next, rest);
  const move = next.camera?.transition;
  if (move && move.kind === 'camera') {
    // the move takes its frames right before the next shot, the shot before holds until then
    const span = Math.max(1, Math.min(move.duration, next.frame - key.frame));
    const start = next.frame - span;
    if (frame < start) return a;
    return mixCamera(a, b, applyEase('cubic-inout', (frame - start) / span));
  }
  if (!key.tween || cutsInto(next)) return a;
  return mixCamera(a, b, applyEase(key.tween.ease, (frame - key.frame) / (next.frame - key.frame)));
}

// the camera as it films: the keyframe values with the shake and the bob added
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

// a smooth wobble from -1 to 1, three waves that never line up, so it does not look like a loop
function wobble(t: number, seed: number): number {
  return (
    0.5 * Math.sin(2 * Math.PI * 0.73 * t + seed) +
    0.3 * Math.sin(2 * Math.PI * 1.91 * t + seed * 2.3) +
    0.2 * Math.sin(2 * Math.PI * 3.67 * t + seed * 4.1)
  );
}

// two steps a second, the head goes up on each step and sways from foot to foot
export const STEPS_PER_SECOND = 2;

export function cameraStateAt(layer: Layer | null, frame: number, fps: number, width: number, height: number): CameraState {
  const k = cameraKeyAt(layer, frame, width, height);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k.zoom));
  let x = k.x;
  let y = k.y;
  let rotation = k.rotation;
  if (k.shake !== 0 || k.bob !== 0) {
    const t = frame / Math.max(1, fps);
    // offsets are in pixels of the video, so a shake looks the same close up and far away
    let dx = k.shake * wobble(t, 1.3);
    let dy = k.shake * wobble(t, 4.7);
    rotation += k.shake * 0.0009 * wobble(t, 2.9);
    const step = Math.PI * STEPS_PER_SECOND * t;
    dy += k.bob * (Math.abs(Math.sin(step)) - 0.5);
    dx += k.bob * 0.4 * Math.sin(step / 2);
    rotation += k.bob * 0.0006 * Math.sin(step / 2);
    x += dx / zoom;
    y += dy / zoom;
  }
  return { x, y, zoom, rotation };
}

export function isRestState(c: CameraState, width: number, height: number): boolean {
  return c.zoom === 1 && c.rotation === 0 && c.x === width / 2 && c.y === height / 2;
}

// stage to video: the point the camera looks at goes to the middle, then it is zoomed and turned.
// depth is the parallax of a layer, it follows the camera that much: position and turn by the
// factor, zoom by its power, so a layer further back zooms less like it would in a real room
export function cameraMatrix(c: CameraState, width: number, height: number, depth = 1): Mat {
  const f = Math.max(0, depth);
  const cx = width / 2 + (c.x - width / 2) * f;
  const cy = height / 2 + (c.y - height / 2) * f;
  const z = Math.pow(c.zoom, f);
  const r = c.rotation * Math.min(1, f);
  return multiply(
    multiply(translate(width / 2, height / 2), rotate(-r)),
    multiply(scale(z), translate(-cx, -cy))
  );
}

// a layer's own parallax, or the one of the folder around it, 1 when neither has one
export function layerParallax(layers: Layer[], layer: Layer): number {
  let l: Layer | null = layer;
  for (let depth = 0; l && depth < 32; depth++) {
    if (typeof l.parallax === 'number' && Number.isFinite(l.parallax)) return Math.max(0, Math.min(MAX_PARALLAX, l.parallax));
    l = parentFolder(layers, l);
  }
  return 1;
}

// the transition going on at frame, p runs from 0 to 1 over it
export interface ActiveTransition {
  transition: Transition;
  // the keyframe the new shot starts on
  at: number;
  p: number;
}

// a fade goes through its color around the keyframe, half before and half after, a fade on the first
// frame only fades in. a crossfade, a zoom and a slide play over the frames after the keyframe, with
// the last picture before it held. a cut and a camera move draw nothing over the frame
export function transitionAt(layer: Layer | null, frame: number): ActiveTransition | null {
  if (!layer) return null;
  for (const key of layer.keyframes) {
    const t = key.camera?.transition;
    if (!t || t.kind === 'cut' || t.kind === 'camera' || t.duration <= 0) continue;
    const d = t.duration;
    if (t.kind === 'fade') {
      if (key.frame === 0) {
        if (frame < d) return { transition: t, at: 0, p: 0.5 + (frame + 0.5) / d / 2 };
        continue;
      }
      const start = key.frame - d / 2;
      if (frame + 0.5 >= start && frame + 0.5 < start + d) return { transition: t, at: key.frame, p: (frame + 0.5 - start) / d };
      continue;
    }
    // nothing came before the first frame to blend from
    if (key.frame === 0) continue;
    if (frame >= key.frame && frame < key.frame + d) return { transition: t, at: key.frame, p: (frame - key.frame + 0.5) / d };
  }
  return null;
}

// how much of the fade color covers the frame, 1 in the middle of the fade
export function fadeAmount(p: number): number {
  return Math.max(0, Math.min(1, 1 - Math.abs(p - 0.5) * 2));
}

// where the held picture of the shot before and the new shot go in a slide, in fractions of the size
export function slideOffsets(direction: Transition['direction'], p: number) {
  const e = applyEase('cubic-inout', p);
  const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[direction] ?? [-1, 0];
  // the new shot comes in from the opposite side and pushes the old one out
  return { old: { x: v[0] * e, y: v[1] * e }, fresh: { x: -v[0] * (1 - e), y: -v[1] * (1 - e) } };
}

// the box of what to show, camera values that fit it with some air around
export function focusCamera(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  air = 0.25
): { x: number; y: number; zoom: number } {
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const zoom = Math.min(width / (bw * (1 + air)), height / (bh * (1 + air)));
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) };
}

export type PresetKind = 'walk' | 'push' | 'zoom' | 'pan-left' | 'pan-right' | 'track' | 'focus' | 'handheld' | 'look';

export const PRESETS: { kind: PresetKind; label: string; seconds: number; needs?: 'target' | 'track' }[] = [
  { kind: 'walk', label: 'First person walk', seconds: 3 },
  { kind: 'push', label: 'Slow push in', seconds: 3 },
  { kind: 'zoom', label: 'Cinematic zoom', seconds: 1.5 },
  { kind: 'pan-left', label: 'Pan left', seconds: 2 },
  { kind: 'pan-right', label: 'Pan right', seconds: 2 },
  { kind: 'look', label: 'Look left and right', seconds: 3 },
  { kind: 'track', label: 'Tracking shot', seconds: 2, needs: 'track' },
  { kind: 'focus', label: 'Focus pull', seconds: 1, needs: 'target' },
  { kind: 'handheld', label: 'Handheld camera', seconds: 3 }
];

// a camera keyframe a preset puts down, ease is the tween toward the next one, null for none
export interface PlannedKey {
  frame: number;
  camera: CameraKey;
  ease: string | null;
}

export interface PresetOptions {
  // where it starts and how many frames it runs
  at: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
  // 1 is the usual amount, 0.25 a hint of it, 3 a lot
  strength: number;
  // the ease of the moves, the preset's own when empty
  ease?: string;
  // what to look at or follow, the middle of the selection
  target?: { x: number; y: number; zoom?: number } | null;
  // for a tracking shot: where the target is at frames along the way
  track?: { frame: number; x: number; y: number }[];
}

// the keyframes of a preset, starting from the camera as it is at the start
export function presetKeys(kind: PresetKind, from: CameraKey, o: PresetOptions): PlannedKey[] {
  const s = Math.max(0.1, Math.min(3, o.strength));
  const n = Math.max(1, Math.round(o.frames));
  const at = Math.max(0, Math.round(o.at));
  const end = at + n;
  const start = { ...from, transition: null };
  // the width of the stage the camera sees now
  const seen = o.width / Math.max(MIN_ZOOM, from.zoom);
  const ease = (fallback: string) => o.ease || fallback;
  switch (kind) {
    case 'push': {
      const goal = o.target ?? { x: from.x, y: from.y };
      return [
        { frame: at, camera: start, ease: ease('inout') },
        { frame: end, camera: { ...start, x: lerp(from.x, goal.x, 0.6), y: lerp(from.y, goal.y, 0.6), zoom: from.zoom * (1 + 0.25 * s) }, ease: null }
      ];
    }
    case 'zoom': {
      const goal = o.target ?? { x: from.x, y: from.y };
      return [
        { frame: at, camera: start, ease: ease('cubic-inout') },
        { frame: end, camera: { ...start, x: goal.x, y: goal.y, zoom: from.zoom * (1 + 0.8 * s) }, ease: null }
      ];
    }
    case 'pan-left':
    case 'pan-right': {
      const dir = kind === 'pan-left' ? -1 : 1;
      return [
        { frame: at, camera: start, ease: ease('inout') },
        { frame: end, camera: { ...start, x: from.x + dir * seen * 0.35 * s }, ease: null }
      ];
    }
    case 'look': {
      const third = Math.max(1, Math.round(n / 3));
      return [
        { frame: at, camera: start, ease: ease('inout') },
        { frame: at + third, camera: { ...start, x: from.x - seen * 0.22 * s, rotation: from.rotation - 0.025 * s }, ease: ease('inout') },
        { frame: at + 2 * third, camera: { ...start, x: from.x + seen * 0.22 * s, rotation: from.rotation + 0.025 * s }, ease: ease('inout') },
        { frame: end, camera: start, ease: null }
      ];
    }
    case 'walk': {
      // forward through the room: a steady push with the bob of the steps, settling when it stops
      const bob = 16 * s;
      const settle = Math.max(2, Math.round(o.fps / 2));
      return [
        { frame: at, camera: { ...start, bob }, ease: ease('linear') },
        { frame: end, camera: { ...start, zoom: from.zoom * (1 + 0.35 * s), bob }, ease: 'out' },
        { frame: end + settle, camera: { ...start, zoom: from.zoom * (1 + 0.35 * s), bob: 0 }, ease: null }
      ];
    }
    case 'handheld': {
      const shake = 9 * s;
      return [
        { frame: at, camera: { ...start, shake }, ease: null },
        { frame: Math.max(at + 1, end - 1), camera: { ...start, shake }, ease: null },
        { frame: end, camera: { ...start, shake: from.shake }, ease: null }
      ];
    }
    case 'focus': {
      const goal = o.target ?? { x: from.x, y: from.y, zoom: from.zoom * 1.5 };
      const zoom = goal.zoom ?? from.zoom * 1.5;
      return [
        { frame: at, camera: start, ease: ease('quad-out') },
        { frame: end, camera: { ...start, x: goal.x, y: goal.y, zoom }, ease: null }
      ];
    }
    case 'track': {
      const samples = (o.track ?? []).filter((t) => t.frame >= at && t.frame <= end);
      if (samples.length === 0) return [{ frame: at, camera: start, ease: null }];
      return samples.map((t, i) => ({
        frame: t.frame,
        camera: { ...start, x: t.x, y: t.y },
        ease: i < samples.length - 1 ? ease('linear') : null
      }));
    }
  }
}

// keyframes of a camera layer kept clean when a document is read: numbers in range, a known transition
export function cleanCamera(c: unknown, width: number, height: number): CameraKey {
  const rest = restCamera(width, height);
  if (!c || typeof c !== 'object') return rest;
  const v = c as Record<string, unknown>;
  const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
  let transition: Transition | null = null;
  const t = v.transition as Record<string, unknown> | null | undefined;
  if (t && typeof t === 'object' && TRANSITIONS.some((k) => k.kind === t.kind)) {
    const dir = ['left', 'right', 'up', 'down'].includes(t.direction as string) ? (t.direction as Transition['direction']) : 'left';
    transition = {
      kind: t.kind as TransitionKind,
      duration: Math.max(0, Math.min(600, Math.round(num(t.duration, 12)))),
      color: typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : '#000000',
      direction: dir
    };
  }
  return {
    x: num(v.x, rest.x),
    y: num(v.y, rest.y),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num(v.zoom, 1))),
    rotation: num(v.rotation, 0),
    shake: Math.max(0, Math.min(200, num(v.shake, 0))),
    bob: Math.max(0, Math.min(200, num(v.bob, 0))),
    transition
  };
}
