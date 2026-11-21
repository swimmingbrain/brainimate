import { writable } from 'svelte/store';
import { createStore, del, entries, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval';
import type { Doc, Layer } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { worldMatrices } from '$lib/rig/bones';
import { applyPoint } from '$lib/core/mat';
import { isCharacterPackage, packCharacter, type CharacterPackage } from './pack';

// the characters kept in the browser: made once, put into any scene and any project, still there after
// the browser restarts. a home screen app on an ipad keeps its own library, a file moves characters
// between the two and to other devices

export interface LibraryMeta {
  id: string;
  name: string;
  updated: number;
  // a small picture of the character, a png data url
  thumb: string;
  // the character id inside, the same in every copy saved from one character
  character: string;
  // keyframes it carries, its animations
  keys: number;
  // one of the two main characters of a series, kept as it is in every project and episode
  main?: 1 | 2;
}

export interface LibraryEntry extends LibraryMeta {
  pkg: CharacterPackage;
}

let store: UseStore | null = null;

function shelf(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore('brainimate-characters', 'characters');
  return store;
}

export const library = writable<LibraryMeta[]>([]);

function meta(e: LibraryEntry): LibraryMeta {
  return { id: e.id, name: e.name, updated: e.updated, thumb: e.thumb, character: e.character, keys: e.keys, ...(e.main ? { main: e.main } : {}) };
}

// how many keyframes a character carries over its rig and body
export function keyCount(pkg: CharacterPackage): number {
  return pkg.layers.reduce((n, l) => n + (l.type === 'folder' ? 0 : Math.max(0, l.keyframes.length - 1)), 0);
}

export async function loadLibrary(): Promise<LibraryMeta[]> {
  const s = shelf();
  if (!s) return [];
  const all = (await entries<string, LibraryEntry>(s).catch(() => [])).map(([, v]) => v).filter((v) => v && isCharacterPackage(v.pkg));
  const list = all.map(meta).sort((a, b) => b.updated - a.updated);
  library.set(list);
  return list;
}

export async function libraryEntry(id: string): Promise<LibraryEntry | null> {
  const s = shelf();
  if (!s) return null;
  return (await idbGet<LibraryEntry>(id, s).catch(() => undefined)) ?? null;
}

async function put(e: LibraryEntry) {
  const s = shelf();
  if (!s) throw new Error('This browser keeps no library, private browsing may be on');
  await idbSet(e.id, e, s);
  await loadLibrary();
}

// a picture of the character at rest, fitted into w by h, drawn with the renderer of the stage
export async function characterThumb(pkg: CharacterPackage, w = 120, h = 180): Promise<string> {
  if (typeof document === 'undefined') return '';
  const { renderLayers, loadImages } = await import('$lib/render/renderer');
  const { setLibrary } = await import('$lib/render/frame');
  const rig = pkg.layers.find((l) => l.type === 'rig');
  if (!rig) return '';
  const rest = worldMatrices(rig.bones, {});
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of rig.bones) {
    const m = rest.get(b.id)!;
    for (const p of [{ x: m[4], y: m[5] }, applyPoint(m, { x: b.length, y: 0 })]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const pad = (maxY - minY) * 0.12;
  minX -= pad * 1.6;
  maxX += pad * 1.6;
  minY -= pad;
  maxY += pad;
  const k = Math.min(w / (maxX - minX), h / (maxY - minY));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  await loadImages(pkg.assets);
  setLibrary(pkg.symbols);
  // the layers at rest: the rig poses of frame 0 left out
  const layers: Layer[] = pkg.layers.map((l) => (l.type === 'rig' ? { ...l, keyframes: [{ ...l.keyframes[0], pose: {} }] } : l));
  const x = (w - (maxX - minX) * k) / 2 - minX * k;
  const y = (h - (maxY - minY) * k) / 2 - minY * k;
  renderLayers(ctx, layers, [k, 0, 0, k, x, y], { frame: 0, outline: false, assets: pkg.assets });
  const url = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// a character of the document into the library. one saved before from the same character is
// replaced, so saving again keeps one entry up to date
export async function saveCharacter(doc: Doc, folderId: string): Promise<LibraryMeta | null> {
  const pkg = packCharacter(doc, folderId);
  if (!pkg) return null;
  const list = await loadLibrary();
  const same = list.find((m) => m.character === pkg.info.id);
  const e: LibraryEntry = {
    id: same?.id ?? newId(),
    name: pkg.info.name,
    updated: Date.now(),
    thumb: await characterThumb(pkg),
    character: pkg.info.id,
    keys: keyCount(pkg),
    pkg,
    ...(same?.main ? { main: same.main } : {})
  };
  await put(e);
  return meta(e);
}

// a library character made main character 1 or 2, the one that was it before is not any more
export async function setMain(id: string, slot: 1 | 2 | null) {
  const list = await loadLibrary();
  for (const m of list) {
    if (m.id === id || m.main !== slot || slot === null) continue;
    const other = await libraryEntry(m.id);
    if (other) {
      delete other.main;
      await put(other);
    }
  }
  const e = await libraryEntry(id);
  if (!e) return;
  if (slot) e.main = slot;
  else delete e.main;
  await put(e);
}

export function mainCharacter(list: LibraryMeta[], slot: 1 | 2): LibraryMeta | null {
  return list.find((m) => m.main === slot) ?? null;
}

export async function renameEntry(id: string, name: string) {
  const e = await libraryEntry(id);
  const clean = name.trim().slice(0, 60);
  if (!e || !clean) return;
  const pkg = { ...e.pkg, info: { ...e.pkg.info, name: clean } };
  pkg.layers = pkg.layers.map((l) => (l.character ? { ...l, name: clean, character: { ...l.character, name: clean } } : l));
  await put({ ...e, name: clean, updated: Date.now(), pkg });
}

// a copy is a character of its own, saving the old one later leaves the copy alone
export async function duplicateEntry(id: string): Promise<LibraryMeta | null> {
  const e = await libraryEntry(id);
  if (!e) return null;
  const character = newId();
  const name = `${e.name} copy`;
  const pkg: CharacterPackage = {
    ...e.pkg,
    info: { ...e.pkg.info, id: character, name },
    layers: e.pkg.layers.map((l) => (l.character ? { ...l, name, character: { ...l.character, id: character, name } } : l))
  };
  const copy: LibraryEntry = { ...e, id: newId(), name, character, updated: Date.now(), pkg };
  // a copy is never a main character itself
  delete copy.main;
  await put(copy);
  return meta(copy);
}

export async function deleteEntry(id: string) {
  const s = shelf();
  if (!s) return;
  await del(id, s);
  await loadLibrary();
}

// a character file for the files app, another browser or a backup
export const CHARACTER_EXT = '.brainimate-character';

export function characterFile(pkg: CharacterPackage): Blob {
  return new Blob([JSON.stringify(pkg)], { type: 'application/json' });
}

export function readCharacterFile(text: string): CharacterPackage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not a character');
  }
  if (!isCharacterPackage(raw)) throw new Error('The file is not a character');
  return raw;
}

export async function addPackage(pkg: CharacterPackage): Promise<LibraryMeta> {
  const list = await loadLibrary();
  const same = list.find((m) => m.character === pkg.info.id);
  const e: LibraryEntry = {
    id: same?.id ?? newId(),
    name: pkg.info.name,
    updated: Date.now(),
    thumb: await characterThumb(pkg),
    character: pkg.info.id,
    keys: keyCount(pkg),
    pkg,
    ...(same?.main ? { main: same.main } : {})
  };
  await put(e);
  return meta(e);
}

// where a character from another document lands: in the middle, standing on the same share of the height
export function placeOffset(pkg: CharacterPackage, doc: Pick<Doc, 'width' | 'height'>): { dx: number; dy: number } {
  const face = pkg.info.face;
  return { dx: doc.width / 2 - face.x, dy: pkg.height > 0 ? (doc.height - pkg.height) * (face.y / pkg.height) : 0 };
}
