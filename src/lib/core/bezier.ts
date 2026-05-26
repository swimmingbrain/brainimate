import { Bezier } from 'bezier-js';
import type { Vec } from './types';
import type { Box } from './bbox';

// start, control 1, control 2, end
export type Cubic = [Vec, Vec, Vec, Vec];

export function pointAt(c: Cubic, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y
  };
}

export function derivativeAt(c: Cubic, t: number): Vec {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const d = 3 * t * t;
  return {
    x: a * (c[1].x - c[0].x) + b * (c[2].x - c[1].x) + d * (c[3].x - c[2].x),
    y: a * (c[1].y - c[0].y) + b * (c[2].y - c[1].y) + d * (c[3].y - c[2].y)
  };
}

function mix(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// de casteljau, the two halves meet at pointAt(c, t)
export function split(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = mix(c[0], c[1], t);
  const p12 = mix(c[1], c[2], t);
  const p23 = mix(c[2], c[3], t);
  const p012 = mix(p01, p12, t);
  const p123 = mix(p12, p23, t);
  const mid = mix(p012, p123, t);
  return [
    [{ ...c[0] }, p01, p012, mid],
    [{ ...mid }, p123, p23, { ...c[3] }]
  ];
}

function toBezier(c: Cubic): Bezier {
  return new Bezier(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
}

function isPoint(c: Cubic): boolean {
  return c.every((p) => p.x === c[0].x && p.y === c[0].y);
}

// closest point on the curve, t in 0..1 and d the distance to p
export function nearest(c: Cubic, p: Vec): { x: number; y: number; t: number; d: number } {
  if (isPoint(c)) return { x: c[0].x, y: c[0].y, t: 0, d: Math.hypot(p.x - c[0].x, p.y - c[0].y) };
  const hit = toBezier(c).project(p);
  const t = hit.t ?? 0;
  return { x: hit.x, y: hit.y, t, d: hit.d ?? Math.hypot(p.x - hit.x, p.y - hit.y) };
}

export function length(c: Cubic): number {
  if (isPoint(c)) return 0;
  return toBezier(c).length();
}

// roots of the derivative of one coordinate, the places where the curve turns
function extrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      out.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}

export function bbox(c: Cubic): Box {
  let minX = Math.min(c[0].x, c[3].x);
  let maxX = Math.max(c[0].x, c[3].x);
  let minY = Math.min(c[0].y, c[3].y);
  let maxY = Math.max(c[0].y, c[3].y);
  for (const t of extrema(c[0].x, c[1].x, c[2].x, c[3].x)) {
    const x = pointAt(c, t).x;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  for (const t of extrema(c[0].y, c[1].y, c[2].y, c[3].y)) {
    const y = pointAt(c, t).y;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// a straight segment has its controls on the line between the ends
export function isLine(c: Cubic, eps = 1e-6): boolean {
  const dx = c[3].x - c[0].x;
  const dy = c[3].y - c[0].y;
  const l = Math.hypot(dx, dy);
  if (l < eps) return isPoint(c);
  const off = (p: Vec) => Math.abs((p.x - c[0].x) * dy - (p.y - c[0].y) * dx) / l;
  return off(c[1]) < eps && off(c[2]) < eps;
}

// points along the curve, more of them the longer and the more bent it is
export function flatten(c: Cubic, tolerance = 0.5): Vec[] {
  if (isLine(c)) return [{ ...c[0] }, { ...c[3] }];
  const hull = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) +
    Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y) +
    Math.hypot(c[3].x - c[2].x, c[3].y - c[2].y);
  const steps = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(hull / Math.max(tolerance, 0.01)) * 2)));
  const out: Vec[] = [];
  for (let i = 0; i <= steps; i++) out.push(pointAt(c, i / steps));
  return out;
}
