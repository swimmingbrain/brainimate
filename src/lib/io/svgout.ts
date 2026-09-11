import type { Doc, ImageItem, InstanceItem, Item, Layer, Mat, Paint, PathItem } from '$lib/core/types';
import type { Stop, Style, TextItem } from '$lib/core/types';
import { identity, isIdentity, multiply, scaleFactor } from '$lib/core/mat';
import { compoundBounds, pathToD, transformPath } from '$lib/core/path';
import { fitGradient, isFitted, isGradient, sortStops, type Gradient } from '$lib/core/gradient';
import { localBounds } from '$lib/core/items';
import { mixHex } from '$lib/core/color';
import { itemLayout } from '$lib/core/fonts';
import { glyphOutlines, type TextLayout } from '$lib/core/text';
import type { Box } from '$lib/core/bbox';
import { MAX_NESTING, instanceSlices, isLayerShown, itemsAt, keyframeAt, setLibrary } from '$lib/render/frame';
import { rigFor } from '$lib/rig/bones';
import { posedList } from '$lib/rig/skin';

export interface SvgOptions {
  frame: number;
  // text as glyph paths, looks the same without the font but is no longer text
  outlineText?: boolean;
  pretty?: boolean;
  // the document background as a rect under everything
  background?: boolean;
  // how text is laid out, the loaded fonts unless a test hands in its own
  layout?: (item: TextItem) => TextLayout | null;
}

// two decimals, without trailing zeros and without a minus zero
export function num(n: number): string {
  const s = (Number.isFinite(n) ? n : 0).toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function matrixAttr(m: Mat): string {
  if (isIdentity(m)) return '';
  if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) return `translate(${num(m[4])} ${num(m[5])})`;
  return `matrix(${m.map(num).join(' ')})`;
}

// what a tinted instance does to the colors inside it, the tint laid over at its amount
type Tint = ((color: string) => string) | null;

interface Writer {
  lines: string[];
  defs: string[];
  pretty: boolean;
  outlineText: boolean;
  ids: number;
  layout: (item: TextItem) => TextLayout | null;
}

function attrs(list: [string, string | null | undefined][]): string {
  return list
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${escapeXml(v as string)}"`)
    .join('');
}

function line(w: Writer, depth: number, text: string) {
  w.lines.push(w.pretty ? '  '.repeat(depth) + text : text);
}

function stopXml(w: Writer, s: Stop, tint: Tint): string {
  const color = tint ? tint(s.color) : s.color;
  const opacity = s.alpha < 1 ? num(Math.max(0, s.alpha)) : null;
  const offset = num(Math.max(0, Math.min(1, s.t)));
  const pad = w.pretty ? '\n    ' : '';
  return `${pad}<stop${attrs([
    ['offset', offset],
    ['stop-color', color],
    ['stop-opacity', opacity]
  ])}/>`;
}

// a gradient in defs, in the user space of the element that uses it. extra maps the paint's space to
// that user space when the element was written with its transform worked in
function gradientRef(w: Writer, p: Gradient, box: Box, extra: Mat | null, tint: Tint): string {
  const q = isFitted(p) ? p : fitGradient(p, box);
  const id = `gradient-${++w.ids}`;
  const transform = extra ? matrixAttr(extra) : '';
  const stops = sortStops(q.stops)
    .map((s) => stopXml(w, s, tint))
    .join('');
  const end = w.pretty ? '\n  ' : '';
  if (q.type === 'linear') {
    const head = attrs([
      ['id', id],
      ['gradientUnits', 'userSpaceOnUse'],
      ['x1', num(q.x1)],
      ['y1', num(q.y1)],
      ['x2', num(q.x2)],
      ['y2', num(q.y2)],
      ['gradientTransform', transform]
    ]);
    w.defs.push(`<linearGradient${head}>${stops}${end}</linearGradient>`);
  } else {
    const head = attrs([
      ['id', id],
      ['gradientUnits', 'userSpaceOnUse'],
      ['cx', num(q.cx)],
      ['cy', num(q.cy)],
      ['r', num(Math.max(0, q.r))],
      ['fx', num(q.fx)],
      ['fy', num(q.fy)],
      ['gradientTransform', transform]
    ]);
    w.defs.push(`<radialGradient${head}>${stops}${end}</radialGradient>`);
  }
  return `url(#${id})`;
}

// fill or stroke and its opacity
function paintAttrs(
  w: Writer,
  name: 'fill' | 'stroke',
  p: Paint | null,
  box: Box,
  extra: Mat | null,
  tint: Tint
): [string, string | null][] {
  if (!p) return [[name, 'none']];
  if (isGradient(p)) return [[name, gradientRef(w, p, box, extra, tint)]];
  const color = tint ? tint(p.color) : p.color;
  return [
    [name, color],
    [`${name}-opacity`, p.alpha < 1 ? num(Math.max(0, p.alpha)) : null]
  ];
}

// local is the element's own space to the world, for stroke widths that keep their size whatever the
// item's scale, like the stage draws them
function styleAttrs(
  w: Writer,
  style: Style,
  box: Box,
  local: Mat,
  extra: Mat | null,
  tint: Tint
): [string, string | null][] {
  const out = paintAttrs(w, 'fill', style.fill, box, extra, tint);
  if (!style.stroke || style.width <= 0) return [...out, ['stroke', null]];
  const own = extra ? scaleFactor(extra) : 1;
  const k = style.scaleStroke ? own : 1 / Math.max(scaleFactor(local), 1e-9);
  out.push(...paintAttrs(w, 'stroke', style.stroke, box, extra, tint));
  out.push(['stroke-width', num(style.width * k)]);
  out.push(['stroke-linecap', style.cap === 'butt' ? null : style.cap]);
  out.push(['stroke-linejoin', style.join === 'miter' ? null : style.join]);
  if (style.join === 'miter') out.push(['stroke-miterlimit', '10']);
  if (style.dash.length > 0) out.push(['stroke-dasharray', style.dash.map((d) => num(d * k)).join(' ')]);
  return out;
}

function common(item: Item, alpha = 1): [string, string | null][] {
  const opacity = item.opacity * alpha;
  return [
    ['opacity', opacity < 1 ? num(Math.max(0, opacity)) : null],
    ['style', item.blend && item.blend !== 'normal' ? `mix-blend-mode:${item.blend}` : null]
  ];
}

function writePath(w: Writer, item: PathItem, parent: Mat, depth: number, tint: Tint) {
  if (item.path.anchors.length === 0) return;
  const box = compoundBounds(item.path, item.subpaths);
  // a shape bent by the rig is written with its transform worked in, the others keep it
  const bent = item.skin !== null && !item.skin.rigid;
  let d: string;
  let transform = '';
  let extra: Mat | null = null;
  let local = multiply(parent, item.transform);
  if (bent) {
    const m = item.transform;
    d = pathToD(transformPath(item.path, m), item.subpaths.map((s) => transformPath(s, m)), 2);
    extra = isIdentity(m) ? null : m;
    local = parent;
  } else {
    d = pathToD(item.path, item.subpaths, 2);
    transform = matrixAttr(item.transform);
  }
  const list: [string, string | null][] = [
    ['d', d],
    ['transform', transform],
    ...styleAttrs(w, item.style, box, local, extra, tint),
    ...common(item)
  ];
  line(w, depth, `<path${attrs(list)}/>`);
}

// a rough baseline for text whose font is not loaded, about where most fonts put it
function guessBaseline(item: TextItem, n: number): number {
  const step = item.size * item.lineHeight;
  return n * step + (step - item.size * 1.2) / 2 + item.size * 0.95;
}

function writeText(w: Writer, item: TextItem, parent: Mat, depth: number, tint: Tint) {
  const layout = w.layout(item);
  const local = multiply(parent, item.transform);
  const box = layout ? layout.bounds : localBounds(item);
  const style = styleAttrs(w, item.style, box, local, null, tint);
  const transform = matrixAttr(item.transform);
  if (w.outlineText && layout) {
    const contours = glyphOutlines(layout).flat();
    if (contours.length === 0) return;
    const d = contours.map((c) => pathToD(c, [], 2)).join(' ');
    line(w, depth, `<path${attrs([['d', d], ['transform', transform], ...style, ...common(item)])}/>`);
    return;
  }
  const lines: { text: string; baseline: number }[] = layout
    ? layout.lines.map((l) => ({ text: item.text.slice(l.start, l.end), baseline: l.baseline }))
    : item.text.split('\n').map((text, n) => ({ text, baseline: guessBaseline(item, n) }));
  const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : null;
  let x = 0;
  if (item.width !== null && item.align === 'center') x = item.width / 2;
  else if (item.width !== null && item.align === 'right') x = item.width;
  const head = attrs([
    ['transform', transform],
    ['font-family', `'${item.font}', sans-serif`],
    ['font-size', num(item.size)],
    ['font-weight', item.weight !== 400 ? String(item.weight) : null],
    ['font-style', item.italic ? 'italic' : null],
    ['letter-spacing', item.spacing !== 0 ? num(item.spacing) : null],
    ['text-anchor', anchor],
    ...style,
    ...common(item)
  ]);
  line(w, depth, `<text xml:space="preserve"${head}>`);
  for (const l of lines) {
    line(w, depth + 1, `<tspan x="${num(x)}" y="${num(l.baseline)}">${escapeXml(l.text)}</tspan>`);
  }
  line(w, depth, '</text>');
}

function writeImage(w: Writer, item: ImageItem, doc: Doc, depth: number) {
  const asset = doc.assets[item.asset];
  if (!asset) return;
  const list: [string, string | null][] = [
    ['href', asset.data],
    ['width', num(item.width)],
    ['height', num(item.height)],
    ['preserveAspectRatio', 'none'],
    ['transform', matrixAttr(item.transform)],
    ...common(item)
  ];
  line(w, depth, `<image${attrs(list)}/>`);
}

// what an instance shows, written out in place with its matrix, alpha and tint
function writeInstance(
  w: Writer,
  item: InstanceItem,
  doc: Doc,
  parent: Mat,
  depth: number,
  tint: Tint,
  offset: number
) {
  if (depth >= MAX_NESTING + 2) return;
  const m = multiply(parent, item.transform);
  let own: Tint = tint;
  if (item.tint && item.tintAmount > 0) {
    const color = item.tint;
    const amount = Math.min(1, item.tintAmount);
    own = (c) => mixHex(tint ? tint(c) : c, color, amount);
  }
  line(w, depth, `<g${attrs([['transform', matrixAttr(item.transform)], ...common(item, item.alpha)])}>`);
  for (const slice of instanceSlices(item, offset)) {
    for (const child of slice.items) writeItem(w, child, doc, m, depth + 1, own, slice.offset);
  }
  line(w, depth, '</g>');
}

function writeItem(w: Writer, item: Item, doc: Doc, parent: Mat, depth: number, tint: Tint, offset: number) {
  if (!item.visible || item.opacity <= 0) return;
  switch (item.type) {
    case 'path':
      writePath(w, item, parent, depth, tint);
      break;
    case 'group': {
      const m = multiply(parent, item.transform);
      line(w, depth, `<g${attrs([['transform', matrixAttr(item.transform)], ...common(item)])}>`);
      for (const child of item.children) writeItem(w, child, doc, m, depth + 1, tint, offset);
      line(w, depth, '</g>');
      break;
    }
    case 'text':
      writeText(w, item, parent, depth, tint);
      break;
    case 'image':
      writeImage(w, item, doc, depth);
      break;
    case 'instance':
      writeInstance(w, item, doc, parent, depth, tint, offset);
      break;
  }
}

// layer names as ids the way drawing apps write them, spaces turned into underscores and kept apart
function layerId(name: string, used: Set<string>): string {
  const base = name.trim().replace(/\s+/g, '_') || 'Layer';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  used.add(id);
  return id;
}

export function exportedLayers(layers: Layer[]): Layer[] {
  return layers.filter((l) => l.type === 'normal' && isLayerShown(layers, l));
}

// the frame as an svg document: a group per shown layer bottom to top, posed like the stage shows it
export function exportSvg(doc: Doc, opts: SvgOptions): string {
  setLibrary(doc.symbols);
  const w: Writer = {
    lines: [],
    defs: [],
    pretty: !!opts.pretty,
    outlineText: !!opts.outlineText,
    ids: 0,
    layout: opts.layout ?? itemLayout
  };
  const rig = rigFor(doc.layers, opts.frame);
  const used = new Set<string>();
  if (opts.background !== false) {
    line(w, 1, `<rect${attrs([['width', num(doc.width)], ['height', num(doc.height)], ['fill', doc.bg]])}/>`);
  }
  for (const layer of exportedLayers(doc.layers)) {
    const items = posedList(itemsAt(layer, opts.frame), rig);
    const offset = opts.frame - (keyframeAt(layer, opts.frame)?.frame ?? 0);
    line(w, 1, `<g${attrs([['id', layerId(layer.name, used)], ['data-name', layer.name]])}>`);
    for (const item of items) writeItem(w, item, doc, identity(), 2, null, offset);
    line(w, 1, '</g>');
  }
  const nl = w.pretty ? '\n' : '';
  const head = attrs([
    ['xmlns', 'http://www.w3.org/2000/svg'],
    ['width', num(doc.width)],
    ['height', num(doc.height)],
    ['viewBox', `0 0 ${num(doc.width)} ${num(doc.height)}`]
  ]);
  const defs: string[] = [];
  if (w.defs.length > 0 && w.pretty) defs.push(`  <defs>\n  ${w.defs.join('\n  ')}\n  </defs>`);
  else if (w.defs.length > 0) defs.push(`<defs>${w.defs.join('')}</defs>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', `<svg${head}>`, ...defs, ...w.lines, '</svg>'].join(nl) + nl;
}
