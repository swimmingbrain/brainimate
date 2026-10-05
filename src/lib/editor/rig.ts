import { get } from 'svelte/store';
import type { Bone, BonePose, Item, Keyframe, Layer, Mat, Skin, Vec } from '$lib/core/types';
import { cloneItem, findItem, parentMatrix, type Found } from '$lib/core/items';
import { identity, invert, multiply } from '$lib/core/mat';
import { isEmpty, transformBox } from '$lib/core/bbox';
import { eachItem } from '$lib/core/library';
import { isLayerLocked, isLayerShown, keyframeAt, poseKeyframe } from '$lib/anim/timeline';
import {
  addBone,
  makeRig,
  nextBoneColor,
  nextBoneName,
  poseOf,
  removeBone,
  rigLayerOf,
  timelineBones,
  worldMatrices,
  type Pose
} from '$lib/rig/bones';
import {
  autoWeights,
  bindItem,
  boundBones,
  reachShare,
  reachingBones,
  samplePoints,
  unbindItem,
  type BindMode
} from '$lib/rig/skin';
import { addTemplate, stageBox, type TemplateKind } from '$lib/rig/templates';
import { activeLayer, addToast, boneSelection, selection } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { LAYER_COLORS, editor, makeLayer } from './editor';
import { deleteSelection } from './selection';

// a share of an item that has to lie within reach of a new chain for the chain to bind it
const AUTO_SHARE = 0.3;

export function rigLayers(): Layer[] {
  return editor.currentLayers().filter((l) => l.type === 'rig');
}

// bones can be posed and changed on a rig layer that shows and is not locked, a folder around it counts
export function canEditRig(layer: Layer): boolean {
  const layers = editor.currentLayers();
  return isLayerShown(layers, layer) && !isLayerLocked(layers, layer);
}

// the rig layer the panel shows: the active one, or the topmost one
export function activeRigLayer(): Layer | null {
  const active = editor.activeLayer();
  if (active?.type === 'rig') return active;
  return [...rigLayers()].reverse()[0] ?? null;
}

// where new bones go: the active rig layer, the topmost one, or a new layer named Rig above the active one
function rigTarget(): { layer: Layer; created: boolean } {
  const existing = activeRigLayer();
  if (existing) return { layer: existing, created: false };
  const layers = editor.currentLayers();
  const layer = makeLayer('Rig', LAYER_COLORS[layers.length % LAYER_COLORS.length], 'rig');
  layer.parent = editor.activeLayer()?.parent ?? null;
  return { layer, created: true };
}

// a new rig layer goes right above the active layer, inside a commit
function placeLayer(layers: Layer[], layer: Layer) {
  const active = get(activeLayer);
  const index = layers.findIndex((l) => l.id === active);
  layers.splice(index < 0 ? layers.length : index + 1, 0, JSON.parse(JSON.stringify(layer)) as Layer);
}

function reach(): number {
  return get(preferences).rig.reach / 100;
}

// the pose of the timeline at the current frame, every rig layer together
function currentPose(): Pose {
  return editor.rig()?.pose ?? {};
}

// a bone from one world point to another, the first one makes the rig layer in the same step
// a branch goes into the rig layer of the bone it grows from
export function addRigBone(parentId: string | null, from: Vec, to: Vec): { layerId: string; boneId: string } | null {
  const layers = editor.currentLayers();
  const parentLayer = parentId ? rigLayerOf(layers, parentId) : null;
  const target = parentLayer ? { layer: parentLayer, created: false } : rigTarget();
  if (!target.created && !canEditRig(target.layer)) {
    addToast(`${target.layer.name} is locked or hidden`, 'warning');
    return null;
  }
  const copy = target.layer.bones.map((b) => ({ ...b }));
  const name = nextBoneName(timelineBones(layers));
  const bone = addBone(copy, parentId, from, to, currentPose(), {
    name,
    color: nextBoneColor(copy, parentId),
    reach: reach()
  });
  editor.commit('Add bone', (draft) => {
    const list = editor.draftLayers(draft);
    if (target.created) placeLayer(list, { ...target.layer, bones: [bone] });
    else list.find((l) => l.id === target.layer.id)?.bones.push(bone);
  });
  if (target.created) activeLayer.set(target.layer.id);
  boneSelection.set(bone.id);
  return { layerId: target.layer.id, boneId: bone.id };
}

// the item in the keyframe that holds it at the current frame, binding changes that one
function keyItem(layers: Layer[], id: string): { layer: Layer; key: Keyframe; found: Found } | null {
  for (const layer of layers) {
    if (layer.type === 'rig' || layer.type === 'folder') continue;
    const key = keyframeAt(layer, editor.frame);
    const found = key ? findItem(key.items, id) : null;
    if (key && found) return { layer, key, found };
  }
  return null;
}

// the ids of the bones anything in the timeline is bound to
function usedBones(layers: Layer[]): Set<string> {
  const out = new Set<string>();
  eachItem(layers, (item) => boundBones(item, out));
  return out;
}

function hasSkin(item: Item): boolean {
  return !!item.skin || (item.type === 'group' && item.children.some(hasSkin));
}

interface Job {
  id: string;
  bones: Bone[];
  mode: BindMode;
  bone?: string;
  unbind?: boolean;
}

// binds or unbinds items in one undo step. a bone nothing is bound to yet takes where it is now as
// its bind matrix, so what gets bound stays where it shows
function runBind(label: string, jobs: Job[], key?: string): number {
  if (jobs.length === 0) return 0;
  const layers = editor.currentLayers();
  const pose = currentPose();
  const all = timelineBones(layers);
  const worlds = worldMatrices(all, pose);
  const used = usedBones(layers);
  const rebind = new Set<string>();
  for (const job of jobs) for (const b of job.bones) if (!job.unbind && !used.has(b.id)) rebind.add(b.id);
  const bones = all.map((b) => (rebind.has(b.id) ? { ...b, bind: worlds.get(b.id)! } : b));
  const byId = new Map(bones.map((b) => [b.id, b]));
  const rig = makeRig(bones, pose);
  const out = new Map<string, Item>();
  for (const job of jobs) {
    const at = keyItem(layers, job.id);
    if (!at) continue;
    const item = at.found.item;
    if (job.unbind) {
      out.set(job.id, unbindItem(item));
      continue;
    }
    const own = job.bones.map((b) => byId.get(b.id) ?? b);
    out.set(job.id, bindItem(item, parentMatrix(at.found.parents), own, rig, job.mode, job.bone));
  }
  editor.commit(
    label,
    (draft) => {
      const list = editor.draftLayers(draft);
      for (const layer of list) {
        if (layer.type !== 'rig') continue;
        for (const b of layer.bones) if (rebind.has(b.id)) b.bind = byId.get(b.id)!.bind;
      }
      for (const [id, item] of out) {
        const at = keyItem(list, id);
        if (at) at.found.list[at.found.index] = cloneItem(item);
      }
    },
    key
  );
  return out.size;
}

// after a chain is drawn: everything on the layers that can be edited that lies well within reach of
// the new bones gets bound, to every bone that reaches it. what is bound already stays as it is
export function autoBind(boneIds: string[], key?: string): number {
  const layers = editor.currentLayers();
  const rig = editor.rig();
  const all = timelineBones(layers);
  const fresh = all.filter((b) => boneIds.includes(b.id));
  if (!rig || fresh.length === 0) return 0;
  const mode = get(preferences).rig.bindMode;
  const jobs: Job[] = [];
  for (const layer of layers) {
    if (!editor.isEditable(layer)) continue;
    for (const item of editor.shownItems(layer)) {
      if (item.locked || !item.visible || hasSkin(item)) continue;
      const pts = samplePoints(item, item.transform);
      if (reachShare(pts, fresh, rig.world) < AUTO_SHARE) continue;
      jobs.push({ id: item.id, bones: reachingBones(pts, all, rig.world), mode });
    }
  }
  return runBind('Bind to bones', jobs, key);
}

// the selection to the picked bone, or to the bones that reach it when none is picked
export function bindSelection() {
  const items = editor.selectedItems(false);
  const all = timelineBones(editor.currentLayers());
  if (items.length === 0) {
    addToast('Select the drawings to bind first');
    return;
  }
  if (all.length === 0) {
    addToast('Draw bones first, with the bone tool (M)');
    return;
  }
  const mode = get(preferences).rig.bindMode;
  const picked = all.find((b) => b.id === get(boneSelection)) ?? null;
  const rig = editor.rig()!;
  const jobs: Job[] = items.map((item) => {
    if (picked && mode === 'rigid') return { id: item.id, bones: [picked], mode: 'rigid', bone: picked.id };
    if (picked) {
      const own = all.filter((b) => b.id === picked.id || boundBones(item).has(b.id));
      return { id: item.id, bones: own, mode: 'smooth' };
    }
    const shown = editor.shownItem(item.id) ?? item;
    const near = reachingBones(samplePoints(shown, editor.shownWorld(item.id)), all, rig.world);
    return { id: item.id, bones: near.length > 0 ? near : all, mode };
  });
  runBind('Bind to bones', jobs);
}

export function unbindSelection() {
  const items = editor.selectedItems(false).filter(hasSkin);
  if (items.length === 0) {
    addToast('Nothing selected is bound');
    return;
  }
  runBind(
    'Unbind',
    items.map((item) => ({ id: item.id, bones: [], mode: 'auto', unbind: true }))
  );
}

// the bind tool's click: rigid binds to the bone or lets go of it, smooth adds the bone to the item's
// weights or takes it out. an item bound smooth the first time is weighed against every bone of the
// layer, auto binds it rigidly when it fits in the bone's reach
export function toggleBind(itemId: string, boneId: string, mode: BindMode) {
  const layers = editor.currentLayers();
  const item = editor.itemById(itemId, false);
  const layer = rigLayerOf(layers, boneId);
  const bone = layer?.bones.find((b) => b.id === boneId);
  if (!item || !layer || !bone) return;
  const all = timelineBones(layers);
  const unbind = () => runBind('Unbind', [{ id: itemId, bones: [], mode, unbind: true }]);
  const rigid = () => runBind('Bind to bone', [{ id: itemId, bones: [bone], mode: 'rigid', bone: boneId }]);
  if (item.skin?.rigid === boneId) return unbind();
  if (mode === 'rigid') return rigid();
  if (!hasSkin(item) || item.skin?.rigid) {
    const rig = editor.rig();
    const shown = editor.shownItem(itemId) ?? item;
    const fits = rig && reachShare(samplePoints(shown, editor.shownWorld(itemId)), [bone], rig.world) === 1;
    if (mode === 'auto' && fits) return rigid();
    runBind('Bind to bones', [{ id: itemId, bones: layer.bones, mode: 'smooth' }]);
    return;
  }
  const own = boundBones(item);
  if (own.has(boneId)) {
    own.delete(boneId);
    const rest = all.filter((b) => own.has(b.id));
    if (rest.length === 0) unbind();
    else runBind('Unbind from bone', [{ id: itemId, bones: rest, mode: 'smooth' }]);
  } else {
    const bones = all.filter((b) => b.id === boneId || own.has(b.id));
    runBind('Bind to bone', [{ id: itemId, bones, mode: 'smooth' }]);
  }
}

// a new reach for a bone, the items bound to it smooth are weighed again, a drag folds into one step
export function setBoneRadius(boneId: string, radius: number) {
  const layers = editor.currentLayers();
  const r = Math.max(1, radius);
  const all = timelineBones(layers).map((b) => (b.id === boneId ? { ...b, radius: r } : b));
  const skins = new Map<string, Skin>();
  const walk = (items: Item[], parent: Mat) => {
    for (const item of items) {
      const world = multiply(parent, item.transform);
      const skin = item.skin;
      if (item.type === 'path' && skin && !skin.rigid && skin.weights.some((l) => l.some((w) => w.bone === boneId))) {
        const own = boundBones(item);
        skins.set(item.id, { weights: autoWeights(item, world, all.filter((b) => own.has(b.id))), rigid: null });
      }
      if (item.type === 'group') walk(item.children, world);
    }
  };
  for (const layer of layers) {
    if (layer.type === 'rig' || layer.type === 'folder') continue;
    const key = keyframeAt(layer, editor.frame);
    if (key) walk(key.items, identity());
  }
  editor.commit(
    'Bone reach',
    (draft) => {
      const list = editor.draftLayers(draft);
      const bone = timelineBones(list).find((b) => b.id === boneId);
      if (bone) bone.radius = r;
      for (const [id, skin] of skins) {
        const at = keyItem(list, id);
        if (at) at.found.item.skin = skin;
      }
    },
    'bone-radius'
  );
}

// the bone goes, its children hang on its parent, the items bound to it let go of it
export function deleteBone(boneId: string) {
  const at = editor.findBone(boneId);
  if (!at) return;
  if (!canEditRig(at.layer)) {
    addToast(`${at.layer.name} is locked or hidden`, 'warning');
    return;
  }
  editor.commit('Delete bone', (draft) => {
    const layer = editor.draftLayers(draft).find((l) => l.id === at.layer.id);
    if (!layer) return;
    removeBone(layer.bones, boneId);
    for (const k of layer.keyframes) delete k.pose[boneId];
  });
  if (get(boneSelection) === boneId) boneSelection.set(null);
}

export type BoneFields = Partial<
  Pick<Bone, 'name' | 'length' | 'rotation' | 'x' | 'y' | 'radius' | 'pinned' | 'color'>
>;

// changes the bone's own values, a key folds a number drag into one step
export function setBone(boneId: string, patch: BoneFields, label: string, key?: string) {
  const at = editor.findBone(boneId);
  if (!at) return;
  editor.commit(
    label,
    (draft) => {
      const bone = editor
        .draftLayers(draft)
        .find((l) => l.id === at.layer.id)
        ?.bones.find((b) => b.id === boneId);
      if (bone) Object.assign(bone, patch);
    },
    key
  );
}

export function renameBone(boneId: string, name: string) {
  const clean = name.trim();
  if (clean) setBone(boneId, { name: clean }, 'Rename bone');
}

// a pinned joint stays where it is while the bones below it are dragged
export function togglePin(boneId: string) {
  const at = editor.findBone(boneId);
  if (at) setBone(boneId, { pinned: !at.bone.pinned }, at.bone.pinned ? 'Unpin joint' : 'Pin joint');
}

// the layers holding drawings bound to some of the bones
function layersUsing(layers: Layer[], ids: Set<string>): string[] {
  return layers
    .filter((l) => l.type === 'normal' && [...usedBones([l])].some((id) => ids.has(id)))
    .map((l) => l.id);
}

// writes poses into their rig layers at the current frame as one step. with auto key a frame that is
// not a keyframe gets one first, and the keyframe before tweens into it. the drawings bound to the
// bones hold until that frame
export function commitPoses(poses: Map<string, Pose>, label = 'Pose', key?: string): boolean {
  const prefs = get(preferences);
  const frame = editor.frame;
  const layers = editor.currentLayers();
  const ids = new Set<string>();
  const own = new Map<string, Pose>();
  for (const [layerId, pose] of poses) {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) continue;
    const mine: Pose = {};
    for (const b of layer.bones) {
      ids.add(b.id);
      if (pose[b.id]) mine[b.id] = { ...pose[b.id] };
    }
    own.set(layerId, mine);
  }
  const extend = layersUsing(layers, ids).filter((id) => (layers.find((l) => l.id === id)?.length ?? 0) <= frame);
  return editor.commit(
    label,
    (draft) => {
      const list = editor.draftLayers(draft);
      for (const [layerId, pose] of own) {
        const layer = list.find((l) => l.id === layerId);
        const ease = prefs.rig.tweenPoses ? prefs.rig.ease : null;
        if (layer) poseKeyframe(layer, frame, prefs.timeline.autoKey, ease).pose = pose;
      }
      for (const l of list) if (extend.includes(l.id)) l.length = frame + 1;
    },
    key
  );
}

export function commitPose(layerId: string, pose: Pose, label = 'Pose', key?: string) {
  commitPoses(new Map([[layerId, pose]]), label, key);
}

// one value of a bone's pose at the current frame, from the properties panel
export function setPoseField(boneId: string, patch: Partial<BonePose>, key?: string) {
  const at = editor.findBone(boneId);
  if (!at) return;
  if (!canEditRig(at.layer)) {
    addToast(`${at.layer.name} is locked or hidden`, 'warning');
    return;
  }
  const pose = { ...currentPose() };
  pose[boneId] = { ...poseOf(pose, boneId), ...patch };
  commitPose(at.layer.id, pose, 'Pose', key);
}

// the rig layers that can be posed back at rest on this frame
export function resetPose() {
  const layers = rigLayers().filter((l) => canEditRig(l) && l.bones.length > 0);
  if (layers.length === 0) {
    addToast('There is no rig to reset');
    return;
  }
  // a pose keyframe at rest already would only get an empty pose again
  const posed = layers.filter((l) => {
    const key = l.keyframes.find((k) => k.frame === editor.frame);
    return !key || Object.keys(key.pose).length > 0;
  });
  if (posed.length === 0) {
    addToast('The pose is at rest already');
    return;
  }
  commitPoses(new Map(posed.map((l) => [l.id, {}])), 'Reset pose');
}

// every keyframe of the rig layer back at rest
export function resetAllPoses() {
  const layer = activeRigLayer();
  if (!layer || !canEditRig(layer)) {
    addToast('There is no rig to reset');
    return;
  }
  const done = editor.commit('Reset all poses', (draft) => {
    const l = editor.draftLayers(draft).find((x) => x.id === layer.id);
    if (l) for (const k of l.keyframes) if (Object.keys(k.pose).length > 0) k.pose = {};
  });
  if (!done) addToast('Every pose is at rest already');
}

// a template fitted to the selection, or to the middle of the stage, bound right away. adding and
// binding undo together
export function addRigTemplate(kind: TemplateKind) {
  const target = rigTarget();
  if (!target.created && !canEditRig(target.layer)) {
    addToast(`${target.layer.name} is locked or hidden`, 'warning');
    return;
  }
  const sel = editor.selectionBounds();
  const doc = editor.doc;
  const box = !isEmpty(sel) ? sel : transformBox(stageBox(doc.width, doc.height), invert(editor.base()));
  const copy = target.layer.bones.map((b) => ({ ...b }));
  const added = addTemplate(copy, kind, box, reach());
  const key = `template-${Date.now()}`;
  editor.commit(
    'Add template',
    (draft) => {
      const list = editor.draftLayers(draft);
      if (target.created) placeLayer(list, { ...target.layer, bones: added });
      else list.find((l) => l.id === target.layer.id)?.bones.push(...added.map((b) => ({ ...b })));
    },
    key
  );
  if (target.created) activeLayer.set(target.layer.id);
  autoBind(
    added.map((b) => b.id),
    key
  );
}

// delete takes the selected items, or the picked bone when no item is selected
export function deletePicked() {
  const bone = get(boneSelection);
  if (get(selection).size === 0 && bone && editor.findBone(bone)) deleteBone(bone);
  else deleteSelection();
}
