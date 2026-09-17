import { delMany, get, getMany, set } from 'idb-keyval';
import { get as read, writable } from 'svelte/store';
import { docVersion, editor } from '$lib/editor/editor';
import { dirty } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { db } from './db';
import { serialize } from './project';

// a copy of the document kept in the browser in case the tab goes away before a save
export interface Snapshot {
  time: number;
  name: string;
  blob: Blob;
}

const SLOTS = 5;
const SAVED_KEY = 'saved-at';
const slotKey = (i: number) => `autosave-${i}`;
const KEYS = Array.from({ length: SLOTS }, (_, i) => slotKey(i));

// the snapshot the welcome dialog offers to bring back
export const autosaveOffer = writable<Snapshot | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;

// every slot that holds a snapshot, newest first
async function snapshots(): Promise<{ slot: number; snap: Snapshot }[]> {
  const s = db();
  if (!s) return [];
  const values = await getMany<Snapshot | undefined>(KEYS, s).catch(() => []);
  const out: { slot: number; snap: Snapshot }[] = [];
  values.forEach((snap, slot) => {
    if (snap && typeof snap.time === 'number' && snap.blob instanceof Blob) out.push({ slot, snap });
  });
  return out.sort((a, b) => b.snap.time - a.snap.time);
}

// writes the document into the slot after the newest one, the oldest of five goes
export async function takeSnapshot(): Promise<Snapshot | null> {
  const s = db();
  if (!s || !read(dirty)) return null;
  const doc = editor.doc;
  const snap: Snapshot = { time: Date.now(), name: doc.name, blob: serialize(doc) };
  const list = await snapshots();
  const slot = list.length > 0 ? (list[0].slot + 1) % SLOTS : 0;
  await set(slotKey(slot), snap, s);
  return snap;
}

// the delay and the switch come from the preferences, in seconds
function schedule() {
  if (timer) clearTimeout(timer);
  const g = read(preferences).general;
  if (!g.autosave) return;
  timer = setTimeout(
    () => {
      timer = null;
      void takeSnapshot().catch(() => {});
    },
    Math.max(1, g.autosaveDelay) * 1000
  );
}

// a snapshot comes 2 s after the last change. the document is read once the edit is done, never
// from inside a commit
export function installAutosave(): () => void {
  let first = true;
  const off = docVersion.subscribe(() => {
    if (first) {
      first = false;
      return;
    }
    schedule();
  });
  // a tab that goes to the background or closes writes what is still waiting right away
  const onhide = () => {
    if (document.visibilityState !== 'hidden' || !timer) return;
    clearTimeout(timer);
    timer = null;
    void takeSnapshot().catch(() => {});
  };
  document.addEventListener('visibilitychange', onhide);
  return () => {
    off();
    document.removeEventListener('visibilitychange', onhide);
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

// a save makes the snapshots pointless
export async function clearAutosave() {
  if (timer) clearTimeout(timer);
  timer = null;
  autosaveOffer.set(null);
  const s = db();
  if (!s) return;
  await delMany(KEYS, s).catch(() => {});
  await set(SAVED_KEY, Date.now(), s).catch(() => {});
}

// the newest snapshot when it is younger than the last save, for the restore row
export async function findAutosave(): Promise<Snapshot | null> {
  const s = db();
  if (!s) return null;
  const [newest] = await snapshots();
  if (!newest) return null;
  const saved = (await get<number>(SAVED_KEY, s).catch(() => undefined)) ?? 0;
  return newest.snap.time > saved ? newest.snap : null;
}
