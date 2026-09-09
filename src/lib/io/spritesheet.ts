import { strToU8, zipSync } from 'fflate';
import type { Doc } from '$lib/core/types';
import { context, surface } from '$lib/render/surface';
import { breath, canvasBlob, checkAbort, frameCanvas, prepareExport, scaledSize } from './render';
import type { ExportRange, Progress } from './render';
import { frameFileName } from './sequence';
import { version } from '$lib/version';

export interface SpriteOptions {
  range: ExportRange;
  scale: number;
  // 0 picks about a square sheet
  columns: number;
  // clear pixels around every frame
  padding: number;
  transparent: boolean;
  name: string;
}

export interface SpriteLayout {
  columns: number;
  rows: number;
  width: number;
  height: number;
  // the top left corner of each frame
  cells: { x: number; y: number }[];
}

// browsers refuse canvases with a longer side
export const MAX_SHEET = 16384;

// frames left to right, then down, with the padding around each one
export function spriteLayout(
  count: number,
  frameW: number,
  frameH: number,
  columns: number,
  padding: number
): SpriteLayout {
  const n = Math.max(1, count);
  const cols = Math.max(1, Math.min(n, Math.round(columns) || Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  const pad = Math.max(0, Math.round(padding));
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({ x: pad + (i % cols) * (frameW + pad), y: pad + Math.floor(i / cols) * (frameH + pad) });
  }
  return { columns: cols, rows, width: cols * (frameW + pad) + pad, height: rows * (frameH + pad) + pad, cells };
}

export interface SpriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

// the json hash game engines read, like texture packer writes it
export function spriteJson(
  name: string,
  layout: SpriteLayout,
  frameW: number,
  frameH: number,
  scale: number,
  fps: number
) {
  const frames: Record<string, SpriteFrame> = {};
  layout.cells.forEach((cell, i) => {
    frames[frameFileName(name, i + 1, '')] = {
      frame: { x: cell.x, y: cell.y, w: frameW, h: frameH },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
      sourceSize: { w: frameW, h: frameH },
      duration: Math.round(1000 / fps)
    };
  });
  return {
    frames,
    meta: {
      app: 'brainIMATE',
      version,
      image: `${name}.png`,
      format: 'RGBA8888',
      size: { w: layout.width, h: layout.height },
      scale,
      fps
    }
  };
}

export interface SpriteSheet {
  png: Blob;
  json: string;
}

export async function exportSpriteSheet(
  doc: Doc,
  o: SpriteOptions,
  signal?: AbortSignal,
  progress?: Progress
): Promise<SpriteSheet> {
  await prepareExport(doc);
  const { width, height } = scaledSize(doc, o.scale);
  const count = o.range.to - o.range.from + 1;
  const layout = spriteLayout(count, width, height, o.columns, o.padding);
  if (layout.width > MAX_SHEET || layout.height > MAX_SHEET) {
    const size = `${layout.width} by ${layout.height} pixels`;
    throw new Error(`The sheet would be ${size}, use fewer frames or a smaller scale`);
  }
  const out = frameCanvas(doc, width, height, o.transparent);
  const sheet = surface(layout.width, layout.height);
  const ctx = context(sheet);
  for (let i = 0; i < count; i++) {
    checkAbort(signal);
    out.draw(o.range.from + i);
    ctx.drawImage(out.canvas, layout.cells[i].x, layout.cells[i].y);
    progress?.((i + 1) / count);
    await breath();
  }
  const png = await canvasBlob(sheet);
  const json = JSON.stringify(spriteJson(o.name, layout, width, height, o.scale, doc.fps), null, 2);
  return { png, json };
}

// the sheet and its json in one zip
export async function spriteZip(name: string, sheet: SpriteSheet): Promise<Blob> {
  const png = new Uint8Array(await sheet.png.arrayBuffer());
  const zip = zipSync({ [`${name}.png`]: [png, { level: 0 }], [`${name}.json`]: [strToU8(sheet.json), { level: 6 }] });
  return new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
