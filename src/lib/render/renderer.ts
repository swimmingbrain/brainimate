import type { Asset, Doc, ImageItem, InstanceItem, Item, Layer, Mat, PathItem, TextItem } from '$lib/core/types';
import { multiply, multiplyInto, scaleFactor } from '$lib/core/mat';
import { canvasPaint, compositeOp, needsBox, type Ctx2D } from '$lib/core/style';
import { compoundBounds } from '$lib/core/path';
import { itemBounds, localBounds } from '$lib/core/items';
import { isEmpty } from '$lib/core/bbox';
import { isLayerShown } from '$lib/anim/timeline';
import { shapePath2D, textPath2D } from './pathcache';
import { cssFamily, itemLayout } from '$lib/core/fonts';
import { MAX_NESTING, currentLibrary, instanceSlices, itemsAt, keyframeAt, libraryStamp } from './frame';
import { drawOnion, type OnionOptions } from './onion';
import { context, sized, type Surface } from './surface';
import { rigFor, type PoseOverride } from '$lib/rig/bones';
import { posed } from '$lib/rig/skin';

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

// css pixels of the canvas, dpr turns them into device pixels
export interface RenderView {
  zoom: number;
  panX: number;
  panY: number;
  dpr: number;
  width: number;
  height: number;
}

export interface RenderOptions {
  frame: number;
  // outline mode for every layer, a layer can also turn it on for itself
  outline: boolean;
  // items a tool is changing, drawn instead of the document item with the same id
  preview?: Map<string, Item>;
  // items a tool is drawing out, on top of their layer
  added?: { layerId: string; item: Item }[];
  assets?: Record<string, Asset>;
  // an item left out, the one being typed into or the instance being edited in place
  hide?: string | null;
  // a pose a tool is dragging, the bound items follow it
  pose?: PoseOverride | null;
  // exports leave guide layers out
  noGuides?: boolean;
}

export interface StageOptions extends RenderOptions {
  // false clips everything to the stage rect
  pasteboard: boolean;
  grid: GridLook | null;
  colors: { pasteboard: string; shadow: string };
  // ghosts of the frames around this one under the artwork, key says when they need drawing again
  onion?: { options: OnionOptions; key: string } | null;
  // a symbol open in place: what is around it shows dimmed and its layers are drawn through base
  edit?: { base: Mat; dim: DimLevel[] } | null;
  shadow?: boolean;
  // keep the layers around the live ones as pictures, off while playing since every frame is new
  cache?: boolean;
  // the layer the tools work on, it always draws live
  active?: string | null;
}

// one level around an open symbol, the main timeline or the symbol it sits in, without the instance opened
export interface DimLevel {
  layers: Layer[];
  frame: number;
  // that level's space to the document
  base: Mat;
  skip: string | null;
}

export const DIM_ALPHA = 0.35;

// per draw call state, set once so the item functions do not need a long argument list
interface DrawState {
  opts: RenderOptions;
  // device pixels per world unit, the stroke widths and outlines are measured against it
  viewScale: number;
  // the copies a tool drags inside groups, already swapped in when a rig posed the items
  preview?: Map<string, Item>;
}

const images = new Map<string, HTMLImageElement>();
let onImageLoad: (() => void) | null = null;

// the stage asks to be redrawn once an image has decoded
export function setImageLoaded(fn: (() => void) | null) {
  onImageLoad = fn;
}

function imageFor(asset: Asset): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = images.get(asset.id);
  if (!img) {
    img = new Image();
    img.onload = () => {
      epoch++;
      onImageLoad?.();
    };
    img.src = asset.data;
    images.set(asset.id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// exports wait for every picture to decode, the stage just draws again when one arrives
export async function loadImages(assets: Record<string, Asset>) {
  const waits: Promise<unknown>[] = [];
  for (const asset of Object.values(assets)) {
    if (asset.type !== 'image') continue;
    imageFor(asset);
    const img = images.get(asset.id);
    if (img && !img.complete) waits.push(img.decode().catch(() => {}));
  }
  await Promise.all(waits);
}

function setMatrix(ctx: Ctx2D, m: Mat) {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

// the line settings each context has now, canvas setters cost more than a compare. a draw that sets
// them some other way forgets the entry, the next path sets them again
const lineState = new WeakMap<Ctx2D, { cap: string; join: string; dash: string; fill: unknown; stroke: unknown }>();

function lineOf(ctx: Ctx2D) {
  let st = lineState.get(ctx);
  if (!st) {
    st = { cap: '', join: '', dash: '?', fill: null, stroke: null };
    lineState.set(ctx, st);
  }
  return st;
}

function forgetLine(ctx: Ctx2D) {
  lineState.delete(ctx);
}

function drawPath(ctx: Ctx2D, item: PathItem, m: Mat, outline: string | null, s: DrawState) {
  if (item.path.anchors.length === 0) return;
  setMatrix(ctx, m);
  const shape = shapePath2D(item.path, item.subpaths);
  const scale = Math.max(scaleFactor(m), 1e-9);
  const st = lineOf(ctx);
  if (outline) {
    ctx.strokeStyle = outline;
    st.stroke = null;
    ctx.lineWidth = 1 / scale;
    if (st.dash !== '') {
      ctx.setLineDash([]);
      st.dash = '';
    }
    ctx.stroke(shape);
    return;
  }
  const style = item.style;
  const box = needsBox(style.fill) || needsBox(style.stroke) ? compoundBounds(item.path, item.subpaths) : null;
  if (style.fill) {
    const paint = canvasPaint(ctx, style.fill, box);
    if (paint !== st.fill) {
      ctx.fillStyle = paint;
      st.fill = paint;
    }
    ctx.fill(shape);
  }
  if (style.stroke && style.width > 0) {
    // without scale stroke the width stays in world units whatever the item transform does
    const k = style.scaleStroke ? 1 : s.viewScale / scale;
    const paint = canvasPaint(ctx, style.stroke, box);
    if (paint !== st.stroke) {
      ctx.strokeStyle = paint;
      st.stroke = paint;
    }
    ctx.lineWidth = style.width * k;
    if (st.cap !== style.cap) {
      ctx.lineCap = style.cap;
      st.cap = style.cap;
    }
    if (st.join !== style.join) {
      ctx.lineJoin = style.join;
      ctx.miterLimit = 10;
      st.join = style.join;
    }
    const dash = style.dash.length > 0 ? `${style.dash.join(',')}@${k}` : '';
    if (dash !== st.dash) {
      ctx.setLineDash(style.dash.length > 0 ? style.dash.map((d) => d * k) : []);
      st.dash = dash;
    }
    ctx.stroke(shape);
  }
}

// the glyph outlines of the laid out text, filled and stroked like a path
function drawText(ctx: Ctx2D, item: TextItem, m: Mat, outline: string | null, s: DrawState) {
  // text sets the line settings its own way
  forgetLine(ctx);
  const layout = itemLayout(item);
  if (!layout) {
    drawTextFallback(ctx, item, m, outline);
    return;
  }
  setMatrix(ctx, m);
  const shape = textPath2D(layout);
  const scale = Math.max(scaleFactor(m), 1e-9);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([]);
    ctx.stroke(shape);
    return;
  }
  const style = item.style;
  const box = needsBox(style.fill) || needsBox(style.stroke) ? layout.bounds : null;
  if (style.fill) {
    ctx.fillStyle = canvasPaint(ctx, style.fill, box);
    ctx.fill(shape);
  }
  if (style.stroke && style.width > 0) {
    const k = style.scaleStroke ? 1 : s.viewScale / scale;
    ctx.strokeStyle = canvasPaint(ctx, style.stroke, box);
    ctx.lineWidth = style.width * k;
    ctx.lineCap = style.cap;
    ctx.lineJoin = style.join;
    ctx.miterLimit = 10;
    ctx.setLineDash(style.dash.length > 0 ? style.dash.map((d) => d * k) : []);
    ctx.stroke(shape);
  }
}

// while the font file loads the browser draws the text as well as it can
function drawTextFallback(ctx: Ctx2D, item: TextItem, m: Mat, outline: string | null) {
  setMatrix(ctx, m);
  ctx.font = `${item.italic ? 'italic ' : ''}${item.weight} ${item.size}px ${cssFamily(item.font)}`;
  ctx.textAlign = item.width !== null ? 'left' : item.align;
  ctx.textBaseline = 'top';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${item.spacing}px`;
  const lines = item.text.split('\n');
  const step = item.size * item.lineHeight;
  const box = needsBox(item.style.fill) || needsBox(item.style.stroke) ? localBounds(item) : null;
  const fill = outline ?? (item.style.fill ? canvasPaint(ctx, item.style.fill, box) : null);
  if (fill) {
    ctx.fillStyle = fill;
    lines.forEach((line, i) => ctx.fillText(line, 0, i * step));
  }
  if (!outline && item.style.stroke && item.style.width > 0) {
    ctx.strokeStyle = canvasPaint(ctx, item.style.stroke, box);
    ctx.lineWidth = item.style.width;
    lines.forEach((line, i) => ctx.strokeText(line, 0, i * step));
  }
}

function drawImage(ctx: Ctx2D, item: ImageItem, m: Mat, outline: string | null, s: DrawState) {
  setMatrix(ctx, m);
  forgetLine(ctx);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1 / Math.max(scaleFactor(m), 1e-9);
    ctx.strokeRect(0, 0, item.width, item.height);
    return;
  }
  const asset = s.opts.assets?.[item.asset];
  const img = asset ? imageFor(asset) : null;
  if (img) ctx.drawImage(img, 0, 0, item.width, item.height);
}

// the symbol's layers at the frame the instance maps to, with the instance matrix and alpha
function drawInstance(
  ctx: Ctx2D,
  item: InstanceItem,
  m: Mat,
  a: number,
  mode: string,
  outline: string | null,
  s: DrawState,
  offset: number,
  depth: number
) {
  if (depth >= MAX_NESTING) return;
  const alpha = a * item.alpha;
  if (alpha <= 0) return;
  if (!outline && item.tint && item.tintAmount > 0) {
    drawTinted(ctx, item, m, alpha, mode, s, offset, depth);
    return;
  }
  // the symbol's items are not in the preview, a drag on the stage never reaches inside
  for (const slice of instanceSlices(item, offset, s.opts.noGuides)) {
    const own = outline ?? (slice.layer.outline ? slice.layer.color : null);
    for (const child of slice.items) drawItem(ctx, child, m, alpha, mode, own, s, slice.offset, depth + 1);
  }
}

// one scratch canvas per nesting level, a tinted instance inside a tinted one needs its own
const tintSurfaces: (Surface | null)[] = [];

// the symbol is drawn alone, the tint color laid over what it covered, and the result put down at
// the instance alpha. only the device pixels the instance covers are touched
function drawTinted(
  ctx: Ctx2D,
  item: InstanceItem,
  m: Mat,
  alpha: number,
  mode: string,
  s: DrawState,
  offset: number,
  depth: number
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const box = itemBounds(item, m, offset, depth);
  if (isEmpty(box)) return;
  const x0 = Math.max(0, Math.floor(box.minX) - 2);
  const y0 = Math.max(0, Math.floor(box.minY) - 2);
  const x1 = Math.min(w, Math.ceil(box.maxX) + 2);
  const y1 = Math.min(h, Math.ceil(box.maxY) + 2);
  if (x1 <= x0 || y1 <= y0) return;
  const surf = sized(tintSurfaces[depth] ?? null, w, h);
  tintSurfaces[depth] = surf;
  const t = context(surf);
  forgetLine(t);
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalAlpha = 1;
  t.globalCompositeOperation = 'source-over';
  t.clearRect(x0, y0, x1 - x0, y1 - y0);
  for (const slice of instanceSlices(item, offset, s.opts.noGuides)) {
    for (const child of slice.items) drawItem(t, child, m, 1, 'normal', null, s, slice.offset, depth + 1);
  }
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-atop';
  t.globalAlpha = Math.min(1, item.tintAmount);
  t.fillStyle = item.tint!;
  t.fillRect(x0, y0, x1 - x0, y1 - y0);
  forgetLine(t);
  t.globalCompositeOperation = 'source-over';
  t.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = compositeOp(mode);
  ctx.drawImage(surf, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

// paths, texts and pictures draw with this one, only groups and instances hand their matrix down
const LEAF: Mat = [1, 0, 0, 1, 0, 0];

// offset is how many frames past its keyframe the item shows, instances pick their symbol frame by it
function drawItem(
  ctx: Ctx2D,
  item: Item,
  parent: Mat,
  alpha: number,
  blend: string,
  outline: string | null,
  s: DrawState,
  offset: number,
  depth: number
) {
  if (!item.visible || item.id === s.opts.hide) return;
  const a = alpha * item.opacity;
  if (a <= 0) return;
  const leaf = item.type === 'path' || item.type === 'text' || item.type === 'image';
  const m = leaf ? multiplyInto(LEAF, parent, item.transform) : multiply(parent, item.transform);
  // a group passes its blend on to children that keep the normal one
  const mode = item.blend && item.blend !== 'normal' ? item.blend : blend;
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = compositeOp(mode);
  switch (item.type) {
    case 'path':
      drawPath(ctx, item, m, outline, s);
      break;
    case 'group': {
      // only the items of the timeline being edited have previews
      const preview = depth === 0 ? s.preview : undefined;
      for (const child of item.children) {
        drawItem(ctx, preview?.get(child.id) ?? child, m, a, mode, outline, s, offset, depth);
      }
      break;
    }
    case 'text':
      drawText(ctx, item, m, outline, s);
      break;
    case 'image':
      drawImage(ctx, item, m, outline, s);
      break;
    case 'instance':
      drawInstance(ctx, item, m, a, mode, outline, s, offset, depth);
      break;
  }
}

// the layers bottom to top, base maps world units to device pixels. from and to pick a run of them,
// the rig and the folders still come from the whole list
export function renderLayers(
  ctx: Ctx2D,
  layers: Layer[],
  base: Mat,
  opts: RenderOptions,
  from = 0,
  to = layers.length - 1
) {
  // bound items show bent by the rig of their timeline at this frame
  const rig = rigFor(layers, opts.frame, opts.pose ?? null);
  const s: DrawState = { opts, viewScale: scaleFactor(base), preview: rig ? undefined : opts.preview };
  ctx.save();
  forgetLine(ctx);
  for (let i = Math.max(0, from); i <= Math.min(to, layers.length - 1); i++) {
    const layer = layers[i];
    if (layer.type === 'folder' || layer.type === 'rig' || !isLayerShown(layers, layer)) continue;
    if (opts.noGuides && layer.type === 'guide') continue;
    const outline = opts.outline || layer.outline ? layer.color : null;
    const offset = opts.frame - (keyframeAt(layer, opts.frame)?.frame ?? 0);
    for (const item of itemsAt(layer, opts.frame)) {
      const src = opts.preview?.get(item.id) ?? item;
      const shown = rig ? posed(src, IDENTITY, rig, opts.preview) : src;
      drawItem(ctx, shown, base, 1, 'normal', outline, s, offset, 0);
    }
    if (opts.added) {
      for (const added of opts.added) {
        if (added.layerId === layer.id) drawItem(ctx, added.item, base, 1, 'normal', outline, s, offset, 0);
      }
    }
  }
  ctx.restore();
  forgetLine(ctx);
}

export interface GridLook {
  size: number;
  color: string;
  // lines inside each cell, 1 for none
  subdivisions?: number;
  // 0 to 1
  opacity?: number;
}

// the lines every step device pixels, the ones on a multiple of skip left out
function gridLines(ctx: Ctx2D, step: number, skip: number, x0: number, y0: number, x1: number, y1: number) {
  const top = Math.max(y0, 0);
  const left = Math.max(x0, 0);
  ctx.beginPath();
  for (let i = Math.max(1, Math.ceil(-x0 / step)); x0 + i * step < x1; i++) {
    if (skip > 1 && i % skip === 0) continue;
    const px = Math.round(x0 + i * step) + 0.5;
    ctx.moveTo(px, top);
    ctx.lineTo(px, y1);
  }
  for (let i = Math.max(1, Math.ceil(-y0 / step)); y0 + i * step < y1; i++) {
    if (skip > 1 && i % skip === 0) continue;
    const py = Math.round(y0 + i * step) + 0.5;
    ctx.moveTo(left, py);
    ctx.lineTo(x1, py);
  }
  ctx.stroke();
}

// one device pixel lines, only the ones inside both the stage and the canvas, the subdivisions fainter
function drawGrid(ctx: Ctx2D, v: RenderView, grid: GridLook, x: number, y: number, w: number, h: number) {
  const dpr = v.dpr;
  const step = grid.size * v.zoom * dpr;
  if (step < 5) return;
  const x0 = x * dpr;
  const y0 = y * dpr;
  const x1 = Math.min((x + w) * dpr, v.width * dpr);
  const y1 = Math.min((y + h) * dpr, v.height * dpr);
  const alpha = grid.opacity ?? 0.45;
  const subs = Math.max(1, Math.round(grid.subdivisions ?? 1));

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = 1;
  if (subs > 1 && step / subs >= 5) {
    ctx.globalAlpha = alpha * 0.4;
    gridLines(ctx, step / subs, subs, x0, y0, x1, y1);
  }
  ctx.globalAlpha = alpha;
  gridLines(ctx, step, 1, x0, y0, x1, y1);
  ctx.restore();
}

let dimSurface: Surface | null = null;
let dimKey: unknown[] = [];

function sameKey(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// everything around an open symbol, drawn once offscreen and laid down faint. it only changes when
// the document, the view or the frames of the levels do, so drags inside the symbol stay cheap
function drawDimmed(ctx: Ctx2D, levels: DimLevel[], view: Mat, opts: RenderOptions) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const key: unknown[] = [w, h, ...view, opts.outline, opts.assets, currentLibrary()];
  for (const l of levels) key.push(l.layers, l.frame, l.skip, ...l.base);
  if (!dimSurface || dimSurface.width !== w || dimSurface.height !== h || !sameKey(key, dimKey)) {
    dimSurface = sized(dimSurface, w, h);
    const t = context(dimSurface);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    for (const l of levels) {
      renderLayers(t, l.layers, multiply(view, l.base), {
        frame: l.frame,
        outline: opts.outline,
        assets: opts.assets,
        hide: l.skip
      });
    }
    dimKey = key;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = DIM_ALPHA;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(dimSurface, 0, 0);
  ctx.restore();
}

// the stage background and everything under the first live layer
function drawUnder(ctx: Ctx2D, doc: Doc, layers: Layer[], v: RenderView, opts: StageOptions, upTo: number) {
  const dpr = v.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = opts.colors.pasteboard;
  ctx.fillRect(0, 0, v.width, v.height);

  // shadow sizes are in device pixels, the transform does not scale them
  ctx.save();
  if (opts.shadow !== false) {
    ctx.shadowColor = opts.colors.shadow;
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowOffsetY = 3 * dpr;
  }
  ctx.fillStyle = doc.bg;
  ctx.fillRect(v.panX, v.panY, doc.width * v.zoom, doc.height * v.zoom);
  ctx.restore();

  ctx.save();
  clipStage(ctx, doc, v, opts);
  const base = baseMatrix(v, opts);
  if (opts.edit) drawDimmed(ctx, opts.edit.dim, viewMatrix(v), opts);
  if (opts.onion) {
    const key = `${opts.onion.key}|${base.join(',')}|${opts.outline}|${libraryStamp()}`;
    drawOnion(ctx, layers, key, opts.onion.options, (target, frame, outline) => {
      renderLayers(target, layers, base, { frame, outline: outline || opts.outline, assets: opts.assets });
    });
  }
  renderLayers(ctx, layers, base, opts, 0, upTo - 1);
  ctx.restore();
}

function viewMatrix(v: RenderView): Mat {
  return [v.dpr * v.zoom, 0, 0, v.dpr * v.zoom, v.dpr * v.panX, v.dpr * v.panY];
}

// a symbol open in place draws its layers through the place of the instance
function baseMatrix(v: RenderView, opts: StageOptions): Mat {
  const view = viewMatrix(v);
  return opts.edit ? multiply(view, opts.edit.base) : view;
}

// without the pasteboard everything is cut at the edge of the stage
function clipStage(ctx: Ctx2D, doc: Doc, v: RenderView, opts: StageOptions) {
  if (opts.pasteboard) return;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.beginPath();
  ctx.rect(v.panX, v.panY, doc.width * v.zoom, doc.height * v.zoom);
  ctx.clip();
}

// counts fonts and pictures that arrived, what was drawn before them is stale
let epoch = 0;

export function invalidateStageCache() {
  epoch++;
}

// one kept picture of some layers: a key seen two draws in a row is drawn once into the surface and
// laid down from then on. a key that changes on every draw, like scrubbing, never pays for the copy
interface Slot {
  surface: Surface | null;
  key: unknown[];
  built: boolean;
  seen: unknown[];
}

const under: Slot = { surface: null, key: [], built: false, seen: [] };
const above: Slot = { surface: null, key: [], built: false, seen: [] };

function throughSlot(ctx: Ctx2D, slot: Slot, key: unknown[], draw: (target: Ctx2D) => void) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const fits = slot.surface !== null && slot.surface.width === w && slot.surface.height === h;
  if (!(slot.built && fits && sameKey(slot.key, key))) {
    if (!sameKey(slot.seen, key)) {
      slot.seen = key;
      slot.built = false;
      draw(ctx);
      return;
    }
    slot.surface = sized(slot.surface, w, h);
    const t = context(slot.surface);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    draw(t);
    slot.key = key;
    slot.built = true;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(slot.surface!, 0, 0);
  ctx.restore();
}

function holdsAny(items: Item[], ids: Map<string, Item> | undefined): boolean {
  if (!ids || ids.size === 0) return false;
  for (const item of items) {
    if (ids.has(item.id)) return true;
    if (item.type === 'group' && holdsAny(item.children, ids)) return true;
  }
  return false;
}

// the run of layers that draws live: the active one and every layer a tool is changing
function liveRange(layers: Layer[], opts: StageOptions): { from: number; to: number } | null {
  if (opts.pose) return null;
  let from = layers.length;
  let to = -1;
  layers.forEach((layer, i) => {
    const live =
      layer.id === opts.active ||
      opts.added?.some((a) => a.layerId === layer.id) ||
      holdsAny(itemsAt(layer, opts.frame), opts.preview);
    if (!live) return;
    from = Math.min(from, i);
    to = Math.max(to, i);
  });
  // nothing live, every layer goes into the picture underneath
  if (to < from) return { from: layers.length, to: layers.length - 1 };
  return { from, to };
}

// a blend mode mixes with what is under it, drawn into an empty picture it would come out wrong
function blends(items: Item[], depth = 0): boolean {
  for (const item of items) {
    if (item.blend && item.blend !== 'normal') return true;
    if (item.type === 'group' && blends(item.children, depth)) return true;
    if (item.type === 'instance' && depth < MAX_NESTING) {
      for (const slice of instanceSlices(item, 0)) if (blends(slice.items, depth + 1)) return true;
    }
  }
  return false;
}

function layersBlend(layers: Layer[], frame: number, from: number): boolean {
  for (let i = from; i < layers.length; i++) if (blends(itemsAt(layers[i], frame))) return true;
  return false;
}

// what the pictures of the layers depend on besides the run they hold
function sharedKey(ctx: Ctx2D, doc: Doc, layers: Layer[], v: RenderView, opts: StageOptions): unknown[] {
  return [
    ctx.canvas.width,
    ctx.canvas.height,
    v.zoom,
    v.panX,
    v.panY,
    v.dpr,
    layers,
    opts.frame,
    opts.outline,
    opts.assets,
    opts.hide,
    opts.pasteboard,
    doc.width,
    doc.height,
    currentLibrary(),
    epoch
  ];
}

// pasteboard, the stage with its shadow, the artwork and the grid on top. while editing, the layers
// under and over the live ones are kept as two pictures, so a drag only draws the layers it changes
export function renderStage(ctx: Ctx2D, doc: Doc, layers: Layer[], v: RenderView, opts: StageOptions) {
  const live = opts.cache ? liveRange(layers, opts) : null;
  if (!live) {
    drawUnder(ctx, doc, layers, v, opts, layers.length);
  } else {
    const shared = sharedKey(ctx, doc, layers, v, opts);
    const underKey = [...shared, live.from, doc.bg, opts.colors.pasteboard, opts.colors.shadow, opts.shadow];
    underKey.push(opts.onion?.key ?? null);
    if (opts.edit) {
      underKey.push(...opts.edit.base);
      for (const l of opts.edit.dim) underKey.push(l.layers, l.frame, l.skip, ...l.base);
    }
    throughSlot(ctx, under, underKey, (t) => drawUnder(t, doc, layers, v, opts, live.from));

    const base = baseMatrix(v, opts);
    const drawRun = (t: Ctx2D, from: number, to: number) => {
      t.save();
      clipStage(t, doc, v, opts);
      renderLayers(t, layers, base, opts, from, to);
      t.restore();
    };
    drawRun(ctx, live.from, live.to);
    const top = live.to + 1;
    if (top < layers.length) {
      if (layersBlend(layers, opts.frame, top)) drawRun(ctx, top, layers.length - 1);
      else throughSlot(ctx, above, [...shared, top], (t) => drawRun(t, top, layers.length - 1));
    }
  }
  if (opts.grid) drawGrid(ctx, v, opts.grid, v.panX, v.panY, doc.width * v.zoom, doc.height * v.zoom);
}
