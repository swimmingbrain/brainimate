import fitCurve from 'fit-curve';
import type { Anchor, PathData, Vec } from './types';
import type { Cubic } from './bezier';
import { kindOf, makeAnchor } from './path';

function samePoint(a: Vec, b: Vec): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

// cubics through the points within tolerance (a plain distance, fit-curve itself wants it squared)
export function fitCubics(points: Vec[], tolerance: number): Cubic[] {
  const pts = points.filter((p, i) => i === 0 || !samePoint(p, points[i - 1]));
  if (pts.length < 2) return [];
  if (pts.length === 2) {
    const [a, b] = pts;
    return [[{ ...a }, { ...a }, { ...b }, { ...b }]];
  }
  const tol = Math.max(tolerance, 0.01);
  const raw = fitCurve(
    pts.map((p) => [p.x, p.y]),
    tol * tol
  );
  return raw.map((c) => c.map(([x, y]) => ({ x, y })) as Cubic);
}

// an open chain of anchors, consecutive cubics share their end points
export function cubicsToAnchors(cubics: Cubic[]): Anchor[] {
  if (cubics.length === 0) return [];
  const out: Anchor[] = [];
  for (let i = 0; i < cubics.length; i++) {
    const c = cubics[i];
    const prev = i > 0 ? cubics[i - 1] : null;
    const a: Anchor = {
      x: c[0].x,
      y: c[0].y,
      ix: prev ? prev[2].x - c[0].x : 0,
      iy: prev ? prev[2].y - c[0].y : 0,
      ox: c[1].x - c[0].x,
      oy: c[1].y - c[0].y,
      kind: 'corner'
    };
    a.kind = kindOf(a);
    out.push(a);
  }
  const last = cubics[cubics.length - 1];
  const end = last[3];
  out.push({ x: end.x, y: end.y, ix: last[2].x - end.x, iy: last[2].y - end.y, ox: 0, oy: 0, kind: 'corner' });
  return out;
}

// the first anchor takes over the in handle of the last one, which goes
export function closeChain(anchors: Anchor[]): Anchor[] {
  if (anchors.length < 3) return anchors;
  const last = anchors[anchors.length - 1];
  const first = anchors[0];
  if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) return anchors;
  const out = anchors.slice(0, -1);
  out[0] = { ...first, ix: last.ix, iy: last.iy };
  out[0].kind = kindOf(out[0]);
  return out;
}

// handles that almost line up at a joint are turned to line up, each keeps its length
function alignJoint(a: Anchor) {
  const li = Math.hypot(a.ix, a.iy);
  const lo = Math.hypot(a.ox, a.oy);
  if (li < 1e-9 || lo < 1e-9) return;
  const dx = a.ox / lo - a.ix / li;
  const dy = a.oy / lo - a.iy / li;
  const d = Math.hypot(dx, dy);
  // 2 means the handles point exactly away from each other, about 1.9 is 35 degrees off
  if (d < 1.9) return;
  a.ix = (-dx / d) * li;
  a.iy = (-dy / d) * li;
  a.ox = (dx / d) * lo;
  a.oy = (dy / d) * lo;
  a.kind = kindOf(a);
}

function farthest(points: Vec[], from: Vec): number {
  let best = 0;
  let bestD = -1;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// a ring is fitted in two halves, split at the point farthest from the start, so a loose
// tolerance can not fold the whole ring into one cubic that starts and ends on the same point
function fitRing(points: Vec[], tolerance: number): Anchor[] {
  const ring = samePoint(points[0], points[points.length - 1]) ? points.slice(0, -1) : points;
  if (ring.length < 3) return [];
  const mid = farthest(ring, ring[0]);
  const one = cubicsToAnchors(fitCubics(ring.slice(0, mid + 1), tolerance));
  const two = cubicsToAnchors(fitCubics([...ring.slice(mid), ring[0]], tolerance));
  if (one.length < 2 || two.length < 2) return [];
  const joint = { ...one[one.length - 1], ox: two[0].ox, oy: two[0].oy };
  const start = { ...one[0], ix: two[two.length - 1].ix, iy: two[two.length - 1].iy };
  alignJoint(joint);
  alignJoint(start);
  return [start, ...one.slice(1, -1), joint, ...two.slice(1, -1)];
}

// a smooth path through freehand points, a closed one is a ring with its seams lined up
export function fitPath(points: Vec[], tolerance: number, closed = false): PathData {
  if (points.length === 0) return { anchors: [], closed: false };
  if (closed) {
    const ring = fitRing(points, tolerance);
    if (ring.length >= 2) return { anchors: ring, closed: true };
  }
  const anchors = cubicsToAnchors(fitCubics(points, tolerance));
  if (anchors.length === 0) return { anchors: [makeAnchor(points[0].x, points[0].y)], closed: false };
  return { anchors, closed: false };
}
