import { describe, expect, it } from 'vitest';
import { applyEase, cubicEase, easeHandles, easeKind, reverseEase } from './easing';

describe('easing', () => {
  it('keeps linear straight and clamps t', () => {
    expect(applyEase('linear', 0.3)).toBeCloseTo(0.3);
    expect(applyEase('linear', -1)).toBe(0);
    expect(applyEase('linear', 2)).toBe(1);
  });

  it('starts slow with in and fast with out', () => {
    expect(applyEase('in', 0.25)).toBeLessThan(0.25);
    expect(applyEase('out', 0.25)).toBeGreaterThan(0.25);
    expect(applyEase('inout', 0.5)).toBeCloseTo(0.5, 3);
    for (const e of ['in', 'out', 'inout']) {
      expect(applyEase(e, 0)).toBeCloseTo(0);
      expect(applyEase(e, 1)).toBeCloseTo(1);
    }
  });

  it('parses custom cubic handles and writes them back', () => {
    expect(easeHandles('cubic(0.1, 0.2, 0.3, 1.4)')).toEqual([0.1, 0.2, 0.3, 1.4]);
    expect(easeHandles('cubic(1.5,0,-2,1)')).toEqual([1, 0, 0, 1]);
    expect(easeHandles('nonsense')).toEqual([0, 0, 1, 1]);
    expect(cubicEase(0.12345, 0, 2, 1)).toBe('cubic(0.123,0,1,1)');
    expect(easeKind('cubic(0,0,1,1)')).toBe('custom');
    expect(easeKind('out')).toBe('out');
  });

  it('lets a back curve overshoot', () => {
    let max = 0;
    for (let t = 0; t <= 1; t += 0.05) max = Math.max(max, applyEase('back-out', t));
    expect(max).toBeGreaterThan(1);
  });

  it('reverses in into out and mirrors a custom curve', () => {
    expect(reverseEase('in')).toBe('out');
    expect(reverseEase('inout')).toBe('inout');
    const e = 'cubic(0.2,0.1,0.6,0.9)';
    const r = reverseEase(e);
    // played backwards: f'(t) = 1 - f(1 - t)
    for (const t of [0.2, 0.5, 0.8]) expect(applyEase(r, t)).toBeCloseTo(1 - applyEase(e, 1 - t), 3);
  });
});
