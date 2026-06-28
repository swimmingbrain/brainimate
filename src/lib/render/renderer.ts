import type { Asset, Doc, ImageItem, Item, Layer, Mat, PathItem, TextItem } from '$lib/core/types';
import { multiply, scaleFactor } from '$lib/core/mat';
import { canvasPaint, compositeOp, needsBox, type Ctx2D } from '$lib/core/style';
import { compoundBounds } from '$lib/core/path';
import { localBounds } from '$lib/core/items';
import { shapePath2D } from './pathcache';
import { itemsAt } from './frame';

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
}

export interface StageOptions extends RenderOptions {
  // false clips everything to the stage rect
  pasteboard: boolean;
  grid: { size: number; color: string } | null;
  colors: { pasteboard: string; shadow: string };
}

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

function drawText(ctx: Ctx2D, item: TextItem, m: Mat, outline: string | null) {
  setMatrix(ctx, m);
  ctx.font = `${item.italic ? 'italic ' : ''}${item.weight} ${item.size}px ${item.font}`;
  ctx.textAlign = item.align;
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

function drawItem(ctx: Ctx2D, item: Item, parent: Mat, alpha: number, blend: string, outline: string | null, s: DrawState) {
  if (!item.visible) return;
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
    case 'group':
      for (const child of item.children) {
        drawItem(ctx, s.opts.preview?.get(child.id) ?? child, m, a, mode, outline, s);
      }
      break;
    case 'text':
      drawText(ctx, item, m, outline);
      break;
    case 'image':
      drawImage(ctx, item, m, outline, s);
      break;
    default:
      // instances are drawn once symbols exist
      break;
  }
}

// the layers bottom to top, base maps world units to device pixels
export function renderLayers(ctx: Ctx2D, layers: Layer[], base: Mat, opts: RenderOptions) {
  const s: DrawState = { opts, viewScale: scaleFactor(base) };
  ctx.save();
  for (const layer of layers) {
    if (!layer.visible || layer.type === 'folder' || layer.type === 'rig') continue;
    const outline = opts.outline || layer.outline ? layer.color : null;
    for (const item of itemsAt(layer, opts.frame)) {
      drawItem(ctx, opts.preview?.get(item.id) ?? item, base, 1, 'normal', outline, s);
    }
    if (opts.added) {
      for (const added of opts.added) if (added.layerId === layer.id) drawItem(ctx, added.item, base, 1, 'normal', outline, s);
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
  const base: Mat = [dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY];
  renderLayers(ctx, layers, base, opts);
  ctx.restore();

  if (opts.grid) drawGrid(ctx, v, opts.grid, x, y, w, h);
}
