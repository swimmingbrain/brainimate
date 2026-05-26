import type { Vec } from './types';

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec, b: Vec): number {
  return a.x * b.y - a.y * b.x;
}

export function len(a: Vec): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// a zero vector stays zero instead of turning into NaN
export function norm(a: Vec): Vec {
  const l = Math.hypot(a.x, a.y);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function perp(a: Vec): Vec {
  return { x: -a.y, y: a.x };
}

export function rotate(a: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export function angle(a: Vec): number {
  return Math.atan2(a.y, a.x);
}

export function equals(a: Vec, b: Vec, eps = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

// snaps the direction from origin to p to the nearest multiple of step radians,
// the point is projected onto that direction so it stays close to the cursor
export function snapAngle(origin: Vec, p: Vec, step = Math.PI / 4): Vec {
  const d = sub(p, origin);
  const a = Math.round(Math.atan2(d.y, d.x) / step) * step;
  const along = d.x * Math.cos(a) + d.y * Math.sin(a);
  return { x: origin.x + Math.cos(a) * along, y: origin.y + Math.sin(a) * along };
}
