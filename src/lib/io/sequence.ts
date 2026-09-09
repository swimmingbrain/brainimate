import { zipSync, type Zippable } from 'fflate';
import type { Doc } from '$lib/core/types';
import { breath, canvasBlob, checkAbort, frameCanvas, prepareExport, scaledSize } from './render';
import type { ExportRange, Progress } from './render';

export interface SequenceOptions {
  range: ExportRange;
  scale: number;
  transparent: boolean;
  // the start of every file name in the zip
  name: string;
}

// name_0001.png, counted from 1 inside the export
export function frameFileName(name: string, n: number, ext = '.png'): string {
  return `${name}_${String(n).padStart(4, '0')}${ext}`;
}

// a png per frame in a zip, stored as they are since pngs are compressed already
export async function exportSequence(
  doc: Doc,
  o: SequenceOptions,
  signal?: AbortSignal,
  progress?: Progress
): Promise<Blob> {
  await prepareExport(doc);
  const { width, height } = scaledSize(doc, o.scale);
  const out = frameCanvas(doc, width, height, o.transparent);
  const files: Zippable = {};
  const count = o.range.to - o.range.from + 1;
  for (let i = 0; i < count; i++) {
    checkAbort(signal);
    out.draw(o.range.from + i);
    const png = new Uint8Array(await (await canvasBlob(out.canvas)).arrayBuffer());
    files[frameFileName(o.name, i + 1)] = [png, { level: 0 }];
    progress?.((i + 1) / count);
    await breath();
  }
  checkAbort(signal);
  return new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
