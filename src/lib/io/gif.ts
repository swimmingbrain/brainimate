import { applyPalette, GIFEncoder, quantize, type Palette } from 'gifenc';
import type { Doc } from '$lib/core/types';
import { breath, checkAbort, exportFrames, frameCanvas, prepareExport, scaledSize } from './render';
import type { ExportRange, Progress } from './render';

export interface GifOptions {
  range: ExportRange;
  scale: number;
  fps: number;
  loop: boolean;
  transparent: boolean;
  dither: boolean;
}

// a gif counts its delays in hundredths of a second, so the rate snaps to one it can hold
export function gifDelay(fps: number): number {
  const centiseconds = Math.max(2, Math.round(100 / Math.max(1, fps)));
  return centiseconds * 10;
}

// the frames the palette is built from, every 4th and the last one
export function paletteFrames(count: number, every = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += every) out.push(i);
  if (count > 0 && out[out.length - 1] !== count - 1) out.push(count - 1);
  return out;
}

// the pixels of the sample frames in one buffer for the quantizer, thinned out evenly so a long or
// large export does not need a huge one
export function mergeSamples(frames: Uint8ClampedArray[], maxPixels = 1 << 20): Uint8ClampedArray {
  const total = frames.reduce((n, f) => n + f.length / 4, 0);
  const step = Math.max(1, Math.ceil(total / maxPixels));
  const out = new Uint8ClampedArray(Math.ceil(total / step) * 4);
  let o = 0;
  let k = 0;
  for (const f of frames) {
    for (let p = 0; p < f.length; p += 4, k++) {
      if (k % step !== 0) continue;
      out[o] = f[p];
      out[o + 1] = f[p + 1];
      out[o + 2] = f[p + 2];
      out[o + 3] = f[p + 3];
      o += 4;
    }
  }
  return out.subarray(0, o);
}

// one palette for the whole animation so the colors do not flicker from frame to frame. a see
// through gif keeps one entry fully clear
export function buildPalette(samples: Uint8ClampedArray, transparent: boolean): Palette {
  if (!transparent) return quantize(samples, 256, { format: 'rgb565' });
  const withClear = new Uint8ClampedArray(samples.length + 4);
  withClear.set(samples);
  return quantize(withClear, 256, { format: 'rgba4444', oneBitAlpha: true });
}

export function clearIndex(palette: Palette): number {
  const i = palette.findIndex((c) => c.length > 3 && c[3] === 0);
  return Math.max(0, i);
}

// a 4 by 4 bayer matrix from -0.5 to 0.5
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

// ordered dithering before the palette lookup, it hides the bands a 256 color gif makes in gradients
export function dither(rgba: Uint8ClampedArray, width: number, height: number, strength = 24): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const n = BAYER[(y & 3) * 4 + (x & 3)] * strength;
      out[i] = rgba[i] + n;
      out[i + 1] = rgba[i + 1] + n;
      out[i + 2] = rgba[i + 2] + n;
      out[i + 3] = rgba[i + 3];
    }
  }
  return out;
}

export type GifEncodeOptions = Pick<GifOptions, 'fps' | 'loop' | 'transparent' | 'dither'>;

// the gif bytes of count frames, grab hands out the pixels of frame i
export async function encodeGif(
  count: number,
  grab: (i: number) => Uint8ClampedArray,
  width: number,
  height: number,
  o: GifEncodeOptions,
  signal?: AbortSignal,
  progress?: Progress
): Promise<Uint8Array> {
  const picks = paletteFrames(count);
  const samples: Uint8ClampedArray[] = [];
  for (const [n, i] of picks.entries()) {
    checkAbort(signal);
    // a copy, the canvas hands out a new buffer each time but a test may not
    samples.push(grab(i).slice());
    progress?.((0.1 * (n + 1)) / picks.length);
    await breath();
  }
  const format = o.transparent ? 'rgba4444' : 'rgb565';
  const palette = buildPalette(mergeSamples(samples), o.transparent);
  samples.length = 0;
  const transparentIndex = o.transparent ? clearIndex(palette) : 0;

  const encoder = GIFEncoder();
  const delay = gifDelay(o.fps);
  for (let i = 0; i < count; i++) {
    checkAbort(signal);
    let rgba = grab(i);
    if (o.dither) rgba = dither(rgba, width, height);
    const index = applyPalette(rgba, palette, format);
    encoder.writeFrame(index, width, height, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: o.loop ? 0 : -1,
      transparent: o.transparent,
      transparentIndex,
      // a see through frame clears what the one before left
      dispose: o.transparent ? 2 : -1
    });
    progress?.(0.1 + (0.9 * (i + 1)) / count);
    if (i % 2 === 1) await breath();
  }
  encoder.finish();
  return encoder.bytes();
}

export async function exportGif(doc: Doc, o: GifOptions, signal?: AbortSignal, progress?: Progress): Promise<Blob> {
  await prepareExport(doc);
  const frames = exportFrames(o.range, doc.fps, o.fps);
  const { width, height } = scaledSize(doc, o.scale);
  const out = frameCanvas(doc, width, height, o.transparent);
  const grab = (i: number): Uint8ClampedArray => {
    out.draw(frames[i]);
    return out.ctx.getImageData(0, 0, width, height).data;
  };
  const bytes = await encodeGif(frames.length, grab, width, height, o, signal, progress);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}
