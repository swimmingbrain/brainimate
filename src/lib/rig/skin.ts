import type { Anchor, Bone, Item, Mat, PathData, PathItem, Skin, Vec } from '$lib/core/types';
import { applyPoint, applyVector, identity, invert, isIdentity, multiply, scaleFactor } from '$lib/core/mat';
import { segmentDistance, type Rig } from './bones';

export type Weight = { bone: string; w: number };

// weights below this are left out, an anchor follows at most this many bones
const MIN_WEIGHT = 0.05;
const MAX_BONES = 4;

// a bone as a line with a reach around it, in the space the item is measured in
interface Capsule {
  id: string;
  a: Vec;
  b: Vec;
  r: number;
}

// the bones placed by matrices, their bind matrices when none are given
function capsules(bones: Bone[], matrices?: Map<string, Mat>): Capsule[] {
  return bones.map((bone) => {
    const m = matrices?.get(bone.id) ?? bone.bind;
    return {
      id: bone.id,
      a: applyPoint(m, { x: 0, y: 0 }),
      b: applyPoint(m, { x: bone.length, y: 0 }),
      r: Math.max(1e-6, bone.radius * scaleFactor(m))
    };
  });
}

// the weights for one anchor from its point and its handle points: (1 - d / r)^2 inside the reach,
// 1 / (d + 1)^3 for every bone when no reach gets there, then the small ones dropped and the rest summed to 1
function weightsFor(points: Vec[], caps: Capsule[]): Weight[] {
  const raw = caps.map((c) => {
    let w = 0;
    for (const p of points) w += Math.max(0, 1 - segmentDistance(p, c.a, c.b).d / c.r) ** 2;
    return w / points.length;
  });
  if (raw.every((w) => w <= 0)) {
    caps.forEach((c, i) => {
      let w = 0;
      for (const p of points) w += 1 / (segmentDistance(p, c.a, c.b).d + 1) ** 3;
      raw[i] = w / points.length;
    });
  }
  return normalize(caps.map((c, i) => ({ bone: c.id, w: raw[i] })));
}

// small weights go, the four largest stay and sum to 1
export function normalize(list: Weight[]): Weight[] {
  let total = list.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return [];
  let out = list.map((x) => ({ bone: x.bone, w: Math.max(0, x.w) / total })).filter((x) => x.w >= MIN_WEIGHT);
  if (out.length === 0) out = [list.reduce((a, b) => (b.w > a.w ? b : a))].map((x) => ({ bone: x.bone, w: 1 }));
  out.sort((a, b) => b.w - a.w);
  out = out.slice(0, MAX_BONES);
  total = out.reduce((s, x) => s + x.w, 0);
  return out.map((x) => ({ bone: x.bone, w: x.w / total }));
}

function handlePoints(a: Anchor, m: Mat): Vec[] {
  const out = [applyPoint(m, a)];
  if (a.ix !== 0 || a.iy !== 0) out.push(applyPoint(m, { x: a.x + a.ix, y: a.y + a.iy }));
  if (a.ox !== 0 || a.oy !== 0) out.push(applyPoint(m, { x: a.x + a.ox, y: a.y + a.oy }));
  return out;
}

// the outline first, then the subpaths, the order skin weights are kept in
export function anchorList(item: PathItem): Anchor[] {
  const out = [...item.path.anchors];
  for (const sub of item.subpaths) out.push(...sub.anchors);
  return out;
}

// one list of bone weights per anchor, world is the item's world matrix and matrices place the bones
// (their bind matrices when left out)
export function autoWeights(item: PathItem, world: Mat, bones: Bone[], matrices?: Map<string, Mat>): Weight[][] {
  const caps = capsules(bones, matrices);
  if (caps.length === 0) return [];
  return anchorList(item).map((a) => weightsFor(handlePoints(a, world), caps));
}

// the bone whose reach holds all the points, the one whose line runs closest to their middle when
// several do, null when none does
export function holdingBone(points: Vec[], bones: Bone[], matrices?: Map<string, Mat>): string | null {
  if (points.length === 0) return null;
  const mid = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length
  };
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of capsules(bones, matrices)) {
    if (!points.every((p) => segmentDistance(p, c.a, c.b).d <= c.r)) continue;
    const d = segmentDistance(mid, c.a, c.b).d;
    if (d < bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}

// the bone whose line runs closest to p
export function nearestBone(p: Vec, bones: Bone[], matrices?: Map<string, Mat>): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of capsules(bones, matrices)) {
    const d = segmentDistance(p, c.a, c.b).d;
    if (d < bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}
