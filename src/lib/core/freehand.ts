import { getStroke } from 'perfect-freehand';
import type { Anchor, PathData, Vec } from './types';
import { cubicsToAnchors, fitCubics, fitPath } from './fit';
import { kindOf } from './path';

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface FreehandOptions {
  size: number;
  // 0 keeps the width, more lets the pressure thin the line
  thinning: number;
  smoothing: number;
  streamline: number;
  simulatePressure: boolean;
  // the stroke is done, the end gets its cap
  last: boolean;
}

// the outline polygon of a brush stroke, perfect-freehand does the widths and the caps
export function strokeOutline(points: InkPoint[], o: FreehandOptions): Vec[] {
  if (points.length === 0) return [];
  const raw = getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    {
      size: o.size,
      thinning: o.thinning,
      smoothing: o.smoothing,
      streamline: o.streamline,
      simulatePressure: o.simulatePressure,
      last: o.last
    }
  );
  return raw.map(([x, y]) => ({ x, y }));
}

// the direction the stroke leaves from points[from], looking at least reach away
function direction(points: Vec[], from: number, step: number, reach: number): Vec | null {
  const p = points[from];
  for (let i = from + step; i >= 0 && i < points.length; i += step) {
    const dx = points[i].x - p.x;
    const dy = points[i].y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= reach) return { x: dx / d, y: dy / d };
  }
  const q = points[step > 0 ? points.length - 1 : 0];
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  return d > 1e-6 ? { x: (q.x - p.x) / d, y: (q.y - p.y) / d } : null;
}

// the outline point furthest out past an end of the stroke, the tip of its cap
function capTip(outline: Vec[], end: Vec, out: Vec, size: number): number {
  let best = -1;
  let bestDot = -Infinity;
  outline.forEach((p, i) => {
    const dx = p.x - end.x;
    const dy = p.y - end.y;
    if (Math.hypot(dx, dy) > size * 1.5) return;
    const d = dx * out.x + dy * out.y;
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  });
  return best;
}

function slice(outline: Vec[], from: number, to: number): Vec[] {
  const out: Vec[] = [];
  for (let i = from; ; i = (i + 1) % outline.length) {
    out.push(outline[i]);
    if (i === to) break;
  }
  return out;
}

function merge(a: Anchor, b: Anchor): Anchor {
  const m = { ...a, ox: b.ox, oy: b.oy };
  m.kind = kindOf(m);
  return m;
}

// the outline split at the two cap tips, each side fitted on its own and joined into one closed path,
// so the fit does not round off the caps or wobble along the sides
export function outlineToPath(outline: Vec[], stroke: Vec[], size: number, tolerance: number): PathData {
  if (outline.length < 3) return { anchors: [], closed: false };
  const first = stroke[0];
  const last = stroke[stroke.length - 1];
  const reach = size / 2;
  const startDir = direction(stroke, 0, 1, reach);
  const endDir = direction(stroke, stroke.length - 1, -1, reach);
  if (!startDir || !endDir) return fitPath(outline, tolerance, true);
  const a = capTip(outline, first, { x: -startDir.x, y: -startDir.y }, size);
  const b = capTip(outline, last, { x: -endDir.x, y: -endDir.y }, size);
  if (a < 0 || b < 0 || a === b) return fitPath(outline, tolerance, true);
  const one = cubicsToAnchors(fitCubics(slice(outline, a, b), tolerance));
  const two = cubicsToAnchors(fitCubics(slice(outline, b, a), tolerance));
  if (one.length < 2 || two.length < 2) return fitPath(outline, tolerance, true);
  const anchors = [...one.slice(0, -1), merge(one[one.length - 1], two[0]), ...two.slice(1, -1)];
  anchors[0] = { ...anchors[0], ix: two[two.length - 1].ix, iy: two[two.length - 1].iy };
  anchors[0].kind = kindOf(anchors[0]);
  return { anchors, closed: true };
}
