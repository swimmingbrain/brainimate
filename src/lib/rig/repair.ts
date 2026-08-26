import type { Bone, Doc, Item, Layer, Mat, Skin } from '$lib/core/types';
import { identity, multiply } from '$lib/core/mat';
import { timelineBones } from './bones';
import { anchorList, autoWeights, normalize } from './skin';

// a skin to put on an item: which timeline (null is the main one), layer, keyframe and the indexes
// down through its groups
interface Fix {
  scope: string | null;
  layer: number;
  key: number;
  path: number[];
  skin: Skin | null;
}

// the skin an item should have now that bones may be gone or its anchors changed, undefined when fine
function repaired(item: Item, world: Mat, bones: Map<string, Bone>): Skin | null | undefined {
  const skin = item.skin;
  if (!skin) return undefined;
  if (skin.rigid) return bones.has(skin.rigid) ? undefined : null;
  if (item.type !== 'path') return null;
  const count = anchorList(item).length;
  const missing = skin.weights.some((list) => list.some((w) => !bones.has(w.bone)));
  if (!missing && skin.weights.length === count) return undefined;
  const used = [...new Set(skin.weights.flat().map((w) => w.bone))].flatMap((id) => bones.get(id) ?? []);
  if (used.length === 0) return null;
  // the anchors changed, they are weighed again against the bones the item had
  if (skin.weights.length !== count) return { weights: autoWeights(item, world, used), rigid: null };
  // only bones went: their weights go, an anchor left with none is weighed again
  const weights = skin.weights.map((list) => normalize(list.filter((w) => bones.has(w.bone))));
  if (weights.some((list) => list.length === 0)) {
    const fresh = autoWeights(item, world, used);
    return { weights: weights.map((list, i) => (list.length > 0 ? list : fresh[i])), rigid: null };
  }
  return { weights, rigid: null };
}

function scanItems(items: Item[], parent: Mat, bones: Map<string, Bone>, at: number[], add: (path: number[], skin: Skin | null) => void) {
  items.forEach((item, i) => {
    const world = multiply(parent, item.transform);
    const fix = repaired(item, world, bones);
    if (fix !== undefined) add([...at, i], fix);
    if (item.type === 'group') scanItems(item.children, world, bones, [...at, i], add);
  });
}

function rigBones(layers: Layer[]): Bone[][] {
  return layers.filter((l) => l.type === 'rig').map((l) => l.bones);
}

// only the layers and keyframes a commit touched are looked at, all of them when the bones changed
function scanTimeline(prev: Layer[] | undefined, next: Layer[], scope: string | null, fixes: Fix[]) {
  if (prev === next) return;
  const a = prev ? rigBones(prev) : [];
  const b = rigBones(next);
  const bonesChanged = a.length !== b.length || a.some((x, i) => x !== b[i]);
  const bones = new Map(timelineBones(next).map((bone) => [bone.id, bone]));
  next.forEach((layer, li) => {
    if (layer.type === 'rig' || layer.type === 'folder') return;
    const before = prev?.find((l) => l.id === layer.id);
    if (!bonesChanged && before === layer) return;
    layer.keyframes.forEach((key, ki) => {
      if (!bonesChanged && before?.keyframes.includes(key)) return;
      scanItems(key.items, identity(), bones, [], (path, skin) => fixes.push({ scope, layer: li, key: ki, path, skin }));
    });
  });
}

// what a commit left behind: skins on bones that are gone (a deleted rig layer or bone, a paste from
// elsewhere, items moved into a symbol) and weights for another number of anchors. gives back a
// recipe that sets them right inside the same undo step, null when all is well
export function skinRepairs(prev: Doc, next: Doc): ((draft: Doc) => void) | null {
  const fixes: Fix[] = [];
  scanTimeline(prev.layers, next.layers, null, fixes);
  for (const [id, symbol] of Object.entries(next.symbols)) {
    scanTimeline(prev.symbols[id]?.layers, symbol.layers, id, fixes);
  }
  if (fixes.length === 0) return null;
  return (draft: Doc) => {
    for (const f of fixes) {
      const layers = f.scope === null ? draft.layers : draft.symbols[f.scope]?.layers;
      let list: Item[] | undefined = layers?.[f.layer]?.keyframes[f.key]?.items;
      let item: Item | undefined;
      for (const index of f.path) {
        item = list?.[index];
        list = item?.type === 'group' ? item.children : undefined;
      }
      if (item) item.skin = f.skin;
    }
  };
}
