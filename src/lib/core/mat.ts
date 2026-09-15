import type { Mat, Vec } from './types';

// [a, b, c, d, e, f] maps (x, y) to (a x + c y + e, b x + d y + f), like canvas setTransform

export interface Decomposed {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  // skew along x in radians, applied before the scale
  skew: number;
}

export function identity(): Mat {
  return [1, 0, 0, 1, 0, 0];
}

export function isIdentity(m: Mat): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

// m * n, so n applies first
export function multiply(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

// m * n written into out, for hot loops that would otherwise make a new array per item
export function multiplyInto(out: Mat, m: Mat, n: Mat): Mat {
  const a = m[0] * n[0] + m[2] * n[1];
  const b = m[1] * n[0] + m[3] * n[1];
  const c = m[0] * n[2] + m[2] * n[3];
  const d = m[1] * n[2] + m[3] * n[3];
  const e = m[0] * n[4] + m[2] * n[5] + m[4];
  const f = m[1] * n[4] + m[3] * n[5] + m[5];
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  out[4] = e;
  out[5] = f;
  return out;
}

// a singular matrix has no inverse, identity keeps the callers going
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return identity();
  const id = 1 / det;
  return [
    m[3] * id,
    -m[1] * id,
    -m[2] * id,
    m[0] * id,
    (m[2] * m[5] - m[3] * m[4]) * id,
    (m[1] * m[4] - m[0] * m[5]) * id
  ];
}

export function applyPoint(m: Mat, p: Vec): Vec {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

// no translation, for handle offsets and directions
export function applyVector(m: Mat, v: Vec): Vec {
  return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y };
}

export function translate(tx: number, ty: number): Mat {
  return [1, 0, 0, 1, tx, ty];
}

export function rotate(angle: number): Mat {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, 0, 0];
}

export function scale(sx: number, sy = sx): Mat {
  return [sx, 0, 0, sy, 0, 0];
}

export function skew(ax: number, ay = 0): Mat {
  return [1, Math.tan(ay), Math.tan(ax), 1, 0, 0];
}

// the matrix m applied around the point p instead of the origin
export function around(m: Mat, p: Vec): Mat {
  return multiply(translate(p.x, p.y), multiply(m, translate(-p.x, -p.y)));
}

export function determinant(m: Mat): number {
  return m[0] * m[3] - m[1] * m[2];
}

// one number for how much the matrix scales lengths, used for stroke widths
export function scaleFactor(m: Mat): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

// m = translate(x, y) * rotate(rotation) * skew(skew) * scale(scaleX, scaleY), a flip ends up in scaleY
export function decompose(m: Mat): Decomposed {
  const [a, b, c, d, e, f] = m;
  const scaleX = Math.hypot(a, b);
  const rotation = scaleX > 0 ? Math.atan2(b, a) : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaleY = d * cos - c * sin;
  const tanSkew = scaleY !== 0 ? (c * cos + d * sin) / scaleY : 0;
  return { x: e, y: f, rotation, scaleX, scaleY, skew: Math.atan(tanSkew) };
}

export function compose(t: Decomposed): Mat {
  let m = translate(t.x, t.y);
  m = multiply(m, rotate(t.rotation));
  m = multiply(m, skew(t.skew));
  return multiply(m, scale(t.scaleX, t.scaleY));
}

export function equals(m: Mat, n: Mat, eps = 1e-9): boolean {
  for (let i = 0; i < 6; i++) if (Math.abs(m[i] - n[i]) > eps) return false;
  return true;
}
