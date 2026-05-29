import { describe, expect, it } from 'vitest';
import { bbox, flatten, isLine, length, nearest, pointAt, split, type Cubic } from './bezier';

const arc: Cubic = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 0 }
];

const straight: Cubic = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 30, y: 40 },
  { x: 30, y: 40 }
];

describe('bezier', () => {
  it('hits the ends and the middle', () => {
    expect(pointAt(arc, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(arc, 1)).toEqual({ x: 100, y: 0 });
    expect(pointAt(arc, 0.5)).toEqual({ x: 50, y: 75 });
  });

  it('splits into two halves that trace the same curve', () => {
    const [left, right] = split(arc, 0.3);
    const at = pointAt(arc, 0.3);
    expect(left[3].x).toBeCloseTo(at.x);
    expect(left[3].y).toBeCloseTo(at.y);
    expect(right[0]).toEqual(left[3]);
    const a = pointAt(left, 0.5);
    const b = pointAt(arc, 0.15);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
    const c = pointAt(right, 0.5);
    const d = pointAt(arc, 0.65);
    expect(c.x).toBeCloseTo(d.x);
    expect(c.y).toBeCloseTo(d.y);
  });

  it('finds the nearest point', () => {
    const hit = nearest(arc, { x: 50, y: 90 });
    expect(hit.t).toBeCloseTo(0.5, 2);
    expect(hit.d).toBeCloseTo(15, 1);
    expect(nearest(straight, { x: 30, y: 0 }).d).toBeCloseTo(24, 1);
  });

  it('bounds the curve at its turning points, not at the controls', () => {
    const b = bbox(arc);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(100);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBeCloseTo(75);
  });

  it('measures length', () => {
    expect(length(straight)).toBeCloseTo(50, 3);
    expect(length(arc)).toBeGreaterThan(150);
    expect(length(arc)).toBeLessThan(300);
  });

  it('flattens a line to its ends and a curve to many points', () => {
    expect(isLine(straight)).toBe(true);
    expect(isLine(arc)).toBe(false);
    expect(flatten(straight)).toHaveLength(2);
    const pts = flatten(arc, 0.5);
    expect(pts.length).toBeGreaterThan(10);
    expect(pts[0]).toEqual(arc[0]);
    expect(pts[pts.length - 1]).toEqual(arc[3]);
  });
});
