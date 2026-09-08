import { describe, expect, it } from 'vitest';
import { applyPoint } from '$lib/core/mat';
import {
  numbers,
  parseColor,
  parseDeclarations,
  parseLength,
  parseStylesheet,
  parseTransform,
  ruleMatches
} from './svgparse';

function near(a: number[], b: number[]) {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
}

describe('svg attribute readers', () => {
  it('reads number lists the way svg packs them', () => {
    expect(numbers('1,2 3-4.5.5e1')).toEqual([1, 2, 3, -4.5, 5]);
    expect(numbers(undefined)).toEqual([]);
  });

  it('reads lengths with units and percentages', () => {
    expect(parseLength('12')).toBe(12);
    expect(parseLength('12px')).toBe(12);
    expect(parseLength('1in')).toBe(96);
    expect(parseLength('50%', 0, 300)).toBe(150);
    expect(parseLength('auto', 7)).toBe(7);
  });

  it('reads transforms left to right', () => {
    near(parseTransform('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20]);
    near(parseTransform('matrix(1,0,0,1,5,6)'), [1, 0, 0, 1, 5, 6]);
    const r = parseTransform('rotate(90 10 10)');
    const p = applyPoint(r, { x: 20, y: 10 });
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo(20, 6);
    near(parseTransform('skewX(45)'), [1, 0, 1, 1, 0, 0]);
    near(parseTransform(''), [1, 0, 0, 1, 0, 0]);
  });

  it('reads colors in hex, rgb, with alpha and by name', () => {
    expect(parseColor('#f00')).toEqual({ color: '#ff0000', alpha: 1 });
    expect(parseColor('#00ff0080')!.alpha).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(0, 0, 255)')).toEqual({ color: '#0000ff', alpha: 1 });
    expect(parseColor('rgba(255,0,0,0.25)')).toEqual({ color: '#ff0000', alpha: 0.25 });
    expect(parseColor('rgb(100% 0% 0% / 50%)')).toEqual({ color: '#ff0000', alpha: 0.5 });
    expect(parseColor('Navy')).toEqual({ color: '#000080', alpha: 1 });
    expect(parseColor('url(#a)')).toBeNull();
  });

  it('reads declarations and class rules like illustrator writes them', () => {
    expect(parseDeclarations('fill: red; stroke-width:2 !important;')).toEqual({ fill: 'red', 'stroke-width': '2' });
    const rules = parseStylesheet('/* c */ .st0{fill:#E30613;} .cls-1, rect.big { stroke: blue } g .x { fill: red }');
    expect(rules).toHaveLength(3);
    expect(rules[0]).toMatchObject({ classes: ['st0'], declarations: { fill: '#E30613' } });
    expect(ruleMatches(rules[0], 'path', ['st0'], undefined)).toBe(true);
    expect(ruleMatches(rules[2], 'circle', ['big'], undefined)).toBe(false);
    expect(ruleMatches(rules[2], 'rect', ['big'], undefined)).toBe(true);
    expect(rules[2].specificity).toBeGreaterThan(rules[1].specificity);
  });
});
