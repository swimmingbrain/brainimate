import type { PathData } from '$lib/core/types';
import { splitBridges } from '$lib/core/bridge';

// keyed by the path object itself: an edit makes a new path object, so a stale entry is never read
const cache = new WeakMap<PathData, Path2D>();
const strokes = new WeakMap<PathData, Path2D>();

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

// a path with holes is stroked ring by ring, so the bridges that join the holes to the outline stay hidden
export function strokePath2D(path: PathData): Path2D {
  let p = strokes.get(path);
  if (!p) {
    const rings = path.closed && path.anchors.length >= 6 ? splitBridges(path) : [path];
    if (rings.length === 1) {
      p = path2D(path);
    } else {
      p = new Path2D();
      for (const ring of rings) p.addPath(buildPath2D(ring));
    }
    strokes.set(path, p);
  }
  return p;
}
