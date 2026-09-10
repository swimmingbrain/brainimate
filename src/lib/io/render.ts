import type { Doc, Mat, TextItem } from '$lib/core/types';
import { setLibrary } from '$lib/render/frame';
import { loadImages, renderLayers } from '$lib/render/renderer';
import { context, surface, type Surface, type SurfaceCtx } from '$lib/render/surface';
import { loadFont } from '$lib/core/fonts';
import { eachItem } from '$lib/core/library';

// frames an export covers, 0 based with both ends in
export interface ExportRange {
  from: number;
  to: number;
}

// the frames asked for inside the document, all of them without a range
export function exportRange(length: number, range: ExportRange | null): ExportRange {
  const last = Math.max(0, length - 1);
  if (!range) return { from: 0, to: last };
  const clamp = (v: number) => Math.max(0, Math.min(last, Math.round(v)));
  const a = clamp(Math.min(range.from, range.to));
  const b = clamp(Math.max(range.from, range.to));
  return { from: a, to: b };
}

// the document frames an export at fps shows, a lower rate skips frames and a higher one holds them
export function exportFrames(range: ExportRange, docFps: number, fps: number): number[] {
  const span = range.to - range.from + 1;
  const count = Math.max(1, Math.round((span * fps) / docFps));
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.min(range.to, range.from + Math.floor((i * docFps) / fps + 1e-9)));
  return out;
}

// the pixel size of the document at scale, video encoders want even sides
export function scaledSize(doc: Pick<Doc, 'width' | 'height'>, scale: number, even = false) {
  let width = Math.max(1, Math.round(doc.width * scale));
  let height = Math.max(1, Math.round(doc.height * scale));
  if (even) {
    width = Math.max(2, width - (width % 2));
    height = Math.max(2, height - (height % 2));
  }
  return { width, height };
}

export interface FrameCanvas {
  canvas: Surface;
  ctx: SurfaceCtx;
  width: number;
  height: number;
  // draws frame of the main timeline, posed rigs included, guides and onion skins left out
  draw(frame: number): void;
}

// readback asks for a canvas that is cheap to read pixels from, the gif reads every frame
export function frameCanvas(
  doc: Doc,
  width: number,
  height: number,
  transparent: boolean,
  readback = false
): FrameCanvas {
  const canvas = surface(width, height);
  const ctx = readback ? (canvas.getContext('2d', { willReadFrequently: true }) as SurfaceCtx) : context(canvas);
  const base: Mat = [width / doc.width, 0, 0, height / doc.height, 0, 0];
  const draw = (frame: number) => {
    setLibrary(doc.symbols);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    if (!transparent) {
      ctx.fillStyle = doc.bg;
      ctx.fillRect(0, 0, width, height);
    }
    renderLayers(ctx, doc.layers, base, { frame, outline: false, assets: doc.assets, noGuides: true });
  };
  return { canvas, ctx, width, height, draw };
}

// the fonts every text of the document uses, loaded before a frame is drawn
export async function loadFonts(doc: Doc) {
  const wanted = new Map<string, TextItem>();
  const visit = (item: Doc['layers'][number]['keyframes'][number]['items'][number]) => {
    if (item.type === 'text') wanted.set(`${item.font}|${item.weight}|${item.italic}`, item);
  };
  eachItem(doc.layers, visit);
  for (const symbol of Object.values(doc.symbols)) eachItem(symbol.layers, visit);
  await Promise.all([...wanted.values()].map((t) => loadFont(t.font, t.weight, t.italic)));
}

// pictures decoded and fonts loaded, so the first frame already shows everything
export async function prepareExport(doc: Doc) {
  setLibrary(doc.symbols);
  await Promise.all([loadImages(doc.assets), loadFonts(doc)]);
}

export function canvasBlob(canvas: Surface, type = 'image/png'): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made'))), type);
  });
}

// a frame letterboxed into w by h as a png data url, for the recent files
export async function thumbnail(doc: Doc, frame = 0, w = 160, h = 90): Promise<string> {
  await prepareExport(doc);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const k = Math.min(w / doc.width, h / doc.height);
  const x = (w - doc.width * k) / 2;
  const y = (h - doc.height * k) / 2;
  ctx.fillStyle = doc.bg;
  ctx.fillRect(x, y, doc.width * k, doc.height * k);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, doc.width * k, doc.height * k);
  ctx.clip();
  renderLayers(ctx, doc.layers, [k, 0, 0, k, x, y], { frame, outline: false, assets: doc.assets, noGuides: true });
  ctx.restore();
  return canvas.toDataURL('image/png');
}

// long exports give the page a moment between frames so it keeps drawing and cancel stays clickable
export function breath(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function abortError(): DOMException {
  return new DOMException('The export was cancelled', 'AbortError');
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

// how far an export is, 0 to 1
export type Progress = (done: number) => void;
