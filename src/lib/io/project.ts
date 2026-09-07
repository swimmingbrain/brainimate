import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Asset, Doc } from '$lib/core/types';
import { pruneAssets } from '$lib/core/assets';
import { migrateDoc } from '$lib/core/migrate';

// a .brainimate file is a zip of document.json and the assets as files next to it
export const PROJECT_EXT = '.brainimate';
export const PROJECT_MIME = 'application/zip';
export const DOC_VERSION = 1;
const DOC_FILE = 'document.json';

export class ProjectError extends Error {}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2'
};

// browsers name font files in more than one way
const ALIASES: Record<string, string> = {
  'image/jpg': 'jpg',
  'application/x-font-ttf': 'ttf',
  'application/x-font-otf': 'otf',
  'application/font-woff': 'woff',
  'font/sfnt': 'ttf'
};

function extOf(mime: string): string {
  const known = Object.entries(MIME).find(([, m]) => m === mime);
  return known ? known[0] : (ALIASES[mime] ?? 'bin');
}

function mimeOf(file: string): string {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

// the type and the bytes a data url holds
export function dataUrlBytes(url: string): { mime: string; bytes: Uint8Array } {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) throw new ProjectError('An asset is not a data url');
  const head = url.slice(5, comma);
  const mime = head.split(';')[0] || 'application/octet-stream';
  const body = url.slice(comma + 1);
  if (!head.includes(';base64')) return { mime, bytes: strToU8(decodeURIComponent(body)) };
  const text = atob(body);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return { mime, bytes };
}

export function bytesDataUrl(bytes: Uint8Array, mime: string): string {
  let text = '';
  // in pieces, a long argument list would overflow the stack
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(text)}`;
}

// the zip bytes: the document with each asset's data swapped for its file name, assets nothing
// uses are left behind. pictures and fonts are stored as they are, the json is compressed
export function packDoc(doc: Doc): Uint8Array {
  const pruned = pruneAssets(doc);
  const files: Zippable = {};
  const assets: Record<string, Asset> = {};
  const stored: Zippable = {};
  for (const asset of Object.values(pruned.assets)) {
    const { mime, bytes } = dataUrlBytes(asset.data);
    const file = `assets/${asset.id}.${extOf(mime)}`;
    stored[file] = [bytes, { level: 0 }];
    assets[asset.id] = { ...asset, data: file };
  }
  files[DOC_FILE] = [strToU8(JSON.stringify({ ...pruned, assets })), { level: 6 }];
  return zipSync({ ...files, ...stored });
}

export function serialize(doc: Doc): Blob {
  return new Blob([packDoc(doc) as Uint8Array<ArrayBuffer>], { type: PROJECT_MIME });
}

export interface Parsed {
  doc: Doc;
  // made by a newer version of the app, parts of it may not show
  newer: boolean;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

const NOT_A_DOC = 'The file is not a brainIMATE document';

function readJson(text: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ProjectError(NOT_A_DOC);
  }
  if (!isObject(raw)) throw new ProjectError(NOT_A_DOC);
  return raw;
}

function positive(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// what the rest of the app needs is checked and filled in, every field it does not know is kept
function toDoc(raw: Record<string, unknown>): Parsed {
  if (!Array.isArray(raw.layers) || !positive(raw.width) || !positive(raw.height)) throw new ProjectError(NOT_A_DOC);
  const newer = typeof raw.version === 'number' && raw.version > DOC_VERSION;
  const doc = raw as unknown as Doc;
  doc.version = DOC_VERSION;
  if (typeof doc.name !== 'string' || !doc.name.trim()) doc.name = 'Untitled';
  if (!positive(doc.fps)) doc.fps = 24;
  if (typeof doc.bg !== 'string') doc.bg = '#ffffff';
  if (!isObject(doc.symbols)) doc.symbols = {};
  if (!isObject(doc.assets)) doc.assets = {};
  for (const [id, asset] of Object.entries(doc.assets)) {
    if (!isObject(asset) || typeof asset.data !== 'string' || !asset.data.startsWith('data:')) delete doc.assets[id];
  }
  return { doc: migrateDoc(doc), newer };
}

// the zip or a plain json with the assets as data urls
export function parseBytes(bytes: Uint8Array): Parsed {
  if (!isZip(bytes)) return toDoc(readJson(strFromU8(bytes)));
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ProjectError('The file is damaged and cannot be read');
  }
  const json = files[DOC_FILE];
  if (!json) throw new ProjectError('There is no document in this file');
  const raw = readJson(strFromU8(json));
  if (isObject(raw.assets)) {
    for (const asset of Object.values(raw.assets)) {
      if (!isObject(asset) || typeof asset.data !== 'string') continue;
      const file = files[asset.data];
      if (file) asset.data = bytesDataUrl(file, mimeOf(asset.data));
    }
  }
  return toDoc(raw);
}

export async function parse(file: Blob): Promise<Parsed> {
  return parseBytes(new Uint8Array(await file.arrayBuffer()));
}

// a name the file system takes, from the document name
export function projectFileName(name: string, ext = PROJECT_EXT): string {
  const clean = name
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${(clean || 'Untitled').slice(0, 120)}${ext}`;
}

// the document name a file brings, without the extension
export function nameFromFile(file: string): string {
  return file.replace(/\.(brainimate|json)$/i, '').trim() || 'Untitled';
}
