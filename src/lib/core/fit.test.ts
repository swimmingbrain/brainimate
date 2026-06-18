import { describe, expect, it } from 'vitest';
import { closeChain, cubicsToAnchors, fitCubics, fitPath } from './fit';
import { nearestSegment, pathArea } from './path';
import { dropClose, pointInPolygon, polygonArea, simplifyPolyline } from './polygon';

function wave(n: number) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: i * 4, y: Math.sin(i / 6) * 30 });
  return pts;
}

describe('fit', () => {
  it('fits freehand points within the tolerance with few anchors', () => {
    const pts = wave(60);
    const path = fitPath(pts, 1);
    expect(path.closed).toBe(false);
    expect(path.anchors.length).toBeLessThan(10);
    for (const p of pts) expect(nearestSegment(path, p)!.d).toBeLessThan(1.5);
    expect(path.anchors[0]).toMatchObject({ x: 0, y: 0, ix: 0, iy: 0 });
  });

  it('marks the joints between fitted cubics smooth', () => {
    const path = fitPath(wave(120), 0.5);
    const inner = path.anchors.slice(1, -1);
    expect(inner.length).toBeGreaterThan(0);
    for (const a of inner) expect(a.kind).not.toBe('corner');
  });

  it('a looser tolerance gives fewer anchors', () => {
    const pts = wave(120);
    expect(fitPath(pts, 10).anchors.length).toBeLessThanOrEqual(fitPath(pts, 0.5).anchors.length);
  });

  it('closes a ring and joins its seam', () => {
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * 50, y: Math.sin(a) * 50 });
    }
    const path = fitPath(pts, 0.5, true);
    expect(path.closed).toBe(true);
    expect(Math.abs(pathArea(path))).toBeGreaterThan(Math.PI * 2500 * 0.97);
  });

  it('keeps a ring a ring even with a loose tolerance', () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * 50, y: Math.sin(a) * 50 });
    }
    const path = fitPath(pts, 40, true);
    expect(path.closed).toBe(true);
    expect(path.anchors.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(pathArea(path))).toBeGreaterThan(Math.PI * 2500 * 0.8);
  });

  it('copes with two points and repeated points', () => {
    expect(fitCubics([{ x: 0, y: 0 }, { x: 0, y: 0 }], 1)).toHaveLength(0);
    const line = cubicsToAnchors(fitCubics([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1));
    expect(line).toHaveLength(2);
    expect(closeChain(line)).toHaveLength(2);
  });
});

describe('polygon', () => {
  it('measures signed area and tells inside from outside', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(-100);
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });

  it('drops close points and keeps the corners of a polyline', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 }
    ];
    expect(dropClose(pts, 1)).toHaveLength(5);
    expect(simplifyPolyline(pts, 1)).toEqual([pts[0], pts[3], pts[5]]);
  });
});
