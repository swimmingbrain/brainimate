import type { Bone, BonePose, Keyframe, Layer, PathData, Vec } from '$lib/core/types';
import { solveChain } from '$lib/rig/ik';
import { poseOf, type Pose } from '$lib/rig/bones';
import type { BoneName, Emotion, FaceFrame, MouthShape } from './model';
import { facePaths, seeded, type FaceStyle } from './model';
import { gaitPose, legRig, weightShift } from './gait';

// the moves of a character as pose keyframes on its rig layer. a cycle is worked out from smooth waves
// at eight keyframes a cycle with straight tweens between them, so it plays smooth and stays light.
// a single move goes pose to pose with eases. every value is a change from the rest pose like any
// pose keyframe, the hip carries the move through the scene

export type AnimKind = 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'point' | 'sit' | 'turn' | 'reach' | 'stand' | 'fall' | 'dodge' | 'gesture' | 'look' | 'nod' | 'shrug' | 'startle' | 'talk';

export const ANIMATIONS: { kind: AnimKind; label: string; seconds: number; cycle: boolean }[] = [
  { kind: 'idle', label: 'Idle, standing', seconds: 3, cycle: true },
  { kind: 'walk', label: 'Walk', seconds: 1, cycle: true },
  { kind: 'run', label: 'Run', seconds: 0.6, cycle: true },
  { kind: 'jump', label: 'Jump', seconds: 1.1, cycle: false },
  { kind: 'wave', label: 'Wave', seconds: 0.5, cycle: true },
  { kind: 'point', label: 'Point', seconds: 1.5, cycle: false },
  { kind: 'sit', label: 'Sit down', seconds: 1, cycle: false },
  { kind: 'turn', label: 'Turn around', seconds: 0.4, cycle: false },
  { kind: 'reach', label: 'Reach and grab', seconds: 0.8, cycle: false },
  // the moves of P6 for telling a story: they start from the pose the character has and end at rest
  { kind: 'stand', label: 'Stand up', seconds: 1, cycle: false },
  { kind: 'fall', label: 'Fall (and get up)', seconds: 0.9, cycle: false },
  { kind: 'dodge', label: 'Dodge', seconds: 0.7, cycle: false },
  { kind: 'gesture', label: 'Explain with the hands', seconds: 1.6, cycle: false },
  { kind: 'look', label: 'Look around', seconds: 2, cycle: false },
  { kind: 'nod', label: 'Nod', seconds: 0.8, cycle: false },
  { kind: 'shrug', label: 'Shrug', seconds: 1, cycle: false },
  { kind: 'startle', label: 'Startled step back', seconds: 0.8, cycle: false },
  { kind: 'talk', label: 'Talk (small gestures)', seconds: 2, cycle: false }
];

export interface AnimOptions {
  // the first frame and the frame rate
  at: number;
  fps: number;
  // how often a cycle plays, or how long a single move holds in seconds
  repeat: number;
  // 2 plays twice as fast
  speed: number;
  // the far arm and leg do what the near ones would
  mirror: boolean;
  // how far a walk or a run goes each cycle, in stage pixels, the sign is the direction on the screen
  distance: number;
  // a single move goes back to where it started at the end
  back: boolean;
  // where a reach goes, on the stage at rest
  target?: Vec | null;
}

export type PoseValues = Partial<Record<BoneName, Partial<BonePose>>>;

export interface PoseKey {
  frame: number;
  pose: PoseValues;
  // the tween to the next keyframe, null holds
  ease: string | null;
}

// what an animation needs to know of the character
export interface Body {
  // feet to head at rest, in stage pixels
  height: number;
  // where it looked when it was made, 1 right and -1 left
  facing: 1 | -1;
  bones: Bone[];
  // the pose where the animation starts, the hip keeps its place from there
  start: Pose;
  id: (name: BoneName) => string | null;
  // the angle a turnable character is seen from, 90 faces the camera
  angle?: number;
}

const L_TO_R: Record<string, BoneName> = {
  'Upper arm L': 'Upper arm R',
  'Lower arm L': 'Lower arm R',
  'Hand L': 'Hand R',
  'Upper leg L': 'Upper leg R',
  'Lower leg L': 'Lower leg R',
  'Foot L': 'Foot R',
  'Upper arm R': 'Upper arm L',
  'Lower arm R': 'Lower arm L',
  'Hand R': 'Hand L',
  'Upper leg R': 'Upper leg L',
  'Lower leg R': 'Lower leg L',
  'Foot R': 'Foot L'
};

export function mirrorPose(p: PoseValues): PoseValues {
  const out: PoseValues = {};
  for (const [name, v] of Object.entries(p)) out[(L_TO_R[name] ?? name) as BoneName] = v;
  return out;
}

function boneLength(body: Body, name: BoneName): number {
  const id = body.id(name);
  return body.bones.find((b) => b.id === id)?.length ?? body.height * 0.2;
}

// a walk or a run from waves: phase 0 has the near leg in front
function stride(phase: number, run: boolean, f: number, u: number): PoseValues {
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  const legSwing = run ? 0.72 : 0.42;
  const knee = run ? 1.25 : 0.62;
  const armSwing = run ? 0.85 : 0.38;
  const elbow = run ? 1.25 : 0.28;
  const lean = run ? 0.18 : 0.04;
  const bob = (run ? 0.03 : 0.012) * u;
  // forward on the screen is a turn toward where it looks
  const fwd = -f;
  return {
    Hip: { y: bob * Math.cos(2 * phase) - (run ? 0.02 * u : 0) },
    Spine: { rotation: -fwd * lean },
    Chest: { rotation: -fwd * lean * 0.3 },
    Head: { rotation: fwd * lean * 0.8 },
    'Upper leg R': { rotation: fwd * legSwing * c },
    'Lower leg R': { rotation: -fwd * (knee * Math.max(0, -s) + 0.05) },
    'Foot R': { rotation: fwd * 0.18 * c },
    'Upper leg L': { rotation: -fwd * legSwing * c },
    'Lower leg L': { rotation: -fwd * (knee * Math.max(0, s) + 0.05) },
    'Foot L': { rotation: -fwd * 0.18 * c },
    'Upper arm R': { rotation: -fwd * armSwing * c },
    'Lower arm R': { rotation: fwd * (elbow + 0.08 * c) },
    'Upper arm L': { rotation: fwd * armSwing * c },
    'Lower arm L': { rotation: fwd * (elbow - 0.08 * c) }
  };
}

function idlePose(phase: number, f: number, u: number): PoseValues {
  const s = Math.sin(phase);
  const fwd = -f;
  return {
    Hip: { y: 0.003 * u * s },
    Chest: { rotation: -fwd * 0.012 * s },
    Head: { rotation: fwd * 0.02 * Math.sin(phase + 0.8) },
    'Upper arm R': { rotation: fwd * (0.04 + 0.025 * s) },
    'Upper arm L': { rotation: -fwd * (0.03 + 0.025 * s) },
    'Lower arm R': { rotation: fwd * 0.12 },
    'Lower arm L': { rotation: fwd * 0.1 }
  };
}

// a walk seen from the front or the back: a leg lifts while the other one carries, the hip sways over
// the leg that carries and bobs, the arms swing a little. the upper leg moves up along the hip bone, which
// points up, so the lifted leg tucks under the body drawn in front of it
export function frontGait(body: Body, phase: number, run: boolean): PoseValues {
  const u = body.height;
  const s = Math.sin(2 * Math.PI * phase);
  const lift = (run ? 0.09 : 0.045) * u;
  const liftR = Math.max(0, s);
  const liftL = Math.max(0, -s);
  const bob = (run ? 0.025 : 0.01) * u;
  const swing = run ? 0.25 : 0.1;
  const elbow = run ? 1.3 : 0.2;
  // the side of the screen the near arm is on: the left from the front, the right from behind
  const near = Math.sign(-body.facing * Math.sin(((body.angle ?? 90) * Math.PI) / 180)) || -1;
  return {
    Hip: { x: -0.012 * u * s, y: -bob * Math.abs(s) + (run ? 0.02 * u : 0) },
    Spine: { rotation: 0.03 * s },
    Head: { rotation: -0.02 * s },
    'Upper leg R': { x: lift * liftR, rotation: 0.05 * liftR },
    'Lower leg R': { rotation: -0.03 * liftR },
    'Upper leg L': { x: lift * liftL, rotation: -0.05 * liftL },
    'Lower leg L': { rotation: 0.03 * liftL },
    'Upper arm R': { rotation: swing * s * 0.5 },
    // the forearms bend in toward the belly
    'Lower arm R': { rotation: elbow * (1 + 0.3 * liftL) * 0.6 * near },
    'Upper arm L': { rotation: -swing * s * 0.5 },
    'Lower arm L': { rotation: elbow * (1 + 0.3 * liftR) * 0.6 * -near }
  };
}

// the keyframes of an animation, the hip's place carried on from the start pose
export function animationKeys(kind: AnimKind, body: Body, o: AnimOptions): PoseKey[] {
  const fps = Math.max(1, o.fps);
  const speed = Math.max(0.1, Math.min(4, o.speed));
  const u = body.height;
  const f = body.facing;
  const fwd = -f;
  const at = Math.max(0, Math.round(o.at));
  const hipId = body.id('Hip');
  const start = hipId ? poseOf(body.start, hipId) : { rotation: 0, x: 0, y: 0, scale: 1 };
  const info = ANIMATIONS.find((a) => a.kind === kind)!;
  const frames = (seconds: number) => Math.max(1, Math.round((seconds * fps) / speed));
  const keys: PoseKey[] = [];
  const put = (frame: number, pose: PoseValues, ease: string | null) => keys.push({ frame, pose: o.mirror ? mirrorPose(pose) : pose, ease });
  // the hip keeps where it is, the move adds to it
  const withHip = (p: PoseValues, dx = 0, dy = 0): PoseValues => ({
    ...p,
    // the size a walk toward the camera left it at stays
    Hip: { ...p.Hip, x: start.x + dx + (p.Hip?.x ?? 0), y: start.y + dy + (p.Hip?.y ?? 0), sx: start.sx ?? 1, scale: (start.scale ?? 1) * (p.Hip?.scale ?? 1) }
  });

  if (info.cycle) {
    const period = frames(info.seconds);
    const cycles = Math.max(1, Math.round(o.repeat));
    const total = period * cycles;
    const legs = legRig(body);
    // walking, running and standing are worked out every other frame, the feet stay planted between
    // keys; a wave and a body without legs at eight keys a cycle
    // seen from the front or the back the legs lift in turn instead of swinging
    const square = body.angle !== undefined && Math.abs(Math.sin((body.angle * Math.PI) / 180)) > 0.75;
    if (square && kind !== 'wave' && kind !== 'idle') {
      const step = period >= 12 ? 2 : 1;
      for (let t = 0; t <= total; t += step) {
        const last = t + step > total;
        const tt = last ? total : t;
        put(at + tt, withHip(frontGait(body, tt / period, kind === 'run'), (o.distance * tt) / period), last ? null : 'linear');
        if (last) break;
      }
      return dedupe(keys);
    }
    if (legs && kind !== 'wave') {
      const step = period >= 12 ? 2 : 1;
      const sx = start.sx ?? 1;
      for (let t = 0; t <= total; t += step) {
        const phase = t / period;
        const last = t + step > total;
        const frame = at + (last ? total : t);
        let pose: PoseValues;
        let dx = 0;
        if (kind === 'idle') pose = weightShift(body, legs, phase);
        else {
          // the hip's own x is mirrored when the character turned
          // a character made bigger by a walk toward the camera takes bigger steps on the screen
          pose = gaitPose(body, legs, phase, { run: kind === 'run', travel: (o.distance * sx) / (start.scale || 1), facing: f });
          dx = (o.distance * (last ? total : t)) / period;
        }
        put(frame, withHip(pose, dx), last ? null : 'linear');
        if (last) break;
      }
      return dedupe(keys);
    }
    const steps = kind === 'wave' ? 4 : 8;
    // a wave lifts the arm first and puts it down after
    const lift = kind === 'wave' ? frames(0.3) : 0;
    if (kind === 'wave') put(at, withHip({}), 'inout');
    for (let i = 0; i <= cycles * steps; i++) {
      const t = (i / steps) * period;
      const frame = at + lift + Math.round(t);
      const phase = (2 * Math.PI * i) / steps;
      let pose: PoseValues;
      let dx = 0;
      if (kind === 'walk' || kind === 'run') {
        pose = stride(phase, kind === 'run', f, u);
        dx = (o.distance * t) / period;
      } else if (kind === 'idle') {
        pose = idlePose(phase, f, u);
      } else {
        pose = {
          'Upper arm R': { rotation: fwd * 2.5 },
          'Lower arm R': { rotation: fwd * (0.55 + 0.4 * Math.sin(phase)) },
          'Hand R': { rotation: fwd * 0.2 * Math.sin(phase) },
          Head: { rotation: fwd * 0.04 }
        };
      }
      put(frame, withHip(pose, dx), i === cycles * steps && kind !== 'wave' ? null : 'linear');
    }
    if (kind === 'wave') put(at + lift + total + frames(0.3), withHip({}), null);
    // the last key of a cycle holds and the moves after it start from there
    return dedupe(keys);
  }

  const hold = Math.max(0, o.repeat);
  switch (kind) {
    case 'jump': {
      const t = (s: number) => at + frames(s);
      const crouch: PoseValues = {
        Hip: { y: 0.08 * u },
        Spine: { rotation: -fwd * 0.25 },
        'Upper leg R': { rotation: fwd * 0.7 },
        'Lower leg R': { rotation: -fwd * 1.2 },
        'Foot R': { rotation: fwd * 0.45 },
        'Upper leg L': { rotation: fwd * 0.6 },
        'Lower leg L': { rotation: -fwd * 1.1 },
        'Foot L': { rotation: fwd * 0.45 },
        'Upper arm R': { rotation: -fwd * 0.7 },
        'Upper arm L': { rotation: -fwd * 0.6 }
      };
      const up: PoseValues = {
        Hip: { y: -0.05 * u },
        Spine: { rotation: fwd * 0.05 },
        'Foot R': { rotation: -fwd * 0.5 },
        'Foot L': { rotation: -fwd * 0.5 },
        'Upper arm R': { rotation: fwd * 2.6 },
        'Upper arm L': { rotation: fwd * 2.4 }
      };
      const air: PoseValues = {
        Hip: { y: -0.28 * u },
        'Upper leg R': { rotation: fwd * 0.5 },
        'Lower leg R': { rotation: -fwd * 0.9 },
        'Upper leg L': { rotation: fwd * 0.3 },
        'Lower leg L': { rotation: -fwd * 0.7 },
        'Upper arm R': { rotation: fwd * 2.2 },
        'Upper arm L': { rotation: fwd * 2.0 }
      };
      const d = o.distance;
      put(at, withHip({}), 'inout');
      put(t(0.25), withHip(crouch), 'out');
      put(t(0.42), withHip(up, d * 0.2), 'out');
      put(t(0.62), withHip(air, d * 0.6), 'in');
      put(t(0.82), withHip(crouch, d), 'inout');
      put(t(1.1), withHip({}, d), null);
      return keys;
    }
    case 'point': {
      const pose: PoseValues = {
        'Upper arm R': { rotation: fwd * 1.45 },
        'Lower arm R': { rotation: fwd * 0.08 },
        'Hand R': { rotation: fwd * 0.12 },
        Chest: { rotation: -fwd * 0.04 },
        Head: { rotation: fwd * 0.03 }
      };
      put(at, withHip({}), 'inout');
      put(at + frames(0.35), withHip(pose), null);
      if (o.back) {
        const end = at + frames(0.35) + Math.round(hold * fps);
        keys[keys.length - 1].ease = 'inout';
        put(end, withHip(pose), 'inout');
        put(end + frames(0.35), withHip({}), null);
      }
      return keys;
    }
    case 'sit': {
      // the thighs go level and the shins down, the hip drops by what the thighs lift
      const thigh = boneLength(body, 'Upper leg R');
      const pose: PoseValues = {
        Hip: { y: thigh * 0.92 },
        Spine: { rotation: fwd * 0.08 },
        'Upper leg R': { rotation: fwd * 1.5 },
        'Lower leg R': { rotation: -fwd * 1.5 },
        'Upper leg L': { rotation: fwd * 1.45 },
        'Lower leg L': { rotation: -fwd * 1.45 },
        // the hands rest on the thighs
        'Upper arm R': { rotation: -fwd * 0.12 },
        'Lower arm R': { rotation: fwd * 0.55 },
        'Upper arm L': { rotation: -fwd * 0.08 },
        'Lower arm L': { rotation: fwd * 0.5 }
      };
      const lean: PoseValues = { ...pose, Hip: { y: thigh * 0.5 }, Spine: { rotation: -fwd * 0.3 } };
      put(at, withHip({}), 'inout');
      put(at + frames(0.55), withHip(lean, 0), 'out');
      put(at + frames(1), withHip(pose), null);
      if (o.back && hold > 0) {
        const end = at + frames(1) + Math.round(hold * fps);
        keys[keys.length - 1].ease = 'inout';
        put(end, withHip(pose), 'inout');
        put(end + frames(0.45), withHip(lean), 'out');
        put(end + frames(1), withHip({}), null);
      }
      return keys;
    }
    case 'turn': {
      const from = start.sx ?? 1;
      const to = -from;
      const mid = at + Math.round(frames(info.seconds) / 2);
      keys.push({ frame: at, pose: { Hip: { x: start.x, y: start.y, sx: from } }, ease: 'in' });
      keys.push({ frame: mid, pose: { Hip: { x: start.x, y: start.y - 0.01 * u, sx: from * 0.05 } }, ease: 'out' });
      keys.push({ frame: at + frames(info.seconds), pose: { Hip: { x: start.x, y: start.y, sx: to } }, ease: null });
      return keys;
    }
    case 'reach': {
      // with a target the near arm solves to it, without one it reaches forward and down to a table
      const pose = reachPose(body, o.target ?? null, fwd);
      put(at, withHip({}), 'inout');
      put(at + frames(info.seconds), withHip(pose), null);
      if (o.back) {
        const end = at + frames(info.seconds) + Math.round(hold * fps);
        keys[keys.length - 1].ease = 'inout';
        put(end, withHip(pose), 'inout');
        put(end + frames(info.seconds), withHip({}), null);
      }
      return keys;
    }
    case 'stand': {
      // from sitting or crouching back up: the body leans over the feet, then rises
      const thigh = boneLength(body, 'Upper leg R');
      const low = (start.y ?? 0) > thigh * 0.3;
      const base = low ? start.y - thigh * 0.92 : 0;
      const up = (p: PoseValues, y: number): PoseValues => ({ ...p, Hip: { x: start.x, y, sx: start.sx ?? 1, scale: start.scale ?? 1 } });
      const lean: PoseValues = {
        Spine: { rotation: -fwd * 0.35 },
        Chest: { rotation: -fwd * 0.08 },
        'Upper leg R': { rotation: fwd * 0.8 },
        'Lower leg R': { rotation: -fwd * 0.9 },
        'Upper leg L': { rotation: fwd * 0.75 },
        'Lower leg L': { rotation: -fwd * 0.85 },
        'Upper arm R': { rotation: fwd * 0.6 },
        'Upper arm L': { rotation: fwd * 0.5 }
      };
      put(at, up({}, start.y), 'inout');
      put(at + frames(0.45), up(lean, base + thigh * 0.45), 'out');
      put(at + frames(1), up({}, base), null);
      return keys;
    }
    case 'fall': {
      // a stumble back, the hip down to the floor, the legs come up, with back it gets up again
      const thigh = boneLength(body, 'Upper leg R');
      const d = o.distance || -fwd * u * 0.15;
      const stumble: PoseValues = {
        Spine: { rotation: fwd * 0.3 },
        Head: { rotation: -fwd * 0.2 },
        'Upper arm R': { rotation: fwd * 2.2 },
        'Upper arm L': { rotation: fwd * 2.4 },
        'Upper leg R': { rotation: fwd * 0.4 },
        'Lower leg R': { rotation: -fwd * 0.3 }
      };
      const down: PoseValues = {
        Hip: { y: thigh * 1.5 },
        Spine: { rotation: fwd * 0.55 },
        Head: { rotation: -fwd * 0.25 },
        'Upper leg R': { rotation: fwd * 1.3 },
        'Lower leg R': { rotation: -fwd * 0.6 },
        'Upper leg L': { rotation: fwd * 1.1 },
        'Lower leg L': { rotation: -fwd * 0.8 },
        'Upper arm R': { rotation: -fwd * 0.6 },
        'Lower arm R': { rotation: fwd * 0.3 },
        'Upper arm L': { rotation: -fwd * 0.7 }
      };
      put(at, withHip({}), 'out');
      put(at + frames(0.3), withHip(stumble, d * 0.5), 'in');
      put(at + frames(0.6), withHip(down, d), 'out');
      put(at + frames(0.9), withHip({ ...down, Spine: { rotation: fwd * 0.45 } }, d), null);
      if (o.back) {
        const end = at + frames(0.9) + Math.round(Math.max(0.4, hold) * fps);
        keys[keys.length - 1].ease = 'inout';
        const kneel: PoseValues = { ...down, Hip: { y: thigh * 0.8 }, Spine: { rotation: -fwd * 0.35 }, 'Upper leg R': { rotation: fwd * 1.2 }, 'Lower leg R': { rotation: -fwd * 1.6 } };
        put(end, withHip(down, d), 'inout');
        put(end + frames(0.5), withHip(kneel, d), 'inout');
        put(end + frames(1.1), withHip({}, d), null);
      }
      return keys;
    }
    case 'dodge': {
      // the body ducks and leans away, a quick step aside, then back up
      const d = o.distance || -fwd * u * 0.12;
      const duck: PoseValues = {
        Hip: { y: 0.1 * u },
        Spine: { rotation: fwd * 0.4 },
        Head: { rotation: fwd * 0.15 },
        'Upper leg R': { rotation: fwd * 0.6 },
        'Lower leg R': { rotation: -fwd * 1 },
        'Upper leg L': { rotation: fwd * 0.4 },
        'Lower leg L': { rotation: -fwd * 0.8 },
        'Upper arm R': { rotation: fwd * 1.9 },
        'Lower arm R': { rotation: fwd * 1.4 },
        'Upper arm L': { rotation: fwd * 1.7 },
        'Lower arm L': { rotation: fwd * 1.4 }
      };
      put(at, withHip({}), 'out');
      put(at + frames(0.2), withHip(duck, d), 'inout');
      put(at + frames(0.45), withHip(duck, d), 'inout');
      put(at + frames(0.7), withHip({}, d), null);
      return keys;
    }
    case 'gesture':
    case 'talk': {
      // the hands open and turn while explaining, talk is calmer and longer
      const big = kind === 'gesture' ? 1 : 0.5;
      const total = frames(info.seconds) + Math.round(hold * fps);
      const a: PoseValues = { 'Upper arm R': { rotation: fwd * 0.7 * big }, 'Lower arm R': { rotation: fwd * 1.5 }, 'Hand R': { rotation: -fwd * 0.3 }, Head: { rotation: fwd * 0.04 } };
      const b: PoseValues = { 'Upper arm R': { rotation: fwd * 0.45 * big }, 'Lower arm R': { rotation: fwd * 1.1 }, 'Upper arm L': { rotation: fwd * 0.5 * big }, 'Lower arm L': { rotation: fwd * 1.3 }, Head: { rotation: -fwd * 0.03 }, Chest: { rotation: -fwd * 0.03 } };
      const step = frames(kind === 'gesture' ? 0.4 : 0.55);
      put(at, withHip({}), 'inout');
      let f2 = at + step;
      for (let i = 0; f2 < at + total - step; i++, f2 += step) put(f2, withHip(i % 2 ? b : a), 'inout');
      put(Math.max(f2, at + step * 2), withHip({}), null);
      return keys;
    }
    case 'look': {
      // the head and the chest turn one way, the other way, then back ahead
      const side = (r: number): PoseValues => ({ Head: { rotation: fwd * r }, Chest: { rotation: fwd * r * 0.3 } });
      put(at, withHip({}), 'inout');
      put(at + frames(0.4), withHip(side(0.28)), 'inout');
      put(at + frames(0.9), withHip(side(0.28)), 'inout');
      put(at + frames(1.3), withHip(side(-0.3)), 'inout');
      put(at + frames(1.7), withHip(side(-0.3)), 'inout');
      put(at + frames(2), withHip({}), null);
      return keys;
    }
    case 'nod': {
      const down: PoseValues = { Head: { rotation: fwd * 0.22 } };
      put(at, withHip({}), 'inout');
      put(at + frames(0.2), withHip(down), 'inout');
      put(at + frames(0.4), withHip({}), 'inout');
      put(at + frames(0.6), withHip(down), 'inout');
      put(at + frames(0.8), withHip({}), null);
      return keys;
    }
    case 'shrug': {
      const pose: PoseValues = {
        Chest: { y: -0.02 * u },
        Head: { rotation: -fwd * 0.08 },
        'Upper arm R': { rotation: fwd * 0.35 },
        'Lower arm R': { rotation: fwd * 1.8 },
        'Hand R': { rotation: -fwd * 0.5 },
        'Upper arm L': { rotation: fwd * 0.3 },
        'Lower arm L': { rotation: fwd * 1.7 },
        'Hand L': { rotation: -fwd * 0.5 }
      };
      put(at, withHip({}), 'inout');
      put(at + frames(0.3), withHip(pose), 'inout');
      put(at + frames(0.6) + Math.round(hold * fps), withHip(pose), 'inout');
      put(at + frames(1) + Math.round(hold * fps), withHip({}), null);
      return keys;
    }
    case 'startle': {
      // a jolt back, the hands up, then it settles
      const d = o.distance || -fwd * u * 0.08;
      const jolt: PoseValues = {
        Hip: { y: -0.02 * u },
        Spine: { rotation: fwd * 0.18 },
        Head: { rotation: -fwd * 0.12 },
        'Upper arm R': { rotation: fwd * 1.2 },
        'Lower arm R': { rotation: fwd * 1.6 },
        'Upper arm L': { rotation: fwd * 1.1 },
        'Lower arm L': { rotation: fwd * 1.6 }
      };
      put(at, withHip({}), 'out');
      put(at + frames(0.15), withHip(jolt, d), 'inout');
      put(at + frames(0.5), withHip({ ...jolt, Spine: { rotation: fwd * 0.08 } }, d), 'inout');
      put(at + frames(0.8), withHip({}, d), null);
      return keys;
    }
    default:
      return keys;
  }
}

function reachPose(body: Body, target: Vec | null, fwd: number): PoseValues {
  const lean: PoseValues = { Spine: { rotation: -fwd * 0.12 }, Chest: { rotation: -fwd * 0.05 }, Head: { rotation: fwd * 0.08 } };
  const upper = body.id('Upper arm R');
  const lower = body.id('Lower arm R');
  if (!target || !upper || !lower) {
    return { ...lean, 'Upper arm R': { rotation: fwd * 0.95 }, 'Lower arm R': { rotation: fwd * 0.25 }, 'Hand R': { rotation: fwd * 0.2 } };
  }
  // the arm solves on the leaning body, from the rest pose with the hip where it is
  const base: Pose = {};
  for (const [name, v] of Object.entries(lean)) {
    const id = body.id(name as BoneName);
    if (id) base[id] = { rotation: v.rotation ?? 0, x: 0, y: 0, scale: 1 };
  }
  const hipId = body.id('Hip');
  if (hipId) base[hipId] = { ...poseOf(body.start, hipId) };
  const lowerBone = body.bones.find((b) => b.id === lower)!;
  const solved = solveChain(body.bones, base, lower, { x: lowerBone.length, y: 0 }, target, { limit: 2 });
  return {
    ...lean,
    'Upper arm R': { rotation: solved[upper]?.rotation ?? 0 },
    'Lower arm R': { rotation: solved[lower]?.rotation ?? 0 },
    'Hand R': { rotation: fwd * 0.15 }
  };
}

// two keyframes on one frame: the later one wins
function dedupe(keys: PoseKey[]): PoseKey[] {
  const out = new Map<number, PoseKey>();
  for (const k of keys) out.set(k.frame, k);
  return [...out.values()].sort((a, b) => a.frame - b.frame);
}

// the pose of a keyframe from the values by bone name, bones the character lacks are left out
export function toPose(values: PoseValues, id: (name: BoneName) => string | null): Pose {
  const out: Pose = {};
  for (const [name, v] of Object.entries(values)) {
    const bone = id(name as BoneName);
    if (!bone) continue;
    out[bone] = { rotation: v.rotation ?? 0, x: v.x ?? 0, y: v.y ?? 0, scale: v.scale ?? 1, ...(v.sx !== undefined && v.sx !== 1 ? { sx: v.sx } : {}) };
  }
  return out;
}

// the face a body layer shows at frame: the last keyframe at or before it that set one
export interface FaceState {
  emotion: Emotion;
  mouth: MouthShape;
}

export function faceAt(layer: Layer | null, frame: number): FaceState {
  const keys = layer?.keyframes ?? [];
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i] as Keyframe & { face?: FaceState };
    if (k.frame <= frame && k.face) return { ...k.face };
  }
  return { emotion: 'neutral', mouth: 'closed' };
}

// the anchors of a face part set to the shape of a mood, the item keeps its id, style and binding
export function faceShapes(frame: FaceFrame, state: FaceState, blink = false, style?: FaceStyle): Record<string, PathData> {
  return facePaths(frame, state.emotion, state.mouth, blink, style);
}

// mouth shapes for talking without a sound, a little different every time but the same for a seed
export function talkPattern(at: number, frames: number, seed: number): { frame: number; mouth: MouthShape }[] {
  const rnd = seeded(seed);
  const out: { frame: number; mouth: MouthShape }[] = [];
  let f = at;
  let last: MouthShape = 'closed';
  while (f < at + frames) {
    const r = rnd();
    let mouth: MouthShape = r < 0.45 ? 'slight' : r < 0.8 ? 'wide' : 'closed';
    if (mouth === last) mouth = last === 'wide' ? 'slight' : 'wide';
    out.push({ frame: f, mouth });
    last = mouth;
    f += 2 + Math.floor(rnd() * 3);
  }
  out.push({ frame: at + frames, mouth: 'closed' });
  return out;
}

// mouth shapes from how loud a voice is on each frame, 0 to 1: quiet is closed, loud is wide. a shape
// holds at least two frames so the mouth does not flicker
export function lipSync(levels: number[], at: number, quiet = 0.12, loud = 0.5): { frame: number; mouth: MouthShape }[] {
  const out: { frame: number; mouth: MouthShape }[] = [];
  let last: MouthShape | null = null;
  let since = 0;
  levels.forEach((v, i) => {
    const mouth: MouthShape = v < quiet ? 'closed' : v < loud ? 'slight' : 'wide';
    since++;
    if (mouth !== last && (last === null || since >= 2)) {
      out.push({ frame: at + i, mouth });
      last = mouth;
      since = 0;
    }
  });
  if (last !== 'closed') out.push({ frame: at + levels.length, mouth: 'closed' });
  return out;
}

// blinks every few seconds over a stretch, each three frames long, never in the same rhythm
export function blinkFrames(at: number, frames: number, fps: number, seed: number): number[] {
  const rnd = seeded(seed + 101);
  const out: number[] = [];
  let f = at + Math.round(fps * (0.6 + rnd()));
  while (f + 3 < at + frames) {
    out.push(f);
    f += Math.round(fps * (2.2 + rnd() * 2.4));
  }
  return out;
}
