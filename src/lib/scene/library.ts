import { writable } from 'svelte/store';
import { createStore, del, entries, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval';
import type { Asset, AudioClip, Doc, Layer, Symbol } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { pruneAssets } from '$lib/core/assets';
import { unpackCharacter, type CharacterPackage } from '$lib/character/pack';

// whole scenes kept in the browser: the background, every layer, the characters with their moves and
// faces, the objects, the camera with its shots and transitions, the sounds. a scene goes into another
// project or opens as a new one, like the characters it is kept until the browser data is cleared, a
// file carries it to another device

export const SCENE_VERSION = 1;
export const SCENE_EXT = '.brainimate-scene';

export interface ScenePackage {
  version: number;
  kind: 'scene';
  name: string;
  width: number;
  height: number;
  fps: number;
  bg: string;
  layers: Layer[];
  assets: Record<string, Asset>;
  symbols: Record<string, Symbol>;
  audio: AudioClip[];
}

export interface SceneMeta {
  id: string;
  name: string;
  updated: number;
  thumb: string;
  layers: number;
  frames: number;
}

interface SceneEntry extends SceneMeta {
  pkg: ScenePackage;
}

let store: UseStore | null = null;
function shelf(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore('brainimate-scenes', 'scenes');
  return store;
}

export const scenes = writable<SceneMeta[]>([]);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function isScenePackage(v: unknown): v is ScenePackage {
  const p = v as ScenePackage;
  return !!p && p.kind === 'scene' && typeof p.name === 'string' && Array.isArray(p.layers) && typeof p.width === 'number' && !!p.assets && !!p.symbols;
}

// the main timeline of a document as a scene, only the pictures, fonts and sounds it uses go along
export function packScene(doc: Doc, name = doc.name): ScenePackage {
  const lean = pruneAssets(doc);
  return {
    version: SCENE_VERSION,
    kind: 'scene',
    name: name.trim().slice(0, 60) || 'Scene',
    width: doc.width,
    height: doc.height,
    fps: doc.fps,
    bg: doc.bg,
    layers: clone(doc.layers),
    assets: clone(lean.assets),
    symbols: clone(doc.symbols),
    audio: clone(doc.audio ?? [])
  };
}

// a fresh copy of a scene with new ids for every layer, bone and item, scaled to fit a stage of
// another size from the top left. a scene for the same stage stays as it is
export function unpackScene(pkg: ScenePackage, width = pkg.width, height = pkg.height): { layers: Layer[]; assets: Record<string, Asset>; symbols: Record<string, Symbol>; audio: AudioClip[] } {
  const asCharacter = { ...pkg, info: { id: '', name: '', colors: {}, face: { x: 0, y: 0, r: 1, facing: 1 } } } as unknown as CharacterPackage;
  const out = unpackCharacter(asCharacter);
  const k = Math.min(width / pkg.width, height / pkg.height);
  if (Math.abs(k - 1) > 1e-6) scaleLayers(out.layers, k, (width - pkg.width * k) / 2, (height - pkg.height * k) / 2);
  return { ...out, audio: (pkg.audio ?? []).map((a) => ({ ...a, id: newId() })) };
}

// every top item, bone and camera of layers scaled by k and moved by dx, dy
function scaleLayers(layers: Layer[], k: number, dx: number, dy: number) {
  const map = (m: number[]) => [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k + dx, m[5] * k + dy];
  for (const l of layers) {
    for (const b of l.bones) {
      if (!b.parent) {
        b.x = b.x * k + dx;
        b.y = b.y * k + dy;
      } else {
        b.x *= k;
        b.y *= k;
      }
      b.length *= k;
      b.radius *= k;
      b.bind = map(b.bind as unknown as number[]) as unknown as typeof b.bind;
    }
    for (const key of l.keyframes) {
      for (const item of key.items) if (!item.skin?.rigid) item.transform = map(item.transform as unknown as number[]) as unknown as typeof item.transform;
      for (const p of Object.values(key.pose)) {
        p.x *= k;
        p.y *= k;
      }
      if (key.camera) {
        key.camera = { ...key.camera, x: key.camera.x * k + dx, y: key.camera.y * k + dy };
      }
    }
    if (l.turnRig) {
      const bones: NonNullable<Layer['turnRig']>['bones'] = {};
      const sc = (p: [number, number, number]): [number, number, number] => [p[0] * k, p[1] * k, p[2] * k];
      for (const [id, spot] of Object.entries(l.turnRig.bones)) bones[id] = { from: sc(spot.from), to: sc(spot.to) };
      l.turnRig = { ...l.turnRig, x: l.turnRig.x * k + dx, ground: l.turnRig.ground * k + dy, bones };
    }
    if (l.character?.model) {
      const m = l.character.model as { x: number; ground: number; height: number; outline: number };
      l.character = { ...l.character, model: { ...m, x: m.x * k + dx, ground: m.ground * k + dy, height: m.height * k, outline: m.outline * k } };
    }
    if (l.character) {
      const f = l.character.face;
      l.character = { ...l.character, face: { ...f, x: f.x * k + dx, y: f.y * k + dy, r: f.r * k } };
      if (l.character.look) {
        const h = l.character.look.head;
        l.character.look = { ...l.character.look, outline: l.character.look.outline * k, head: { x: h.x * k + dx, y: h.y * k + dy, rx: h.rx * k, ry: h.ry * k } };
      }
    }
  }
}

// a small picture of the first frame as the video shows it
export async function sceneThumb(pkg: ScenePackage, w = 108): Promise<string> {
  if (typeof document === 'undefined') return '';
  const { loadImages } = await import('$lib/render/renderer');
  const { setLibrary } = await import('$lib/render/frame');
  const { renderCameraFrame } = await import('$lib/render/camera');
  const h = Math.round((w * pkg.height) / pkg.width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  await loadImages(pkg.assets);
  setLibrary(pkg.symbols);
  ctx.fillStyle = pkg.bg;
  ctx.fillRect(0, 0, w, h);
  const doc = { version: 1, name: pkg.name, width: pkg.width, height: pkg.height, fps: pkg.fps, bg: pkg.bg, layers: pkg.layers, symbols: pkg.symbols, assets: pkg.assets, swatches: [], guides: { h: [], v: [] } } as Doc;
  const k = w / pkg.width;
  renderCameraFrame(ctx, doc, { frame: 0, base: [k, 0, 0, k, 0, 0], transparent: false });
  const url = canvas.toDataURL('image/jpeg', 0.8);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

function meta(e: SceneEntry): SceneMeta {
  return { id: e.id, name: e.name, updated: e.updated, thumb: e.thumb, layers: e.layers, frames: e.frames };
}

export async function loadScenes(): Promise<SceneMeta[]> {
  const s = shelf();
  if (!s) return [];
  const list = (await entries<string, SceneEntry>(s).catch(() => []))
    .map(([, v]) => v)
    .filter((v) => v && isScenePackage(v.pkg))
    .map(meta)
    .sort((a, b) => b.updated - a.updated);
  scenes.set(list);
  return list;
}

export async function sceneEntry(id: string): Promise<ScenePackage | null> {
  const s = shelf();
  if (!s) return null;
  return (await idbGet<SceneEntry>(id, s).catch(() => undefined))?.pkg ?? null;
}

export async function storeScene(pkg: ScenePackage, id = newId()): Promise<SceneMeta> {
  const s = shelf();
  if (!s) throw new Error('This browser keeps no library, private browsing may be on');
  const e: SceneEntry = {
    id,
    name: pkg.name,
    updated: Date.now(),
    thumb: await sceneThumb(pkg).catch(() => ''),
    layers: pkg.layers.length,
    frames: Math.max(1, ...pkg.layers.map((l) => l.length)),
    pkg
  };
  await idbSet(e.id, e, s);
  await loadScenes();
  return meta(e);
}

export async function renameScene(id: string, name: string) {
  const pkg = await sceneEntry(id);
  const clean = name.trim().slice(0, 60);
  if (pkg && clean) await storeScene({ ...pkg, name: clean }, id);
}

export async function deleteScene(id: string) {
  const s = shelf();
  if (!s) return;
  await del(id, s);
  await loadScenes();
}

export function sceneFile(pkg: ScenePackage): Blob {
  return new Blob([JSON.stringify(pkg)], { type: 'application/json' });
}

export function readSceneFile(text: string): ScenePackage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not a scene');
  }
  if (!isScenePackage(raw)) throw new Error('The file is not a scene');
  return raw;
}
