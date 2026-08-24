import type { Bone, BonePose, Layer, Mat, Vec } from '$lib/core/types';
import { applyPoint, applyVector, decompose, identity, invert, multiply, rotate, scale, translate } from '$lib/core/mat';
import { PALETTE } from '$lib/core/palette';
import { newId } from '$lib/core/ids';

export type Pose = Record<string, BonePose>;

export const REST_POSE: BonePose = { rotation: 0, x: 0, y: 0, scale: 1 };
// the reach of a new bone, a share of its length
export const DEFAULT_RADIUS = 0.35;

export function poseOf(pose: Pose, id: string): BonePose {
  return pose[id] ?? REST_POSE;
}

export function boneById(bones: Bone[], id: string | null): Bone | null {
  if (!id) return null;
  return bones.find((b) => b.id === id) ?? null;
}

export function childrenOf(bones: Bone[], id: string): Bone[] {
  return bones.filter((b) => b.parent === id);
}

export function rootsOf(bones: Bone[]): Bone[] {
  return bones.filter((b) => !boneById(bones, b.parent));
}

// the bone, its parent and so on up to the root, a loop of parents stops where it comes back
export function chainToRoot(bones: Bone[], id: string): Bone[] {
  const out: Bone[] = [];
  for (let b = boneById(bones, id); b && !out.includes(b); b = boneById(bones, b.parent)) out.push(b);
  return out;
}

// how many bones sit above this one
export function boneDepth(bones: Bone[], id: string): number {
  return Math.max(0, chainToRoot(bones, id).length - 1);
}

// translate(x + pose.x, y + pose.y) * rotate(rotation + pose.rotation) * scale(pose.scale)
export function localMatrix(bone: Bone, p: BonePose = REST_POSE): Mat {
  const m = multiply(translate(bone.x + p.x, bone.y + p.y), rotate(bone.rotation + p.rotation));
  return p.scale === 1 ? m : multiply(m, scale(p.scale));
}

// the bone's world matrix with every bone up the chain posed
export function worldAt(bones: Bone[], bone: Bone, pose: Pose): Mat {
  let m = identity();
  for (const b of chainToRoot(bones, bone.id)) m = multiply(localMatrix(b, poseOf(pose, b.id)), m);
  return m;
}

export function restWorld(bones: Bone[], bone: Bone): Mat {
  return worldAt(bones, bone, {});
}

// every world matrix at once, a parent is worked out only once for all its children
export function worldMatrices(bones: Bone[], pose: Pose): Map<string, Mat> {
  const out = new Map<string, Mat>();
  const visiting = new Set<string>();
  const visit = (b: Bone): Mat => {
    const known = out.get(b.id);
    if (known) return known;
    const parent = visiting.has(b.id) ? null : boneById(bones, b.parent);
    visiting.add(b.id);
    let m = localMatrix(b, poseOf(pose, b.id));
    if (parent) m = multiply(visit(parent), m);
    out.set(b.id, m);
    return m;
  };
  bones.forEach(visit);
  return out;
}

export function originOf(world: Mat): Vec {
  return { x: world[4], y: world[5] };
}

export function tipOf(world: Mat, bone: Bone): Vec {
  return applyPoint(world, { x: bone.length, y: 0 });
}

export interface BoneOptions {
  name: string;
  color: string;
  // the reach as a share of the length
  reach?: number;
}

// a bone from one world point to another under parent, its local placement comes through the
// parent's world matrix at pose, so it lands where it was clicked even on a posed rig
export function addBone(bones: Bone[], parentId: string | null, from: Vec, to: Vec, pose: Pose, opts: BoneOptions): Bone {
  const parent = boneById(bones, parentId);
  const parentWorld = parent ? worldAt(bones, parent, pose) : identity();
  const inv = invert(parentWorld);
  const o = applyPoint(inv, from);
  const d = applyVector(inv, { x: to.x - from.x, y: to.y - from.y });
  const length = Math.hypot(d.x, d.y);
  const bone: Bone = {
    id: newId(),
    name: opts.name,
    parent: parent?.id ?? null,
    x: o.x,
    y: o.y,
    length,
    radius: length * (opts.reach ?? DEFAULT_RADIUS),
    rotation: Math.atan2(d.y, d.x),
    bind: identity(),
    pinned: false,
    color: opts.color
  };
  bone.bind = multiply(parentWorld, localMatrix(bone));
  bones.push(bone);
  return bone;
}

// the bone goes, its children hang on its parent and stay where they are at rest
export function removeBone(bones: Bone[], id: string) {
  const index = bones.findIndex((b) => b.id === id);
  if (index < 0) return;
  const bone = bones[index];
  const parent = boneById(bones, bone.parent);
  const parentInv = parent ? invert(restWorld(bones, parent)) : identity();
  for (const child of childrenOf(bones, id)) {
    const d = decompose(multiply(parentInv, restWorld(bones, child)));
    child.x = d.x;
    child.y = d.y;
    child.rotation = d.rotation;
    child.parent = parent?.id ?? null;
  }
  bones.splice(index, 1);
}

// a new chain takes the next palette color, a branch the color of the bone it grows from
export function nextBoneColor(bones: Bone[], parentId: string | null = null): string {
  const parent = boneById(bones, parentId);
  if (parent) return parent.color;
  return PALETTE[rootsOf(bones).length % PALETTE.length];
}

// 'Bone 4' like names, counting the bones of every rig layer
export function nextBoneName(bones: Bone[]): string {
  let n = 0;
  for (const b of bones) {
    const m = /^Bone (\d+)$/.exec(b.name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `Bone ${n + 1}`;
}

// every bone of the rig layers of a timeline
export function timelineBones(layers: Layer[]): Bone[] {
  const out: Bone[] = [];
  for (const l of layers) if (l.type === 'rig') out.push(...l.bones);
  return out;
}

export function rigLayerOf(layers: Layer[], boneId: string): Layer | null {
  return layers.find((l) => l.type === 'rig' && l.bones.some((b) => b.id === boneId)) ?? null;
}

// screen pixels, the callers divide by the zoom
export const JOINT_TOLERANCE = 6;
export const BODY_TOLERANCE = 5;

// a joint is where a bone starts, the free end of a bone with no children is one too
export interface Joint {
  bone: Bone;
  end: 'origin' | 'tip';
  point: Vec;
}

export function jointsOf(bones: Bone[], worlds: Map<string, Mat>): Joint[] {
  const out: Joint[] = [];
  for (const bone of bones) {
    const m = worlds.get(bone.id);
    if (!m) continue;
    out.push({ bone, end: 'origin', point: originOf(m) });
    if (childrenOf(bones, bone.id).length === 0) out.push({ bone, end: 'tip', point: tipOf(m, bone) });
  }
  return out;
}

// the closest joint within tolerance world units, a bone's start wins over a tip on the same spot
export function hitJoint(joints: Joint[], p: Vec, tolerance: number): Joint | null {
  let best: Joint | null = null;
  let bestD = tolerance;
  for (const j of joints) {
    const d = Math.hypot(j.point.x - p.x, j.point.y - p.y);
    if (d < bestD - 1e-6 || (d <= bestD && best?.end === 'tip' && j.end === 'origin')) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

// distance from p to the segment a b, and how far along it the closest point is
export function segmentDistance(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { d: Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y), t };
}

// the bone whose body passes closest to p within tolerance world units
export function hitBody(bones: Bone[], worlds: Map<string, Mat>, p: Vec, tolerance: number): Bone | null {
  let best: Bone | null = null;
  let bestD = tolerance;
  for (const bone of bones) {
    const m = worlds.get(bone.id);
    if (!m) continue;
    const { d } = segmentDistance(p, originOf(m), tipOf(m, bone));
    if (d <= bestD) {
      best = bone;
      bestD = d;
    }
  }
  return best;
}
