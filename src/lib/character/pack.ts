import type { Asset, CharacterInfo, Doc, Item, Layer, Symbol } from '$lib/core/types';
import { multiply, translate } from '$lib/core/mat';
import { newId } from '$lib/core/ids';
import { walkItems, nestedSymbols } from '$lib/core/library';
import { descendantIds } from '$lib/anim/timeline';

// a character on its own, to keep in the library, to save as a file and to put into any document: its
// folder with the rig and the body and every keyframe, poses and faces included, and the pictures and
// symbols its parts use

export const PACKAGE_VERSION = 1;

export interface CharacterPackage {
  version: number;
  info: CharacterInfo;
  // bottom first, like the layers of a document, the folder last
  layers: Layer[];
  assets: Record<string, Asset>;
  symbols: Record<string, Symbol>;
  // the stage it was made on and its frame rate, for the record
  width: number;
  height: number;
  fps: number;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function packCharacter(doc: Doc, folderId: string): CharacterPackage | null {
  const folder = doc.layers.find((l) => l.id === folderId);
  if (!folder?.character) return null;
  const ids = new Set([folderId, ...descendantIds(doc.layers, folderId)]);
  const layers = clone(doc.layers.filter((l) => ids.has(l.id)));
  const assets: Record<string, Asset> = {};
  const symbolIds = new Set<string>();
  const visit = (item: Item) => {
    if (item.type === 'image' && doc.assets[item.asset]) assets[item.asset] = doc.assets[item.asset];
    if (item.type === 'instance') {
      symbolIds.add(item.symbol);
      for (const s of nestedSymbols(doc.symbols, item.symbol)) symbolIds.add(s);
    }
  };
  for (const l of layers) for (const k of l.keyframes) walkItems(k.items, visit);
  const symbols: Record<string, Symbol> = {};
  for (const id of symbolIds) if (doc.symbols[id]) symbols[id] = clone(doc.symbols[id]);
  // pictures inside the symbols go along too
  for (const s of Object.values(symbols)) for (const l of s.layers) for (const k of l.keyframes) walkItems(k.items, visit);
  return {
    version: PACKAGE_VERSION,
    info: clone(folder.character),
    layers,
    assets: clone(assets),
    symbols,
    width: doc.width,
    height: doc.height,
    fps: doc.fps
  };
}

export interface Unpacked {
  layers: Layer[];
  assets: Record<string, Asset>;
  symbols: Record<string, Symbol>;
}

// a fresh copy with new ids everywhere, moved by dx and dy: the bones and their bind, the items, the face
export function unpackCharacter(pkg: CharacterPackage, dx = 0, dy = 0, name?: string): Unpacked {
  const layers = clone(pkg.layers);
  const layerIds = new Map<string, string>();
  const boneIds = new Map<string, string>();
  const itemIds = new Map<string, string>();
  for (const l of layers) layerIds.set(l.id, newId());
  for (const l of layers) for (const b of l.bones) boneIds.set(b.id, newId());
  const bone = (id: string) => boneIds.get(id) ?? id;
  const shift = translate(dx, dy);
  const moved = dx !== 0 || dy !== 0;
  const fixItem = (item: Item, top: boolean) => {
    let id = itemIds.get(item.id);
    if (!id) {
      id = newId();
      itemIds.set(item.id, id);
    }
    item.id = id;
    if (item.skin) {
      item.skin.rigid = item.skin.rigid ? bone(item.skin.rigid) : null;
      item.skin.weights = item.skin.weights.map((list) => list.map((w) => ({ ...w, bone: bone(w.bone) })));
    }
    if (top && moved) item.transform = multiply(shift, item.transform);
    if (item.type === 'group') for (const c of item.children) fixItem(c, false);
  };
  for (const l of layers) {
    l.id = layerIds.get(l.id)!;
    if (l.parent) l.parent = layerIds.get(l.parent) ?? null;
    for (const b of l.bones) {
      b.id = bone(b.id);
      if (b.parent) b.parent = bone(b.parent);
      else if (moved) {
        b.x += dx;
        b.y += dy;
      }
      if (moved) b.bind = multiply(shift, b.bind);
    }
    for (const k of l.keyframes) {
      const pose: Layer['keyframes'][number]['pose'] = {};
      for (const [id, p] of Object.entries(k.pose)) pose[bone(id)] = p;
      k.pose = pose;
      for (const item of k.items) fixItem(item, true);
    }
    if (l.character) {
      l.character = { ...l.character, face: { ...l.character.face, x: l.character.face.x + dx, y: l.character.face.y + dy } };
      if (name) {
        l.character.name = name;
        l.name = name;
      }
    }
  }
  return { layers, assets: clone(pkg.assets), symbols: clone(pkg.symbols) };
}

// a package read from a file or the library made sound: what a character needs is there
export function isCharacterPackage(v: unknown): v is CharacterPackage {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<CharacterPackage>;
  if (!Array.isArray(p.layers) || !p.info || typeof p.info !== 'object') return false;
  const folder = p.layers.find((l) => l && l.type === 'folder' && l.character);
  return !!folder && p.layers.every((l) => l && Array.isArray(l.keyframes) && Array.isArray(l.bones));
}
