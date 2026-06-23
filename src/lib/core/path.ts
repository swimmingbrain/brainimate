import type { Anchor, Mat, PathData, Vec } from './types';
import { applyPoint, applyVector } from './mat';
import { bbox as cubicBox, flatten, nearest, pointAt, split, type Cubic } from './bezier';
import { addPoint, emptyBox, union, type Box } from './bbox';
import { polygonArea } from './polygon';

// the editing helpers below change the path they get, use copyPath first on anything shared

// a closed outline with holes, or more islands, that fill as one shape
export interface Compound {
  path: PathData;
  subpaths: PathData[];
}

export interface Segment {
  // the segment runs from anchors[index] to anchors[next]
  index: number;
  next: number;
  cubic: Cubic;
}

export function makeAnchor(x: number, y: number, kind: Anchor['kind'] = 'corner'): Anchor {
  return { x, y, ix: 0, iy: 0, ox: 0, oy: 0, kind };
}

export function copyAnchor(a: Anchor): Anchor {
  return { x: a.x, y: a.y, ix: a.ix, iy: a.iy, ox: a.ox, oy: a.oy, kind: a.kind };
}

export function copyPath(path: PathData): PathData {
  return { anchors: path.anchors.map(copyAnchor), closed: path.closed };
}

export function inPoint(a: Anchor): Vec {
  return { x: a.x + a.ix, y: a.y + a.iy };
}

export function outPoint(a: Anchor): Vec {
  return { x: a.x + a.ox, y: a.y + a.oy };
}

export function hasHandles(a: Anchor): boolean {
  return a.ix !== 0 || a.iy !== 0 || a.ox !== 0 || a.oy !== 0;
}

// a closed path has one more segment, from the last anchor back to the first
export function segmentCount(path: PathData): number {
  const n = path.anchors.length;
  if (n < 2) return 0;
  return path.closed ? n : n - 1;
}

export function segmentCubic(path: PathData, index: number): Cubic {
  const a = path.anchors[index];
  const b = path.anchors[(index + 1) % path.anchors.length];
  return [{ x: a.x, y: a.y }, outPoint(a), inPoint(b), { x: b.x, y: b.y }];
}

export function segments(path: PathData): Segment[] {
  const out: Segment[] = [];
  const count = segmentCount(path);
  for (let i = 0; i < count; i++) {
    out.push({ index: i, next: (i + 1) % path.anchors.length, cubic: segmentCubic(path, i) });
  }
  return out;
}

export function transformPath(path: PathData, m: Mat): PathData {
  return {
    closed: path.closed,
    anchors: path.anchors.map((a) => {
      const p = applyPoint(m, a);
      const i = applyVector(m, { x: a.ix, y: a.iy });
      const o = applyVector(m, { x: a.ox, y: a.oy });
      return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, kind: a.kind };
    })
  };
}

export function pathBounds(path: PathData): Box {
  const count = segmentCount(path);
  if (count === 0) {
    let b = emptyBox();
    for (const a of path.anchors) b = addPoint(b, a);
    return b;
  }
  let b = emptyBox();
  for (let i = 0; i < count; i++) b = union(b, cubicBox(segmentCubic(path, i)));
  return b;
}

export function nearestSegment(path: PathData, p: Vec): { index: number; t: number; d: number; point: Vec } | null {
  let best: { index: number; t: number; d: number; point: Vec } | null = null;
  const count = segmentCount(path);
  for (let i = 0; i < count; i++) {
    const hit = nearest(segmentCubic(path, i), p);
    if (!best || hit.d < best.d) best = { index: i, t: hit.t, d: hit.d, point: { x: hit.x, y: hit.y } };
  }
  return best;
}

// splits segment index at t and returns the index of the new anchor
export function insertAnchor(path: PathData, index: number, t: number): number {
  const n = path.anchors.length;
  const a = path.anchors[index];
  const b = path.anchors[(index + 1) % n];
  const c = segmentCubic(path, index);
  let added: Anchor;
  // a straight segment stays straight, with no handles on the new point
  if (a.ox === 0 && a.oy === 0 && b.ix === 0 && b.iy === 0) {
    const p = pointAt(c, t);
    added = makeAnchor(p.x, p.y, 'corner');
  } else {
    const [left, right] = split(c, t);
    const mid = left[3];
    a.ox = left[1].x - a.x;
    a.oy = left[1].y - a.y;
    b.ix = right[2].x - b.x;
    b.iy = right[2].y - b.y;
    added = {
      x: mid.x,
      y: mid.y,
      ix: left[2].x - mid.x,
      iy: left[2].y - mid.y,
      ox: right[1].x - mid.x,
      oy: right[1].y - mid.y,
      kind: 'smooth'
    };
  }
  path.anchors.splice(index + 1, 0, added);
  return index + 1;
}

export function removeAnchor(path: PathData, index: number) {
  path.anchors.splice(index, 1);
  if (path.anchors.length < 3) path.closed = false;
}

export function reversePath(path: PathData) {
  path.anchors.reverse();
  for (const a of path.anchors) {
    const ix = a.ix;
    const iy = a.iy;
    a.ix = a.ox;
    a.iy = a.oy;
    a.ox = ix;
    a.oy = iy;
  }
}

export function closePath(path: PathData) {
  if (path.anchors.length > 2) path.closed = true;
}

export function openPath(path: PathData) {
  path.closed = false;
}

// b is appended after a, ends that touch become one anchor
export function joinPaths(a: PathData, b: PathData, eps = 0.5): PathData {
  const out = copyPath(a);
  const rest = b.anchors.map(copyAnchor);
  const last = out.anchors[out.anchors.length - 1];
  const first = rest[0];
  if (last && first && Math.hypot(last.x - first.x, last.y - first.y) <= eps) {
    last.ox = first.ox;
    last.oy = first.oy;
    last.kind = 'corner';
    rest.shift();
  }
  out.anchors.push(...rest);
  out.closed = false;
  return out;
}

export function moveAnchor(path: PathData, index: number, dx: number, dy: number) {
  const a = path.anchors[index];
  a.x += dx;
  a.y += dy;
}

// how the pull is shared between the two controls, the curve then passes through the cursor
export function bendWeight(t: number): number {
  if (t <= 1 / 6) return 0;
  if (t <= 0.5) return Math.pow((6 * t - 1) / 2, 3) / 2;
  if (t <= 5 / 6) return (1 - Math.pow((6 * (1 - t) - 1) / 2, 3)) / 2 + 0.5;
  return 1;
}

// keeps the length of a handle and turns it to point away from dir
function mirrorInto(hx: number, hy: number, dir: Vec): Vec {
  const l = Math.hypot(hx, hy);
  const dl = Math.hypot(dir.x, dir.y);
  if (l === 0 || dl === 0) return { x: hx, y: hy };
  return { x: (-dir.x / dl) * l, y: (-dir.y / dl) * l };
}

// p1 and p2 are the absolute controls from the start of the drag, d how far the grab point moved
export function bendSegment(path: PathData, index: number, t: number, p1: Vec, p2: Vec, d: Vec, keepSmooth = false) {
  const a = path.anchors[index];
  const b = path.anchors[(index + 1) % path.anchors.length];
  const w = bendWeight(t);
  const k1 = (1 - w) / (3 * t * (1 - t) * (1 - t));
  const k2 = w / (3 * t * t * (1 - t));
  a.ox = p1.x + d.x * k1 - a.x;
  a.oy = p1.y + d.y * k1 - a.y;
  b.ix = p2.x + d.x * k2 - b.x;
  b.iy = p2.y + d.y * k2 - b.y;
  if (keepSmooth) {
    const before = mirrorInto(a.ix, a.iy, { x: a.ox, y: a.oy });
    a.ix = before.x;
    a.iy = before.y;
    const after = mirrorInto(b.ox, b.oy, { x: b.ix, y: b.iy });
    b.ox = after.x;
    b.oy = after.y;
  } else {
    a.kind = 'corner';
    b.kind = 'corner';
  }
}

// the kind the handles describe: in line is smooth, in line and the same length is symmetric
export function kindOf(a: Pick<Anchor, 'ix' | 'iy' | 'ox' | 'oy'>): Anchor['kind'] {
  const li = Math.hypot(a.ix, a.iy);
  const lo = Math.hypot(a.ox, a.oy);
  if (li < 1e-9 || lo < 1e-9) return 'corner';
  if ((a.ix * a.ox + a.iy * a.oy) / (li * lo) > -0.9995) return 'corner';
  return Math.abs(li - lo) <= 1e-6 * Math.max(li, lo) ? 'symmetric' : 'smooth';
}

// points along the whole path, a closed path does not repeat its first point at the end
export function flattenPath(path: PathData, tolerance = 0.5): Vec[] {
  const count = segmentCount(path);
  if (count === 0) return path.anchors.map((a) => ({ x: a.x, y: a.y }));
  const out: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const pts = flatten(segmentCubic(path, i), tolerance);
    if (i > 0) pts.shift();
    out.push(...pts);
  }
  if (path.closed) out.pop();
  return out;
}

// signed, positive for a clockwise path on screen, an open path counts as closed
export function pathArea(path: PathData): number {
  return polygonArea(flattenPath(path, 0.25));
}

// straight segments through the points, corners all the way
export function polylineToPath(points: Vec[], closed: boolean): PathData {
  return { closed, anchors: points.map((p) => makeAnchor(p.x, p.y)) };
}

function num(n: number, precision: number): string {
  const s = n.toFixed(precision);
  const out = precision > 0 ? s.replace(/\.?0+$/, '') : s;
  return out === '-0' ? '0' : out;
}

function contourD(path: PathData, precision: number): string {
  const a = path.anchors;
  if (a.length === 0) return '';
  const f = (n: number) => num(n, precision);
  const parts = [`M${f(a[0].x)} ${f(a[0].y)}`];
  const count = segmentCount(path);
  for (let i = 0; i < count; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const straight = p.ox === 0 && p.oy === 0 && q.ix === 0 && q.iy === 0;
    // z draws the straight way back to the start by itself
    if (straight && path.closed && i === count - 1) break;
    if (straight) parts.push(`L${f(q.x)} ${f(q.y)}`);
    else parts.push(`C${f(p.x + p.ox)} ${f(p.y + p.oy)} ${f(q.x + q.ix)} ${f(q.y + q.iy)} ${f(q.x)} ${f(q.y)}`);
  }
  if (path.closed) parts.push('Z');
  return parts.join('');
}

// an svg path d string for the outline and its subpaths, only M, L, C and Z
export function pathToD(path: PathData, subpaths: PathData[] = [], precision = 2): string {
  return [path, ...subpaths]
    .map((p) => contourD(p, precision))
    .filter((d) => d.length > 0)
    .join(' ');
}

// the box around the outline and every subpath
export function compoundBounds(path: PathData, subpaths: PathData[]): Box {
  let b = pathBounds(path);
  for (const sub of subpaths) b = union(b, pathBounds(sub));
  return b;
}

// every subpath runs against the outline, so the nonzero fill keeps it empty
export function orientHoles(c: Compound): Compound {
  const sign = Math.sign(pathArea(c.path));
  for (const sub of c.subpaths) if (sign !== 0 && Math.sign(pathArea(sub)) === sign) reversePath(sub);
  return c;
}
