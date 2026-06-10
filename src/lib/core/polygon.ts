import type { Vec } from './types';

// positive when the points run clockwise on screen (y down)
export function polygonArea(points: Vec[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
  }
  return sum / 2;
}

// even odd, a point on the edge can land either way
export function pointInPolygon(p: Vec, points: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// drops points closer than min to the one kept before them, the last point always stays
export function dropClose(points: Vec[], min: number): Vec[] {
  if (points.length < 3) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= min) out.push(points[i]);
  }
  const end = points[points.length - 1];
  const last = out[out.length - 1];
  if (out.length > 1 && Math.hypot(end.x - last.x, end.y - last.y) < min) out.pop();
  out.push(end);
  return out;
}

function lineDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// douglas peucker, keeps the points that stick out more than eps from the line through their neighbours
export function simplifyPolyline(points: Vec[], eps: number): Vec[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let worstD = eps;
    for (let i = from + 1; i < to; i++) {
      const d = lineDistance(points[i], points[from], points[to]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([from, worst], [worst, to]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

export function polylineLength(points: Vec[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return l;
}
