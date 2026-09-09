import type { Doc } from '$lib/core/types';
import { canvasBlob, frameCanvas, prepareExport, scaledSize } from './render';

// one frame of the main timeline as a png at scale, on the background or see through
export async function exportPng(doc: Doc, frame: number, scale: number, transparent: boolean): Promise<Blob> {
  await prepareExport(doc);
  const { width, height } = scaledSize(doc, scale);
  const out = frameCanvas(doc, width, height, transparent);
  out.draw(frame);
  return canvasBlob(out.canvas);
}
