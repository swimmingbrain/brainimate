import type { Anchor, PathData, Vec } from './types';

// a share of the chord to each neighbour, 0.39 makes four points on a circle come out round
const HANDLE_SHARE = 0.39;

// catmull rom tangents: each smooth anchor points its handles along the line between its neighbours,
// corners keep no handles and the outer handles of an open path stay empty
export function setSmoothHandles(path: PathData, index: number) {
  const anchors = path.anchors;
  const n = anchors.length;
  const a = anchors[index];
  if (a.kind === 'corner' || n < 2) {
    a.ix = a.iy = a.ox = a.oy = 0;
    return;
  }
  const prev: Vec | null = index > 0 || path.closed ? anchors[(index - 1 + n) % n] : null;
  const next: Vec | null = index < n - 1 || path.closed ? anchors[(index + 1) % n] : null;
  const from = prev ?? a;
  const to = next ?? a;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    a.ix = a.iy = a.ox = a.oy = 0;
    return;
  }
  const lin = prev ? Math.hypot(a.x - prev.x, a.y - prev.y) * HANDLE_SHARE : 0;
  const lout = next ? Math.hypot(next.x - a.x, next.y - a.y) * HANDLE_SHARE : 0;
  a.ix = (-dx / d) * lin;
  a.iy = (-dy / d) * lin;
  a.ox = (dx / d) * lout;
  a.oy = (dy / d) * lout;
}

// the curvature tool path: every point is passed through, smooth ones round, corners sharp
export function catmullRom(points: Vec[], closed: boolean, corners: boolean[] = []): PathData {
  const anchors: Anchor[] = points.map((p, i) => ({
    x: p.x,
    y: p.y,
    ix: 0,
    iy: 0,
    ox: 0,
    oy: 0,
    kind: corners[i] ? 'corner' : 'smooth'
  }));
  const path = { anchors, closed: closed && anchors.length > 2 };
  for (let i = 0; i < anchors.length; i++) setSmoothHandles(path, i);
  return path;
}

// handles again for every anchor from its position and kind, after a point moved or was added
export function rebuildSmooth(path: PathData) {
  for (let i = 0; i < path.anchors.length; i++) setSmoothHandles(path, i);
}

// the smooth command, every anchor becomes smooth
export function smoothPath(path: PathData) {
  for (const a of path.anchors) a.kind = 'smooth';
  rebuildSmooth(path);
}
