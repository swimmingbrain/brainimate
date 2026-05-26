import type { Anchor, Mat, PathData, Vec } from './types';
import { applyPoint, applyVector } from './mat';
import { bbox as cubicBox, nearest, pointAt, split, type Cubic } from './bezier';
import { addPoint, emptyBox, union, type Box } from './bbox';

// the editing helpers below change the path they get, use copyPath first on anything shared

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
    const ai = mirrorInto(a.ix, a.iy, { x: a.ox, y: a.oy });
    a.ix = ai.x;
    a.iy = ai.y;
    const bo = mirrorInto(b.ox, b.oy, { x: b.ix, y: b.iy });
    b.ox = bo.x;
    b.oy = bo.y;
  } else {
    a.kind = 'corner';
    b.kind = 'corner';
  }
}
