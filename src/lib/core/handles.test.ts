import { describe, expect, it } from 'vitest';
import { continueFrom, nextPoint, pullHandles, retractHandles, retractOut } from './handles';
import { makeAnchor } from './path';
import type { PathData } from './types';

describe('pen handles', () => {
  it('pulls symmetric handles towards the pointer', () => {
    const a = makeAnchor(10, 10);
    pullHandles(a, { x: 30, y: 20 });
    expect([a.ox, a.oy, a.ix, a.iy]).toEqual([20, 10, -20, -10]);
    expect(a.kind).toBe('symmetric');
  });

  it('keeps the in handle when the pair is broken', () => {
    const a = makeAnchor(0, 0);
    pullHandles(a, { x: 10, y: 0 });
    pullHandles(a, { x: 0, y: 10 }, true);
    expect(a.ix).toBe(-10);
    expect(a.iy).toBeCloseTo(0);
    expect(a.ox).toBeCloseTo(0);
    expect(a.oy).toBe(10);
    expect(a.kind).toBe('corner');
  });

  it('snaps the handle to 45 degree steps with shift', () => {
    const a = makeAnchor(0, 0);
    pullHandles(a, { x: 10, y: 1 }, false, true);
    expect(a.oy).toBeCloseTo(0);
    expect(a.ox).toBeCloseTo(10);
    const p = nextPoint({ x: 0, y: 0 }, { x: 10, y: 9 }, true);
    expect(p.x).toBeCloseTo(p.y);
  });

  it('a drag that ends on the anchor leaves a corner', () => {
    const a = makeAnchor(5, 5);
    pullHandles(a, { x: 5, y: 5 });
    expect(a.kind).toBe('corner');
  });

  it('retracts the out handle or both', () => {
    const a = { x: 0, y: 0, ix: -3, iy: 0, ox: 3, oy: 0, kind: 'symmetric' as const };
    retractOut(a);
    expect([a.ix, a.ox, a.kind]).toEqual([-3, 0, 'corner']);
    retractHandles(a);
    expect(a.ix).toBe(0);
  });

  it('continues from the first anchor by turning the path around', () => {
    const path: PathData = { closed: false, anchors: [makeAnchor(0, 0), makeAnchor(10, 0), makeAnchor(20, 0)] };
    path.anchors[0].ox = 4;
    expect(continueFrom(path, 2)).toBe(2);
    expect(path.anchors[0].x).toBe(0);
    expect(continueFrom(path, 0)).toBe(2);
    expect(path.anchors[2].x).toBe(0);
    expect(path.anchors[2].ix).toBe(4);
  });
});
