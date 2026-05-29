import { describe, expect, it } from 'vitest';
import {
  boxCenter,
  boxHeight,
  boxWidth,
  contains,
  containsBox,
  emptyBox,
  expand,
  fromPoints,
  fromRect,
  intersects,
  isEmpty,
  transformBox,
  union
} from './bbox';
import { rotate } from './mat';

describe('bbox', () => {
  it('starts empty and takes the other box in a union', () => {
    const e = emptyBox();
    expect(isEmpty(e)).toBe(true);
    expect(boxWidth(e)).toBe(0);
    const b = fromRect(0, 0, 10, 5);
    expect(union(e, b)).toEqual(b);
  });

  it('builds from points and from a rect with a negative size', () => {
    const pts = [
      { x: 3, y: 1 },
      { x: -2, y: 4 },
      { x: 0, y: 0 }
    ];
    expect(fromPoints(pts)).toEqual({ minX: -2, minY: 0, maxX: 3, maxY: 4 });
    expect(fromRect(10, 10, -4, -6)).toEqual({ minX: 6, minY: 4, maxX: 10, maxY: 10 });
  });

  it('measures and finds the center', () => {
    const b = fromRect(2, 4, 10, 6);
    expect(boxWidth(b)).toBe(10);
    expect(boxHeight(b)).toBe(6);
    expect(boxCenter(b)).toEqual({ x: 7, y: 7 });
  });

  it('tests points and overlaps, edges included', () => {
    const b = fromRect(0, 0, 10, 10);
    expect(contains(b, { x: 10, y: 5 })).toBe(true);
    expect(contains(b, { x: 10.1, y: 5 })).toBe(false);
    expect(intersects(b, fromRect(10, 10, 5, 5))).toBe(true);
    expect(intersects(b, fromRect(11, 0, 5, 5))).toBe(false);
    expect(intersects(b, emptyBox())).toBe(false);
    expect(containsBox(b, fromRect(1, 1, 2, 2))).toBe(true);
    expect(containsBox(b, fromRect(-1, 1, 2, 2))).toBe(false);
    expect(expand(b, 2)).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 });
  });

  it('grows around rotated corners', () => {
    const b = transformBox(fromRect(-1, -1, 2, 2), rotate(Math.PI / 4));
    expect(b.maxX).toBeCloseTo(Math.SQRT2);
    expect(b.minY).toBeCloseTo(-Math.SQRT2);
  });
});
