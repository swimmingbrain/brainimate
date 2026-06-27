import { describe, expect, it } from 'vitest';
import {
  addStop,
  colorAt,
  convertPaint,
  cssPaint,
  fitGradient,
  gradientAngle,
  isFitted,
  makeGradient,
  reverseGradient,
  transformPaint,
  withAngle,
  type Gradient
} from './gradient';
import { fromRect } from './bbox';
import { multiply, scale, translate } from './mat';

const BW = [
  { t: 0, color: '#ffffff', alpha: 1 },
  { t: 1, color: '#000000', alpha: 1 }
];

describe('gradient', () => {
  it('turns a solid into a gradient that fades to black, and back', () => {
    const g = convertPaint({ type: 'solid', color: '#ff0000', alpha: 0.5 }, 'linear') as Gradient;
    expect(g.type).toBe('linear');
    expect(g.stops).toEqual([
      { t: 0, color: '#ff0000', alpha: 0.5 },
      { t: 1, color: '#000000', alpha: 1 }
    ]);
    expect(isFitted(g)).toBe(false);
    expect(convertPaint(g, 'solid')).toEqual({ type: 'solid', color: '#ff0000', alpha: 0.5 });
    const r = convertPaint(g, 'radial') as Gradient;
    expect(r.type).toBe('radial');
    expect(r.stops).toHaveLength(2);
  });

  it('fits across a box at an angle and keeps the angle', () => {
    const box = fromRect(0, 0, 100, 50);
    const g = fitGradient(makeGradient('linear', BW), box);
    expect(g).toMatchObject({ x1: 0, y1: 25, x2: 100, y2: 25 });
    const down = fitGradient(makeGradient('linear', BW), box, 90);
    expect(down.type === 'linear' && down.y1).toBeCloseTo(0);
    expect(down.type === 'linear' && down.y2).toBeCloseTo(50);
    expect(gradientAngle(down)).toBeCloseTo(90);
    const radial = fitGradient(makeGradient('radial', BW), box);
    expect(radial).toMatchObject({ cx: 50, cy: 25, r: 50, fx: 50, fy: 25 });
  });

  it('turns around its middle and reverses its stops', () => {
    const g = fitGradient(makeGradient('linear', BW), fromRect(0, 0, 100, 100));
    const turned = withAngle(g, 90);
    expect(turned.type === 'linear' && turned.x1).toBeCloseTo(50);
    expect(turned.type === 'linear' && turned.y1).toBeCloseTo(0);
    const rev = reverseGradient(g);
    expect(rev.stops.map((s) => s.color)).toEqual(['#000000', '#ffffff']);
  });

  it('moves with a matrix, a radial one scales its radius', () => {
    const r = fitGradient(makeGradient('radial', BW), fromRect(0, 0, 20, 20));
    const moved = transformPaint(r, multiply(translate(5, 0), scale(2)));
    expect(moved).toMatchObject({ cx: 25, cy: 20, r: 20 });
    expect(transformPaint(null, scale(2))).toBeNull();
  });

  it('reads colors between stops and adds a stop with that color', () => {
    const g = makeGradient('linear', BW);
    expect(colorAt(g, 0.5).color).toBe('#808080');
    const { paint, index } = addStop(g, 0.25);
    expect(index).toBe(1);
    expect(paint.stops[1].color).toBe('#bfbfbf');
  });

  it('writes css for the chips', () => {
    expect(cssPaint({ type: 'solid', color: '#ff0000', alpha: 1 })).toBe('#ff0000');
    expect(cssPaint({ type: 'solid', color: '#ff0000', alpha: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    expect(cssPaint(makeGradient('linear', BW))).toBe('linear-gradient(90deg, #ffffff 0%, #000000 100%)');
    expect(cssPaint(null)).toBeNull();
  });
});
