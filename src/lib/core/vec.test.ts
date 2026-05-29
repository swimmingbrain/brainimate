import { describe, expect, it } from 'vitest';
import { add, angle, cross, dist, dot, len, lerp, norm, perp, rotate, scale, snapAngle, sub } from './vec';

describe('vec', () => {
  it('adds, subtracts and scales', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(scale({ x: 1, y: -2 }, 3)).toEqual({ x: 3, y: -6 });
  });

  it('measures lengths and products', () => {
    expect(len({ x: 3, y: 4 })).toBe(5);
    expect(dist({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
  });

  it('normalizes without turning zero into NaN', () => {
    expect(norm({ x: 0, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(norm({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('lerps, rotates and turns a quarter', () => {
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({ x: 2.5, y: 5 });
    const r = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
    const q = perp({ x: 1, y: 0 });
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBe(1);
    expect(angle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
  });

  it('snaps a direction to 45 degree steps', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
    const d = snapAngle({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(d.x).toBeCloseTo(d.y);
  });
});
