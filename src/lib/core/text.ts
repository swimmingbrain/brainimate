import type { Anchor, PathData } from './types';
import type { Box } from './bbox';

// what text layout needs from a font, measured in font units. a fake one does for the tests
export interface FontLike {
  unitsPerEm: number;
  ascender: number;
  // below the baseline, negative like in the font tables
  descender: number;
  advance(ch: string): number;
  kerning(left: string, right: string): number;
  // the glyph outline at size with its baseline origin on (x, y), y pointing down
  outline(ch: string, x: number, y: number, size: number): OutlineCommand[];
}

export interface OutlineCommand {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface TextSettings {
  size: number;
  // a multiple of the size
  lineHeight: number;
  // added after every letter, in pixels at the size
  spacing: number;
  align: 'left' | 'center' | 'right';
  // box text wraps at this width, point text has none
  width: number | null;
}

export interface PlacedGlyph {
  ch: string;
  // where the glyph's origin sits, on the baseline of its line
  x: number;
  baseline: number;
  // the index of the character in the text
  index: number;
}

export interface TextLine {
  // text indexes, end is not included and the newline is not part of the line
  start: number;
  end: number;
  x: number;
  // without the spaces at the end
  width: number;
  top: number;
  baseline: number;
}

export interface TextLayout {
  font: FontLike;
  size: number;
  lines: TextLine[];
  glyphs: PlacedGlyph[];
  // the line boxes, not the ink: the box text width across, the lines down
  bounds: Box;
  lineStep: number;
}

// how far text from..to reaches, letter spacing after every letter but the last
export function measure(
  font: FontLike,
  text: string,
  from: number,
  to: number,
  scale: number,
  spacing: number
): number {
  let w = 0;
  for (let i = from; i < to; i++) {
    w += font.advance(text[i]) * scale;
    if (i + 1 < to) w += font.kerning(text[i], text[i + 1]) * scale + spacing;
  }
  return w;
}

function trimEnd(text: string, from: number, to: number): number {
  let end = to;
  while (end > from && text[end - 1] === ' ') end--;
  return end;
}

// greedy: as many whole words as fit, spaces at the end of a line hang over the edge, a word
// longer than the whole width is broken between letters
export function wrapParagraph(
  font: FontLike,
  text: string,
  from: number,
  to: number,
  max: number,
  scale: number,
  spacing: number
): [number, number][] {
  const out: [number, number][] = [];
  let start = from;
  while (start < to) {
    let end = start;
    let i = start;
    while (i < to) {
      let j = i;
      while (j < to && text[j] === ' ') j++;
      while (j < to && text[j] !== ' ') j++;
      const w = measure(font, text, start, trimEnd(text, start, j), scale, spacing);
      if (w > max) {
        if (end === start) {
          // the first word alone is too wide, it is cut where it stops fitting
          let k = start + 1;
          while (k < j && measure(font, text, start, k + 1, scale, spacing) <= max) k++;
          end = k;
        }
        break;
      }
      end = j;
      i = j;
    }
    while (end < to && text[end] === ' ') end++;
    out.push([start, end]);
    start = end;
  }
  if (out.length === 0) out.push([from, from]);
  return out;
}

// lines on newlines and on the box width, glyphs placed with kerning and letter spacing, each line
// aligned in the box or around the origin. lines stand like css lines: the extra height of the line
// height goes half above and half below the letters
export function layoutText(text: string, font: FontLike, s: TextSettings): TextLayout {
  const scale = s.size / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const descent = -font.descender * scale;
  const lineStep = s.size * s.lineHeight;
  const lead = (lineStep - (ascent + descent)) / 2;

  const ranges: [number, number][] = [];
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== '\n') continue;
    if (s.width === null) ranges.push([from, i]);
    else ranges.push(...wrapParagraph(font, text, from, i, Math.max(s.width, 1), scale, s.spacing));
    from = i + 1;
  }

  const lines: TextLine[] = [];
  const glyphs: PlacedGlyph[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  ranges.forEach(([start, end], n) => {
    const width = measure(font, text, start, trimEnd(text, start, end), scale, s.spacing);
    let x = 0;
    if (s.width !== null) {
      if (s.align === 'center') x = (s.width - width) / 2;
      else if (s.align === 'right') x = s.width - width;
    } else if (s.align === 'center') x = -width / 2;
    else if (s.align === 'right') x = -width;
    const top = n * lineStep;
    const baseline = top + lead + ascent;
    lines.push({ start, end, x, width, top, baseline });
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + width);
    let gx = x;
    for (let i = start; i < end; i++) {
      glyphs.push({ ch: text[i], x: gx, baseline, index: i });
      gx += font.advance(text[i]) * scale;
      if (i + 1 < end) gx += font.kerning(text[i], text[i + 1]) * scale + s.spacing;
    }
  });
  if (s.width !== null) {
    minX = 0;
    maxX = s.width;
  }
  const bounds = { minX, minY: 0, maxX, maxY: lines.length * lineStep };
  return { font, size: s.size, lines, glyphs, bounds, lineStep };
}

function corner(x: number, y: number): Anchor {
  return { x, y, ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' };
}

// handles that leave an anchor in opposite directions make a smooth anchor
function settle(a: Anchor) {
  const inLen = Math.hypot(a.ix, a.iy);
  const outLen = Math.hypot(a.ox, a.oy);
  if (inLen === 0 || outLen === 0) return;
  const cross = a.ix * a.oy - a.iy * a.ox;
  const dot = a.ix * a.ox + a.iy * a.oy;
  if (dot < 0 && Math.abs(cross) / (inLen * outLen) < 0.02) a.kind = 'smooth';
}

// font outline commands to our contours, quadratic curves raised to cubics. a closing point on top of
// the first one is folded into it
export function outlineContours(commands: OutlineCommand[]): PathData[] {
  const out: PathData[] = [];
  let cur: Anchor[] | null = null;
  const finish = (closed: boolean) => {
    if (!cur) return;
    if (closed && cur.length > 1) {
      const first = cur[0];
      const last = cur[cur.length - 1];
      if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
        first.ix = last.ix;
        first.iy = last.iy;
        cur.pop();
      }
    }
    cur.forEach(settle);
    if (cur.length > 1) out.push({ anchors: cur, closed });
    cur = null;
  };
  for (const c of commands) {
    const x = c.x ?? 0;
    const y = c.y ?? 0;
    if (c.type === 'M') {
      finish(false);
      cur = [corner(x, y)];
      continue;
    }
    if (c.type === 'Z') {
      finish(true);
      continue;
    }
    if (!cur) cur = [corner(x, y)];
    const prev = cur[cur.length - 1];
    const next = corner(x, y);
    if (c.type === 'Q') {
      const qx = c.x1 ?? x;
      const qy = c.y1 ?? y;
      prev.ox = ((qx - prev.x) * 2) / 3;
      prev.oy = ((qy - prev.y) * 2) / 3;
      next.ix = ((qx - x) * 2) / 3;
      next.iy = ((qy - y) * 2) / 3;
    } else if (c.type === 'C') {
      prev.ox = (c.x1 ?? prev.x) - prev.x;
      prev.oy = (c.y1 ?? prev.y) - prev.y;
      next.ix = (c.x2 ?? x) - x;
      next.iy = (c.y2 ?? y) - y;
    }
    cur.push(next);
  }
  finish(false);
  return out;
}

// about where the first baseline sits under the top of a text whose font is not there, most fonts
// put it close to this
export function approxBaseline(size: number, lineHeight: number): number {
  return (size * lineHeight - size * 1.2) / 2 + size * 0.95;
}

// the contours of every glyph, worked out once per layout
const outlines = new WeakMap<TextLayout, PathData[][]>();

export function glyphOutlines(layout: TextLayout): PathData[][] {
  let list = outlines.get(layout);
  if (!list) {
    list = layout.glyphs.map((g) =>
      g.ch === ' ' ? [] : outlineContours(layout.font.outline(g.ch, g.x, g.baseline, layout.size))
    );
    outlines.set(layout, list);
  }
  return list;
}

// one map of layouts per font, the same settings give the same layout object back
const layouts = new WeakMap<FontLike, Map<string, TextLayout>>();
const KEPT = 300;

export function cachedLayout(text: string, font: FontLike, s: TextSettings): TextLayout {
  let map = layouts.get(font);
  if (!map) {
    map = new Map();
    layouts.set(font, map);
  }
  const key = `${s.size}|${s.lineHeight}|${s.spacing}|${s.align}|${s.width}|${text}`;
  let layout = map.get(key);
  if (!layout) {
    layout = layoutText(text, font, s);
    if (map.size >= KEPT) map.delete(map.keys().next().value as string);
    map.set(key, layout);
  }
  return layout;
}
