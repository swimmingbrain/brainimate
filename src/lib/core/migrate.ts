import type { Doc, Item, Layer } from './types';

// fills in what older documents do not have yet, so the rest of the app can rely on it
function migrateItem(item: Item) {
  if (item.type === 'path' && !Array.isArray(item.subpaths)) item.subpaths = [];
  if (item.type === 'group') item.children.forEach(migrateItem);
}

function migrateLayers(layers: Layer[]) {
  for (const layer of layers) for (const key of layer.keyframes) key.items.forEach(migrateItem);
}

export function migrateDoc(doc: Doc): Doc {
  const guides = doc.guides as Partial<Doc['guides']> | undefined;
  doc.guides = {
    h: Array.isArray(guides?.h) ? guides.h.filter(Number.isFinite) : [],
    v: Array.isArray(guides?.v) ? guides.v.filter(Number.isFinite) : []
  };
  if (!Array.isArray(doc.swatches)) doc.swatches = [];
  migrateLayers(doc.layers);
  for (const symbol of Object.values(doc.symbols ?? {})) migrateLayers(symbol.layers);
  return doc;
}
