import type { Asset, Doc, Item } from './types';
import { eachItem } from './library';

// cyrb53, a quick 53 bit hash of a string, plenty to tell two files apart
export function hashString(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// the id comes from the content, so the same file imported twice is one asset
export function assetId(data: string): string {
  return `a${hashString(data)}`;
}

export function makeAsset(type: Asset['type'], name: string, data: string): Asset {
  return { id: assetId(data), type, name, data };
}

// the assets something uses: images by id, fonts by the family text asks for
export function usedAssets(doc: Doc): Set<string> {
  const used = new Set<string>();
  const families = new Set<string>();
  const visit = (item: Item) => {
    if (item.type === 'image') used.add(item.asset);
    else if (item.type === 'text') families.add(item.font);
  };
  eachItem(doc.layers, visit);
  for (const symbol of Object.values(doc.symbols)) eachItem(symbol.layers, visit);
  for (const asset of Object.values(doc.assets)) {
    if (asset.type === 'font' && families.has(asset.name)) used.add(asset.id);
  }
  return used;
}

// the document without the assets nothing uses, what gets saved
export function pruneAssets(doc: Doc): Doc {
  const used = usedAssets(doc);
  const assets: Record<string, Asset> = {};
  for (const [id, asset] of Object.entries(doc.assets)) if (used.has(id)) assets[id] = asset;
  return { ...doc, assets };
}
