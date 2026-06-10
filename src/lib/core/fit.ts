import fitCurve from 'fit-curve';
import type { Anchor, PathData, Vec } from './types';
import type { Cubic } from './bezier';
import { kindOf } from './path';

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
  out.push({ x: last[3].x, y: last[3].y, ix: last[2].x - last[3].x, iy: last[2].y - last[3].y, ox: 0, oy: 0, kind: 'corner' });
  return out;
}

// the first anchor takes over the in handle of the last one, which goes
export function closeChain(anchors: Anchor[]): Anchor[] {
  if (anchors.length < 3) return anchors;
  const last = anchors[anchors.length - 1];
  const first = anchors[0];
  if (!samePoint(first, last) && Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) return anchors;
  const out = anchors.slice(0, -1);
  out[0] = { ...first, ix: last.ix, iy: last.iy };
  out[0].kind = kindOf(out[0]);
  return out;
}

// a smooth path through freehand points, closed paths get their seam joined
export function fitPath(points: Vec[], tolerance: number, closed = false): PathData {
  if (points.length === 0) return { anchors: [], closed: false };
  const pts = closed && !samePoint(points[0], points[points.length - 1]) ? [...points, points[0]] : points;
  const anchors = cubicsToAnchors(fitCubics(pts, tolerance));
  if (anchors.length === 0) return { anchors: [{ ...points[0], ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' }], closed: false };
  if (!closed) return { anchors, closed: false };
  const ring = closeChain(anchors);
  return { anchors: ring, closed: ring.length > 2 };
}
