import { get } from 'svelte/store';
import type { BonePose, Doc, Layer, Vec } from '$lib/core/types';
import { applyPoint, invert, multiply } from '$lib/core/mat';
import { itemBounds } from '$lib/core/items';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { insertKeyframe } from '$lib/anim/timeline';
import { poseAt, resolveItems } from '$lib/render/frame';
import { rigFor, worldMatrices, type Pose } from '$lib/rig/bones';
import { solveChain } from '$lib/rig/ik';
import { characterLayers, characterFolders, type Emotion, type HandPose } from '$lib/character/model';
import { addToast, selection } from '$lib/stores/app';
import { editor } from './editor';
import { animateDraft, bodyIn, faceDraft, handKeys, holdFrom, reach, shownTransform } from './character';

// characters doing things with each other and with what is in the scene: turning to and looking at one
// another, pointing, waving, shaking hands, handing an object over, hugging, reacting, and the moves a
// product video is made of. each one is a single undo step of ordinary keyframes on the rigs and body
// layers, so every part can be changed afterwards on the timeline like a move made by hand

type Side = 'L' | 'R';

// where a character is at a frame: its hip on the stage, the way it looks on the screen, its size
interface Where {
  rig: Layer;
  hip: Vec;
  head: Vec;
  // 1 the character looks right on the screen, -1 left, after any turn
  look: number;
  // the way it looked when it was made
  facing: number;
  height: number;
  world: Map<string, readonly number[]>;
  bone: (name: string) => string | null;
}

function where(draft: Doc, id: string, at: number): Where | null {
  const body = bodyIn(draft.layers, id, at);
  const parts = characterLayers(draft.layers, id);
  if (!body || !parts) return null;
  const pose = poseAt(body.rig, at);
  const world = worldMatrices(body.rig.bones, pose);
  const bone = (name: string) => body.rig.bones.find((b) => b.name === name)?.id ?? null;
  const hipId = bone('Hip');
  const headId = bone('Head');
  if (!hipId || !headId) return null;
  const hip = world.get(hipId)!;
  const headBone = body.rig.bones.find((b) => b.id === headId)!;
  const head = applyPoint(world.get(headId)!, { x: headBone.length * 0.5, y: 0 });
  const sx = pose[hipId]?.sx ?? 1;
  return {
    rig: body.rig,
    hip: { x: hip[4], y: hip[5] },
    head,
    look: body.facing * Math.sign(sx || 1),
    facing: body.facing,
    height: body.height,
    world,
    bone
  };
}

function fpsOf(draft: Doc) {
  return Math.max(1, draft.fps);
}

// a character turns to x if it looks away from it. the frame it is done
function turnTo(draft: Doc, id: string, x: number, at: number): number {
  const w = where(draft, id, at);
  if (!w || Math.abs(x - w.hip.x) < 1 || Math.sign(x - w.hip.x) === w.look) return at;
  return animateDraft(draft, id, { kind: 'turn', repeat: 0, speed: 1, mirror: false, distance: 0, back: false }, at) ?? at;
}

// the bones that stand still: legs, arms and body back to rest over a moment, the hip stays where it is
function settle(draft: Doc, id: string, at: number, frames: number): number {
  const w = where(draft, id, at);
  if (!w) return at;
  const before = insertKeyframe(w.rig, at);
  before.tween = { ease: 'inout' };
  const key = insertKeyframe(w.rig, at + frames);
  const keep = new Set(['Hip', 'Fingers L', 'Index L', 'Thumb L', 'Fingers R', 'Index R', 'Thumb R']);
  const pose: Pose = {};
  for (const b of w.rig.bones) {
    const p = key.pose[b.id];
    if (!p) continue;
    if (b.name === 'Hip') pose[b.id] = { ...p, y: 0, rotation: 0 };
    else if (keep.has(b.name)) pose[b.id] = p;
  }
  key.pose = pose;
  key.tween = null;
  reach(draft, at + frames);
  return at + frames;
}

// walks to x on the stage with steps that fit its size and stands still there
export function walkDraft(draft: Doc, id: string, x: number, at: number, run = false): number {
  let t = turnTo(draft, id, x, at);
  const w = where(draft, id, t);
  if (!w) return t;
  const d = x - w.hip.x;
  if (Math.abs(d) < w.height * 0.05) return t;
  const natural = w.height * (run ? 1.5 : 0.75);
  const cycles = Math.max(1, Math.round(Math.abs(d) / natural));
  const end = animateDraft(draft, id, { kind: run ? 'run' : 'walk', repeat: cycles, speed: 1, mirror: false, distance: d / cycles, back: false }, t);
  if (end === null) return t;
  t = settle(draft, id, end, Math.round(fpsOf(draft) * 0.3));
  return t;
}

// the arm of a side solved so the wrist reaches target, from the pose the rig has at frame
function armRotations(w: Where, side: Side, target: Vec, at: number): { upper: number; lower: number } | null {
  const upper = w.bone(`Upper arm ${side}`);
  const lower = w.bone(`Lower arm ${side}`);
  if (!upper || !lower) return null;
  const base = poseAt(w.rig, at);
  const lowerBone = w.rig.bones.find((b) => b.id === lower)!;
  const solved = solveChain(w.rig.bones, base, lower, { x: lowerBone.length, y: 0 }, target, { limit: 2 });
  return { upper: solved[upper]?.rotation ?? 0, lower: solved[lower]?.rotation ?? 0 };
}

function setRot(pose: Pose, id: string | null, rotation: number) {
  if (!id) return;
  const p: BonePose = pose[id] ?? { rotation: 0, x: 0, y: 0, scale: 1 };
  pose[id] = { ...p, rotation };
}

// keys that move bones to rotations by name over dur frames and hold them for hold frames, then back
// to how they were when back is set. the frame the pose is reached and the frame it is over
function poseMove(draft: Doc, id: string, at: number, dur: number, hold: number, rotations: Record<string, number>, back: boolean | Record<string, number>): { arrive: number; end: number } {
  const w = where(draft, id, at);
  if (!w) return { arrive: at, end: at };
  const rig = w.rig;
  const arrive = at + dur;
  const leave = arrive + hold;
  const end = back ? leave + dur : leave;
  // what was there in between gives way, the keys before and after stay
  const start = insertKeyframe(rig, at);
  const was = JSON.parse(JSON.stringify(start.pose)) as Pose;
  start.tween = { ease: 'inout' };
  const after = rig.keyframes.find((k) => k.frame > end);
  rig.keyframes = rig.keyframes.filter((k) => k.frame <= at || k.frame > end);
  const a = insertKeyframe(rig, arrive);
  for (const [name, r] of Object.entries(rotations)) setRot(a.pose, w.bone(name), r);
  a.tween = hold > 0 || back ? { ease: 'inout' } : null;
  if (hold > 0) {
    const h = insertKeyframe(rig, leave);
    h.pose = JSON.parse(JSON.stringify(a.pose));
    h.tween = back ? { ease: 'inout' } : null;
  }
  if (back) {
    const e = insertKeyframe(rig, end);
    e.pose = JSON.parse(JSON.stringify(a.pose));
    const to = back === true ? null : back;
    for (const name of Object.keys(to ?? rotations)) {
      const bid = w.bone(name);
      if (!bid) continue;
      if (to) setRot(e.pose, bid, to[name]);
      else if (was[bid]) e.pose[bid] = { ...was[bid] };
      else delete e.pose[bid];
    }
    e.tween = after ? { ease: 'inout' } : null;
  }
  reach(draft, end);
  return { arrive, end };
}

function hand(draft: Doc, id: string, side: Side, pose: HandPose, at: number, blend = 3) {
  const w = where(draft, id, at);
  if (!w || !w.bone(`Index ${side}`)) return;
  handKeys(w.rig, side, pose, w.facing, at, blend);
  reach(draft, at);
}

function mood(draft: Doc, id: string, emotion: Emotion, at: number, blend = 4) {
  faceDraft(draft, id, [{ frame: at, state: { emotion }, blend }]);
}

// the head tilts to look at a point: up or down, as far as a neck goes
function lookKeys(draft: Doc, id: string, target: Vec, at: number, dur: number) {
  const w = where(draft, id, at);
  if (!w) return;
  const dx = Math.abs(target.x - w.head.x);
  const dy = target.y - w.head.y;
  const tilt = Math.max(-0.45, Math.min(0.45, Math.atan2(dy, Math.max(dx, w.height * 0.2)))) * w.facing;
  const before = insertKeyframe(w.rig, at);
  before.tween = { ease: 'inout' };
  const key = insertKeyframe(w.rig, at + dur);
  setRot(key.pose, w.bone('Head'), tilt * 0.6);
  setRot(key.pose, w.bone('Neck'), tilt * 0.4);
  reach(draft, at + dur);
}

// the hand side holding an item, from the bone it is bound to
function holder(draft: Doc, itemId: string, at: number): { folder: string; side: Side; layer: Layer } | null {
  for (const layer of draft.layers) {
    if (layer.type !== 'normal' && layer.type !== 'guide') continue;
    const item = resolveItems(layer, at).find((i) => i.id === itemId);
    if (!item) continue;
    const bone = item.skin?.rigid;
    if (!bone) return null;
    for (const f of characterFolders(draft.layers)) {
      const b = characterLayers(draft.layers, f.id)?.rig?.bones.find((x) => x.id === bone);
      if (b?.name.startsWith('Hand ')) return { folder: f.id, side: b.name.endsWith('L') ? 'L' : 'R', layer };
    }
    return null;
  }
  return null;
}

// the middle of an item on the stage at a frame, wherever it is bound
function itemCenter(draft: Doc, itemId: string, at: number): Vec | null {
  for (const layer of draft.layers) {
    if (layer.type !== 'normal' && layer.type !== 'guide') continue;
    const item = resolveItems(layer, at).find((i) => i.id === itemId);
    if (!item) continue;
    const box = itemBounds(item, shownTransform(draft, item, at));
    return isEmpty(box) ? null : boxCenter(box);
  }
  return null;
}

// an item goes from wherever it is into a hand at a frame, it stays where it is shown
function bindTo(draft: Doc, itemId: string, folder: string, side: Side, at: number): boolean {
  const layer = draft.layers.find((l) => (l.type === 'normal' || l.type === 'guide') && resolveItems(l, at).some((i) => i.id === itemId));
  const rigLayer = characterLayers(draft.layers, folder)?.rig;
  const bone = rigLayer?.bones.find((b) => b.name === `Hand ${side}`);
  if (!layer || !bone) return false;
  const item = resolveItems(layer, at).find((i) => i.id === itemId)!;
  const shown = shownTransform(draft, item, at);
  const delta = rigFor(draft.layers, at)?.skin.get(bone.id);
  if (!delta) return false;
  const transform = multiply(invert(delta), shown);
  holdFrom(layer, at);
  const key = insertKeyframe(layer, at);
  key.tween = null;
  key.items = key.items.map((i) => (i.id === itemId ? { ...i, transform, skin: { weights: [], rigid: bone.id }, role: 'prop' } : i));
  return true;
}

// the pose of an arm holding something in front of the chest, by the way the character was made
function holdInFront(facing: number, side: Side): Record<string, number> {
  const fwd = -facing;
  return { [`Upper arm ${side}`]: fwd * 0.55, [`Lower arm ${side}`]: fwd * 1.45, [`Hand ${side}`]: fwd * 0.1 };
}

function partners(a: string, b: string): boolean {
  const list = characterFolders(editor.doc.layers);
  if (a === b || !list.some((f) => f.id === a) || !list.some((f) => f.id === b)) {
    addToast('Pick two different characters', 'info');
    return false;
  }
  return true;
}

function run(label: string, recipe: (draft: Doc, at: number) => void): boolean {
  if (editor.editStack.length > 0) return false;
  const at = editor.frame;
  let ok = true;
  editor.commit(label, (draft) => {
    try {
      recipe(draft, at);
    } catch (e) {
      ok = false;
      throw e;
    }
  });
  return ok;
}

// ---------------------------------------------------------------- two characters

export type Interaction = 'look' | 'point' | 'wave' | 'handshake' | 'give' | 'hug';

export const INTERACTIONS: { id: Interaction; label: string; hint: string }[] = [
  { id: 'look', label: 'Look at', hint: 'Turns and looks at the other one' },
  { id: 'point', label: 'Point at', hint: 'Points with the near hand' },
  { id: 'wave', label: 'Wave to', hint: 'Turns, smiles and waves' },
  { id: 'handshake', label: 'Shake hands', hint: 'Walks over, both shake hands' },
  { id: 'give', label: 'Hand over', hint: 'Walks over and hands over what it holds' },
  { id: 'hug', label: 'Hug', hint: 'Walks over, both hug' }
];

export function lookAt(a: string, b: string): boolean {
  if (!partners(a, b)) return false;
  return run('Look at', (draft, at) => {
    const tb = where(draft, b, at);
    if (!tb) return;
    const t = turnTo(draft, a, tb.hip.x, at);
    lookKeys(draft, a, tb.head, t, Math.round(fpsOf(draft) * 0.3));
  });
}

export function pointAt(a: string, target: Vec, hold = 1.2): boolean {
  return run('Point at', (draft, at) => pointDraft(draft, a, target, at, hold));
}

function pointDraft(draft: Doc, a: string, target: Vec, at: number, hold: number): number {
  const fps = fpsOf(draft);
  const t = turnTo(draft, a, target.x, at);
  const w = where(draft, a, t);
  if (!w) return t;
  const shoulderId = w.bone('Upper arm R');
  if (!shoulderId) return t;
  const s = w.world.get(shoulderId)!;
  const shoulder = { x: s[4], y: s[5] };
  const len = Math.hypot(target.x - shoulder.x, target.y - shoulder.y) || 1;
  // the arm straight toward it, a little short of its full length
  const reachTo = { x: shoulder.x + ((target.x - shoulder.x) / len) * w.height * 0.27, y: shoulder.y + ((target.y - shoulder.y) / len) * w.height * 0.27 };
  const arm = armRotations(w, 'R', reachTo, t);
  if (!arm) return t;
  const dur = Math.round(fps * 0.35);
  const m = poseMove(draft, a, t, dur, Math.round(hold * fps), { 'Upper arm R': arm.upper, 'Lower arm R': arm.lower }, true);
  hand(draft, a, 'R', 'point', m.arrive, 2);
  hand(draft, a, 'R', 'relaxed', m.end, 3);
  lookKeys(draft, a, target, t, dur);
  return m.end;
}

export function pointAtCharacter(a: string, b: string): boolean {
  if (!partners(a, b)) return false;
  return run('Point at', (draft, at) => {
    const tb = where(draft, b, at);
    if (tb) pointDraft(draft, a, { x: tb.hip.x, y: (tb.hip.y + tb.head.y) / 2 }, at, 1.2);
  });
}

export function waveTo(a: string, b: string): boolean {
  if (!partners(a, b)) return false;
  return run('Wave to', (draft, at) => {
    const tb = where(draft, b, at);
    if (!tb) return;
    const t = turnTo(draft, a, tb.hip.x, at);
    mood(draft, a, 'happy', t);
    hand(draft, a, 'R', 'open', t);
    const end = animateDraft(draft, a, { kind: 'wave', repeat: 3, speed: 1, mirror: false, distance: 0, back: true }, t) ?? t;
    hand(draft, a, 'R', 'relaxed', end, 3);
  });
}

// a walks over to b until they are gap of a's height apart, both turned to each other
function meet(draft: Doc, a: string, b: string, at: number, gap: number): { t: number; wa: Where; wb: Where } | null {
  const wa0 = where(draft, a, at);
  const wb0 = where(draft, b, at);
  if (!wa0 || !wb0) return null;
  const side = Math.sign(wb0.hip.x - wa0.hip.x) || 1;
  const goal = wb0.hip.x - side * gap * wa0.height;
  let t = walkDraft(draft, a, goal, at);
  t = Math.max(t, turnTo(draft, b, goal, at));
  const wa = where(draft, a, t);
  const wb = where(draft, b, t);
  if (!wa || !wb) return null;
  return { t, wa, wb };
}

export function handshake(a: string, b: string): boolean {
  if (!partners(a, b)) return false;
  return run('Shake hands', (draft, at) => {
    const fps = fpsOf(draft);
    const m = meet(draft, a, b, at, 0.36);
    if (!m) return;
    const point = { x: (m.wa.hip.x + m.wb.hip.x) / 2, y: (m.wa.hip.y + m.wb.hip.y) / 2 - m.wa.height * 0.06 };
    const dur = Math.round(fps * 0.45);
    const hold = Math.round(fps * 1.2);
    for (const id of [a, b]) {
      const w = where(draft, id, m.t)!;
      const arm = armRotations(w, 'R', point, m.t);
      if (!arm) continue;
      mood(draft, id, 'happy', m.t);
      const mv = poseMove(draft, id, m.t, dur, hold, { 'Upper arm R': arm.upper, 'Lower arm R': arm.lower }, true);
      hand(draft, id, 'R', 'grab', mv.arrive, 2);
      hand(draft, id, 'R', 'relaxed', mv.end, 3);
      // the hands go up and down together three times
      const upper = w.bone('Upper arm R')!;
      const lower = w.bone('Lower arm R')!;
      const step = Math.max(2, Math.floor(hold / 7));
      for (let i = 1; i <= 6; i++) {
        const f = mv.arrive + i * step;
        if (f >= mv.arrive + hold) break;
        const k = insertKeyframe(w.rig, f);
        const s = (i % 2 ? 1 : -1) * 0.07 * w.facing;
        setRot(k.pose, upper, arm.upper + s);
        setRot(k.pose, lower, arm.lower - s * 0.5);
        k.tween = { ease: 'inout' };
      }
    }
  });
}

export function hug(a: string, b: string): boolean {
  if (!partners(a, b)) return false;
  return run('Hug', (draft, at) => {
    const fps = fpsOf(draft);
    const m = meet(draft, a, b, at, 0.2);
    if (!m) return;
    for (const id of [a, b]) {
      const w = where(draft, id, m.t)!;
      const fwd = -w.facing;
      mood(draft, id, 'happy', m.t);
      poseMove(
        draft,
        id,
        m.t,
        Math.round(fps * 0.5),
        Math.round(fps * 1.5),
        {
          'Upper arm R': fwd * 1.35,
          'Lower arm R': fwd * 1.2,
          'Upper arm L': fwd * 1.25,
          'Lower arm L': fwd * 1.35,
          Spine: fwd * 0.08,
          Head: fwd * 0.12
        },
        true
      );
    }
  });
}

// a hands b what it holds: a walks over, both reach out, the item changes hands, b keeps it in front
export function giveItem(a: string, b: string, itemId?: string): boolean {
  if (!partners(a, b)) return false;
  const id = itemId ?? [...get(selection)][0];
  const held = id ? holder(editor.doc, id, editor.frame) : null;
  if (!id || !held || held.folder !== a) {
    addToast('The first character has to hold the object: pick it and use Take', 'info');
    return false;
  }
  return run('Hand over', (draft, at) => {
    const fps = fpsOf(draft);
    const m = meet(draft, a, b, at, 0.5);
    if (!m) return;
    const point = { x: (m.wa.hip.x + m.wb.hip.x) / 2, y: (m.wa.hip.y + m.wb.hip.y) / 2 - m.wa.height * 0.14 };
    const dur = Math.round(fps * 0.5);
    const hold = Math.round(fps * 0.5);
    const giverArm = armRotations(m.wa, held.side, point, m.t);
    const takerArm = armRotations(m.wb, 'R', point, m.t);
    if (!giverArm || !takerArm) return;
    // the empty hand goes down to rest afterwards
    const give = poseMove(
      draft,
      a,
      m.t,
      dur,
      hold,
      { [`Upper arm ${held.side}`]: giverArm.upper, [`Lower arm ${held.side}`]: giverArm.lower },
      { [`Upper arm ${held.side}`]: 0, [`Lower arm ${held.side}`]: 0, [`Hand ${held.side}`]: 0 }
    );
    const take = poseMove(draft, b, m.t, dur, hold, { 'Upper arm R': takerArm.upper, 'Lower arm R': takerArm.lower }, holdInFront(m.wb.facing, 'R'));
    hand(draft, b, 'R', 'grab', m.t + 2);
    const swap = give.arrive + Math.round(hold / 2);
    bindTo(draft, id, b, 'R', swap);
    hand(draft, b, 'R', 'hold', swap, 2);
    hand(draft, a, held.side, 'open', swap + 1, 2);
    hand(draft, a, held.side, 'relaxed', give.end, 3);
    mood(draft, a, 'happy', m.t);
    reach(draft, Math.max(give.end, take.end));
  });
}

// ---------------------------------------------------------------- one character

export type Reaction = 'surprised' | 'happy' | 'sad' | 'angry' | 'scared';

export const REACTIONS: { id: Reaction; label: string }[] = [
  { id: 'surprised', label: 'Surprised' },
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'angry', label: 'Angry' },
  { id: 'scared', label: 'Scared' }
];

export function react(a: string, kind: Reaction): boolean {
  return run('React', (draft, at) => {
    const fps = fpsOf(draft);
    const w = where(draft, a, at);
    if (!w) return;
    const fwd = -w.facing;
    const quick = Math.round(fps * 0.2);
    const hold = Math.round(fps * 0.9);
    mood(draft, a, kind === 'surprised' ? 'surprised' : kind === 'happy' ? 'excited' : kind, at, 2);
    const poses: Record<Reaction, Record<string, number>> = {
      // the body pulls back and the hands come up open
      surprised: { Spine: fwd * 0.16, Chest: fwd * 0.06, Head: fwd * 0.1, 'Upper arm R': fwd * 0.75, 'Lower arm R': fwd * 1.5, 'Upper arm L': fwd * 0.6, 'Lower arm L': fwd * 1.5 },
      happy: { Spine: fwd * 0.06, Head: fwd * 0.08, 'Upper arm R': fwd * 2.5, 'Lower arm R': fwd * 0.4, 'Upper arm L': fwd * 2.3, 'Lower arm L': fwd * 0.4 },
      sad: { Spine: -fwd * 0.12, Chest: -fwd * 0.08, Head: -fwd * 0.22, 'Upper arm R': -fwd * 0.05, 'Upper arm L': -fwd * 0.05 },
      angry: { Spine: -fwd * 0.1, Head: -fwd * 0.05, 'Upper arm R': fwd * 0.3, 'Lower arm R': fwd * 1.4, 'Upper arm L': fwd * 0.25, 'Lower arm L': fwd * 1.3 },
      scared: { Spine: fwd * 0.22, Head: -fwd * 0.1, 'Upper arm R': fwd * 1.1, 'Lower arm R': fwd * 1.9, 'Upper arm L': fwd * 1.0, 'Lower arm L': fwd * 1.9 }
    };
    const m = poseMove(draft, a, at, quick, hold, poses[kind], true);
    const hands: Record<Reaction, HandPose> = { surprised: 'open', happy: 'open', sad: 'relaxed', angry: 'fist', scared: 'open' };
    for (const s of ['R', 'L'] as const) {
      hand(draft, a, s, hands[kind], at + quick, 2);
      hand(draft, a, s, 'relaxed', m.end, 3);
    }
    // a hop for joy, a start for a surprise: the hip goes up and back down
    if (kind === 'happy' || kind === 'surprised') {
      const hipId = w.bone('Hip')!;
      const up = kind === 'happy' ? 0.05 : 0.025;
      for (const [f, dy] of [
        [at + quick, -up],
        [at + quick * 2, 0]
      ] as const) {
        const k = insertKeyframe(w.rig, f);
        const p = k.pose[hipId] ?? { rotation: 0, x: 0, y: 0, scale: 1 };
        k.pose[hipId] = { ...p, y: dy * w.height, x: p.x - (kind === 'surprised' && dy < 0 ? w.look * 0.02 * w.height : 0) };
        k.tween = { ease: 'inout' };
      }
    }
  });
}

// ---------------------------------------------------------------- templates for product videos

export type Template = 'enter' | 'leave' | 'toward' | 'take' | 'present' | 'pointObject' | 'turn' | 'walkTo';

export const TEMPLATES: { id: Template; label: string; hint: string; needsItem?: boolean }[] = [
  { id: 'enter', label: 'Walk into the picture', hint: 'Comes in from the side it looks away from' },
  { id: 'toward', label: 'Walk toward the camera', hint: 'Gets bigger and comes down the screen' },
  { id: 'take', label: 'Take the product', hint: 'Walks to the picked object and takes it', needsItem: true },
  { id: 'present', label: 'Hold it to the camera', hint: 'Shows what the hand holds' },
  { id: 'pointObject', label: 'Point at the object', hint: 'Points at the picked object', needsItem: true },
  { id: 'turn', label: 'Turn around', hint: 'Faces the other way' },
  { id: 'leave', label: 'Leave the picture', hint: 'Walks out on the side it looks to' }
];

// the hip x that puts a character just outside the stage on a side
function offStage(draft: Doc, w: Where, side: number): number {
  return side < 0 ? -w.height * 0.25 : draft.width + w.height * 0.25;
}

export function applyTemplate(a: string, template: Template): boolean {
  const item = [...get(selection)][0];
  const needs = TEMPLATES.find((t) => t.id === template)?.needsItem;
  if (needs && !item) {
    addToast('Pick the object on the stage first', 'info');
    return false;
  }
  if (template === 'present' && !heldBy(a)) {
    addToast('The character holds nothing: take an object first', 'info');
    return false;
  }
  const label = TEMPLATES.find((t) => t.id === template)?.label ?? 'Template';
  return run(label, (draft, at) => {
    const fps = fpsOf(draft);
    const w = where(draft, a, at);
    if (!w) return;
    const hipId = w.bone('Hip')!;
    switch (template) {
      case 'enter': {
        // it starts outside behind its back and walks to where it stands now
        const goal = w.hip.x;
        const from = offStage(draft, w, -w.look);
        const k = insertKeyframe(w.rig, at);
        const p = k.pose[hipId] ?? { rotation: 0, x: 0, y: 0, scale: 1 };
        k.pose[hipId] = { ...p, x: p.x + (from - w.hip.x) };
        k.tween = null;
        walkDraft(draft, a, goal, at);
        break;
      }
      case 'leave':
        walkDraft(draft, a, offStage(draft, w, w.look), at);
        break;
      case 'turn':
        animateDraft(draft, a, { kind: 'turn', repeat: 0, speed: 1, mirror: false, distance: 0, back: false }, at);
        break;
      case 'toward': {
        // walking on the spot while it grows and comes down the screen: the camera sees it come closer
        const seconds = 2.5;
        const cycles = Math.max(1, Math.round(seconds));
        const end = animateDraft(draft, a, { kind: 'walk', repeat: cycles, speed: 1, mirror: false, distance: 0, back: false }, at);
        if (end === null) return;
        const grow = 1.35;
        // the feet are below the hip by about half the height, they go down as it grows
        const feet = w.height * 0.47;
        for (const k of w.rig.keyframes) {
          if (k.frame <= at || k.frame > end) continue;
          const t = (k.frame - at) / (end - at);
          const s = 1 + (grow - 1) * t;
          const p = k.pose[hipId] ?? { rotation: 0, x: 0, y: 0, scale: 1 };
          k.pose[hipId] = { ...p, scale: (p.scale ?? 1) * s, y: p.y + feet * (1 - s) + w.height * 0.12 * t };
        }
        const last = w.rig.keyframes.find((k) => k.frame === end)!;
        const keepHip = { ...last.pose[hipId] };
        const done = settle(draft, a, end, Math.round(fps * 0.3));
        const k = w.rig.keyframes.find((x) => x.frame === done)!;
        k.pose[hipId] = { ...k.pose[hipId], scale: keepHip.scale, y: keepHip.y };
        break;
      }
      case 'take': {
        const c = itemCenter(draft, item!, at);
        if (!c) return;
        // close enough to reach it, on the side it is
        const side = Math.sign(c.x - w.hip.x) || w.look;
        const goal = c.x - side * w.height * 0.22;
        const t = Math.abs(c.x - w.hip.x) > w.height * 0.3 ? walkDraft(draft, a, goal, at) : turnTo(draft, a, c.x, at);
        const w2 = where(draft, a, t)!;
        const arm = armRotations(w2, 'R', c, t);
        if (!arm) return;
        const dur = Math.round(fps * 0.5);
        hand(draft, a, 'R', 'grab', t + 2);
        const mv = poseMove(draft, a, t, dur, Math.round(fps * 0.15), { 'Upper arm R': arm.upper, 'Lower arm R': arm.lower, Spine: w2.facing * 0.1 }, { ...holdInFront(w2.facing, 'R'), Spine: 0 });
        bindTo(draft, item!, a, 'R', mv.arrive);
        hand(draft, a, 'R', 'hold', mv.arrive, 2);
        break;
      }
      case 'present': {
        const held = heldSide(draft, a, at) ?? 'R';
        const fwd = -w.facing;
        mood(draft, a, 'happy', at);
        poseMove(
          draft,
          a,
          at,
          Math.round(fps * 0.4),
          Math.round(fps * 1.6),
          // up beside the face and out a little, where the camera sees it best from the side
          { [`Upper arm ${held}`]: fwd * 1.75, [`Lower arm ${held}`]: fwd * 0.4, [`Hand ${held}`]: -fwd * 0.35, Head: fwd * 0.08, Chest: -fwd * 0.05 },
          holdInFront(w.facing, held)
        );
        break;
      }
      case 'pointObject': {
        const c = itemCenter(draft, item!, at);
        if (c) pointDraft(draft, a, c, at, 1.2);
        break;
      }
    }
  });
}

function heldBy(a: string): boolean {
  return heldSide(editor.doc, a, editor.frame) !== null;
}

// the hand of a character that holds an item at a frame
function heldSide(draft: Doc, a: string, at: number): Side | null {
  const rig = characterLayers(draft.layers, a)?.rig;
  if (!rig) return null;
  const hands = new Map(rig.bones.filter((b) => b.name.startsWith('Hand ')).map((b) => [b.id, b.name.endsWith('L') ? 'L' : 'R'] as const));
  for (const layer of draft.layers) {
    if (layer.type !== 'normal' && layer.type !== 'guide') continue;
    for (const i of resolveItems(layer, at)) {
      const side = i.skin?.rigid ? hands.get(i.skin.rigid) : undefined;
      if (side && i.role === 'prop') return side;
    }
  }
  return null;
}

// a character walks to a point on the stage, its hip ends up above x
export function walkTo(a: string, x: number, runIt = false): boolean {
  return run(runIt ? 'Run to' : 'Walk to', (draft, at) => {
    walkDraft(draft, a, x, at, runIt);
  });
}
