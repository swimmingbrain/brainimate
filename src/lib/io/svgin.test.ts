import { describe, expect, it } from 'vitest';
import type { GroupItem, ImageItem, Item, Mat, PathItem, TextItem } from '$lib/core/types';
import { applyPoint, multiply } from '$lib/core/mat';
import { pathArea } from '$lib/core/path';
import { readSvg, type SvgNode } from './svgin';

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// a small xml reader for the tests, the app reads files with DOMParser
function xml(text: string): SvgNode {
  const src = text
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const root: SvgNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of src.matchAll(re)) {
    if (m[1] !== undefined || m[6] !== undefined) {
      const t = m[1] ?? decode(m[6]);
      for (const n of stack) n.text += t;
      continue;
    }
    if (m[2]) {
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
    const node: SvgNode = { tag: m[3], attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root.children[0];
}

function read(svg: string) {
  return readSvg(xml(svg), 'Test');
}

function children(item: Item | null): Item[] {
  return item?.type === 'group' ? item.children : [];
}

function at(m: Mat, x: number, y: number) {
  const p = applyPoint(m, { x, y });
  return [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000];
}

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

describe('svg import', () => {
  it('reads a rect with an illustrator class style', () => {
    const r = read(`<svg ${NS} viewBox="0 0 100 50">
      <defs><style type="text/css"><![CDATA[ .st0{fill:#E30613;stroke:#000;stroke-width:2} ]]></style></defs>
      <rect class="st0" x="10" y="5" width="30" height="20" fill="blue"/>
    </svg>`);
    const item = r.item as PathItem;
    expect(item.type).toBe('path');
    expect(item.skin).toBeNull();
    expect(item.path.closed).toBe(true);
    expect(item.path.anchors.map((a) => [a.x, a.y])).toEqual([
      [10, 5],
      [40, 5],
      [40, 25],
      [10, 25]
    ]);
    expect(item.style.fill).toEqual({ type: 'solid', color: '#e30613', alpha: 1 });
    expect(item.style.stroke).toEqual({ type: 'solid', color: '#000000', alpha: 1 });
    expect(item.style.width).toBe(2);
    expect(item.style.cap).toBe('butt');
    expect(r.width).toBe(100);
  });

  it('lets the style attribute win over classes and classes over attributes', () => {
    const r = read(`<svg ${NS}><style>.a{fill:red} rect{fill:green}</style>
      <rect class="a" width="5" height="5" style="fill: rgb(0, 0, 255); opacity: .5"/>
      <rect class="a" width="5" height="5" fill="yellow"/>
      <rect width="5" height="5" fill="yellow"/>
    </svg>`);
    const fills = children(r.item).map((i) => (i as PathItem).style.fill);
    expect(fills.map((f) => (f?.type === 'solid' ? f.color : null))).toEqual(['#0000ff', '#ff0000', '#008000']);
    expect(children(r.item)[0].opacity).toBe(0.5);
  });

  it('turns arcs and quadratic curves into cubics through the same points', () => {
    const d = 'M10 10 Q 20 0 30 10 T 50 10 A 10 10 0 0 1 70 10 L 70 30 Z';
    const r = read(`<svg ${NS}><path d="${d}" fill="red"/></svg>`);
    const item = r.item as PathItem;
    expect(item.path.closed).toBe(true);
    const points = item.path.anchors.map((a) => [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100]);
    expect(points[0]).toEqual([10, 10]);
    for (const p of [
      [30, 10],
      [50, 10],
      [70, 10],
      [70, 30]
    ]) {
      expect(points).toContainEqual(p);
    }
    // the quadratic left the first anchor with a handle two thirds toward its control point
    expect(item.path.anchors[0].ox).toBeCloseTo(20 / 3, 6);
    expect(item.path.anchors[0].oy).toBeCloseTo(-20 / 3, 6);
    // the arc bulges up to y = 0 between 50 and 70
    expect(item.path.anchors.some((a) => Math.abs(a.y) < 0.01 && a.x > 55 && a.x < 65)).toBe(true);
  });

  it('keeps groups with nested transforms and maps the viewBox', () => {
    const r = read(`<svg ${NS} width="200" height="100" viewBox="0 0 100 50">
      <g transform="translate(10 20)" id="outer">
        <g transform="scale(2)"><rect width="5" height="5"/></g>
        <circle cx="0" cy="0" r="1"/>
      </g>
    </svg>`);
    const outer = r.item as GroupItem;
    expect(outer.type).toBe('group');
    expect(outer.name).toBe('outer');
    const inner = outer.children[0] as GroupItem;
    const rect = inner.children[0];
    const world = multiply(outer.transform, multiply(inner.transform, rect.transform));
    expect(at(world, 5, 5)).toEqual([40, 60]);
    expect(outer.children[1].type).toBe('path');
    expect(r.width).toBe(200);
  });

  it('reads gradients with href, bounding box units, user space and a transform', () => {
    const r = read(`<svg ${NS} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="base">
          <stop offset="0" stop-color="#000"/><stop offset="100%" stop-color="#fff" stop-opacity=".5"/>
        </linearGradient>
        <linearGradient id="g" xlink:href="#base" x1="0" y1="0" x2="1" y2="0"/>
        <linearGradient id="u" href="#base" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0"
          gradientTransform="translate(5 0)"/>
        <radialGradient id="r" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>
        </radialGradient>
      </defs>
      <rect x="10" y="10" width="40" height="20" fill="url(#g)"/>
      <rect x="0" y="0" width="10" height="10" fill="url(#u)" fill-opacity="0.5"/>
      <circle cx="50" cy="50" r="10" style="fill:url('#r')"/>
    </svg>`);
    const [a, b, c] = children(r.item) as PathItem[];
    expect(a.style.fill).toMatchObject({ type: 'linear', x1: 10, y1: 10, x2: 50, y2: 10 });
    const fill = a.style.fill;
    expect(fill?.type === 'linear' && fill.stops).toEqual([
      { t: 0, color: '#000000', alpha: 1 },
      { t: 1, color: '#ffffff', alpha: 0.5 }
    ]);
    expect(b.style.fill).toMatchObject({ type: 'linear', x1: 5, y1: 0, x2: 15, y2: 0 });
    const half = b.style.fill;
    expect(half?.type === 'linear' && half.stops[0].alpha).toBe(0.5);
    expect(c.style.fill).toMatchObject({ type: 'radial', cx: 50, cy: 50, r: 10, fx: 50, fy: 50 });
  });

  it('keeps a skewed linear gradient square to its color lines', () => {
    const r = read(`<svg ${NS}><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x2="10"
      gradientTransform="skewX(45)"><stop offset="0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#g)"/></svg>`);
    const fill = (r.item as PathItem).style.fill;
    expect(fill?.type).toBe('linear');
    if (fill?.type !== 'linear') return;
    // skewX keeps vertical lines slanted at 45 degrees, the vector runs across them
    expect(fill.x2 - fill.x1).toBeCloseTo(5, 6);
    expect(fill.y2 - fill.y1).toBeCloseTo(-5, 6);
  });

  it('skips illustrator data and counts clip paths it leaves out', () => {
    const r = read(`<svg ${NS} xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/">
      <switch>
        <foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/" width="1" height="1">
          <i:pgfRef xlink:href="#adobe_illustrator_pgf"/>
        </foreignObject>
        <g i:extraneous="self"><circle cx="5" cy="5" r="5" clip-path="url(#c)"/><rect width="2" height="2"/></g>
      </switch>
      <clipPath id="c"><rect width="3" height="3"/></clipPath>
      <i:pgf id="adobe_illustrator_pgf">AAAA</i:pgf>
    </svg>`);
    expect(r.item?.type).toBe('group');
    expect(children(r.item)).toHaveLength(2);
    expect(r.skipped).toBe(1);
  });

  it('reads text into a text item with its font settings', () => {
    const r = read(`<svg ${NS}><text x="10" y="40" font-family="'Instrument Serif', serif" font-size="20px"
      font-weight="bold" text-anchor="middle" fill="#333" letter-spacing="2"><tspan x="10" y="40">Hi</tspan><tspan
      x="10" dy="30">there</tspan></text>
      <text transform="translate(5 5)" style="font-family: Inter-Bold; font-size: 10px">One</text>
      <text>Hello <tspan font-weight="bold">world</tspan></text></svg>`);
    const [a, b, c] = children(r.item) as TextItem[];
    expect(c.text).toBe('Hello world');
    expect(a.type).toBe('text');
    expect(a.text).toBe('Hi\nthere');
    expect(a.font).toBe('Instrument Serif');
    expect(a.size).toBe(20);
    expect(a.weight).toBe(700);
    expect(a.align).toBe('center');
    expect(a.spacing).toBe(2);
    expect(a.lineHeight).toBe(1.5);
    expect(a.style.fill).toEqual({ type: 'solid', color: '#333333', alpha: 1 });
    expect(a.transform[4]).toBe(10);
    expect(a.transform[5]).toBeLessThan(40);
    expect(b.font).toBe('Inter');
    expect(b.weight).toBe(700);
    expect(b.text).toBe('One');
  });

  it('expands use and symbol in place and reads basic shapes and pictures', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const r = read(`<svg ${NS}>
      <symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></symbol>
      <use href="#s" x="20" y="30"/>
      <polygon points="0,0 10,0 5,8" fill="green"/>
      <polyline points="0 0 5 5 10 0" fill="none" stroke="black"/>
      <line x1="0" y1="0" x2="10" y2="10" stroke="black"/>
      <ellipse cx="5" cy="5" rx="4" ry="2"/>
      <image href="${png}" x="1" y="2" width="30" height="20"/>
    </svg>`);
    const list = children(r.item);
    expect(list.map((i) => i.type)).toEqual(['group', 'path', 'path', 'path', 'path', 'image']);
    const use = list[0] as GroupItem;
    expect(at(multiply(use.transform, use.children[0].transform), 10, 10)).toEqual([30, 40]);
    expect((list[1] as PathItem).path.closed).toBe(true);
    expect((list[2] as PathItem).path.closed).toBe(false);
    expect((list[2] as PathItem).style.fill).toBeNull();
    expect((list[4] as PathItem).path.anchors).toHaveLength(4);
    const image = list[5] as ImageItem;
    expect(r.assets).toHaveLength(1);
    expect(r.assets[0].data).toBe(png);
    expect(image.asset).toBe(r.assets[0].id);
    expect(at(image.transform, 0, 0)).toEqual([1, 2]);
  });

  it('scales a symbol with a viewBox to the size its use asks for', () => {
    const r = read(`<svg ${NS}><symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>
      <use href="#s" x="5" y="5" width="40" height="20"/></svg>`);
    const use = r.item as GroupItem;
    const m = multiply(use.transform, use.children[0].transform);
    // 10 by 10 into 40 by 20 is a scale of 2, centered across
    expect(at(m, 0, 0)).toEqual([15, 5]);
    expect(at(m, 10, 10)).toEqual([35, 25]);
  });

  it('turns the inner contours of an even odd path into holes', () => {
    const r = read(`<svg ${NS}><path fill-rule="evenodd" d="M0 0H10V10H0Z M2 2H8V8H2Z M20 0 L30 0"/></svg>`);
    const [shape, open] = children(r.item) as PathItem[];
    expect(shape.subpaths).toHaveLength(1);
    expect(Math.sign(pathArea(shape.subpaths[0]))).toBe(-Math.sign(pathArea(shape.path)));
    expect(open.path.closed).toBe(false);
  });
});
