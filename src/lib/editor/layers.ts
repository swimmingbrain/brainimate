import { get } from 'svelte/store';
import type { Item, Layer } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { descendantIds, moveLayer } from '$lib/anim/timeline';
import { activeLayer, addToast, collapsedFolders, frameSelection, selection } from '$lib/stores/app';
import { LAYER_COLORS, editor, makeLayer } from './editor';

// the next free number for names like 'Layer 3' or 'Folder 2'
function nextName(layers: Layer[], base: string): string {
  let n = 0;
  const pattern = new RegExp(`^${base} (\\d+)$`);
  for (const l of layers) {
    const m = pattern.exec(l.name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${base} ${n + 1}`;
}

// a new layer goes right above the active one, into the same folder, and becomes active
function addAboveActive(layer: Layer, label: string) {
  const active = editor.activeLayer();
  layer.parent = active?.parent ?? null;
  editor.commit(label, (draft) => {
    const layers = editor.draftLayers(draft);
    const index = layers.findIndex((l) => l.id === active?.id);
    layers.splice(index < 0 ? layers.length : index + 1, 0, layer);
  });
  activeLayer.set(layer.id);
}

function nextColor(): string {
  return LAYER_COLORS[editor.currentLayers().length % LAYER_COLORS.length];
}

export function addLayer() {
  addAboveActive(makeLayer(nextName(editor.currentLayers(), 'Layer'), nextColor()), 'New layer');
}

export function addFolder() {
  addAboveActive(makeLayer(nextName(editor.currentLayers(), 'Folder'), nextColor(), 'folder'), 'New folder');
}

// a rig layer holds bones and their poses, the bone tool fills it
export function addRigLayer() {
  addAboveActive(makeLayer(nextName(editor.currentLayers(), 'Rig'), nextColor(), 'rig'), 'New rig layer');
}

// a folder goes with everything in it, one layer that holds frames always stays
export function deleteLayer(id: string) {
  const layers = editor.currentLayers();
  const index = layers.findIndex((l) => l.id === id);
  if (index < 0) return;
  const gone = new Set([id, ...descendantIds(layers, id)]);
  if (!layers.some((l) => !gone.has(l.id) && l.type === 'normal')) {
    addToast('The last layer stays', 'warning');
    return;
  }
  editor.commit(gone.size > 1 ? 'Delete folder' : 'Delete layer', (draft) => {
    const list = editor.draftLayers(draft);
    for (let i = list.length - 1; i >= 0; i--) if (gone.has(list[i].id)) list.splice(i, 1);
  });
  // the layer below takes over, or the new bottom one
  const rest = editor.currentLayers();
  const below = layers.slice(0, index).reverse().find((l) => !gone.has(l.id));
  activeLayer.set(below?.id ?? rest[rest.length - 1].id);
  frameSelection.update((s) => (s ? { ...s, layers: s.layers.filter((l) => !gone.has(l)) } : s));
  editor.pruneSelection();
}

function renewItemIds(items: Item[], ids: Map<string, string>) {
  for (const item of items) {
    if (!ids.has(item.id)) ids.set(item.id, newId());
    item.id = ids.get(item.id)!;
    if (item.type === 'group') renewItemIds(item.children, ids);
  }
}

// a copy right above, a folder with copies of everything in it. items get new ids, the same in
// every keyframe of a layer so its tweens still match
export function duplicateLayer(id: string) {
  const layers = editor.currentLayers();
  const gone = new Set([id, ...descendantIds(layers, id)]);
  const block = layers.filter((l) => gone.has(l.id));
  if (block.length === 0) return;
  const layerIds = new Map(block.map((l) => [l.id, newId()]));
  const copies = block.map((l) => {
    const c = JSON.parse(JSON.stringify(l)) as Layer;
    c.id = layerIds.get(l.id)!;
    if (c.parent && layerIds.has(c.parent)) c.parent = layerIds.get(c.parent)!;
    if (l.id === id) c.name = `${l.name} copy`;
    const ids = new Map<string, string>();
    for (const k of c.keyframes) renewItemIds(k.items, ids);
    return c;
  });
  editor.commit('Duplicate layer', (draft) => {
    const list = editor.draftLayers(draft);
    const index = list.findIndex((l) => l.id === id);
    list.splice(index + 1, 0, ...copies);
  });
  activeLayer.set(layerIds.get(id)!);
}

export function renameLayer(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  editor.commit('Rename layer', (draft) => {
    const layer = editor.draftLayers(draft).find((l) => l.id === id);
    if (layer) layer.name = clean;
  });
}

// items on a layer that went hidden or locked cannot stay selected
function dropHiddenSelection() {
  const sel = get(selection);
  const kept = [...sel].filter((sid) => {
    const layer = editor.layerOfItem(sid);
    return layer && editor.isEditable(layer);
  });
  if (kept.length !== sel.size) selection.set(new Set(kept));
}

export function setLayerFlag(id: string, key: 'visible' | 'locked' | 'outline', value: boolean) {
  const labels = {
    visible: value ? 'Show layer' : 'Hide layer',
    locked: value ? 'Lock layer' : 'Unlock layer',
    outline: value ? 'Show layer as outlines' : 'Show layer filled'
  };
  editor.commit(labels[key], (draft) => {
    const layer = editor.draftLayers(draft).find((l) => l.id === id);
    if (layer) layer[key] = value;
  });
  dropHiddenSelection();
}

export function showAllLayers() {
  editor.commit('Show all layers', (draft) => {
    for (const l of editor.draftLayers(draft)) l.visible = true;
  });
}

// the layer, the folders around it and what it holds stay as they are, everything else changes
function keepAround(id: string): Set<string> {
  const layers = editor.currentLayers();
  const keep = new Set([id, ...descendantIds(layers, id)]);
  for (let l = layers.find((x) => x.id === id); l?.parent && !keep.has(l.parent); ) {
    keep.add(l.parent);
    l = layers.find((x) => x.id === l!.parent);
  }
  return keep;
}

export function hideOtherLayers(id: string) {
  const keep = keepAround(id);
  editor.commit('Hide other layers', (draft) => {
    for (const l of editor.draftLayers(draft)) l.visible = keep.has(l.id);
  });
  dropHiddenSelection();
}

export function lockOtherLayers(id: string) {
  const keep = keepAround(id);
  editor.commit('Lock other layers', (draft) => {
    for (const l of editor.draftLayers(draft)) l.locked = !keep.has(l.id);
  });
  dropHiddenSelection();
}

export function setLayerColor(id: string, color: string) {
  editor.commit('Layer color', (draft) => {
    const layer = editor.draftLayers(draft).find((l) => l.id === id);
    if (layer) layer.color = color;
  });
}

// drag and drop in the layer list
export function moveLayerTo(id: string, target: string, where: 'above' | 'below' | 'into') {
  if (id === target) return;
  editor.commit(where === 'into' ? 'Move into folder' : 'Move layer', (draft) => {
    moveLayer(editor.draftLayers(draft), id, target, where);
  });
}

export function toggleFolder(id: string) {
  collapsedFolders.update((set) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

export function setActiveLayer(id: string) {
  activeLayer.set(id);
}

export function deleteActiveLayer() {
  const id = get(activeLayer);
  if (id) deleteLayer(id);
}
