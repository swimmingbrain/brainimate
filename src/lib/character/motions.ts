import { writable } from 'svelte/store';
import { createStore, del, entries, set as idbSet, type UseStore } from 'idb-keyval';
import type { BonePose, Layer } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { poseAt } from '$lib/render/frame';

// moves of your own: the keyframes of a character's skeleton between two frames, kept by bone name, so
// they play on any character, in any scene and project. the hip's place is kept as a change from where
// the move starts, a walk saved on one side of the stage walks the same way from anywhere

export interface MotionKey {
  // frames after the start
  frame: number;
  pose: Record<string, BonePose>;
  ease: string | null;
}

export interface Motion {
  id: string;
  name: string;
  updated: number;
  frames: number;
  keys: MotionKey[];
}

let store: UseStore | null = null;
function shelf(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore('brainimate-motions', 'motions');
  return store;
}

export const motions = writable<Motion[]>([]);

export function isMotion(v: unknown): v is Motion {
  const m = v as Motion;
  return !!m && typeof m.name === 'string' && Array.isArray(m.keys) && m.keys.every((k) => typeof k.frame === 'number' && typeof k.pose === 'object');
}

// the move of a rig from frame from to frame to, the poses there worked out where no keyframe is
export function captureMotion(rig: Layer, from: number, to: number, name: string): Motion | null {
  if (to <= from) return null;
  const byId = new Map(rig.bones.map((b) => [b.id, b.name]));
  const hip = rig.bones.find((b) => b.name === 'Hip');
  const start = hip ? (poseAt(rig, from)[hip.id] ?? { rotation: 0, x: 0, y: 0, scale: 1 }) : null;
  const frames = [from, ...rig.keyframes.map((k) => k.frame).filter((f) => f > from && f < to), to];
  const keys: MotionKey[] = frames.map((f) => {
    const pose: Record<string, BonePose> = {};
    for (const [id, p] of Object.entries(poseAt(rig, f))) {
      const n = byId.get(id);
      if (!n) continue;
      pose[n] = n === 'Hip' && start ? { ...p, x: p.x - start.x, y: p.y - start.y } : { ...p };
    }
    const own = rig.keyframes.find((k) => k.frame === f);
    return { frame: f - from, pose, ease: f === to ? null : (own?.tween?.ease ?? (own ? null : 'linear')) };
  });
  return { id: newId(), name: name.trim().slice(0, 60) || 'Move', updated: Date.now(), frames: to - from, keys };
}

// the keys of a move on a rig from frame at, the hip carried on from where it is there
export function placeMotion(rig: Layer, motion: Motion, at: number): { frame: number; pose: Record<string, BonePose>; ease: string | null }[] {
  const byName = new Map(rig.bones.map((b) => [b.name, b.id]));
  const hip = rig.bones.find((b) => b.name === 'Hip');
  const here = hip ? (poseAt(rig, at)[hip.id] ?? { rotation: 0, x: 0, y: 0, scale: 1 }) : null;
  return motion.keys.map((k) => {
    const pose: Record<string, BonePose> = {};
    for (const [n, p] of Object.entries(k.pose)) {
      const id = byName.get(n);
      if (!id) continue;
      pose[id] = n === 'Hip' && here ? { ...p, x: p.x + here.x, y: p.y + here.y, ...(here.sx !== undefined ? { sx: (p.sx ?? 1) * here.sx } : {}) } : { ...p };
    }
    return { frame: at + k.frame, pose, ease: k.ease };
  });
}

export async function loadMotions(): Promise<Motion[]> {
  const s = shelf();
  if (!s) return [];
  const list = (await entries<string, Motion>(s).catch(() => []))
    .map(([, v]) => v)
    .filter(isMotion)
    .sort((a, b) => b.updated - a.updated);
  motions.set(list);
  return list;
}

export async function saveMotion(m: Motion) {
  const s = shelf();
  if (!s) throw new Error('This browser keeps no library, private browsing may be on');
  await idbSet(m.id, m, s);
  await loadMotions();
}

export async function renameMotion(m: Motion, name: string) {
  const clean = name.trim().slice(0, 60);
  if (clean) await saveMotion({ ...m, name: clean, updated: Date.now() });
}

export async function deleteMotion(id: string) {
  const s = shelf();
  if (!s) return;
  await del(id, s);
  await loadMotions();
}
