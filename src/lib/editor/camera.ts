import { derived, get, writable } from 'svelte/store';
import type { CameraKey, Doc, Layer, Transition, TransitionKind } from '$lib/core/types';
import { emptyBox, isEmpty, union, type Box } from '$lib/core/bbox';
import { itemBounds } from '$lib/core/items';
import { findItem } from '$lib/core/items';
import {
  MAX_PARALLAX,
  MAX_ZOOM,
  MIN_ZOOM,
  cameraKeyAt,
  cameraLayerOf,
  focusCamera,
  makeTransition,
  presetKeys,
  restCamera,
  type PresetKind
} from '$lib/anim/camera';
import { insertKeyframe, keyframeForEdit, layersLength } from '$lib/anim/timeline';
import { resolveItems } from '$lib/render/frame';
import { activeLayer, addToast, frame, playing, selection } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { editor, docVersion, makeLayer } from './editor';

// the camera on the main timeline: a layer with one keyframe per position, made, moved and keyed from
// here. the stage shows what it films in the camera view, the export always does

export const CAMERA_COLOR = '#e0b341';

// the stage shows what the camera films, like the video, instead of the whole scene to draw on
export const cameraView = writable(false);

export function toggleCameraView() {
  if (!cameraLayerOf(editor.doc.layers)) {
    addToast('Add a camera first, Insert > Camera', 'info');
    return;
  }
  cameraView.update((on) => !on);
}

// the stage films through the camera: asked for, or while playing a document that has one
export const showingCamera = derived([cameraView, playing, docVersion], ([on, play]) => {
  if (editor.editStack.length > 0) return false;
  const cam = cameraLayerOf(editor.doc.layers);
  return !!cam && cam.visible && (on || play);
});

// the camera view draws at half the pixels while playing on a tablet, or always at full or half size
// as the preferences say. the export always draws at full size
export function previewScaleFor(mode: 'auto' | 'full' | 'half', touch: boolean, play: boolean): number {
  if (mode === 'full') return 1;
  if (mode === 'half') return 0.5;
  return touch && play ? 0.5 : 1;
}

export function cameraLayer(): Layer | null {
  return cameraLayerOf(editor.doc.layers);
}

function onMainTimeline(): boolean {
  if (editor.editStack.length === 0) return true;
  addToast('Leave the symbol first, the camera films the main timeline', 'info');
  return false;
}

function draftCamera(draft: Doc): Layer | null {
  return draft.layers.find((l) => l.type === 'camera') ?? null;
}

// a camera layer on top of the timeline, looking at the whole stage
export function addCamera(): Layer | null {
  if (!onMainTimeline()) return null;
  const have = cameraLayer();
  if (have) {
    activeLayer.set(have.id);
    return have;
  }
  const doc = editor.doc;
  const layer = makeLayer('Camera', CAMERA_COLOR, 'camera');
  layer.keyframes[0].camera = restCamera(doc.width, doc.height);
  // as long as the scene, so the camera holds over all of it
  layer.length = Math.max(1, layersLength(doc.layers));
  editor.commit('Add camera', (draft) => {
    draft.layers.push(layer);
  });
  activeLayer.set(layer.id);
  return cameraLayer();
}

// the camera values at the playhead
export function cameraHere(): CameraKey {
  const doc = editor.doc;
  return cameraKeyAt(cameraLayer(), editor.frame, doc.width, doc.height);
}

function clampCamera(c: CameraKey): CameraKey {
  return { ...c, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom)), shake: Math.max(0, c.shake), bob: Math.max(0, c.bob) };
}

// a change to the camera lands in a keyframe at the playhead, made there with auto key. key joins the
// steps of one drag into a single undo step
export function setCamera(patch: Partial<CameraKey>, label = 'Move camera', key?: string): boolean {
  if (!onMainTimeline()) return false;
  if (!cameraLayer()) addCamera();
  const at = editor.frame;
  const autoKey = get(preferences).timeline.autoKey;
  return editor.commit(
    label,
    (draft) => {
      const layer = draftCamera(draft);
      if (!layer) return;
      const k = keyframeForEdit(layer, at, autoKey);
      const doc = editor.doc;
      const before = k.camera ?? restCamera(doc.width, doc.height);
      k.camera = clampCamera({ ...before, ...patch });
      layer.length = Math.max(layer.length, at + 1);
    },
    key
  );
}

// a keyframe of the camera at the playhead without changing where it looks
export function keyCamera() {
  if (!onMainTimeline()) return;
  if (!cameraLayer()) addCamera();
  const at = editor.frame;
  editor.commit('Camera keyframe', (draft) => {
    const layer = draftCamera(draft);
    if (layer) insertKeyframe(layer, at);
  });
}

// the tween from the camera keyframe at or before the playhead to the next one, null for a hold
export function setCameraEase(ease: string | null) {
  const cam = cameraLayer();
  if (!cam || !onMainTimeline()) return;
  const at = editor.frame;
  editor.commit('Camera ease', (draft) => {
    const layer = draftCamera(draft);
    if (!layer) return;
    const k = [...layer.keyframes].reverse().find((f) => f.frame <= at);
    if (k) k.tween = ease === null ? null : { ease };
  });
}

// a new shot starts at the playhead with this transition, null makes it a plain keyframe again
export function setTransition(kind: TransitionKind | null, patch: Partial<Transition> = {}, key?: string) {
  if (!onMainTimeline()) return;
  if (!cameraLayer()) addCamera();
  const at = editor.frame;
  const fps = editor.doc.fps;
  editor.commit(
    kind ? 'Shot transition' : 'Remove transition',
    (draft) => {
      const layer = draftCamera(draft);
      if (!layer) return;
      const k = insertKeyframe(layer, at);
      const doc = editor.doc;
      const c = k.camera ?? restCamera(doc.width, doc.height);
      const kept = c.transition && c.transition.kind === kind ? c.transition : null;
      k.camera = { ...c, transition: kind ? { ...(kept ?? makeTransition(kind, fps)), ...patch, kind } : null };
    },
    key
  );
}

// the world box of the selection on the main timeline, empty when nothing is picked
function selectionBox(): Box {
  if (editor.editStack.length > 0) return emptyBox();
  return editor.selectionBounds();
}

// the camera frames the picked objects, or keeps looking where it does when nothing is picked
export function focusSelection() {
  const box = selectionBox();
  if (isEmpty(box)) {
    addToast('Pick what the camera should look at', 'info');
    return;
  }
  const doc = editor.doc;
  setCamera(focusCamera(box, doc.width, doc.height), 'Focus camera');
}

// where an item is at frame, looked up again since it moves: its box on its layer then
function itemBoxAt(id: string, at: number): Box | null {
  for (const layer of editor.doc.layers) {
    if (layer.type !== 'normal' && layer.type !== 'guide') continue;
    const found = findItem(resolveItems(layer, at), id);
    if (found) return itemBounds(found.item, found.item.transform);
  }
  return null;
}

export interface PresetChoice {
  kind: PresetKind;
  seconds: number;
  strength: number;
  ease: string;
}

// a preset puts its keyframes down from the playhead on. the layers that end earlier hold their last
// frame until the move is done, so the scene does not go empty under the camera
export function applyPreset(choice: PresetChoice): boolean {
  if (!onMainTimeline()) return false;
  if (!cameraLayer()) addCamera();
  const doc = editor.doc;
  const at = editor.frame;
  const frames = Math.max(1, Math.round(choice.seconds * doc.fps));
  const from = cameraHere();
  const box = selectionBox();
  const picked = !isEmpty(box);
  let target: { x: number; y: number; zoom?: number } | null = null;
  if (picked) target = focusCamera(box, doc.width, doc.height);
  if (choice.kind === 'focus' && !picked) {
    addToast('Pick what the camera should pull focus to', 'info');
    return false;
  }
  let track: { frame: number; x: number; y: number }[] | undefined;
  if (choice.kind === 'track') {
    const ids = [...get(selection)];
    if (ids.length === 0) {
      addToast('Pick what the camera should follow', 'info');
      return false;
    }
    // a sample every quarter second, the camera glides between them
    const step = Math.max(1, Math.round(doc.fps / 4));
    track = [];
    for (let f = at; f <= at + frames; f += step) {
      let b = emptyBox();
      for (const id of ids) {
        const one = itemBoxAt(id, f);
        if (one) b = union(b, one);
      }
      if (!isEmpty(b)) track.push({ frame: f, x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    }
  }
  const plan = presetKeys(choice.kind, from, {
    at,
    frames,
    fps: doc.fps,
    width: doc.width,
    height: doc.height,
    strength: choice.strength,
    ease: choice.ease,
    target: choice.kind === 'push' || choice.kind === 'zoom' || choice.kind === 'focus' ? target : null,
    track
  });
  const end = Math.max(...plan.map((p) => p.frame));
  editor.commit('Camera preset', (draft) => {
    const layer = draftCamera(draft);
    if (!layer) return;
    for (const p of plan) {
      const k = insertKeyframe(layer, p.frame);
      const transition = k.camera?.transition ?? null;
      k.camera = { ...p.camera, transition: p.frame === at ? (transition ?? null) : null };
      k.tween = p.ease ? { ease: p.ease } : k.frame === end ? k.tween : null;
    }
    // keyframes of the camera inside the move that were there before give way to it
    layer.keyframes = layer.keyframes.filter((k) => k.frame <= at || k.frame >= end || plan.some((p) => p.frame === k.frame));
    for (const l of draft.layers) {
      if (l.type === 'folder') continue;
      l.length = Math.max(l.length, end + 1);
    }
  });
  addToast(`${frames} frames of camera move from frame ${at + 1}`, 'success', 2000);
  return true;
}

// how far a layer follows the camera, null puts it back to following the folder or 1
export function setParallax(layerId: string, value: number | null, key?: string) {
  editor.commit(
    'Parallax',
    (draft) => {
      const layer = draft.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (value === null) delete layer.parallax;
      else layer.parallax = Math.max(0, Math.min(MAX_PARALLAX, value));
    },
    key
  );
}

// depth for the layers of a comic scene by their names: the background far back, the foreground in front
export const SCENE_DEPTH: Record<string, number> = {
  Background: 0.3,
  Midground: 0.65,
  Characters: 1,
  Foreground: 1.4,
  'Speech bubbles': 0
};

export function sceneDepth() {
  const named = editor.doc.layers.filter((l) => SCENE_DEPTH[l.name] !== undefined);
  if (named.length === 0) {
    addToast('No comic scene layers to set, Insert > Comic scene layers adds them', 'info');
    return;
  }
  editor.commit('Scene depth', (draft) => {
    for (const l of draft.layers) if (SCENE_DEPTH[l.name] !== undefined) l.parallax = SCENE_DEPTH[l.name];
  });
}

// the keyframes of the camera that start a shot or carry a label, to jump between
export function cameraShots(): { frame: number; name: string; kind: TransitionKind | null }[] {
  const cam = cameraLayer();
  if (!cam) return [];
  return cam.keyframes
    .filter((k) => k.frame === 0 || k.label || k.camera?.transition)
    .map((k, i) => ({ frame: k.frame, name: k.label || `Shot ${i + 1}`, kind: k.camera?.transition?.kind ?? null }));
}

export function playheadFrame(): number {
  return get(frame);
}
