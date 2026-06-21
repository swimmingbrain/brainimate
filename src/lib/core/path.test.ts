import { describe, expect, it } from 'vitest';
import {
  bendSegment,
  bendWeight,
  closePath,
  compoundBounds,
  copyPath,
  inPoint,
  insertAnchor,
  joinPaths,
  makeAnchor,
  nearestSegment,
  outPoint,
  pathBounds,
  pathToD,
  removeAnchor,
  reversePath,
  segmentCount,
  segmentCubic,
  segments,
  transformPath
} from './path';
import { ellipsePath, linePath, rectPath } from './shapes';
import { pointAt } from './bezier';
import { multiply, rotate, translate } from './mat';
import type { Anchor, PathData } from './types';

function curve(): PathData {
  return {
    closed: false,
    anchors: [
      { x: 0, y: 0, ix: 0, iy: 0, ox: 0, oy: 100, kind: 'corner' },
      { x: 100, y: 0, ix: 0, iy: 100, ox: 0, oy: 0, kind: 'corner' }
    ]
  };
}

describe('path', () => {
  it('counts the closing segment of a closed path', () => {
    const r = rectPath(0, 0, 10, 10);
    expect(segmentCount(r)).toBe(4);
    expect(segments(r)[3]).toMatchObject({ index: 3, next: 0 });
    expect(segmentCount(linePath(0, 0, 1, 1))).toBe(1);
    expect(segmentCount({ closed: true, anchors: [makeAnchor(0, 0)] })).toBe(0);
  });

  it('gives absolute handle points', () => {
    const a: Anchor = { x: 10, y: 10, ix: -5, iy: 0, ox: 5, oy: 2, kind: 'smooth' };
    expect(inPoint(a)).toEqual({ x: 5, y: 10 });
    expect(outPoint(a)).toEqual({ x: 15, y: 12 });
  });

  it('transforms anchors and turns their handles', () => {
    const p = transformPath(curve(), multiply(translate(10, 0), rotate(Math.PI / 2)));
    expect(p.anchors[1].x).toBeCloseTo(10);
    expect(p.anchors[1].y).toBeCloseTo(100);
    expect(p.anchors[0].ox).toBeCloseTo(-100);
    expect(p.anchors[0].oy).toBeCloseTo(0);
  });

  it('bounds curves at their extremes', () => {
    const b = pathBounds(curve());
    expect(b.maxY).toBeCloseTo(75);
    expect(pathBounds({ closed: false, anchors: [makeAnchor(3, 4)] })).toEqual({ minX: 3, minY: 4, maxX: 3, maxY: 4 });
  });

  it('finds the nearest segment and t', () => {
    const r = rectPath(0, 0, 100, 100);
    const hit = nearestSegment(r, { x: 103, y: 25 })!;
    expect(hit.index).toBe(1);
    // t is not the share of the length on a straight segment, the point is what counts
    expect(pointAt(segmentCubic(r, 1), hit.t).y).toBeCloseTo(25, 1);
    expect(hit.d).toBeCloseTo(3, 1);
  });

  it('inserts an anchor without changing the shape', () => {
    const p = curve();
    const before = pointAt(segmentCubic(p, 0), 0.25);
    const index = insertAnchor(p, 0, 0.5);
    expect(index).toBe(1);
    expect(p.anchors).toHaveLength(3);
    expect(p.anchors[1]).toMatchObject({ x: 50, y: 75, kind: 'smooth' });
    const after = pointAt(segmentCubic(p, 0), 0.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('inserts a plain corner on a straight segment and on the closing one', () => {
    const r = rectPath(0, 0, 100, 100);
    const index = insertAnchor(r, 3, 0.5);
    expect(index).toBe(4);
    expect(r.anchors[4]).toMatchObject({ x: 0, y: 50, ix: 0, ox: 0, kind: 'corner' });
  });

  it('removes anchors and opens a path too small to be closed', () => {
    const r = rectPath(0, 0, 10, 10);
    removeAnchor(r, 0);
    expect(r.anchors).toHaveLength(3);
    expect(r.closed).toBe(true);
    removeAnchor(r, 0);
    expect(r.closed).toBe(false);
  });

  it('reverses and swaps the handles', () => {
    const p = curve();
    reversePath(p);
    expect(p.anchors[0]).toMatchObject({ x: 100, y: 0, ox: 0, oy: 100, ix: 0, iy: 0 });
    expect(pointAt(segmentCubic(p, 0), 0.5)).toEqual({ x: 50, y: 75 });
  });

  it('closes only with three anchors or more', () => {
    const l = linePath(0, 0, 10, 0);
    closePath(l);
    expect(l.closed).toBe(false);
    l.anchors.push(makeAnchor(5, 5));
    closePath(l);
    expect(l.closed).toBe(true);
  });

  it('joins two open paths and merges touching ends', () => {
    const a = linePath(0, 0, 10, 0);
    const b = linePath(10, 0, 10, 10);
    expect(joinPaths(a, b).anchors).toHaveLength(3);
    expect(joinPaths(a, linePath(20, 0, 30, 0)).anchors).toHaveLength(4);
    expect(a.anchors).toHaveLength(2);
  });

  it('copies deeply', () => {
    const p = curve();
    const c = copyPath(p);
    c.anchors[0].x = 99;
    expect(p.anchors[0].x).toBe(0);
  });

  it('shares the bend between the controls by where it was grabbed', () => {
    expect(bendWeight(0.1)).toBe(0);
    expect(bendWeight(0.5)).toBeCloseTo(0.5);
    expect(bendWeight(0.9)).toBe(1);
    expect(bendWeight(0.3)).toBeLessThan(0.5);
    expect(bendWeight(0.7)).toBeGreaterThan(0.5);
  });

  it('bends a segment so it passes through the dragged point', () => {
    for (const t of [0.15, 0.3, 0.5, 0.8]) {
      const p = rectPath(0, 0, 100, 100);
      const c = segmentCubic(p, 0);
      const grab = pointAt(c, t);
      const d = { x: 7, y: -30 };
      bendSegment(p, 0, t, c[1], c[2], d);
      const moved = pointAt(segmentCubic(p, 0), t);
      expect(moved.x).toBeCloseTo(grab.x + d.x);
      expect(moved.y).toBeCloseTo(grab.y + d.y);
      expect(p.anchors[0].kind).toBe('corner');
    }
  });

  it('keeps the far handles in line when bending smooth', () => {
    const p = ellipsePath(0, 0, 50, 50);
    const c = segmentCubic(p, 0);
    bendSegment(p, 0, 0.5, c[1], c[2], { x: 10, y: 10 }, true);
    const a = p.anchors[0];
    expect(a.ix * a.oy - a.iy * a.ox).toBeCloseTo(0);
    expect(Math.hypot(a.ix, a.iy)).toBeCloseTo(50 * 0.5523);
    expect(a.kind).toBe('symmetric');
  });

  it('writes an svg d string with lines, curves and one ring per contour', () => {
    expect(pathToD(rectPath(0, 0, 10, 5))).toBe('M0 0L10 0L10 5L0 5Z');
    expect(pathToD(curve())).toBe('M0 0C0 100 100 100 100 0');
    const hole = rectPath(2, 2, 1.25, 1);
    expect(pathToD(rectPath(0, 0, 10, 10), [hole], 1)).toBe('M0 0L10 0L10 10L0 10Z M2 2L3.3 2L3.3 3L2 3Z');
    expect(pathToD({ anchors: [], closed: false })).toBe('');
  });

  it('bounds a compound path around every contour', () => {
    const b = compoundBounds(rectPath(0, 0, 10, 10), [rectPath(20, -5, 2, 2)]);
    expect(b).toEqual({ minX: 0, minY: -5, maxX: 22, maxY: 10 });
  });
});
