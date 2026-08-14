import type { Asset, Doc, ImageItem, InstanceItem, Item, Layer, Mat, PathItem, TextItem } from '$lib/core/types';
import { multiply, scaleFactor } from '$lib/core/mat';
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
}

export interface StageOptions extends RenderOptions {
  // false clips everything to the stage rect
  pasteboard: boolean;
  grid: { size: number; color: string } | null;
  colors: { pasteboard: string; shadow: string };
  // ghosts of the frames around this one under the artwork, key says when they need drawing again
  onion?: { options: OnionOptions; key: string } | null;
  // a symbol open in place: what is around it shows dimmed and its layers are drawn through base
  edit?: { base: Mat; dim: DimLevel[] } | null;
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
    img.onload = () => onImageLoad?.();
    img.src = asset.data;
    images.set(asset.id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function setMatrix(ctx: Ctx2D, m: Mat) {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

function drawPath(ctx: Ctx2D, item: PathItem, m: Mat, outline: string | null, s: DrawState) {
  if (item.path.anchors.length === 0) return;
  setMatrix(ctx, m);
  const shape = shapePath2D(item.path, item.subpaths);
  const scale = Math.max(scaleFactor(m), 1e-9);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([]);
    ctx.stroke(shape);
    return;
  }
  const style = item.style;
  const box = needsBox(style.fill) || needsBox(style.stroke) ? compoundBounds(item.path, item.subpaths) : null;
  if (style.fill) {
    ctx.fillStyle = canvasPaint(ctx, style.fill, box);
    ctx.fill(shape);
  }
  if (style.stroke && style.width > 0) {
    // without scale stroke the width stays in world units whatever the item transform does
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

// the glyph outlines of the laid out text, filled and stroked like a path
function drawText(ctx: Ctx2D, item: TextItem, m: Mat, outline: string | null, s: DrawState) {
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
  for (const slice of instanceSlices(item, offset)) {
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
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalAlpha = 1;
  t.globalCompositeOperation = 'source-over';
  t.clearRect(x0, y0, x1 - x0, y1 - y0);
  for (const slice of instanceSlices(item, offset)) {
    for (const child of slice.items) drawItem(t, child, m, 1, 'normal', null, s, slice.offset, depth + 1);
  }
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-atop';
  t.globalAlpha = Math.min(1, item.tintAmount);
  t.fillStyle = item.tint!;
  t.fillRect(x0, y0, x1 - x0, y1 - y0);
  t.globalCompositeOperation = 'source-over';
  t.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = compositeOp(mode);
  ctx.drawImage(surf, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

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
  const m = multiply(parent, item.transform);
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
      const preview = depth === 0 ? s.opts.preview : undefined;
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

// the layers bottom to top, base maps world units to device pixels
export function renderLayers(ctx: Ctx2D, layers: Layer[], base: Mat, opts: RenderOptions) {
  const s: DrawState = { opts, viewScale: scaleFactor(base) };
  ctx.save();
  for (const layer of layers) {
    if (layer.type === 'folder' || layer.type === 'rig' || !isLayerShown(layers, layer)) continue;
    const outline = opts.outline || layer.outline ? layer.color : null;
    const offset = opts.frame - (keyframeAt(layer, opts.frame)?.frame ?? 0);
    for (const item of itemsAt(layer, opts.frame)) {
      drawItem(ctx, opts.preview?.get(item.id) ?? item, base, 1, 'normal', outline, s, offset, 0);
    }
    if (opts.added) {
      for (const added of opts.added) {
        if (added.layerId === layer.id) drawItem(ctx, added.item, base, 1, 'normal', outline, s, offset, 0);
      }
    }
  }
  ctx.restore();
}

// one device pixel lines, only the ones inside both the stage and the canvas
function drawGrid(ctx: Ctx2D, v: RenderView, grid: { size: number; color: string }, x: number, y: number, w: number, h: number) {
  const dpr = v.dpr;
  const step = grid.size * v.zoom * dpr;
  if (step < 5) return;
  const x0 = x * dpr;
  const y0 = y * dpr;
  const x1 = Math.min((x + w) * dpr, v.width * dpr);
  const y1 = Math.min((y + h) * dpr, v.height * dpr);
  const top = Math.max(y0, 0);
  const left = Math.max(x0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = grid.color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = Math.max(1, Math.ceil(-x0 / step)); x0 + i * step < x1; i++) {
    const px = Math.round(x0 + i * step) + 0.5;
    ctx.moveTo(px, top);
    ctx.lineTo(px, y1);
  }
  for (let i = Math.max(1, Math.ceil(-y0 / step)); y0 + i * step < y1; i++) {
    const py = Math.round(y0 + i * step) + 0.5;
    ctx.moveTo(left, py);
    ctx.lineTo(x1, py);
  }
  ctx.stroke();
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

// pasteboard, the stage with its shadow, the artwork and the grid on top
export function renderStage(ctx: Ctx2D, doc: Doc, layers: Layer[], v: RenderView, opts: StageOptions) {
  const dpr = v.dpr;
  const x = v.panX;
  const y = v.panY;
  const w = doc.width * v.zoom;
  const h = doc.height * v.zoom;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = opts.colors.pasteboard;
  ctx.fillRect(0, 0, v.width, v.height);

  // shadow sizes are in device pixels, the transform does not scale them
  ctx.save();
  ctx.shadowColor = opts.colors.shadow;
  ctx.shadowBlur = 24 * dpr;
  ctx.shadowOffsetY = 3 * dpr;
  ctx.fillStyle = doc.bg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.save();
  if (!opts.pasteboard) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }
  const view: Mat = [dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY];
  let base = view;
  if (opts.edit) {
    drawDimmed(ctx, opts.edit.dim, view, opts);
    base = multiply(view, opts.edit.base);
  }
  if (opts.onion) {
    const key = `${opts.onion.key}|${base.join(',')}|${opts.outline}|${libraryStamp()}`;
    drawOnion(ctx, layers, key, opts.onion.options, (target, frame, outline) => {
      renderLayers(target, layers, base, { frame, outline: outline || opts.outline, assets: opts.assets });
    });
  }
  renderLayers(ctx, layers, base, opts);
  ctx.restore();

  if (opts.grid) drawGrid(ctx, v, opts.grid, x, y, w, h);
}
