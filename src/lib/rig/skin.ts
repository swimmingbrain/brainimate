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

// sum w_i * world_i * inverse(bind_i), a bone the rig does not have is left out
export function blend(weights: Weight[], rig: Rig): Mat {
  const out: Mat = [0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const { bone, w } of weights) {
    const m = rig.skin.get(bone);
    if (!m) continue;
    for (let i = 0; i < 6; i++) out[i] += w * m[i];
    total += w;
  }
  if (total <= 0) return identity();
  if (Math.abs(total - 1) > 1e-9) for (let i = 0; i < 6; i++) out[i] /= total;
  return out;
}

// the anchor with its point and both handle points through one affine matrix
export function mapAnchor(a: Anchor, m: Mat): Anchor {
  const p = applyPoint(m, a);
  const i = applyVector(m, { x: a.ix, y: a.iy });
  const o = applyVector(m, { x: a.ox, y: a.oy });
  return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, kind: a.kind };
}

// the matrix a rigid skin puts on top of the item's world matrix
export function rigidDelta(skin: Skin, rig: Rig): Mat {
  return (skin.rigid && rig.skin.get(skin.rigid)) || identity();
}

// a contour with each anchor through its own matrix, first is where its weights start in the skin
function mapContour(path: PathData, first: number, matrixAt: (index: number) => Mat): PathData {
  return { closed: path.closed, anchors: path.anchors.map((a, i) => mapAnchor(a, matrixAt(first + i))) };
}

function contoursOf(item: PathItem): PathData[] {
  return [item.path, ...item.subpaths];
}

// each contour through matrixAt, the outline and then the subpaths
function mapContours(item: PathItem, matrixAt: (index: number) => Mat): { path: PathData; subpaths: PathData[] } {
  let first = 0;
  const out = contoursOf(item).map((c) => {
    const mapped = mapContour(c, first, matrixAt);
    first += c.anchors.length;
    return mapped;
  });
  return { path: out[0], subpaths: out.slice(1) };
}

// linear blend skinning: every anchor and its two handle points in world space through the blend of
// its bones, p' = sum w_i * world_i * inverse(bind_i) * p. a rigid skin moves it all with one bone
export function deform(item: PathItem, rig: Rig, world: Mat): { path: PathData; subpaths: PathData[] } {
  const skin = item.skin;
  if (!skin) return mapContours(item, () => world);
  if (skin.rigid) {
    const m = multiply(rigidDelta(skin, rig), world);
    return mapContours(item, () => m);
  }
  return mapContours(item, (i) => multiply(blend(skin.weights[i] ?? [], rig), world));
}

// the same blend seen from the item's own space: inverse(world) * blend * world, per anchor
export function localBlends(item: PathItem, rig: Rig, world: Mat): Mat[] {
  const skin = item.skin;
  const n = anchorList(item).length;
  if (!skin || skin.rigid) return new Array(n).fill(identity());
  const inv = invert(world);
  const out: Mat[] = [];
  for (let i = 0; i < n; i++) {
    const b = blend(skin.weights[i] ?? [], rig);
    out.push(isIdentity(b) ? identity() : multiply(inv, multiply(b, world)));
  }
  return out;
}
