import { get, set } from 'idb-keyval';
import { writable } from 'svelte/store';
import { db } from './db';

// a file opened or saved lately. the handle is there where the browser can open a file again by
// itself, the thumbnail is a 160 by 90 png data url of the first frame
export interface RecentFile {
  name: string;
  handle?: FileSystemFileHandle;
  time: number;
  thumbnail: string;
}

const KEY = 'recent';
export const MAX_RECENT = 10;

export const recentFiles = writable<RecentFile[]>([]);

function valid(list: unknown): RecentFile[] {
  if (!Array.isArray(list)) return [];
  return list.filter((r) => r && typeof r.name === 'string' && typeof r.time === 'number');
}

export async function loadRecent(): Promise<RecentFile[]> {
  const s = db();
  if (!s) return [];
  const list = valid(await get(KEY, s).catch(() => []));
  recentFiles.set(list);
  return list;
}

// the same file on disk, or the same name when there is no handle to ask
async function same(a: RecentFile, b: RecentFile): Promise<boolean> {
  if (a.handle && b.handle) return a.handle.isSameEntry(b.handle).catch(() => false);
  return !a.handle && !b.handle && a.name === b.name;
}

// newest first, a file that is already in the list moves to the top
export async function addRecent(entry: RecentFile) {
  const s = db();
  if (!s) return;
  const others: RecentFile[] = [];
  for (const r of await loadRecent()) if (!(await same(r, entry))) others.push(r);
  const list = [entry, ...others].slice(0, MAX_RECENT);
  await set(KEY, list, s);
  recentFiles.set(list);
}

export async function removeRecent(entry: RecentFile) {
  const s = db();
  if (!s) return;
  const others: RecentFile[] = [];
  for (const r of await loadRecent()) if (!(r.time === entry.time && (await same(r, entry)))) others.push(r);
  await set(KEY, others, s);
  recentFiles.set(others);
}
