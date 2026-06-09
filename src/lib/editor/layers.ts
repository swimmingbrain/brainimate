import { get } from 'svelte/store';
import type { Layer } from '$lib/core/types';
import { activeLayer, addToast, selection } from '$lib/stores/app';
import { LAYER_COLORS, editor, makeLayer } from './editor';

function nextName(layers: Layer[]): string {
  let n = 0;
  for (const l of layers) {
    const m = /^Layer (\d+)$/.exec(l.name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `Layer ${n + 1}`;
}

// a new layer goes right above the active one and becomes active
export function addLayer() {
  const layers = editor.currentLayers();
  const layer = makeLayer(nextName(layers), LAYER_COLORS[layers.length % LAYER_COLORS.length]);
  const active = get(activeLayer);
  editor.commit('New layer', (draft) => {
    const index = draft.layers.findIndex((l) => l.id === active);
    draft.layers.splice(index < 0 ? draft.layers.length : index + 1, 0, layer);
  });
  activeLayer.set(layer.id);
}

export function deleteLayer(id: string) {
  const layers = editor.currentLayers();
  if (layers.length <= 1) {
    addToast('The last layer stays', 'warning');
    return;
  }
  const index = layers.findIndex((l) => l.id === id);
  if (index < 0) return;
  editor.commit('Delete layer', (draft) => {
    draft.layers.splice(index, 1);
  });
  // the layer below takes over, or the new bottom one
  const rest = editor.currentLayers();
  activeLayer.set(rest[Math.max(0, index - 1)].id);
  editor.pruneSelection();
}

export function renameLayer(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  editor.commit('Rename layer', (draft) => {
    const layer = draft.layers.find((l) => l.id === id);
    if (layer) layer.name = clean;
  });
}

export function setLayerFlag(id: string, key: 'visible' | 'locked' | 'outline', value: boolean) {
  const labels = {
    visible: value ? 'Show layer' : 'Hide layer',
    locked: value ? 'Lock layer' : 'Unlock layer',
    outline: value ? 'Show layer as outlines' : 'Show layer filled'
  };
  const label = labels[key];
  editor.commit(label, (draft) => {
    const layer = draft.layers.find((l) => l.id === id);
    if (layer) layer[key] = value;
  });
  // items on a layer that was hidden or locked cannot stay selected
  if (key !== 'outline' && ((key === 'visible' && !value) || (key === 'locked' && value))) {
    const sel = get(selection);
    const kept = [...sel].filter((sid) => editor.layerOfItem(sid)?.id !== id);
    if (kept.length !== sel.size) selection.set(new Set(kept));
  }
}

export function setActiveLayer(id: string) {
  activeLayer.set(id);
}
