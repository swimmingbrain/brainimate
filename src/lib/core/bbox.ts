import type { Mat, Vec } from './types';
import { applyPoint } from './mat';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// an empty box has min above max, any union with it gives the other box
export function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmpty(b: Box): boolean {
  return b.minX > b.maxX || b.minY > b.maxY;
}

export function boxWidth(b: Box): number {
  return isEmpty(b) ? 0 : b.maxX - b.minX;
}

export function boxHeight(b: Box): number {
  return isEmpty(b) ? 0 : b.maxY - b.minY;
}

export function boxCenter(b: Box): Vec {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function fromRect(x: number, y: number, width: number, height: number): Box {
  return {
    minX: Math.min(x, x + width),
    minY: Math.min(y, y + height),
    maxX: Math.max(x, x + width),
    maxY: Math.max(y, y + height)
  };
}

export function union(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

export function addPoint(b: Box, p: Vec): Box {
  return {
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y)
  };
}

export function fromPoints(points: Vec[]): Box {
  let b = emptyBox();
  for (const p of points) b = addPoint(b, p);
  return b;
}

export function contains(b: Box, p: Vec): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

// touching edges count as intersecting
export function intersects(a: Box, b: Box): boolean {
  if (isEmpty(a) || isEmpty(b)) return false;
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

// b lies fully inside a
export function containsBox(a: Box, b: Box): boolean {
  return b.minX >= a.minX && b.maxX <= a.maxX && b.minY >= a.minY && b.maxY <= a.maxY;
}

export function expand(b: Box, d: number): Box {
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

export function corners(b: Box): Vec[] {
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY }
  ];
}

// the box around the four transformed corners, a little larger than the shape when rotated
export function transformBox(b: Box, m: Mat): Box {
  if (isEmpty(b)) return b;
  return fromPoints(corners(b).map((p) => applyPoint(m, p)));
}

export function translateBox(b: Box, dx: number, dy: number): Box {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}
