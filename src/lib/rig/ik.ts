import type { Bone, Vec } from '$lib/core/types';
import { applyPoint, determinant } from '$lib/core/mat';
import { boneById, originOf, poseOf, worldMatrices, type Pose } from './bones';

function dist(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleOf(from: Vec, to: Vec): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// the short way round, -pi to pi
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// which side of the line from root to end the middle joint is on, 1 or -1, 0 when the chain is straight
export function bendSide(root: Vec, mid: Vec, end: Vec): number {
  const c = (end.x - root.x) * (mid.y - root.y) - (end.y - root.y) * (mid.x - root.x);
  const scale = dist(root, end) * dist(root, mid);
  if (scale === 0 || Math.abs(c) / scale < 1e-6) return 0;
  return Math.sign(c);
}

// the analytic two bone solve: the middle joint and the end so the end gets as close to target as the
// two lengths allow. side keeps the bend on the side it is on, so an elbow never flips over
export function twoBoneIK(root: Vec, mid: Vec, end: Vec, target: Vec, side = bendSide(root, mid, end) || 1): { mid: Vec; end: Vec } {
  const l1 = dist(root, mid);
  const l2 = dist(mid, end);
  const reach = dist(root, target);
  const base = reach > 1e-9 ? angleOf(root, target) : angleOf(root, end);
  const lo = Math.abs(l1 - l2) + 1e-6;
  const hi = l1 + l2 - 1e-6;
  const d = Math.max(lo, Math.min(hi, reach));
  let a = 0;
  if (l1 > 0 && d > 0) a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const t = base + side * a;
  return {
    mid: { x: root.x + Math.cos(t) * l1, y: root.y + Math.sin(t) * l1 },
    end: { x: root.x + Math.cos(base) * d, y: root.y + Math.sin(base) * d }
  };
}

function closerSide(root: Vec, mid: Vec, end: Vec, target: Vec): number {
  const a = twoBoneIK(root, mid, end, target, 1);
  const b = twoBoneIK(root, mid, end, target, -1);
  return dist(a.mid, mid) <= dist(b.mid, mid) ? 1 : -1;
}

// forward and backward reaching: the joints move toward the target with every length kept, the first
// point stays. a target out of reach stretches the chain straight at it
export function fabrik(points: Vec[], lengths: number[], target: Vec, maxIter = 10, tolerance = 0.1): Vec[] {
  const p = points.map((q) => ({ x: q.x, y: q.y }));
  const n = p.length;
  if (n < 2) return p;
  const root = { ...p[0] };
  const toward = (from: Vec, to: Vec, length: number, fallback: Vec): Vec => {
    const d = dist(from, to);
    const dir = d > 1e-9 ? { x: (to.x - from.x) / d, y: (to.y - from.y) / d } : fallback;
    return { x: from.x + dir.x * length, y: from.y + dir.y * length };
  };
  const unit = (i: number): Vec => {
    const d = dist(points[i], points[i + 1]);
    return d > 1e-9 ? { x: (points[i + 1].x - points[i].x) / d, y: (points[i + 1].y - points[i].y) / d } : { x: 1, y: 0 };
  };
  const total = lengths.reduce((s, l) => s + l, 0);
  if (dist(root, target) >= total) {
    for (let i = 0; i < n - 1; i++) p[i + 1] = toward(p[i], target, lengths[i], unit(i));
    return p;
  }
  for (let iter = 0; iter < maxIter; iter++) {
    if (dist(p[n - 1], target) <= tolerance) break;
    p[n - 1] = { ...target };
    for (let i = n - 2; i >= 0; i--) {
      const u = unit(i);
      p[i] = toward(p[i + 1], p[i], lengths[i], { x: -u.x, y: -u.y });
    }
    p[0] = { ...root };
    for (let i = 0; i < n - 1; i++) p[i + 1] = toward(p[i], p[i + 1], lengths[i], unit(i));
  }
  return p;
}

// turning a bone by angle in world space, a mirrored parent turns the other way round
function turn(pose: Pose, bones: Bone[], bone: Bone, angle: number) {
  const parent = boneById(bones, bone.parent);
  const pm = parent ? worldMatrices(bones, pose).get(parent.id) : null;
  const s = pm && determinant(pm) < 0 ? -1 : 1;
  const p = poseOf(pose, bone.id);
  pose[bone.id] = { ...p, rotation: p.rotation + s * wrap(angle) };
}

// the bones that turn when a joint on bone effector is dragged: it and its parents, up to and with the
// first pinned one, the root, or limit bones
export function ikChain(bones: Bone[], effector: string, limit: number): Bone[] {
  const out: Bone[] = [];
  for (let b = boneById(bones, effector); b && out.length < Math.max(1, limit) && !out.includes(b); b = boneById(bones, b.parent)) {
    out.push(b);
    if (b.pinned) break;
  }
  return out;
}

export interface SolveOptions {
  // how many bones may turn
  limit?: number;
  // the bend side of a two bone chain, kept for a whole drag so it never flips
  memo?: { side?: number };
  // turns the last bone to steps of this many radians
  snap?: number;
}

// a new pose where the point local on bone effector (its tip, or where a child starts) reaches target:
// two bones solve exactly, longer chains with fabrik. only rotations change, every length stays
export function solveChain(bones: Bone[], pose: Pose, effector: string, local: Vec, target: Vec, opts: SolveOptions = {}): Pose {
  const out: Pose = { ...pose };
  const chain = ikChain(bones, effector, opts.limit ?? 4);
  if (chain.length === 0) return out;
  const eff = chain[0];
  const worldOf = (b: Bone) => worldMatrices(bones, out).get(b.id)!;
  const endOf = () => applyPoint(worldOf(eff), local);
  if (chain.length === 1) {
    const o = originOf(worldOf(eff));
    turn(out, bones, eff, angleOf(o, target) - angleOf(o, endOf()));
  } else if (chain.length === 2) {
    const upper = chain[1];
    const root = originOf(worldOf(upper));
    const mid = originOf(worldOf(eff));
    const end = endOf();
    const memo = opts.memo ?? {};
    // a straight chain bends to the side that moves the middle joint the least, an elbow stays put
    // and the forearm swings
    if (!memo.side) memo.side = bendSide(root, mid, end) || closerSide(root, mid, end, target);
    const solved = twoBoneIK(root, mid, end, target, memo.side);
    turn(out, bones, upper, angleOf(root, solved.mid) - angleOf(root, mid));
    const m2 = originOf(worldOf(eff));
    turn(out, bones, eff, angleOf(m2, solved.end) - angleOf(m2, endOf()));
  } else {
    // root first, every joint down to the dragged point
    const order = [...chain].reverse();
    const points = [...order.map((b) => originOf(worldOf(b))), endOf()];
    const lengths = points.slice(1).map((p, i) => dist(points[i], p));
    const solved = fabrik(points, lengths, target);
    order.forEach((b, i) => {
      const o = originOf(worldOf(b));
      const next = i + 1 < order.length ? originOf(worldOf(order[i + 1])) : endOf();
      turn(out, bones, b, angleOf(o, solved[i + 1]) - angleOf(o, next));
    });
  }
  if (opts.snap) {
    const m = worldOf(eff);
    const a = Math.atan2(m[1], m[0]);
    turn(out, bones, eff, Math.round(a / opts.snap) * opts.snap - a);
  }
  return out;
}

// turns one bone around its start so the point from follows to, the bones below go along
export function rotateBone(bones: Bone[], pose: Pose, id: string, from: Vec, to: Vec, snap = 0): Pose {
  const out: Pose = { ...pose };
  const bone = boneById(bones, id);
  if (!bone) return out;
  const o = originOf(worldMatrices(bones, out).get(id)!);
  turn(out, bones, bone, angleOf(o, to) - angleOf(o, from));
  if (snap) {
    const m = worldMatrices(bones, out).get(id)!;
    const a = Math.atan2(m[1], m[0]);
    turn(out, bones, bone, Math.round(a / snap) * snap - a);
  }
  return out;
}
