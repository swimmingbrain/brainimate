import { describe, expect, it } from 'vitest';
import { catmullRom, rebuildSmooth, smoothPath } from './smooth';
import { pointAt } from './bezier';
import { segmentCubic } from './path';
import { rectPath } from './shapes';

describe('catmull rom', () => {
  it('passes through every point with handles in line', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 0 }
    ];
    const path = catmullRom(pts, false);
    expect(path.anchors.map((a) => [a.x, a.y])).toEqual(pts.map((p) => [p.x, p.y]));
    const mid = path.anchors[1];
    expect(mid.kind).toBe('smooth');
    // the tangent runs along the line between the neighbours
    expect(mid.oy).toBeCloseTo(0);
    expect(mid.iy).toBeCloseTo(0);
    expect(mid.ox).toBeGreaterThan(0);
    expect(mid.ix).toBeLessThan(0);
  });

  it('leaves the outer handles of an open path empty and corners sharp', () => {
    const path = catmullRom(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
        { x: 30, y: 10 }
      ],
      false,
      [false, false, true, false]
    );
    expect(Math.hypot(path.anchors[0].ix, path.anchors[0].iy)).toBe(0);
    expect(Math.hypot(path.anchors[3].ox, path.anchors[3].oy)).toBe(0);
    expect(path.anchors[2]).toMatchObject({ ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' });
  });

  it('makes four points on a circle come out round', () => {
    const r = 100;
    const path = catmullRom(
      [
        { x: 0, y: -r },
        { x: r, y: 0 },
        { x: 0, y: r },
        { x: -r, y: 0 }
      ],
      true
    );
    expect(path.closed).toBe(true);
    for (let i = 0; i < 4; i++) {
      const p = pointAt(segmentCubic(path, i), 0.5);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(r * 0.99);
      expect(Math.hypot(p.x, p.y)).toBeLessThan(r * 1.01);
    }
  });

  it('smooths every anchor of a path and rebuilds after a move', () => {
    const path = rectPath(0, 0, 100, 100);
    smoothPath(path);
    expect(path.anchors.every((a) => a.kind === 'smooth' && (a.ox !== 0 || a.oy !== 0))).toBe(true);
    path.anchors[0].x = -50;
    rebuildSmooth(path);
    expect(path.anchors[1].ix).not.toBe(0);
  });
});
