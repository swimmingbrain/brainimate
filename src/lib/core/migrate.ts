import type { Bone, Doc, Item, Layer } from './types';
import { cleanCamera } from '$lib/anim/camera';

// fills in what older documents do not have yet, so the rest of the app can rely on it
function migrateItem(item: Item) {
  if (item.type === 'path' && !Array.isArray(item.subpaths)) item.subpaths = [];
  if (item.type === 'group') item.children.forEach(migrateItem);
  if (item.type === 'text' && typeof item.width !== 'number') item.width = null;
  if (item.type === 'instance' && !Number.isFinite(item.tintAmount)) item.tintAmount = 0;
  if (item.skin === undefined) item.skin = null;
}

// a bone from before binding had a reach gets the default one
function migrateBone(bone: Bone) {
  if (!Number.isFinite(bone.radius)) bone.radius = bone.length * 0.35;
}

function migrateLayers(layers: Layer[], width: number, height: number) {
  for (const layer of layers) {
    for (const key of layer.keyframes) key.items.forEach(migrateItem);
    if (!Array.isArray(layer.bones)) layer.bones = [];
    layer.bones.forEach(migrateBone);
    // the camera values are read as numbers in range, a camera keyframe without them shows the stage
    if (layer.type === 'camera') for (const key of layer.keyframes) key.camera = cleanCamera(key.camera, width, height);
    else for (const key of layer.keyframes) delete key.camera;
    if (layer.parallax !== undefined && !(typeof layer.parallax === 'number' && Number.isFinite(layer.parallax))) delete layer.parallax;
  }
}

export function migrateDoc(doc: Doc): Doc {
  const guides = doc.guides as Partial<Doc['guides']> | undefined;
  doc.guides = {
    h: Array.isArray(guides?.h) ? guides.h.filter(Number.isFinite) : [],
    v: Array.isArray(guides?.v) ? guides.v.filter(Number.isFinite) : []
  };
  if (!Array.isArray(doc.swatches)) doc.swatches = [];
  migrateLayers(doc.layers, doc.width, doc.height);
  // a camera films the main timeline only, inside a symbol it would have nothing to film
  for (const symbol of Object.values(doc.symbols ?? {})) {
    symbol.layers = symbol.layers.filter((l) => l.type !== 'camera');
    migrateLayers(symbol.layers, doc.width, doc.height);
  }
  // one camera, the first one wins
  const cameras = doc.layers.filter((l) => l.type === 'camera');
  if (cameras.length > 1) doc.layers = doc.layers.filter((l) => l.type !== 'camera' || l === cameras[0]);
  return doc;
}
