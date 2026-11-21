import { writable } from 'svelte/store';
import { createStore, del, entries, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval';
import type { Doc } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { customFormat, type Format } from './formats';
import type { Status } from './types';
import type { Outfit } from '$lib/character/wardrobe';

// the videos of the channel kept in the browser: each one the whole project with its production, so it
// opens again as it was, can be copied for the next episode and stays after the browser closes. custom
// formats are kept the same way

export interface VideoMeta {
  id: string;
  title: string;
  format: string;
  status: Status;
  updated: number;
  seconds: number;
  thumb: string;
}

interface VideoEntry extends VideoMeta {
  doc: Doc;
}

let videoStore: UseStore | null = null;
let formatStore: UseStore | null = null;
const videosShelf = () => (typeof indexedDB === 'undefined' ? null : (videoStore ??= createStore('brainimate-videos', 'videos')));
const formatsShelf = () => (typeof indexedDB === 'undefined' ? null : (formatStore ??= createStore('brainimate-formats', 'formats')));

export const videos = writable<VideoMeta[]>([]);
export const customFormats = writable<Format[]>([]);

function meta(e: VideoEntry): VideoMeta {
  return { id: e.id, title: e.title, format: e.format, status: e.status, updated: e.updated, seconds: e.seconds, thumb: e.thumb };
}

export async function loadVideos(): Promise<VideoMeta[]> {
  const s = videosShelf();
  if (!s) return [];
  const list = (await entries<string, VideoEntry>(s).catch(() => []))
    .map(([, v]) => v)
    .filter((v) => v && v.doc && Array.isArray(v.doc.layers))
    .map(meta)
    .sort((a, b) => b.updated - a.updated);
  videos.set(list);
  return list;
}

export async function videoDoc(id: string): Promise<Doc | null> {
  const s = videosShelf();
  if (!s) return null;
  return (await idbGet<VideoEntry>(id, s).catch(() => undefined))?.doc ?? null;
}

// a project kept, under its id when it was kept before
export async function keepVideo(doc: Doc, id: string | null, thumb = ''): Promise<VideoMeta> {
  const s = videosShelf();
  if (!s) throw new Error('This browser keeps no library, private browsing may be on');
  const p = doc.production;
  const e: VideoEntry = {
    id: id ?? newId(),
    title: p?.title || doc.name || 'Video',
    format: p?.format ?? '',
    status: p?.status ?? 'idea',
    updated: Date.now(),
    seconds: p ? p.scenes.reduce((n, sc) => n + sc.duration, 0) : 0,
    thumb,
    doc: JSON.parse(JSON.stringify(doc))
  };
  await idbSet(e.id, e, s);
  await loadVideos();
  return meta(e);
}

export async function deleteVideo(id: string) {
  const s = videosShelf();
  if (!s) return;
  await del(id, s);
  await loadVideos();
}

export async function loadFormats(): Promise<Format[]> {
  const s = formatsShelf();
  if (!s) return [];
  const list = (await entries<string, Format>(s).catch(() => [])).map(([, v]) => v).filter((f) => f && Array.isArray(f.beats));
  customFormats.set(list);
  return list;
}

export async function addFormat(label: string, beats: string[]): Promise<Format> {
  const s = formatsShelf();
  const f = customFormat(`custom-${newId()}`, label.trim().slice(0, 60) || 'My format', beats.map((b) => b.trim()).filter(Boolean));
  if (s) {
    await idbSet(f.id, f, s);
    await loadFormats();
  }
  return f;
}

export async function deleteFormat(id: string) {
  const s = formatsShelf();
  if (!s) return;
  await del(id, s);
  await loadFormats();
}

// outfits of one's own: the kinds and colors of top, bottom and shoes kept to put on any character

let outfitStore: UseStore | null = null;
const outfitsShelf = () => (typeof indexedDB === 'undefined' ? null : (outfitStore ??= createStore('brainimate-outfits', 'outfits')));
export const savedOutfits = writable<(Outfit & { id: string })[]>([]);

export async function loadOutfits() {
  const s = outfitsShelf();
  if (!s) return [];
  const list = (await entries<string, Outfit & { id: string }>(s).catch(() => [])).map(([, v]) => v).filter((o) => o && o.top);
  savedOutfits.set(list);
  return list;
}

export async function keepOutfit(o: Outfit) {
  const s = outfitsShelf();
  if (!s) throw new Error('This browser keeps no library, private browsing may be on');
  const id = newId();
  await idbSet(id, { ...o, id }, s);
  await loadOutfits();
}

export async function deleteOutfit(id: string) {
  const s = outfitsShelf();
  if (!s) return;
  await del(id, s);
  await loadOutfits();
}
