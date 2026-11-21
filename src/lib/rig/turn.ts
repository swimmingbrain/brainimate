import type { Bone, Layer, Mat, Point3, Turn, TurnRig, Vec } from '$lib/core/types';
import { identity, invert, multiply, applyPoint, applyVector } from '$lib/core/mat';
import { localMatrix } from './bones';
import { keyframeIndexAt, tweenAt } from '$lib/render/frame';

// a turnable character is seen from any angle. its rig keeps one set of bones with the same ids and
// names, only where they stand at rest changes with the angle: the bones are worked out from where
// they are in the room, looked at from the angle of the body layer at a frame. poses stay changes from
// that rest, so a wave or a walk works the same from every side

export const SIDE = 12;
export const THREE_QUARTER = 50;
export const FRONT = 90;
export const BACK = -90;

export const VIEWS: { id: string; label: string; angle: number }[] = [
  { id: 'front', label: 'Front', angle: FRONT },
  { id: 'three', label: '3/4', angle: THREE_QUARTER },
  { id: 'side', label: 'Side', angle: SIDE },
  { id: 'backthree', label: 'Back 3/4', angle: -50 },
  { id: 'back', label: 'Back', angle: BACK }
];

const RAD = Math.PI / 180;

// a point of the room on the stage and how near the viewer it is
export function project(p: Point3, angle: number, rig: Pick<TurnRig, 'x' | 'ground' | 'facing'>): Vec & { z: number } {
  const t = angle * RAD;
  const [a, s, y] = p;
  return { x: rig.x + rig.facing * (a * Math.cos(t) - s * Math.sin(t)), y: rig.ground - y, z: a * Math.sin(t) + s * Math.cos(t) };
}

// the nearest name of a view for an angle
export function viewOf(angle: number): string {
  const a = normalize(angle);
  let best = VIEWS[0];
  for (const v of VIEWS) if (Math.abs(normalize(a - v.angle)) < Math.abs(normalize(a - best.angle))) best = v;
  return best.id;
}

// an angle between -180 and 180
export function normalize(a: number): number {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

export const BASE_TURN: Turn = { body: SIDE, head: SIDE };

// the angle a body layer shows at frame: the keyframes that set one, turning between them on a tween
export function turnAt(layer: Layer | null | undefined, frame: number): Turn | null {
  if (!layer || !layer.keyframes.some((k) => k.turn)) return null;
  const i = keyframeIndexAt(layer, frame);
  const own = (index: number): Turn => {
    for (let j = index; j >= 0; j--) if (layer.keyframes[j].turn) return layer.keyframes[j].turn!;
    return BASE_TURN;
  };
  const here = own(Math.max(0, i));
  const spot = tweenAt(layer, frame);
  if (!spot) return { ...here };
  const next = own(layer.keyframes.indexOf(spot.next));
  return { body: here.body + (next.body - here.body) * spot.t, head: here.head + (next.head - here.head) * spot.t };
}

// the bones of a rig standing at an angle, from root to tip so a parent is placed before its children
const memo = new WeakMap<TurnRig, Map<number, Bone[]>>();

export function turnedBones(bones: Bone[], rig: TurnRig, angle: number): Bone[] {
  const key = Math.round(angle * 100) / 100;
  let cache = memo.get(rig);
  if (!cache) {
    cache = new Map();
    memo.set(rig, cache);
  }
  const hit = cache.get(key);
  if (hit && hit.length === bones.length && hit.every((b, i) => b.id === bones[i].id)) return hit;
  const world = new Map<string, Mat>();
  const byId = new Map(bones.map((b) => [b.id, b]));
  const out = new Map<string, Bone>();
  const place = (b: Bone): Mat => {
    const known = world.get(b.id);
    if (known) return known;
    const spot = rig.bones[b.id];
    const parent = b.parent ? byId.get(b.parent) : undefined;
    const parentWorld = parent ? place(parent) : identity();
    if (!spot) {
      // a bone added by hand stays where its parent takes it
      out.set(b.id, b);
      const m = multiply(parentWorld, localMatrix(b));
      world.set(b.id, m);
      return m;
    }
    const from = project(spot.from, key, rig);
    let to = project(spot.to, key, rig);
    // a bone seen end on, a foot from the front, keeps a little length straight down
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1) to = { ...from, y: from.y + 1, z: from.z };
    const inv = invert(parentWorld);
    const o = applyPoint(inv, from);
    const d = applyVector(inv, { x: to.x - from.x, y: to.y - from.y });
    const placed: Bone = { ...b, x: o.x, y: o.y, length: Math.hypot(d.x, d.y), rotation: Math.atan2(d.y, d.x) };
    const m = multiply(parentWorld, localMatrix(placed));
    placed.bind = m;
    out.set(b.id, placed);
    world.set(b.id, m);
    return m;
  };
  bones.forEach(place);
  const list = bones.map((b) => out.get(b.id)!);
  if (cache.size > 64) cache.delete(cache.keys().next().value as number);
  cache.set(key, list);
  return list;
}

// the body layer that holds the angle of a rig: the normal layer in the same character folder
export function turnSource(layers: Layer[], rig: Layer): Layer | null {
  if (!rig.turnRig || !rig.parent) return null;
  return layers.find((l) => l.parent === rig.parent && l.type === 'normal') ?? null;
}

// the bones of a rig layer as they stand at frame
export function bonesAt(layers: Layer[], rig: Layer, frame: number): Bone[] {
  if (!rig.turnRig) return rig.bones;
  const turn = turnAt(turnSource(layers, rig), frame);
  return turnedBones(rig.bones, rig.turnRig, turn?.body ?? SIDE);
}

// the angle a rig stands at, for a body made at the side view without any keyframe that turns it
export function bodyAngleAt(layers: Layer[], rig: Layer, frame: number): number {
  return turnAt(turnSource(layers, rig), frame)?.body ?? SIDE;
}
