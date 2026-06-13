import { describe, expect, it } from 'vitest';
import { straightenStroke } from './recognize';
import { decompose } from './mat';
import type { Vec } from './types';

// a wobbly hand drawn outline through the corners, starting in the middle of a side
function sketch(corners: Vec[], per = 12): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const wobble = Math.sin(i * 7 + k) * 1.5;
      out.push({ x: a.x + (b.x - a.x) * t + wobble, y: a.y + (b.y - a.y) * t - wobble });
    }
  }
  const half = Math.floor(per / 2);
  return [...out.slice(half), ...out.slice(0, half)];
}

describe('straighten', () => {
  it('turns a rough box into a rect', () => {
    const pts = sketch([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 }
    ]);
    const out = straightenStroke(pts, 6, true);
    expect(out.name).toBe('Rectangle');
    const d = decompose(out.transform);
    expect(d.x).toBeCloseTo(100, -1);
    expect(d.y).toBeCloseTo(50, -1);
    expect(d.rotation).toBe(0);
  });

  it('turns a rough circle into an ellipse', () => {
    const pts: Vec[] = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r = 80 + Math.sin(i * 3) * 4;
      pts.push({ x: 300 + Math.cos(a) * r, y: 200 + Math.sin(a) * r * 0.6 });
    }
    const out = straightenStroke(pts, 6, true);
    expect(out.name).toBe('Ellipse');
    expect(out.path.anchors).toHaveLength(4);
    const d = decompose(out.transform);
    expect(d.x).toBeCloseTo(300, -1);
  });

  it('keeps an open zigzag as straight segments', () => {
    const pts: Vec[] = [];
    for (let i = 0; i <= 40; i++) pts.push({ x: i * 5, y: (i % 10 < 5 ? i % 10 : 10 - (i % 10)) * 10 });
    const out = straightenStroke(pts, 3, false);
    expect(out.name).toBe('Pencil');
    expect(out.path.closed).toBe(false);
    expect(out.path.anchors.length).toBeGreaterThan(4);
    expect(out.path.anchors.length).toBeLessThan(15);
    expect(out.path.anchors.every((a) => a.ox === 0 && a.ix === 0)).toBe(true);
  });

  it('a closed triangle stays a polygon', () => {
    const pts = sketch([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 90 }
    ]);
    const out = straightenStroke(pts, 6, true);
    expect(out.name).toBe('Pencil');
    expect(out.path.closed).toBe(true);
    expect(out.path.anchors).toHaveLength(3);
  });
});
