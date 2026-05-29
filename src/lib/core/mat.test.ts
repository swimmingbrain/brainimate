import { describe, expect, it } from 'vitest';
import {
  applyPoint,
  applyVector,
  around,
  compose,
  decompose,
  equals,
  identity,
  invert,
  multiply,
  rotate,
  scale,
  skew,
  translate
} from './mat';
import type { Mat } from './types';

function expectMat(m: Mat, n: Mat) {
  for (let i = 0; i < 6; i++) expect(m[i]).toBeCloseTo(n[i], 9);
}

describe('mat', () => {
  it('leaves points alone as identity', () => {
    expect(applyPoint(identity(), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('applies the right hand matrix first', () => {
    const m = multiply(translate(10, 0), scale(2));
    expect(applyPoint(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 });
    const n = multiply(scale(2), translate(10, 0));
    expect(applyPoint(n, { x: 1, y: 1 })).toEqual({ x: 22, y: 2 });
  });

  it('inverts so that m times its inverse is identity', () => {
    const m = multiply(translate(5, -3), multiply(rotate(0.7), scale(2, 0.5)));
    expectMat(multiply(m, invert(m)), identity());
    expectMat(multiply(invert(m), m), identity());
  });

  it('gives identity for a singular matrix', () => {
    expect(invert([0, 0, 0, 0, 5, 5])).toEqual(identity());
  });

  it('moves vectors without the translation', () => {
    expect(applyVector(translate(100, 100), { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    const v = applyVector(rotate(Math.PI / 2), { x: 1, y: 0 });
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it('rotates around a point', () => {
    const m = around(rotate(Math.PI), { x: 10, y: 10 });
    const p = applyPoint(m, { x: 20, y: 10 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });

  it('decomposes what compose built', () => {
    const t = { x: 12, y: -7, rotation: 0.6, scaleX: 2, scaleY: 0.75, skew: 0.3 };
    const d = decompose(compose(t));
    expect(d.x).toBeCloseTo(t.x);
    expect(d.y).toBeCloseTo(t.y);
    expect(d.rotation).toBeCloseTo(t.rotation);
    expect(d.scaleX).toBeCloseTo(t.scaleX);
    expect(d.scaleY).toBeCloseTo(t.scaleY);
    expect(d.skew).toBeCloseTo(t.skew);
  });

  it('keeps a flip in the y scale', () => {
    const m = multiply(rotate(0.4), scale(1, -2));
    const d = decompose(m);
    expect(d.scaleY).toBeCloseTo(-2);
    expectMat(compose(d), m);
  });

  it('builds skew and compares matrices', () => {
    expect(applyPoint(skew(Math.PI / 4), { x: 0, y: 1 }).x).toBeCloseTo(1);
    expect(equals(identity(), [1, 0, 0, 1, 0, 1e-12])).toBe(true);
    expect(equals(identity(), translate(1, 0))).toBe(false);
  });
});
