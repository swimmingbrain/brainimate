import { describe, expect, it } from 'vitest';
import { ellipsePath, KAPPA, linePath, polygonPath, rectPath, starPath } from './shapes';
import { pathBounds, segmentCubic } from './path';
import { pointAt } from './bezier';

describe('shapes', () => {
  it('makes a plain rect from four corners', () => {
    const p = rectPath(10, 20, 100, 50);
    expect(p.closed).toBe(true);
    expect(p.anchors).toHaveLength(4);
    expect(pathBounds(p)).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('rounds the corners with 8 anchors and keeps the bounds', () => {
    const p = rectPath(0, 0, 100, 50, 10);
    expect(p.anchors).toHaveLength(8);
    const b = pathBounds(p);
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.maxY).toBeCloseTo(50);
    expect(p.anchors[0]).toMatchObject({ x: 10, y: 0, ix: -10 * KAPPA });
  });

  it('caps the radius at half the short side', () => {
    const p = rectPath(0, 0, 100, 20, 50);
    expect(p.anchors[0].x).toBe(10);
  });

  it('makes an ellipse that passes close to the true circle', () => {
    const p = ellipsePath(0, 0, 50, 50);
    expect(p.anchors).toHaveLength(4);
    const mid = pointAt(segmentCubic(p, 0), 0.5);
    expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(50, 0);
    const b = pathBounds(p);
    expect(b.minX).toBeCloseTo(-50);
    expect(b.maxY).toBeCloseTo(50);
  });

  it('makes polygons and stars pointing up', () => {
    const tri = polygonPath(0, 0, 10, 3);
    expect(tri.anchors).toHaveLength(3);
    expect(tri.anchors[0].x).toBeCloseTo(0);
    expect(tri.anchors[0].y).toBeCloseTo(-10);
    const star = starPath(0, 0, 10, 4, 5);
    expect(star.anchors).toHaveLength(10);
    expect(Math.hypot(star.anchors[1].x, star.anchors[1].y)).toBeCloseTo(4);
  });

  it('makes an open line', () => {
    const l = linePath(0, 0, 10, 10);
    expect(l.closed).toBe(false);
    expect(l.anchors).toHaveLength(2);
  });
});
