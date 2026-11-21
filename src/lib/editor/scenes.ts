import { get } from 'svelte/store';
import type { Doc, Layer } from '$lib/core/types';
import { activeLayer, addToast, dialog, dirty } from '$lib/stores/app';
import { editor, makeDoc } from './editor';
import { isUntouched } from './layers';
import { packScene, storeScene, unpackScene, type ScenePackage, type SceneMeta } from '$lib/scene/library';
import { starterLayers, STARTERS, type StarterId } from '$lib/scene/starters';

// scenes in the editor: the open one kept in the library, a kept or a ready made one put under what is
// there, or opened as a project of its own

export async function saveScene(name: string): Promise<SceneMeta | null> {
  if (editor.editStack.length > 0) {
    addToast('Leave the symbol first, a scene keeps the main timeline', 'info');
    return null;
  }
  const m = await storeScene(packScene(editor.doc, name));
  addToast(`${m.name} saved to the scene library`, 'success', 2200);
  return m;
}

// layers under everything that is there, their pictures, symbols and sounds along. a scene camera goes
// only into a document without one
function addLayers(draft: Doc, layers: Layer[]) {
  const hasCamera = draft.layers.some((l) => l.type === 'camera');
  const keep = layers.filter((l) => !(hasCamera && l.type === 'camera'));
  // a camera stays on top, everything else goes to the bottom
  const camera = keep.filter((l) => l.type === 'camera');
  draft.layers.splice(0, 0, ...keep.filter((l) => l.type !== 'camera'));
  draft.layers.push(...camera);
}

export function insertScene(pkg: ScenePackage): boolean {
  if (editor.editStack.length > 0) return false;
  const doc = editor.doc;
  const out = unpackScene(pkg, doc.width, doc.height);
  // a fresh document takes the scene as it is, nothing of the empty layer stays
  const fresh = isUntouched(doc.layers);
  editor.commit(`Insert scene: ${pkg.name}`, (draft) => {
    if (fresh) draft.layers = [];
    addLayers(draft, out.layers);
    Object.assign(draft.assets, out.assets);
    Object.assign(draft.symbols, out.symbols);
    if (out.audio.length) draft.audio = [...(draft.audio ?? []), ...out.audio];
    if (fresh) draft.bg = pkg.bg;
  });
  selectTop();
  if (pkg.fps !== doc.fps) addToast(`The scene was made at ${pkg.fps} fps, this project runs at ${doc.fps}`, 'info', 3000);
  return true;
}

// a scene as a new project, the open one asks first when it has changes
export function openScene(pkg: ScenePackage, confirmed = false) {
  if (!confirmed && get(dirty)) {
    dialog.set({
      kind: 'confirm',
      title: 'Open scene',
      message: `${pkg.name} opens as a new project. Changes not saved in the open one are lost.`,
      confirm: 'Open',
      danger: true,
      onconfirm: () => openScene(pkg, true)
    });
    return;
  }
  const out = unpackScene(pkg);
  const doc = makeDoc(pkg.width, pkg.height, pkg.fps);
  doc.name = pkg.name;
  doc.bg = pkg.bg;
  doc.layers = out.layers;
  doc.assets = out.assets;
  doc.symbols = out.symbols;
  if (out.audio.length) doc.audio = out.audio;
  editor.loadDoc(doc);
}

// a ready made place: the comic layers with the room drawn in, under what is there
export function insertStarter(id: StarterId): boolean {
  if (editor.editStack.length > 0) return false;
  const doc = editor.doc;
  const layers = starterLayers(id, doc.width, doc.height);
  const fresh = isUntouched(doc.layers);
  const label = STARTERS.find((s) => s.id === id)?.label ?? 'Scene';
  editor.commit(`Scene: ${label}`, (draft) => {
    if (fresh) draft.layers = [];
    addLayers(draft, layers);
  });
  selectTop();
  return true;
}

// the characters layer of a comic scene takes the next drawing, else the top normal layer
function selectTop() {
  const layers = editor.doc.layers;
  const target = layers.find((l) => l.type === 'normal' && l.name === 'Characters' && !l.parent) ?? [...layers].reverse().find((l) => l.type === 'normal');
  if (target) activeLayer.set(target.id);
}
