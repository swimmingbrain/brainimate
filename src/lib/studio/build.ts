import type { CameraKey, Doc, Item, Keyframe, Layer } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { makeLayer, LAYER_COLORS } from '$lib/editor/editor';
import { restCamera, makeTransition } from '$lib/anim/camera';
import { resolveItems } from '$lib/render/frame';
import { characterFolders, characterLayers } from '$lib/character/model';
import { rebuildKey } from '$lib/character/rebuild';
import { modelOf } from '$lib/character/views';
import { STARTERS, starterLayers, type StarterId } from '$lib/scene/starters';
import { cuesFrom, sceneStarts } from './production';
import type { Production, Scene } from './types';

// the storyboard laid onto the timeline: every scene gets its place on the background and the midground,
// a camera shot with its move and its transition, the characters not in it step out, and the subtitles
// come from the script. everything it makes is marked, so building again replaces it and leaves what the
// person animated by hand alone

export const MARK = 'scene:';

function marked(k: Keyframe): boolean {
  return k.label.startsWith(MARK);
}

function topLayer(doc: Doc, name: string, index: number): Layer {
  let l = doc.layers.find((x) => x.name === name && !x.parent && x.type === 'normal');
  if (!l) {
    l = makeLayer(name, LAYER_COLORS[index % LAYER_COLORS.length]);
    doc.layers.splice(Math.min(index, doc.layers.length), 0, l);
  }
  return l;
}

function keyAt(layer: Layer, frame: number): Keyframe {
  let k = layer.keyframes.find((x) => x.frame === frame);
  if (!k) {
    k = { frame, items: [], pose: {}, tween: null, label: '' };
    layer.keyframes.push(k);
    layer.keyframes.sort((a, b) => a.frame - b.frame);
  }
  return k;
}

// the camera of a scene at its start and end: a push goes in, a pull comes back, a pan travels, a shake
// trembles, a close-up goes near the faces of the cast
function shot(doc: Doc, scene: Scene, focus: { x: number; y: number } | null): [CameraKey, CameraKey] {
  const rest = restCamera(doc.width, doc.height);
  const at = (zoom: number, dx = 0, extra: Partial<CameraKey> = {}): CameraKey => ({ ...rest, zoom, x: rest.x + dx, ...extra });
  switch (scene.camera) {
    case 'push':
      return [at(1), at(1.18)];
    case 'pull':
      return [at(1.2), at(1)];
    case 'pan':
      return [at(1.15, -doc.width * 0.06), at(1.15, doc.width * 0.06)];
    case 'shake':
      return [at(1.05, 0, { shake: 14 }), at(1.08, 0, { shake: 14 })];
    case 'closeup': {
      const f = focus ?? { x: rest.x, y: doc.height * 0.4 };
      const k = { ...rest, zoom: 1.9, x: f.x, y: f.y };
      return [k, { ...k, zoom: 2.05 }];
    }
    default:
      return [at(1), at(1)];
  }
}

export interface Built {
  scenes: number;
  frames: number;
  cues: number;
}

export function buildTimeline(doc: Doc, p: Production): Built {
  const fps = doc.fps;
  const spans = sceneStarts(p, fps);
  const total = spans.length ? spans[spans.length - 1].end : 1;
  const bg = topLayer(doc, 'Background', 0);
  const mid = topLayer(doc, 'Midground', 1);
  // what an earlier build made goes, the first keyframe stays and is cleared if it was made
  for (const l of [bg, mid]) {
    l.keyframes = l.keyframes.filter((k) => k.frame === 0 || !marked(k));
    if (marked(l.keyframes[0])) {
      l.keyframes[0].items = [];
      l.keyframes[0].label = '';
    }
  }
  bg.parallax ??= 0.7;
  mid.parallax ??= 0.9;
  for (const { scene, start } of spans) {
    if (!scene.place || !STARTERS.some((s) => s.id === scene.place)) continue;
    const drawn = starterLayers(scene.place as StarterId, doc.width, doc.height);
    for (const [layer, src] of [
      [bg, drawn[0]],
      [mid, drawn[1]]
    ] as const) {
      const k = keyAt(layer, start);
      k.items = src.keyframes[0].items;
      k.tween = null;
      k.label = `${MARK}${scene.name}`;
    }
  }

  // the camera: one shot a scene, its transition in front of it
  let cam = doc.layers.find((l) => l.type === 'camera');
  if (!cam) {
    cam = makeLayer('Camera', '#e0b341', 'camera');
    cam.keyframes[0].camera = restCamera(doc.width, doc.height);
    doc.layers.push(cam);
  }
  cam.keyframes = cam.keyframes.filter((k) => k.frame === 0 || !marked(k));
  const cast = (scene: Scene) => characterFolders(doc.layers).filter((f) => scene.cast.length === 0 || scene.cast.includes(f.id));
  for (const [i, { scene, start, end }] of spans.entries()) {
    // the faces of the cast for a close-up
    const faces = cast(scene).map((f) => f.character!.face);
    const focus = faces.length ? { x: faces.reduce((n, f) => n + f.x, 0) / faces.length, y: faces.reduce((n, f) => n + f.y, 0) / faces.length + doc.height * 0.05 } : null;
    const [a, b] = shot(doc, scene, focus);
    const k = keyAt(cam, start);
    k.camera = { ...a, transition: i === 0 || scene.transition === 'cut' ? (i === 0 ? null : makeTransition('cut', fps)) : makeTransition(scene.transition, fps) };
    k.tween = { ease: 'inout' };
    k.label = `${MARK}${scene.name}`;
    const e = keyAt(cam, Math.max(start + 1, end - 1));
    e.camera = { ...b, transition: null };
    e.tween = null;
    e.label = `${MARK}${scene.name} end`;
  }

  // the characters a scene leaves out are hidden in it
  for (const folder of characterFolders(doc.layers)) {
    const parts = characterLayers(doc.layers, folder.id);
    const body = parts?.body;
    if (!body || !parts?.rig) continue;
    body.keyframes = body.keyframes.filter((k) => k.frame === 0 || !marked(k));
    const info = folder.character!;
    const turnable = !!parts.rig.turnRig && !!modelOf(info);
    const show = (k: Keyframe, on: boolean) => {
      if (on) {
        for (const item of k.items) if (item.role) item.visible = true;
        if (turnable) rebuildKey(info, parts.rig!, body, k);
      } else for (const item of k.items) if (item.role) item.visible = false;
    };
    // every keyframe starts out shown, then the scenes without this character hide it
    for (const k of body.keyframes) if (k.label === `${MARK}hidden`) k.label = '';
    let anyHidden = false;
    for (const { scene, start, end } of spans) {
      const inIt = scene.cast.length === 0 || scene.cast.includes(folder.id);
      const items: Item[] = resolveItems(body, start).map((i) => JSON.parse(JSON.stringify(i)));
      const k = keyAt(body, start);
      if (k.items.length === 0) k.items = items;
      k.tween = null;
      k.label = `${MARK}${inIt ? 'shown' : 'hidden'}`;
      show(k, inIt);
      if (!inIt) anyHidden = true;
      for (const inner of body.keyframes) if (inner.frame > start && inner.frame < end) show(inner, inIt);
    }
    if (!anyHidden) for (const k of body.keyframes) if (k.label === `${MARK}shown` && k.frame !== 0) k.label = '';
    body.keyframes = body.keyframes.filter((k) => k.frame === 0 || k.label !== '' || k.items.length > 0);
  }

  for (const l of doc.layers) if (l.type !== 'folder') l.length = Math.max(l.length, total);
  p.cues = cuesFrom(p, fps);
  doc.production = p;
  return { scenes: spans.length, frames: total, cues: p.cues.length };
}

export function sceneLabelId(): string {
  return newId();
}
