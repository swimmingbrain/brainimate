import type { PathData } from '$lib/core/types';

// keyed by the path object itself: an edit makes a new path object, so a stale entry is never read
const cache = new WeakMap<PathData, Path2D>();
// a compound path is keyed by its subpaths list and remembers which outline it was built with
const compound = new WeakMap<PathData[], { path: PathData; shape: Path2D }>();

export function buildPath2D(path: PathData): Path2D {
  const p = new Path2D();
  const anchors = path.anchors;
  const n = anchors.length;
  if (n === 0) return p;
  p.moveTo(anchors[0].x, anchors[0].y);
  const count = path.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % n];
    if (a.ox === 0 && a.oy === 0 && b.ix === 0 && b.iy === 0) p.lineTo(b.x, b.y);
    else p.bezierCurveTo(a.x + a.ox, a.y + a.oy, b.x + b.ix, b.y + b.iy, b.x, b.y);
  }
  if (path.closed) p.closePath();
  return p;
}

export function path2D(path: PathData): Path2D {
  let p = cache.get(path);
  if (!p) {
    p = buildPath2D(path);
    cache.set(path, p);
  }
  return p;
}

// one Path2D with every contour, the nonzero fill leaves the holes empty since they run the other way
export function shapePath2D(path: PathData, subpaths: PathData[]): Path2D {
  if (subpaths.length === 0) return path2D(path);
  const hit = compound.get(subpaths);
  if (hit && hit.path === path) return hit.shape;
  const shape = new Path2D();
  shape.addPath(path2D(path));
  for (const sub of subpaths) shape.addPath(path2D(sub));
  compound.set(subpaths, { path, shape });
  return shape;
}
