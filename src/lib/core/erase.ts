import { Bezier } from 'bezier-js';
import type { Anchor, PathData, Vec } from './types';
import { bbox as cubicBox, isLine, pointAt, split, type Cubic } from './bezier';
import { kindOf, segmentCount, segmentCubic } from './path';
import { fromPoints, intersects } from './bbox';
import { pointInPolygon } from './polygon';

// a straight segment as a cubic with its controls at the thirds, so t runs evenly along it
function evenLine(a: Vec, b: Vec): Cubic {
  return [
    { x: a.x, y: a.y },
    { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
    { x: b.x, y: b.y }
  ];
}

function part(c: Cubic, t0: number, t1: number, straight: boolean): Cubic {
  if (straight) {
    const a = pointAt(c, t0);
    const b = pointAt(c, t1);
    return [a, { ...a }, { ...b }, b];
  }
  const left = t1 < 1 ? split(c, t1)[0] : c;
  return t0 > 0 ? split(left, t0 / t1)[1] : left;
}

function runToPath(run: Cubic[]): PathData {
  const anchors: Anchor[] = [];
  run.forEach((c, k) => {
    if (k === 0) {
      anchors.push({ x: c[0].x, y: c[0].y, ix: 0, iy: 0, ox: c[1].x - c[0].x, oy: c[1].y - c[0].y, kind: 'corner' });
    } else {
      const a = anchors[anchors.length - 1];
      a.ox = c[1].x - a.x;
      a.oy = c[1].y - a.y;
      a.kind = kindOf(a);
    }
    anchors.push({ x: c[3].x, y: c[3].y, ix: c[2].x - c[3].x, iy: c[2].y - c[3].y, ox: 0, oy: 0, kind: 'corner' });
  });
  return { anchors, closed: false };
}

function runLength(run: Cubic[]): number {
  return run.reduce((sum, c) => sum + Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y), 0);
}

// cuts a stroked path with a closed polygon: the parts inside go, the rest come back as open paths.
// null means the polygon does not touch the path at all
export function cutPath(path: PathData, polygon: Vec[]): PathData[] | null {
  const count = segmentCount(path);
  if (count === 0 || polygon.length < 3) return null;
  const polyBox = fromPoints(polygon);
  const edges = polygon.map((p, i) => ({ p1: p, p2: polygon[(i + 1) % polygon.length] }));
  const edgeBoxes = edges.map((e) => fromPoints([e.p1, e.p2]));
  // kept pieces in path order, null where a piece fell inside
  const pieces: (Cubic | null)[] = [];
  let removed = 0;

  for (let i = 0; i < count; i++) {
    const raw = segmentCubic(path, i);
    const straight = isLine(raw);
    const c = straight ? evenLine(raw[0], raw[3]) : raw;
    const box = cubicBox(c);
    const ts: number[] = [];
    if (intersects(box, polyBox)) {
      const bez = new Bezier(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
      edges.forEach((e, k) => {
        if (!intersects(box, edgeBoxes[k])) return;
        for (const t of bez.lineIntersects(e)) if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
      });
      ts.sort((a, b) => a - b);
    }
    const bounds = [0, ...ts, 1];
    for (let k = 0; k < bounds.length - 1; k++) {
      const t0 = bounds[k];
      const t1 = bounds[k + 1];
      if (t1 - t0 < 1e-9) continue;
      if (pointInPolygon(pointAt(c, (t0 + t1) / 2), polygon)) {
        pieces.push(null);
        removed++;
      } else {
        pieces.push(part(c, t0, t1, straight));
      }
    }
  }
  if (removed === 0) return null;

  const runs: Cubic[][] = [];
  let current: Cubic[] = [];
  for (const piece of pieces) {
    if (piece) current.push(piece);
    else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    // on a closed path the run over the seam continues at the start
    if (path.closed && pieces[0] && runs.length > 0) runs[0] = [...current, ...runs[0]];
    else runs.push(current);
  }
  return runs.filter((r) => runLength(r) > 0.01).map(runToPath);
}
