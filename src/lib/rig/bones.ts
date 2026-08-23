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
