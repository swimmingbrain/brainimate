import { Bezier } from 'bezier-js';
import type { Anchor, PathData, Style, Vec } from './types';
import { copyPath, joinPaths, kindOf, polylineToPath, reversePath, segmentCount, segmentCubic } from './path';
import { derivativeAt, flatten, isLine, type Cubic } from './bezier';
import { closeChain, cubicsToAnchors, fitCubics } from './fit';
import { ellipsePath } from './shapes';

// below this the tangents on both sides of an anchor count as one direction
const SMOOTH_COS = Math.cos((12 * Math.PI) / 180);
const MITER_LIMIT = 10;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function unit(x: number, y: number): Vec {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// direction the curve leaves its start, a handle on the anchor falls back to the next control
export function startTangent(c: Cubic): Vec {
  for (const p of [c[1], c[2], c[3]]) {
    const t = unit(p.x - c[0].x, p.y - c[0].y);
    if (t.x !== 0 || t.y !== 0) return t;
  }
  return { x: 0, y: 0 };
}

export function endTangent(c: Cubic): Vec {
  for (const p of [c[2], c[1], c[0]]) {
    const t = unit(c[3].x - p.x, c[3].y - p.y);
    if (t.x !== 0 || t.y !== 0) return t;
  }
  return { x: 0, y: 0 };
}

// joins two open paths at their closest ends, a gap gets a straight segment and ends that meet close it
export function joinTwo(a: PathData, b: PathData, eps = 0.5): PathData {
  const first = copyPath(a);
  const second = copyPath(b);
  const fa = first.anchors[0];
  const la = first.anchors[first.anchors.length - 1];
  const fb = second.anchors[0];
  const lb = second.anchors[second.anchors.length - 1];
  const options = [dist(la, fb), dist(la, lb), dist(fa, fb), dist(fa, lb)];
  const best = options.indexOf(Math.min(...options));
  if (best === 1 || best === 3) reversePath(second);
  if (best === 2 || best === 3) reversePath(first);
  const out = joinPaths(first, second, eps);
  return closeIfMeeting(out, eps);
}

// an open path whose ends sit on each other becomes closed with one anchor there
export function closeIfMeeting(path: PathData, eps = 0.5): PathData {
  const n = path.anchors.length;
  if (path.closed || n < 3) return path;
  const s = path.anchors[0];
  const e = path.anchors[n - 1];
  if (dist(s, e) > eps) return path;
  const anchors = path.anchors.slice(0, -1);
  anchors[0] = { ...s, ix: e.ix, iy: e.iy };
  anchors[0].kind = kindOf(anchors[0]);
  return { anchors, closed: true };
}

// anchors where the path turns sharply, the fit keeps those and smooths everything between
function breaks(path: PathData): number[] {
  const n = path.anchors.length;
  const count = segmentCount(path);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!path.closed && (i === 0 || i === n - 1)) {
      out.push(i);
      continue;
    }
    const before = segmentCubic(path, (i - 1 + count) % count);
    const after = segmentCubic(path, i % count);
    const a = endTangent(before);
    const b = startTangent(after);
    if (a.x * b.x + a.y * b.y < SMOOTH_COS) out.push(i);
  }
  return out;
}

function straighten(c: Cubic): Cubic {
  return isLine(c, 1e-3) ? [c[0], { ...c[0] }, { ...c[3] }, c[3]] : c;
}

// fewer anchors for the same shape, fitted within tolerance between the sharp corners
export function simplifyPath(path: PathData, tolerance: number): PathData {
  const n = path.anchors.length;
  const count = segmentCount(path);
  if (count === 0) return copyPath(path);
  let marks = breaks(path);
  const seamless = path.closed && marks.length === 0;
  if (seamless) marks = [0];
  const runs: [number, number][] = [];
  if (path.closed) {
    for (let k = 0; k < marks.length; k++) {
      const s = marks[k];
      const e = k + 1 < marks.length ? marks[k + 1] : marks[0] + n;
      runs.push([s, e]);
    }
  } else {
    for (let k = 0; k + 1 < marks.length; k++) runs.push([marks[k], marks[k + 1]]);
  }

  let anchors: Anchor[] = [];
  for (const [s, e] of runs) {
    const points: Vec[] = [];
    for (let i = s; i < e; i++) {
      const pts = flatten(segmentCubic(path, i % n), tolerance / 4);
      if (points.length > 0) pts.shift();
      points.push(...pts);
    }
    const run = cubicsToAnchors(fitCubics(points, tolerance).map(straighten));
    if (run.length === 0) continue;
    if (anchors.length === 0) {
      anchors = run;
      continue;
    }
    const last = anchors[anchors.length - 1];
    anchors[anchors.length - 1] = { ...last, ox: run[0].ox, oy: run[0].oy };
    anchors[anchors.length - 1].kind = kindOf(anchors[anchors.length - 1]);
    anchors.push(...run.slice(1));
  }
  if (!path.closed) return { anchors, closed: false };
  const ring = closeChain(anchors);
  return { anchors: ring, closed: ring.length > 2 };
}

function polygon(points: Vec[]): PathData {
  return polylineToPath(points, true);
}

// a closed chain from bezier-js curves, lines come back as quadratics and are raised to cubics
function chain(curves: Bezier[]): PathData {
  const cubics: Cubic[] = curves.map((b) => {
    const p = b.points;
    if (p.length === 4) return [p[0], p[1], p[2], p[3]];
    return [
      p[0],
      { x: p[0].x + ((p[1].x - p[0].x) * 2) / 3, y: p[0].y + ((p[1].y - p[0].y) * 2) / 3 },
      { x: p[2].x + ((p[1].x - p[2].x) * 2) / 3, y: p[2].y + ((p[1].y - p[2].y) * 2) / 3 },
      p[2]
    ];
  });
  return { anchors: closeChain(cubicsToAnchors(cubics)), closed: true };
}

// the band of one segment as a polygon, when bezier-js cannot offset the curve
function band(c: Cubic, r: number): PathData {
  const left: Vec[] = [];
  const right: Vec[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = derivativeAt(c, Math.min(0.999, Math.max(0.001, t)));
    const n = unit(-d.y, d.x);
    const mt = 1 - t;
    const x = mt * mt * mt * c[0].x + 3 * mt * mt * t * c[1].x + 3 * mt * t * t * c[2].x + t * t * t * c[3].x;
    const y = mt * mt * mt * c[0].y + 3 * mt * mt * t * c[1].y + 3 * mt * t * t * c[2].y + t * t * t * c[3].y;
    left.push({ x: x + n.x * r, y: y + n.y * r });
    right.push({ x: x - n.x * r, y: y - n.y * r });
  }
  return polygon([...left, ...right.reverse()]);
}

function segmentBand(c: Cubic, r: number): PathData {
  if (isLine(c)) {
    const n = unit(-(c[3].y - c[0].y), c[3].x - c[0].x);
    return polygon([
      { x: c[0].x + n.x * r, y: c[0].y + n.y * r },
      { x: c[3].x + n.x * r, y: c[3].y + n.y * r },
      { x: c[3].x - n.x * r, y: c[3].y - n.y * r },
      { x: c[0].x - n.x * r, y: c[0].y - n.y * r }
    ]);
  }
  try {
    const bez = new Bezier(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
    const out = chain(bez.outline(r).curves);
    if (out.anchors.length > 2 && out.anchors.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y))) return out;
  } catch {
    // falls through to the sampled band
  }
  return band(c, r);
}

// the corner piece between two segments, a and b are the tangents arriving and leaving
function joinPiece(p: Vec, a: Vec, b: Vec, r: number, join: Style['join']): PathData[] {
  if (a.x * b.x + a.y * b.y > 0.9999) return [];
  if (join === 'round') return [ellipsePath(p.x, p.y, r, r)];
  const n1 = { x: -a.y, y: a.x };
  const n2 = { x: -b.y, y: b.x };
  const out: PathData[] = [];
  for (const s of [1, -1]) {
    const p1 = { x: p.x + n1.x * r * s, y: p.y + n1.y * r * s };
    const p2 = { x: p.x + n2.x * r * s, y: p.y + n2.y * r * s };
    const mid = unit(n1.x + n2.x, n1.y + n2.y);
    const cosHalf = Math.hypot(n1.x + n2.x, n1.y + n2.y) / 2;
    if (join === 'miter' && cosHalf > 1 / MITER_LIMIT) {
      const k = (r / cosHalf) * s;
      out.push(polygon([p, p1, { x: p.x + mid.x * k, y: p.y + mid.y * k }, p2]));
    } else {
      out.push(polygon([p, p1, p2]));
    }
  }
  return out;
}

// out points away from the path at that end
function capPiece(p: Vec, out: Vec, r: number, cap: Style['cap']): PathData[] {
  if (cap === 'round') return [ellipsePath(p.x, p.y, r, r)];
  if (cap === 'butt') return [];
  const n = { x: -out.y, y: out.x };
  return [
    polygon([
      { x: p.x + n.x * r, y: p.y + n.y * r },
      { x: p.x + n.x * r + out.x * r, y: p.y + n.y * r + out.y * r },
      { x: p.x - n.x * r + out.x * r, y: p.y - n.y * r + out.y * r },
      { x: p.x - n.x * r, y: p.y - n.y * r }
    ])
  ];
}

// closed pieces that together cover the stroke, one band per segment plus the joins and caps,
// outline stroke unites them into the final shape
export function strokePieces(path: PathData, width: number, cap: Style['cap'], join: Style['join']): PathData[] {
  const r = width / 2;
  const count = segmentCount(path);
  if (count === 0 || r <= 0) return [];
  const cubics: Cubic[] = [];
  for (let i = 0; i < count; i++) cubics.push(segmentCubic(path, i));
  const live = cubics.filter((c) => dist(c[0], c[3]) > 1e-9 || !isLine(c));
  if (live.length === 0) return [];
  const out: PathData[] = live.map((c) => segmentBand(c, r));
  for (let i = 0; i < live.length; i++) {
    const next = i + 1 < live.length ? live[i + 1] : path.closed ? live[0] : null;
    if (next) out.push(...joinPiece(live[i][3], endTangent(live[i]), startTangent(next), r, join));
  }
  if (!path.closed) {
    const s = startTangent(live[0]);
    const e = endTangent(live[live.length - 1]);
    out.push(...capPiece(live[0][0], { x: -s.x, y: -s.y }, r, cap));
    out.push(...capPiece(live[live.length - 1][3], e, r, cap));
  }
  return out;
}
