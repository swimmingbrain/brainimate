import { get } from 'svelte/store';
import type { Asset, Mat, Symbol } from '$lib/core/types';
import { fontVersion } from '$lib/core/fonts';
import { emptyBox, isEmpty, union, type Box } from '$lib/core/bbox';
import { itemBounds } from '$lib/core/items';
import { nestedSymbols } from '$lib/core/library';
import { currentLibrary, layerSlices, libraryStamp } from './frame';
import { renderLayers } from './renderer';
import { context, surface, type Surface } from './surface';

// library rows are 40 by 30, drawn at twice the size so they stay sharp on fine screens
export const THUMB_W = 40;
export const THUMB_H = 30;
const SCALE = 2;
const PAD = 3;

// a symbol object changes with every edit of it, so it is the key. one with instances inside is
// drawn again when another symbol changed too, and all of them once a font arrived
const cache = new WeakMap<Symbol, { stamp: number; fonts: number; nested: boolean; canvas: Surface }>();

// the box of what the symbol shows on its first frame, in its own space
export function symbolBounds(symbol: Symbol, frame = 0): Box {
  let b = emptyBox();
  for (const slice of layerSlices(symbol.layers, frame)) {
    for (const item of slice.items) b = union(b, itemBounds(item, item.transform, slice.offset));
  }
  return b;
}

export function symbolThumb(symbol: Symbol, assets: Record<string, Asset>): Surface {
  const hit = cache.get(symbol);
  const fonts = get(fontVersion);
  if (hit && hit.fonts === fonts && (!hit.nested || hit.stamp === libraryStamp())) return hit.canvas;
  const canvas = hit?.canvas ?? surface(THUMB_W * SCALE, THUMB_H * SCALE);
  const ctx = context(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const b = symbolBounds(symbol);
  if (!isEmpty(b)) {
    const w = Math.max(b.maxX - b.minX, 1e-6);
    const h = Math.max(b.maxY - b.minY, 1e-6);
    // never larger than the artwork itself, a small dot stays a small dot
    const k = Math.min((THUMB_W - PAD * 2) / w, (THUMB_H - PAD * 2) / h, 1) * SCALE;
    const x = (THUMB_W * SCALE - w * k) / 2 - b.minX * k;
    const y = (THUMB_H * SCALE - h * k) / 2 - b.minY * k;
    const base: Mat = [k, 0, 0, k, x, y];
    renderLayers(ctx, symbol.layers, base, { frame: 0, outline: false, assets });
  }
  const nested = nestedSymbols(currentLibrary(), symbol.id).size > 0;
  cache.set(symbol, { stamp: libraryStamp(), fonts, nested, canvas });
  return canvas;
}
