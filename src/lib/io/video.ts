import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, WebMOutputFormat } from 'mediabunny';
import { canEncodeVideo } from 'mediabunny';
import type { Doc } from '$lib/core/types';
import { abortError, breath, checkAbort, frameCanvas, prepareExport, scaledSize } from './render';
import type { ExportRange, Progress } from './render';

export type VideoFormat = 'webm' | 'mp4';

export interface VideoOptions {
  format: VideoFormat;
  range: ExportRange;
  scale: number;
  // 0 to 1, the slider maps it to a bitrate
  quality: number;
  // webm only, vp9 keeps the alpha
  transparent: boolean;
}

// bits per pixel and frame from 0.02 to 0.2, a flat drawing needs far less than film
export function videoBitrate(width: number, height: number, fps: number, quality: number): number {
  const q = Math.max(0, Math.min(1, quality));
  const bpp = 0.02 + q * 0.18;
  return Math.round(Math.max(200_000, Math.min(40_000_000, width * height * fps * bpp)));
}

const CODECS = { webm: 'vp9', mp4: 'avc' } as const;

// mp4 needs an h.264 encoder, not every browser has one
export async function canExport(format: VideoFormat, width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return await canEncodeVideo(CODECS[format], { width, height });
  } catch {
    return false;
  }
}

export async function exportVideo(doc: Doc, o: VideoOptions, signal?: AbortSignal, progress?: Progress): Promise<Blob> {
  await prepareExport(doc);
  const { width, height } = scaledSize(doc, o.scale, true);
  const alpha = o.format === 'webm' && o.transparent;
  const out = frameCanvas(doc, width, height, alpha);
  const target = new BufferTarget();
  const format = o.format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
  const output = new Output({ format, target });
  const source = new CanvasSource(out.canvas, {
    codec: CODECS[o.format],
    quality: new Quality({ bitrate: videoBitrate(width, height, doc.fps, o.quality) }),
    alpha: alpha ? 'keep' : 'discard',
    latencyMode: 'quality'
  });
  output.addVideoTrack(source, { frameRate: doc.fps });
  const count = o.range.to - o.range.from + 1;
  try {
    await output.start();
    for (let i = 0; i < count; i++) {
      checkAbort(signal);
      out.draw(o.range.from + i);
      await source.add(i / doc.fps, 1 / doc.fps);
      progress?.((i + 1) / count);
      if (i % 2 === 1) await breath();
    }
    source.close();
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw signal?.aborted ? abortError() : e;
  }
  if (!target.buffer) throw new Error('The video came out empty');
  return new Blob([target.buffer], { type: format.mimeType });
}
