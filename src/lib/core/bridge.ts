import type { Anchor, PathData } from './types';
import { copyAnchor, kindOf, pathArea, reversePath } from './path';

// our paths have one anchor list, so a hole is joined to its outline by a straight bridge there and back,
// the hole runs the other way round, so the nonzero fill leaves it empty, and the stroke skips the bridge

function nearestPair(outer: PathData, hole: PathData): [number, number] {
  let best = Infinity;
  let pair: [number, number] = [0, 0];
  outer.anchors.forEach((o, i) => {
    hole.anchors.forEach((h, j) => {
      const d = (o.x - h.x) ** 2 + (o.y - h.y) ** 2;
      if (d < best) {
        best = d;
        pair = [i, j];
      }
    });
  });
  return pair;
}

export function bridgeHole(outer: PathData, hole: PathData): PathData {
  const ring = { anchors: hole.anchors.map(copyAnchor), closed: true };
  if (Math.sign(pathArea(ring)) === Math.sign(pathArea(outer))) reversePath(ring);
  const [i, j] = nearestPair(outer, ring);
  const o = outer.anchors;
  const h = ring.anchors;
  const out: Anchor[] = o.slice(0, i).map(copyAnchor);
  out.push({ ...o[i], ox: 0, oy: 0, kind: 'corner' });
  out.push({ ...h[j], ix: 0, iy: 0, kind: 'corner' });
  for (let k = 1; k < h.length; k++) out.push(copyAnchor(h[(j + k) % h.length]));
  out.push({ ...h[j], ox: 0, oy: 0, kind: 'corner' });
  out.push({ ...o[i], ix: 0, iy: 0, kind: 'corner' });
  for (let k = i + 1; k < o.length; k++) out.push(copyAnchor(o[k]));
  return { anchors: out, closed: true };
}

function same(a: Anchor, b: Anchor): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

// the first bridge: anchor p and q sit on one point, and so do p + 1 and q - 1
function findBridge(a: Anchor[]): [number, number] | null {
  const seen = new Map<string, number[]>();
  for (let q = 0; q < a.length; q++) {
    const key = `${Math.round(a[q].x * 1e4)},${Math.round(a[q].y * 1e4)}`;
    const list = seen.get(key);
    if (list) {
      for (const p of list) if (q - p >= 4 && same(a[p], a[q]) && same(a[p + 1], a[q - 1])) return [p, q];
      list.push(q);
    } else {
      seen.set(key, [q]);
    }
  }
  return null;
}

// undoes bridgeHole: the outline and each hole come back as their own closed paths
export function splitBridges(path: PathData): PathData[] {
  const a = path.anchors;
  if (!path.closed || a.length < 6) return [path];
  const bridge = findBridge(a);
  if (!bridge) return [path];
  const [p, q] = bridge;
  const outer: Anchor[] = [...a.slice(0, p), { ...a[p], ox: a[q].ox, oy: a[q].oy }, ...a.slice(q + 1)];
  outer[p].kind = kindOf(outer[p]);
  const hole: Anchor[] = [{ ...a[p + 1], ix: a[q - 1].ix, iy: a[q - 1].iy }, ...a.slice(p + 2, q - 1)];
  hole[0].kind = kindOf(hole[0]);
  return [
    ...splitBridges({ anchors: outer.map(copyAnchor), closed: true }),
    ...splitBridges({ anchors: hole.map(copyAnchor), closed: true })
  ];
}
