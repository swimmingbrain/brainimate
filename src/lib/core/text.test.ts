import { describe, expect, it } from 'vitest';
import { cachedLayout, layoutText, outlineContours, type FontLike, type TextSettings } from './text';

// 1000 units to the em: letters 500 wide, a space 250, W 1000, and A V kerned together by 100
const fake: FontLike = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  advance: (ch) => (ch === ' ' ? 250 : ch === 'W' ? 1000 : 500),
  kerning: (a, b) => (a === 'A' && b === 'V' ? -100 : 0),
  outline: () => []
};

// size 10 makes a letter 5 wide and a space 2.5
function settings(over: Partial<TextSettings> = {}): TextSettings {
  return { size: 10, lineHeight: 1.2, spacing: 0, align: 'left', width: null, ...over };
}

function lineTexts(text: string, s: TextSettings): string[] {
  return layoutText(text, fake, s).lines.map((l) => text.slice(l.start, l.end));
}

describe('text layout', () => {
  it('splits lines on newlines and stands them like css lines', () => {
    const layout = layoutText('ab\ncd', fake, settings());
    expect(layout.lines.map((l) => [l.start, l.end])).toEqual([
      [0, 2],
      [3, 5]
    ]);
    // a 12 high line holds 8 above and 2 below the baseline, the 2 left over split around them
    expect(layout.lines.map((l) => l.baseline)).toEqual([9, 21]);
    expect(layout.glyphs.map((g) => [g.ch, g.x])).toEqual([
      ['a', 0],
      ['b', 5],
      ['c', 0],
      ['d', 5]
    ]);
    expect(layout.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 24 });
  });

  it('aligns point text around its origin', () => {
    expect(layoutText('ab', fake, settings({ align: 'center' })).lines[0].x).toBe(-5);
    expect(layoutText('ab', fake, settings({ align: 'right' })).lines[0].x).toBe(-10);
    const two = layoutText('a\nabc', fake, settings({ align: 'center' }));
    expect(two.lines.map((l) => l.x)).toEqual([-2.5, -7.5]);
    expect(two.bounds.minX).toBe(-7.5);
    expect(two.bounds.maxX).toBe(7.5);
  });

  it('aligns box text inside its width', () => {
    expect(layoutText('ab', fake, settings({ width: 30, align: 'center' })).lines[0].x).toBe(10);
    expect(layoutText('ab', fake, settings({ width: 30, align: 'right' })).lines[0].x).toBe(20);
    const box = layoutText('ab', fake, settings({ width: 30 }));
    expect([box.bounds.minX, box.bounds.maxX]).toEqual([0, 30]);
  });

  it('adds letter spacing between letters and kerns pairs', () => {
    const spaced = layoutText('abc', fake, settings({ spacing: 2 }));
    expect(spaced.glyphs.map((g) => g.x)).toEqual([0, 7, 14]);
    expect(spaced.lines[0].width).toBe(19);
    expect(layoutText('AV', fake, settings()).lines[0].width).toBe(9);
  });

  it('wraps whole words at the box width, spaces hang at the end', () => {
    expect(lineTexts('aa aa aa', settings({ width: 26 }))).toEqual(['aa aa ', 'aa']);
    const layout = layoutText('aa aa aa', fake, settings({ width: 26 }));
    expect(layout.lines.map((l) => l.width)).toEqual([22.5, 10]);
    expect(lineTexts('aa aa aa', settings({ width: 40 }))).toEqual(['aa aa aa']);
    expect(lineTexts('aa aa aa', settings({ width: 10 }))).toEqual(['aa ', 'aa ', 'aa']);
  });

  it('cuts a word wider than the box between letters', () => {
    expect(lineTexts('aaaaaaa', settings({ width: 12 }))).toEqual(['aa', 'aa', 'aa', 'a']);
    expect(lineTexts('W', settings({ width: 3 }))).toEqual(['W']);
  });

  it('keeps an empty line for empty text and between two newlines', () => {
    expect(lineTexts('', settings())).toEqual(['']);
    expect(lineTexts('a\n\nb', settings({ width: 20 }))).toEqual(['a', '', 'b']);
  });

  it('gives the same layout object back for the same settings', () => {
    const a = cachedLayout('hello', fake, settings());
    expect(cachedLayout('hello', fake, settings())).toBe(a);
    expect(cachedLayout('hello', fake, settings({ size: 11 }))).not.toBe(a);
  });
});

describe('glyph outlines', () => {
  it('folds the closing point of a contour into the first one', () => {
    const contours = outlineContours([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 10 },
      { type: 'L', x: 0, y: 0 },
      { type: 'Z' }
    ]);
    expect(contours).toHaveLength(1);
    expect(contours[0].closed).toBe(true);
    expect(contours[0].anchors.map((a) => [a.x, a.y])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ]);
  });

  it('raises quadratic curves to cubic handles', () => {
    const [c] = outlineContours([
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 30, y1: 0, x: 30, y: 30 },
      { type: 'Z' }
    ]);
    expect([c.anchors[0].ox, c.anchors[0].oy]).toEqual([20, 0]);
    expect([c.anchors[1].ix, c.anchors[1].iy]).toEqual([0, -20]);
  });

  it('keeps each contour of a glyph with a hole', () => {
    const ring = outlineContours([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
      { type: 'M', x: 2, y: 2 },
      { type: 'L', x: 2, y: 8 },
      { type: 'L', x: 8, y: 8 },
      { type: 'Z' }
    ]);
    expect(ring).toHaveLength(2);
  });
});
