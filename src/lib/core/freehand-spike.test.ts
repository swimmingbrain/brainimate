import { describe, expect, it } from 'vitest';
import { outlineToPath, strokeOutline, type InkPoint } from './freehand';
import { fitCubics } from './fit';

// the box of the anchors and their handles
function reach(anchors: { x: number; y: number; ix: number; iy: number; ox: number; oy: number }[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const a of anchors) {
    xs.push(a.x, a.x + a.ix, a.x + a.ox);
    ys.push(a.y, a.y + a.iy, a.y + a.oy);
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('a fast stroke with few points', () => {
  it('keeps its outline next to the stroke, no spike runs off', () => {
    // a quick straight stroke on a tablet: six points far apart, the way a fast pencil or a finger at a
    // low event rate sends them, at the zoom a 1080 by 1920 stage has on an ipad
    for (const [step, size] of [
      [95, 6],
      [60, 11],
      [120, 3]
    ]) {
      const points: InkPoint[] = Array.from({ length: 6 }, (_, i) => ({ x: 100 + i * step, y: 200 + i * step * 0.25, pressure: 0.8 }));
      const options = { size, thinning: 0.6, smoothing: 0.38, streamline: 0.31, simulatePressure: false, last: true };
      const outline = strokeOutline(points, options);
      const path = outlineToPath(outline, points, size, 0.76);
      const box = reach(path.anchors);
      const end = points[points.length - 1];
      const margin = size * 3;
      expect(box.maxX, `step ${step}`).toBeLessThanOrEqual(end.x + margin);
      expect(box.minX).toBeGreaterThanOrEqual(points[0].x - margin);
      expect(box.maxY).toBeLessThanOrEqual(end.y + margin);
      expect(box.minY).toBeGreaterThanOrEqual(points[0].y - margin);
    }
  });

  it('never gives a handle longer than the piece of curve it shapes', () => {
    const line = Array.from({ length: 5 }, (_, i) => ({ x: i * 100, y: i * 25 + (i % 2) * 0.01 }));
    for (const c of fitCubics(line, 0.5)) {
      const chord = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y);
      expect(Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y)).toBeLessThanOrEqual(chord + 1e-9);
      expect(Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y)).toBeLessThanOrEqual(chord + 1e-9);
      for (const p of c) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});
