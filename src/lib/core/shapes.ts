import type { Anchor, PathData } from './types';
import { makeAnchor } from './path';

// handle length for a quarter circle drawn with one cubic
export const KAPPA = 0.5523;

function anchor(x: number, y: number, ix: number, iy: number, ox: number, oy: number, kind: Anchor['kind']): Anchor {
  return { x, y, ix, iy, ox, oy, kind };
}

// clockwise from the top left, with a radius the corners become quarter arcs and there are 8 anchors
export function rectPath(x: number, y: number, w: number, h: number, radius = 0): PathData {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  if (r === 0) {
    return {
      closed: true,
      anchors: [makeAnchor(x, y), makeAnchor(x + w, y), makeAnchor(x + w, y + h), makeAnchor(x, y + h)]
    };
  }
  const k = r * KAPPA;
  return {
    closed: true,
    anchors: [
      anchor(x + r, y, -k, 0, 0, 0, 'smooth'),
      anchor(x + w - r, y, 0, 0, k, 0, 'smooth'),
      anchor(x + w, y + r, 0, -k, 0, 0, 'smooth'),
      anchor(x + w, y + h - r, 0, 0, 0, k, 'smooth'),
      anchor(x + w - r, y + h, k, 0, 0, 0, 'smooth'),
      anchor(x + r, y + h, 0, 0, -k, 0, 'smooth'),
      anchor(x, y + h - r, 0, k, 0, 0, 'smooth'),
      anchor(x, y + r, 0, 0, 0, -k, 'smooth')
    ]
  };
}

// four symmetric anchors, top, right, bottom, left
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathData {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return {
    closed: true,
    anchors: [
      anchor(cx, cy - ry, -kx, 0, kx, 0, 'symmetric'),
      anchor(cx + rx, cy, 0, -ky, 0, ky, 'symmetric'),
      anchor(cx, cy + ry, kx, 0, -kx, 0, 'symmetric'),
      anchor(cx - rx, cy, 0, ky, 0, -ky, 'symmetric')
    ]
  };
}

// the first corner points straight up
export function polygonPath(cx: number, cy: number, radius: number, sides: number): PathData {
  const n = Math.max(3, Math.round(sides));
  const anchors: Anchor[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
    anchors.push(makeAnchor(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
  }
  return { closed: true, anchors };
}

// points tips on the outer radius with the dents on the inner one in between
export function starPath(cx: number, cy: number, outer: number, inner: number, points: number): PathData {
  const n = Math.max(3, Math.round(points));
  const anchors: Anchor[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? outer : inner;
    anchors.push(makeAnchor(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return { closed: true, anchors };
}

export function linePath(x1: number, y1: number, x2: number, y2: number): PathData {
  return { closed: false, anchors: [makeAnchor(x1, y1), makeAnchor(x2, y2)] };
}
