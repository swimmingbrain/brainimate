import { describe, expect, it } from 'vitest';
import { closeIfMeeting, joinTwo, simplifyPath, strokePieces } from './pathops';
import { cutPath } from './erase';
import { outlineToPath, strokeOutline } from './freehand';
import { combine } from './boolean';
import { ellipsePath, linePath, rectPath } from './shapes';
import { flattenPath, makeAnchor, pathArea } from './path';
import type { PathData } from './types';

function polyline(points: [number, number][], closed = false): PathData {
  return { closed, anchors: points.map(([x, y]) => makeAnchor(x, y)) };
}

describe('join', () => {
  it('joins two open paths at their closest ends', () => {
    const a = linePath(0, 0, 10, 0);
    const b = linePath(30, 0, 10.2, 0);
    const out = joinTwo(a, b);
    expect(out.anchors.map((p) => p.x)).toEqual([0, 10, 30]);
    expect(out.closed).toBe(false);
  });

  it('closes when both ends meet', () => {
    const a = polyline([
      [0, 0],
      [10, 0],
      [10, 10]
    ]);
    const b = polyline([
      [10, 10],
      [0, 10],
      [0, 0]
    ]);
    const out = joinTwo(a, b);
    expect(out.closed).toBe(true);
    expect(out.anchors).toHaveLength(4);
    expect(closeIfMeeting(linePath(0, 0, 5, 5)).closed).toBe(false);
  });
});

describe('simplify', () => {
  it('keeps the corners of a rect', () => {
    const out = simplifyPath(rectPath(0, 0, 100, 50), 1);
    expect(out.closed).toBe(true);
    expect(out.anchors).toHaveLength(4);
    expect(Math.abs(pathArea(out))).toBeCloseTo(5000, 0);
  });

  it('merges points on a straight line and smooths a dense curve', () => {
    const line = simplifyPath(
      polyline([
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0]
      ]),
      1
    );
    expect(line.anchors).toHaveLength(2);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 80; i++) pts.push([i * 2, Math.sin(i / 10) * 20]);
    expect(simplifyPath(polyline(pts), 1).anchors.length).toBeLessThan(12);
  });
});

describe('cut', () => {
  const box = [
    { x: 40, y: -10 },
    { x: 60, y: -10 },
    { x: 60, y: 10 },
    { x: 40, y: 10 }
  ];

  it('cuts a line in two where the polygon crosses it', () => {
    const out = cutPath(linePath(0, 0, 100, 0), box)!;
    expect(out).toHaveLength(2);
    expect(out[0].anchors.map((a) => Math.round(a.x))).toEqual([0, 40]);
    expect(out[1].anchors.map((a) => Math.round(a.x))).toEqual([60, 100]);
    expect(out[0].anchors[0].ox).toBe(0);
  });

  it('leaves an untouched path alone and removes a covered one', () => {
    expect(cutPath(linePath(0, 50, 100, 50), box)).toBeNull();
    expect(cutPath(linePath(45, 0, 55, 0), box)).toEqual([]);
  });

  it('keeps one open path when a ring is cut once', () => {
    const out = cutPath(ellipsePath(50, 50, 50, 50), [
      { x: 40, y: -10 },
      { x: 60, y: -10 },
      { x: 60, y: 10 },
      { x: 40, y: 10 }
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(false);
  });
});

describe('outline', () => {
  it('outlines a stroke into pieces whose union covers the band', async () => {
    const pieces = strokePieces(linePath(0, 0, 100, 0), 10, 'butt', 'miter');
    const out = await combine(
      'unite',
      pieces.map((p) => [p])
    );
    expect(out).toHaveLength(1);
    expect(Math.abs(pathArea(out[0].path))).toBeCloseTo(1000, 0);
  });

  it('adds round caps and joins', async () => {
    const pieces = strokePieces(
      polyline([
        [0, 0],
        [100, 0],
        [100, 100]
      ]),
      10,
      'round',
      'round'
    );
    const out = await combine(
      'unite',
      pieces.map((p) => [p])
    );
    expect(out).toHaveLength(1);
    const area = Math.abs(pathArea(out[0].path));
    expect(area).toBeGreaterThan(2000);
    expect(area).toBeLessThan(2000 + Math.PI * 25 + 1);
  });
});

describe('brush outline', () => {
  it('turns a freehand outline into one closed path', () => {
    const stroke = [];
    for (let i = 0; i <= 40; i++) stroke.push({ x: i * 5, y: Math.sin(i / 8) * 20, pressure: 0.5 });
    const outline = strokeOutline(stroke, {
      size: 10,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.3,
      simulatePressure: false,
      last: true
    });
    const path = outlineToPath(outline, stroke, 10, 0.5);
    expect(path.closed).toBe(true);
    expect(path.anchors.length).toBeLessThan(outline.length / 2);
    expect(Math.abs(pathArea(path))).toBeGreaterThan(1500);
    expect(flattenPath(path).length).toBeGreaterThan(10);
  });
});
