import { get } from 'svelte/store';
import { SVGPathData } from 'svg-pathdata';
import type { Asset, Item, Mat, Paint, PathData, Stop, Style } from '$lib/core/types';
import { applyPoint, applyVector, determinant, identity, isIdentity, multiply, translate } from '$lib/core/mat';
import { compoundBounds, orientHoles, polylineToPath } from '$lib/core/path';
import { ellipsePath, linePath, rectPath } from '$lib/core/shapes';
import { makeGroupItem, makeImageItem, makePathItem, makeTextItem } from '$lib/core/items';
import { makeAsset } from '$lib/core/assets';
import { approxBaseline, outlineContours, type OutlineCommand } from '$lib/core/text';
import { DEFAULT_FONT, fontFamilies, itemLayout, weightOf } from '$lib/core/fonts';
import { fromRect, isEmpty, type Box } from '$lib/core/bbox';
import {
  numbers,
  parseColor,
  parseDeclarations,
  parseLength,
  parseStylesheet,
  parseTransform,
  ruleMatches,
  type CssRule
} from './svgparse';

// an svg element as plain data: DOMParser fills it in the browser, the tests build it themselves
export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  text: string;
}

export interface SvgImport {
  // the drawing as one item, a group of everything or the only item there is
  item: Item | null;
  // pictures the drawing holds, they become assets of the document
  assets: Asset[];
  // clip paths and masks that were left out
  skipped: number;
  // pictures the file only links to, they cannot be read from here
  linked: number;
  width: number;
  height: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// elements of other namespaces keep their prefix, illustrator's i:pgf data is skipped by it
export function fromDom(el: Element): SvgNode {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  const tag = el.namespaceURI === SVG_NS ? el.localName : `x:${el.localName}`;
  return { tag, attrs, children: Array.from(el.children).map(fromDom), text: el.textContent ?? '' };
}

export function parseSvgText(text: string): SvgNode {
  const dom = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = dom.documentElement;
  if (!root || root.localName !== 'svg' || dom.getElementsByTagName('parsererror').length > 0) {
    throw new Error('This is not an svg file');
  }
  return fromDom(root);
}

// properties children take from their parents, the others stay on the element
const INHERITED = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'visibility'
];
const PROPERTIES = new Set([
  ...INHERITED,
  'opacity',
  'display',
  'mix-blend-mode',
  'stop-color',
  'stop-opacity',
  'clip-path',
  'mask'
]);

// tags that never draw by themselves
const QUIET = new Set([
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'filter',
  'style',
  'title',
  'desc',
  'metadata',
  'linearGradient',
  'radialGradient',
  'foreignObject',
  'script'
]);

const GENERIC: Record<string, string> = {
  serif: 'Instrument Serif',
  monospace: 'JetBrains Mono',
  'sans-serif': DEFAULT_FONT,
  cursive: DEFAULT_FONT,
  fantasy: 'Bebas Neue'
};

type Props = Record<string, string>;

interface Ctx {
  // what the parent hands down
  inherited: Props;
  depth: number;
  // ids of the use elements being followed, a use of itself would never end
  following: Set<string>;
}

class Reader {
  rules: CssRule[] = [];
  ids = new Map<string, SvgNode>();
  assets: Asset[] = [];
  skipped = 0;
  linked = 0;
  width = 0;
  height = 0;

  constructor(root: SvgNode) {
    const visit = (n: SvgNode) => {
      if (n.attrs.id) this.ids.set(n.attrs.id, n);
      if (n.tag === 'style') this.rules.push(...parseStylesheet(n.text, this.rules.length));
      n.children.forEach(visit);
    };
    visit(root);
    this.rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  }

  // presentation attributes, then the style sheet, then the style attribute
  declared(n: SvgNode): Props {
    const out: Props = {};
    for (const [k, v] of Object.entries(n.attrs)) if (PROPERTIES.has(k)) out[k] = v;
    const classes = (n.attrs.class ?? '').split(/\s+/).filter(Boolean);
    for (const rule of this.rules) {
      if (ruleMatches(rule, n.tag, classes, n.attrs.id)) Object.assign(out, rule.declarations);
    }
    Object.assign(out, parseDeclarations(n.attrs.style));
    for (const [k, v] of Object.entries(out)) if (v === 'inherit') delete out[k];
    return out;
  }

  styleOf(n: SvgNode, ctx: Ctx): Props {
    return { ...ctx.inherited, ...this.declared(n) };
  }

  passOn(props: Props): Props {
    const out: Props = {};
    for (const k of INHERITED) if (props[k] !== undefined) out[k] = props[k];
    return out;
  }

  ref(n: SvgNode): SvgNode | null {
    const href = n.attrs.href ?? n.attrs['xlink:href'] ?? '';
    return href.startsWith('#') ? (this.ids.get(href.slice(1)) ?? null) : null;
  }

  // a gradient with what it takes from the ones it points to through href
  gradient(id: string): { node: SvgNode; attrs: Props; stops: SvgNode[] } | null {
    let node = this.ids.get(id) ?? null;
    if (!node || (node.tag !== 'linearGradient' && node.tag !== 'radialGradient')) return null;
    const first = node;
    const attrs: Props = {};
    let stops: SvgNode[] = [];
    for (let guard = 0; node && guard < 10; guard++) {
      for (const [k, v] of Object.entries(node.attrs)) if (attrs[k] === undefined) attrs[k] = v;
      const own = node.children.filter((c) => c.tag === 'stop');
      if (stops.length === 0 && own.length > 0) stops = own;
      node = this.ref(node);
    }
    return { node: first, attrs, stops };
  }

  stopsOf(nodes: SvgNode[], opacity: number): Stop[] {
    let last = 0;
    return nodes.map((s) => {
      const props = this.declared(s);
      const raw = s.attrs.offset ?? '0';
      const value = raw.trim().endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
      last = Math.max(last, Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)));
      const c = parseColor(props['stop-color'] ?? 'black') ?? { color: '#000000', alpha: 1 };
      const a = parseFloat(props['stop-opacity'] ?? '1');
      return { t: last, color: c.color, alpha: c.alpha * (Number.isFinite(a) ? a : 1) * opacity };
    });
  }

  // a gradient of the file in the item's own space: bounding box units go through box, the
  // gradient transform through the points. a skewed radial one stays round, its radius scaled
  gradientPaint(id: string, box: Box, opacity: number): Paint | null {
    const g = this.gradient(id);
    if (!g) return null;
    const stops = this.stopsOf(g.stops, opacity);
    if (stops.length === 0) return null;
    if (stops.length === 1) return { type: 'solid', color: stops[0].color, alpha: stops[0].alpha };
    const user = g.attrs.gradientUnits === 'userSpaceOnUse';
    if (!user && isEmpty(box)) return { type: 'solid', color: stops[0].color, alpha: stops[0].alpha };
    const units: Mat = user ? identity() : [box.maxX - box.minX, 0, 0, box.maxY - box.minY, box.minX, box.minY];
    const m = multiply(units, parseTransform(g.attrs.gradientTransform));
    const len = (v: string | undefined, fallback: number, whole: number) => {
      if (v === undefined) return fallback;
      if (!user) return v.trim().endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
      return parseLength(v, fallback, whole);
    };
    const w = user ? this.width : 1;
    const h = user ? this.height : 1;
    if (g.node.tag === 'linearGradient') {
      const a = { x: len(g.attrs.x1, 0, w), y: len(g.attrs.y1, 0, h) };
      const b = { x: len(g.attrs.x2, w, w), y: len(g.attrs.y2, 0, h) };
      const p = applyPoint(m, a);
      const q = applyPoint(m, b);
      // the lines of one color run along the image of the normal, the vector has to stay square to them
      const along = applyVector(m, { x: -(b.y - a.y), y: b.x - a.x });
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const n2 = along.x * along.x + along.y * along.y;
      const k = n2 > 1e-12 ? (dx * along.x + dy * along.y) / n2 : 0;
      return { type: 'linear', stops, x1: p.x, y1: p.y, x2: p.x + dx - k * along.x, y2: p.y + dy - k * along.y };
    }
    const cx = len(g.attrs.cx, 0.5 * w, w);
    const cy = len(g.attrs.cy, 0.5 * h, h);
    const r = len(g.attrs.r, 0.5 * Math.hypot(w, h) / Math.SQRT2, Math.hypot(w, h) / Math.SQRT2);
    const c = applyPoint(m, { x: cx, y: cy });
    const f = applyPoint(m, { x: len(g.attrs.fx, cx, w), y: len(g.attrs.fy, cy, h) });
    return { type: 'radial', stops, cx: c.x, cy: c.y, r: r * Math.sqrt(Math.abs(determinant(m))), fx: f.x, fy: f.y };
  }

  paint(value: string | undefined, opacity: string | undefined, props: Props, box: Box): Paint | null {
    const v = (value ?? '').trim();
    if (!v || v === 'none') return null;
    const alpha = Math.max(0, Math.min(1, parseFloat(opacity ?? '1')));
    const k = Number.isFinite(alpha) ? alpha : 1;
    const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/.exec(v);
    if (url) {
      const g = this.gradientPaint(url[1], box, k);
      if (g) return g;
      // a fallback color after the url, else nothing
      return url[2] ? this.paint(url[2], opacity, props, box) : null;
    }
    const c = parseColor(v === 'currentcolor' || v === 'currentColor' ? (props.color ?? 'black') : v);
    return c ? { type: 'solid', color: c.color, alpha: c.alpha * k } : null;
  }

  style(props: Props, box: Box): Style {
    const cap = props['stroke-linecap'];
    const join = props['stroke-linejoin'];
    const dash = props['stroke-dasharray'];
    return {
      fill: this.paint(props.fill ?? 'black', props['fill-opacity'], props, box),
      stroke: this.paint(props.stroke ?? 'none', props['stroke-opacity'], props, box),
      width: Math.max(0, parseLength(props['stroke-width'], 1)),
      cap: cap === 'round' || cap === 'square' ? cap : 'butt',
      join: join === 'round' || join === 'bevel' ? join : 'miter',
      dash: dash && dash !== 'none' ? numbers(dash).filter((d) => d >= 0) : [],
      // like in the file, strokes grow and shrink with the drawing
      scaleStroke: true
    };
  }

  // opacity, blend and the effects left out, the same for every kind of item
  finish(item: Item, n: SvgNode, props: Props): Item {
    const opacity = parseFloat(props.opacity ?? '1');
    if (Number.isFinite(opacity)) item.opacity = Math.max(0, Math.min(1, opacity));
    const blend = props['mix-blend-mode'];
    if (blend && blend !== 'normal') item.blend = blend;
    if (props['clip-path'] && props['clip-path'] !== 'none') this.skipped++;
    if (props.mask && props.mask !== 'none') this.skipped++;
    if (props.visibility === 'hidden' || props.visibility === 'collapse') item.visible = false;
    item.name = n.attrs['data-name'] ?? n.attrs.id ?? item.name;
    return item;
  }

  shape(n: SvgNode, props: Props, contours: PathData[], name: string): Item[] {
    const usable = contours.filter((c) => c.anchors.length > 0);
    if (usable.length === 0) return [];
    const closed = usable.filter((c) => c.closed);
    const open = usable.filter((c) => !c.closed);
    const transform = parseTransform(n.attrs.transform);
    const items: Item[] = [];
    // closed contours fill together as one shape, open ones go on their own
    if (closed.length > 0) {
      let compound = { path: closed[0], subpaths: closed.slice(1) };
      if (props['fill-rule'] === 'evenodd') compound = orientHoles(compound);
      const box = compoundBounds(compound.path, compound.subpaths);
      const style = this.style(props, box);
      items.push(this.finish(makePathItem(name, compound.path, style, transform, compound.subpaths), n, props));
    }
    for (const c of open) {
      const style = this.style(props, compoundBounds(c, []));
      items.push(this.finish(makePathItem(name, c, style, transform), n, props));
    }
    return items;
  }

  path(d: string): PathData[] {
    let data: SVGPathData;
    try {
      data = new SVGPathData(d).toAbs().normalizeHVZ(false).normalizeST().qtToC().aToC();
    } catch {
      return [];
    }
    const commands: OutlineCommand[] = [];
    let start = { x: 0, y: 0 };
    let closed = false;
    for (const c of data.commands) {
      if (c.type === SVGPathData.MOVE_TO) {
        start = { x: c.x, y: c.y };
        commands.push({ type: 'M', x: c.x, y: c.y });
        closed = false;
        continue;
      }
      if (c.type === SVGPathData.CLOSE_PATH) {
        commands.push({ type: 'Z' });
        closed = true;
        continue;
      }
      // drawing on after a close starts a new contour where the last one began
      if (closed) {
        commands.push({ type: 'M', x: start.x, y: start.y });
        closed = false;
      }
      if (c.type === SVGPathData.LINE_TO) commands.push({ type: 'L', x: c.x, y: c.y });
      else if (c.type === SVGPathData.CURVE_TO) {
        commands.push({ type: 'C', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, x: c.x, y: c.y });
      }
    }
    return outlineContours(commands);
  }

  points(text: string | undefined): { x: number; y: number }[] {
    const n = numbers(text);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
    return out;
  }

  font(list: string | undefined): { family: string; weight: number | null } {
    const families = get(fontFamilies);
    for (const raw of (list ?? '').split(',')) {
      const name = raw.trim().replace(/^['"]|['"]$/g, '');
      if (!name) continue;
      const exact = families.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (exact) return { family: exact.name, weight: null };
      // postscript names like Inter-Bold carry the weight after the dash
      const [base, face] = name.split('-');
      const loose = families.find((f) => f.name.replace(/\s+/g, '').toLowerCase() === base.toLowerCase());
      if (loose) return { family: loose.name, weight: face ? weightOf(face) : null };
      if (GENERIC[name.toLowerCase()]) return { family: GENERIC[name.toLowerCase()], weight: null };
    }
    return { family: DEFAULT_FONT, weight: null };
  }

  text(n: SvgNode, props: Props): Item | null {
    const spans = n.children.filter((c) => c.tag === 'tspan');
    const lines: string[] = [];
    let x = numbers(n.attrs.x)[0];
    let y = numbers(n.attrs.y)[0];
    let lineStep = 0;
    const clean = (s: string) => s.replace(/\s+/g, ' ');
    if (spans.length === 0) lines.push(clean(n.text).trim());
    // text before the first tspan starts the first line
    const lead = spans.length > 0 && spans[0].text ? n.text.slice(0, n.text.indexOf(spans[0].text)) : '';
    if (lead.trim()) lines.push(clean(lead).trimStart());
    for (const span of spans) {
      const breaks = span.attrs.x !== undefined || span.attrs.y !== undefined || span.attrs.dy !== undefined;
      if (lines.length === 0 || breaks) lines.push(clean(span.text));
      else lines[lines.length - 1] += clean(span.text);
      x ??= numbers(span.attrs.x)[0];
      y ??= numbers(span.attrs.y)[0];
      const dy = numbers(span.attrs.dy)[0];
      if (!lineStep && dy && lines.length > 1) lineStep = dy;
    }
    const text = lines.join('\n').trim();
    if (!text) return null;
    const size = parseLength(props['font-size'], 16);
    const { family, weight } = this.font(props['font-family']);
    const w = props['font-weight'];
    const bold = w === 'bold' || w === 'bolder' ? 700 : w === 'lighter' ? 300 : parseInt(w ?? '', 10);
    const lineHeight = lineStep > 0 ? lineStep / size : 1.2;
    const box = fromRect(0, 0, size * 0.55 * Math.max(...lines.map((l) => l.length)), size * lineHeight * lines.length);
    const style = this.style(props, box);
    const item = makeTextItem(text, family, size, style);
    item.weight = Number.isFinite(bold) ? bold : (weight ?? 400);
    item.italic = props['font-style'] === 'italic' || props['font-style'] === 'oblique';
    item.lineHeight = lineHeight;
    const spacing = props['letter-spacing'];
    if (spacing && spacing !== 'normal') item.spacing = parseLength(spacing, 0);
    const anchor = props['text-anchor'];
    item.align = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
    // the file places the first baseline, a text item its top. a loaded font knows where it is
    const baseline = itemLayout(item)?.lines[0]?.baseline ?? approxBaseline(size, lineHeight);
    item.transform = multiply(parseTransform(n.attrs.transform), translate(x ?? 0, (y ?? 0) - baseline));
    return this.finish(item, n, props);
  }

  image(n: SvgNode, props: Props): Item | null {
    const href = n.attrs.href ?? n.attrs['xlink:href'] ?? '';
    const width = parseLength(n.attrs.width, 0, this.width);
    const height = parseLength(n.attrs.height, 0, this.height);
    if (!href.startsWith('data:image/')) {
      if (href) this.linked++;
      return null;
    }
    if (width <= 0 || height <= 0) return null;
    const name = n.attrs['data-name'] ?? n.attrs.id ?? 'Image';
    const asset = makeAsset('image', name, href);
    if (!this.assets.some((a) => a.id === asset.id)) this.assets.push(asset);
    const at = translate(parseLength(n.attrs.x, 0, this.width), parseLength(n.attrs.y, 0, this.height));
    const item = makeImageItem(asset.id, name, width, height, multiply(parseTransform(n.attrs.transform), at));
    return this.finish(item, n, props);
  }

  // a group of what the children draw, null when they draw nothing
  group(n: SvgNode, props: Props, children: SvgNode[], ctx: Ctx, extra: Mat = identity()): Item | null {
    const inner: Ctx = { ...ctx, inherited: this.passOn(props), depth: ctx.depth + 1 };
    const items = children.flatMap((c) => this.walk(c, inner));
    if (items.length === 0) return null;
    const transform = multiply(parseTransform(n.attrs.transform), extra);
    return this.finish(makeGroupItem(n.attrs['data-name'] ?? n.attrs.id ?? 'Group', items, transform), n, props);
  }

  use(n: SvgNode, props: Props, ctx: Ctx): Item[] {
    const target = this.ref(n);
    const id = target?.attrs.id;
    if (!target || !id || ctx.following.has(id) || ctx.depth > 40) return [];
    const at = translate(parseLength(n.attrs.x, 0, this.width), parseLength(n.attrs.y, 0, this.height));
    const following = new Set(ctx.following).add(id);
    const inner: Ctx = { inherited: this.passOn(props), depth: ctx.depth + 1, following };
    const placed = multiply(parseTransform(n.attrs.transform), at);
    if (target.tag === 'symbol' || target.tag === 'svg') {
      // a symbol with a viewBox fills the size the use asks for
      const box = numbers(target.attrs.viewBox);
      const w = parseLength(n.attrs.width ?? target.attrs.width, 0, this.width);
      const h = parseLength(n.attrs.height ?? target.attrs.height, 0, this.height);
      const fit = box.length === 4 && w > 0 && h > 0 ? fitBox(box, w, h) : identity();
      const bare = { ...n, attrs: { ...n.attrs, transform: '' } };
      const group = this.group(bare, props, target.children, inner, multiply(placed, fit));
      return group ? [group] : [];
    }
    const items = this.walk(target, inner);
    if (items.length === 1 && isIdentity(placed)) return items;
    if (items.length === 0) return [];
    const group = makeGroupItem(n.attrs['data-name'] ?? id, items, placed);
    return [this.finish(group, n, props)];
  }

  walk(n: SvgNode, ctx: Ctx): Item[] {
    if (n.tag.includes(':') || QUIET.has(n.tag)) return [];
    const props = this.styleOf(n, ctx);
    if (props.display === 'none') return [];
    const a = n.attrs;
    const len = (v: string | undefined, whole: number) => parseLength(v, 0, whole);
    switch (n.tag) {
      case 'g':
      case 'a': {
        const g = this.group(n, props, n.children, ctx);
        return g ? [g] : [];
      }
      case 'svg': {
        const g = this.group(n, props, n.children, ctx, translate(len(a.x, this.width), len(a.y, this.height)));
        return g ? [g] : [];
      }
      // the first child the reader understands, illustrator puts its own data first
      case 'switch': {
        const pick = n.children.find((c) => !c.tag.includes(':') && !QUIET.has(c.tag) && !c.attrs.requiredExtensions);
        return pick ? this.walk(pick, { ...ctx, inherited: this.passOn(props) }) : [];
      }
      case 'path':
        return this.shape(n, props, this.path(a.d ?? ''), 'Path');
      case 'rect': {
        const w = len(a.width, this.width);
        const h = len(a.height, this.height);
        if (w <= 0 || h <= 0) return [];
        const r = Math.max(len(a.rx ?? a.ry, this.width), 0);
        return this.shape(n, props, [rectPath(len(a.x, this.width), len(a.y, this.height), w, h, r)], 'Rectangle');
      }
      case 'circle': {
        const r = len(a.r, Math.hypot(this.width, this.height) / Math.SQRT2);
        if (r <= 0) return [];
        return this.shape(n, props, [ellipsePath(len(a.cx, this.width), len(a.cy, this.height), r, r)], 'Ellipse');
      }
      case 'ellipse': {
        const rx = len(a.rx ?? a.ry, this.width);
        const ry = len(a.ry ?? a.rx, this.height);
        if (rx <= 0 || ry <= 0) return [];
        return this.shape(n, props, [ellipsePath(len(a.cx, this.width), len(a.cy, this.height), rx, ry)], 'Ellipse');
      }
      case 'line': {
        const w = this.width;
        const h = this.height;
        return this.shape(n, props, [linePath(len(a.x1, w), len(a.y1, h), len(a.x2, w), len(a.y2, h))], 'Line');
      }
      case 'polyline':
      case 'polygon': {
        const pts = this.points(a.points);
        if (pts.length < 2) return [];
        const polygon = n.tag === 'polygon';
        return this.shape(n, props, [polylineToPath(pts, polygon)], polygon ? 'Polygon' : 'Line');
      }
      case 'text': {
        const t = this.text(n, props);
        return t ? [t] : [];
      }
      case 'image': {
        const img = this.image(n, props);
        return img ? [img] : [];
      }
      case 'use':
        return this.use(n, props, ctx);
      default:
        return [];
    }
  }
}

// a viewBox scaled into w by h and centered, like the default preserveAspectRatio does
function fitBox(box: number[], w: number, h: number): Mat {
  if (box.length !== 4 || box[2] <= 0 || box[3] <= 0) return identity();
  const k = Math.min(w / box[2], h / box[3]);
  return [k, 0, 0, k, (w - box[2] * k) / 2 - box[0] * k, (h - box[3] * k) / 2 - box[1] * k];
}

// the size the svg asks for and the matrix from its viewBox to that size
function viewport(root: SvgNode): { width: number; height: number; matrix: Mat } {
  const box = numbers(root.attrs.viewBox);
  const hasBox = box.length === 4 && box[2] > 0 && box[3] > 0;
  const width = parseLength(root.attrs.width, hasBox ? box[2] : 0, hasBox ? box[2] : 0) || (hasBox ? box[2] : 300);
  const height = parseLength(root.attrs.height, hasBox ? box[3] : 0, hasBox ? box[3] : 0) || (hasBox ? box[3] : 150);
  return { width, height, matrix: hasBox ? fitBox(box, width, height) : identity() };
}

export function readSvg(root: SvgNode, name = 'SVG'): SvgImport {
  const reader = new Reader(root);
  const view = viewport(root);
  const box = numbers(root.attrs.viewBox);
  // percentages inside the drawing are of the viewBox
  reader.width = box.length === 4 ? box[2] : view.width;
  reader.height = box.length === 4 ? box[3] : view.height;
  const props = reader.declared(root);
  const ctx: Ctx = { inherited: reader.passOn(props), depth: 0, following: new Set() };
  const items = root.children.flatMap((c) => reader.walk(c, ctx));
  let item: Item | null = null;
  if (items.length === 1) {
    item = items[0];
    item.transform = multiply(view.matrix, item.transform);
  } else if (items.length > 1) {
    item = makeGroupItem(name, items, view.matrix);
  }
  const { assets, skipped, linked } = reader;
  return { item, assets, skipped, linked, width: view.width, height: view.height };
}

export function readSvgText(text: string, name = 'SVG'): SvgImport {
  return readSvg(parseSvgText(text), name);
}
