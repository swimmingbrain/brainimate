import { describe, expect, it } from 'vitest';
import { bridgeHole, combine, divide, intersect, splitBridges, subtract, unite } from './boolean';
import { rectPath } from './shapes';
import { pathArea, pathBounds } from './path';

describe('boolean', () => {
  it('unites two overlapping rects into one outline with their joint area', async () => {
    const out = await unite([rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]);
    expect(out).toHaveLength(1);
    expect(Math.abs(pathArea(out[0]))).toBeCloseTo(17500, 0);
    expect(out[0].anchors).toHaveLength(8);
    expect(out[0].closed).toBe(true);
  });

  it('subtracts a rect over the edge as a notch', async () => {
    const out = await subtract([rectPath(0, 0, 100, 100)], [rectPath(80, 40, 50, 20)]);
    expect(out).toHaveLength(1);
    expect(Math.abs(pathArea(out[0]))).toBeCloseTo(10000 - 20 * 20, 0);
    expect(out[0].anchors).toHaveLength(8);
    const b = pathBounds(out[0]);
    expect(b.maxX).toBeCloseTo(100);
  });

  it('keeps a hole inside one path through a bridge', async () => {
    const out = await subtract([rectPath(0, 0, 100, 100)], [rectPath(40, 40, 20, 20)]);
    expect(out).toHaveLength(1);
    expect(Math.abs(pathArea(out[0]))).toBeCloseTo(10000 - 400, 0);
    const parts = splitBridges(out[0]);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => Math.round(Math.abs(pathArea(p)))).sort((a, b) => a - b)).toEqual([400, 10000]);
  });

  it('gives each island of a result its own path', async () => {
    const out = await subtract([rectPath(0, 0, 100, 20)], [rectPath(40, -10, 20, 40)]);
    expect(out).toHaveLength(2);
    for (const p of out) expect(Math.abs(pathArea(p))).toBeCloseTo(800, 0);
  });

  it('intersects and excludes', async () => {
    const both = await intersect([rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]);
    expect(Math.abs(pathArea(both[0]))).toBeCloseTo(2500, 0);
    const either = await combine('exclude', [[rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]]);
    const area = either.reduce((sum, p) => sum + Math.abs(pathArea(p)), 0);
    expect(area).toBeCloseTo(15000, 0);
  });

  it('divides overlapping shapes into pieces that remember their source', async () => {
    const pieces = await divide([[rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]]);
    expect(pieces).toHaveLength(3);
    const overlap = pieces.find((p) => Math.round(Math.abs(pathArea(p.path))) === 2500);
    expect(overlap?.source).toBe(1);
  });

  it('bridges a hole that runs the other way round', () => {
    const ring = bridgeHole(rectPath(0, 0, 10, 10), rectPath(4, 4, 2, 2));
    expect(ring.anchors).toHaveLength(4 + 4 + 2);
    expect(Math.abs(pathArea(ring))).toBeCloseTo(96, 3);
  });
});
