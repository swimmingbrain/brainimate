import { describe, expect, it } from 'vitest';
import { combine, divide, intersect, subtract, unite } from './boolean';
import { rectPath } from './shapes';
import { pathArea, pathBounds, type Compound } from './path';

function area(c: Compound): number {
  return [c.path, ...c.subpaths].reduce((sum, p) => sum + pathArea(p), 0);
}

describe('boolean', () => {
  it('unites two overlapping rects into one outline with their joint area', async () => {
    const out = await unite([rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]);
    expect(out).toHaveLength(1);
    expect(out[0].subpaths).toHaveLength(0);
    expect(Math.abs(pathArea(out[0].path))).toBeCloseTo(17500, 0);
    expect(out[0].path.anchors).toHaveLength(8);
    expect(out[0].path.closed).toBe(true);
  });

  it('subtracts a rect over the edge as a notch', async () => {
    const out = await subtract([rectPath(0, 0, 100, 100)], [rectPath(80, 40, 50, 20)]);
    expect(out).toHaveLength(1);
    expect(Math.abs(pathArea(out[0].path))).toBeCloseTo(10000 - 20 * 20, 0);
    expect(out[0].path.anchors).toHaveLength(8);
    const b = pathBounds(out[0].path);
    expect(b.maxX).toBeCloseTo(100);
  });

  it('keeps a hole as a subpath that runs the other way round', async () => {
    const out = await subtract([rectPath(0, 0, 100, 100)], [rectPath(40, 40, 20, 20)]);
    expect(out).toHaveLength(1);
    const [c] = out;
    expect(c.subpaths).toHaveLength(1);
    expect(Math.abs(pathArea(c.path))).toBeCloseTo(10000, 0);
    expect(Math.abs(pathArea(c.subpaths[0]))).toBeCloseTo(400, 0);
    expect(Math.sign(pathArea(c.subpaths[0]))).toBe(-Math.sign(pathArea(c.path)));
    expect(Math.abs(area(c))).toBeCloseTo(9600, 0);
  });

  it('unites a ring from two shapes with the hole kept inside one item', async () => {
    const frame = [rectPath(0, 0, 100, 30), rectPath(0, 70, 100, 30), rectPath(0, 0, 30, 100), rectPath(70, 0, 30, 100)];
    const out = await combine('unite', frame.map((p) => [p]));
    expect(out).toHaveLength(1);
    expect(out[0].subpaths).toHaveLength(1);
    expect(Math.abs(area(out[0]))).toBeCloseTo(10000 - 1600, 0);
  });

  it('a compound shape goes in with its hole and comes out with it', async () => {
    const ring: Compound = (await subtract([rectPath(0, 0, 100, 100)], [rectPath(40, 40, 20, 20)]))[0];
    const out = await unite([ring.path, ...ring.subpaths], [rectPath(90, 0, 50, 50)]);
    expect(out).toHaveLength(1);
    expect(out[0].subpaths).toHaveLength(1);
    expect(Math.abs(area(out[0]))).toBeCloseTo(9600 + 2000, 0);
  });

  it('gives each island of a result its own compound', async () => {
    const out = await subtract([rectPath(0, 0, 100, 20)], [rectPath(40, -10, 20, 40)]);
    expect(out).toHaveLength(2);
    for (const c of out) expect(Math.abs(pathArea(c.path))).toBeCloseTo(800, 0);
  });

  it('an island inside a hole becomes a compound of its own', async () => {
    const out = await combine('exclude', [[rectPath(0, 0, 100, 100)], [rectPath(20, 20, 60, 60)], [rectPath(40, 40, 20, 20)]]);
    expect(out).toHaveLength(2);
    const sizes = out.map((c) => c.subpaths.length).sort();
    expect(sizes).toEqual([0, 1]);
  });

  it('intersects and excludes', async () => {
    const both = await intersect([rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]);
    expect(Math.abs(pathArea(both[0].path))).toBeCloseTo(2500, 0);
    const either = await combine('exclude', [[rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]]);
    const total = either.reduce((sum, c) => sum + Math.abs(area(c)), 0);
    expect(total).toBeCloseTo(15000, 0);
  });

  it('divides overlapping shapes into pieces that remember their source', async () => {
    const pieces = await divide([[rectPath(0, 0, 100, 100)], [rectPath(50, 50, 100, 100)]]);
    expect(pieces).toHaveLength(3);
    const overlap = pieces.find((p) => Math.round(Math.abs(pathArea(p.shape.path))) === 2500);
    expect(overlap?.source).toBe(1);
  });
});
