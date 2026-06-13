import type { Mat, PathData, Vec } from './types';
import { identity, multiply, rotate, translate } from './mat';
import { makeAnchor } from './path';
import { ellipsePath, rectPath } from './shapes';
import { simplifyPolyline } from './polygon';

export interface Recognized {
  name: string;
  path: PathData;
  transform: Mat;
}

// a corner counts as square within this many degrees
const RIGHT_ANGLE = 22;
// how far a point may stray from the ellipse, as a share of its radius there
const ELLIPSE_SLACK = 0.2;

function frame(origin: Vec, angle: number, points: Vec[]) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of points) {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const u = dx * c + dy * s;
    const v = -dx * s + dy * c;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  // the middle of the box, back in world space
  const mu = (minU + maxU) / 2;
  const mv = (minV + maxV) / 2;
  return {
    w: maxU - minU,
    h: maxV - minV,
    center: { x: origin.x + mu * c - mv * s, y: origin.y + mu * s + mv * c }
  };
}

function placed(center: Vec, angle: number): Mat {
  return multiply(translate(center.x, center.y), angle === 0 ? identity() : rotate(angle));
}

// four corners near 90 degrees make a rect along the longest side
function asRect(corners: Vec[], points: Vec[]): Recognized | null {
  if (corners.length !== 4) return null;
  let longest = 0;
  let angle = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[(i + 3) % 4];
    const b = corners[i];
    const c = corners[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (Math.abs(deg - 90) > RIGHT_ANGLE) return null;
    const l = Math.hypot(v2.x, v2.y);
    if (l > longest) {
      longest = l;
      angle = Math.atan2(v2.y, v2.x);
    }
  }
  // nearly upright stays upright
  const quarter = Math.PI / 2;
  const snapped = Math.round(angle / quarter) * quarter;
  if (Math.abs(angle - snapped) < (6 * Math.PI) / 180) angle = 0;
  const f = frame(corners[0], angle, points);
  return { name: 'Rectangle', path: rectPath(-f.w / 2, -f.h / 2, f.w, f.h), transform: placed(f.center, angle) };
}

// the principal axes of the points give the ellipse a turn, every point has to lie near it
function asEllipse(points: Vec[]): Recognized | null {
  if (points.length < 8) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // a nearly round shape has no clear axis, it stays upright
  const spread = Math.hypot(sxx - syy, 2 * sxy) / (sxx + syy || 1);
  if (spread < 0.1) angle = 0;
  const f = frame({ x: mx, y: my }, angle, points);
  const rx = f.w / 2;
  const ry = f.h / 2;
  if (rx < 1e-6 || ry < 1e-6) return null;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const p of points) {
    const dx = p.x - f.center.x;
    const dy = p.y - f.center.y;
    const u = dx * c + dy * s;
    const v = -dx * s + dy * c;
    const r = Math.hypot(u / rx, v / ry);
    if (Math.abs(r - 1) > ELLIPSE_SLACK) return null;
  }
  return { name: 'Ellipse', path: ellipsePath(0, 0, rx, ry), transform: placed(f.center, angle) };
}

// the straighten mode of the pencil: a polyline, or a rect or an ellipse when the stroke was close to one
export function straightenStroke(points: Vec[], eps: number, closed: boolean): Recognized {
  const ring = closed ? [...points, points[0]] : points;
  let corners = simplifyPolyline(ring, eps);
  if (closed && corners.length > 1) corners = corners.slice(0, -1);
  // the start of a closed stroke is kept by the simplify even in the middle of a side
  if (closed && corners.length > 3) {
    const [a, b, c] = [corners[corners.length - 1], corners[0], corners[1]];
    const l = Math.hypot(c.x - a.x, c.y - a.y);
    const off = l > 0 ? Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / l : 0;
    if (off < eps) corners = corners.slice(1);
  }
  if (closed) {
    const shape = asRect(corners, points) ?? (corners.length > 4 ? asEllipse(points) : null);
    if (shape) return shape;
  }
  return {
    name: 'Pencil',
    path: { closed: closed && corners.length > 2, anchors: corners.map((p) => makeAnchor(p.x, p.y)) },
    transform: identity()
  };
}
