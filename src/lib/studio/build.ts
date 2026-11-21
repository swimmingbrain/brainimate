import type { CameraKey, Doc, Item, Keyframe, Layer, Vec } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { makeLayer, LAYER_COLORS } from '$lib/editor/editor';
import { restCamera, makeTransition, cameraKeyAt } from '$lib/anim/camera';
import { applyPoint, multiply, translate } from '$lib/core/mat';
import { worldMatrices } from '$lib/rig/bones';
import { bonesAt } from '$lib/rig/turn';
import { poseAt } from '$lib/render/frame';
import { ANIMATIONS, talkPattern, type AnimKind } from '$lib/character/anim';
import { animateDraft, faceDraft } from '$lib/editor/character';
import { makeVisual } from './visuals';
import { actionPoses, handItems, heldAt, heldItem, wheelItem } from './pov';
import { resolveItems } from '$lib/render/frame';
import { characterFolders, characterLayers } from '$lib/character/model';
import { rebuildKey } from '$lib/character/rebuild';
import { modelOf } from '$lib/character/views';
import { STARTERS, starterLayers, type StarterId } from '$lib/scene/starters';
import { cuesFrom, sceneStarts, type ClipSeconds } from './production';
import { clipLength } from '$lib/io/audio';
import type { CameraMove, Production, Scene } from './types';

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

type ShotKey = { f: number; cam: CameraKey; ease: string | null };

export const POV_MOVES: CameraMove[] = ['pov-walk', 'pov-run', 'pov-look', 'pov-interact'];

export function isPov(scene: Scene): boolean {
  return POV_MOVES.includes(scene.camera) && !!scene.pov?.actor;
}

// where a joint of a character is at a frame on the stage, its head or its hip
export function jointAt(doc: Doc, folderId: string, frame: number, name: 'Head' | 'Hip'): Vec | null {
  const parts = characterLayers(doc.layers, folderId);
  if (!parts?.rig) return null;
  const bones = bonesAt(doc.layers, parts.rig, frame);
  const bone = bones.find((b) => b.name === name);
  if (!bone) return null;
  const m = worldMatrices(bones, poseAt(parts.rig, frame)).get(bone.id);
  if (!m) return null;
  // the middle of the head, the top of the hip
  return name === 'Head' ? applyPoint(m, { x: bone.length * 0.5, y: 0 }) : { x: m[4], y: m[5] };
}

// the motion a first person shot has
export function povMotion(scene: Scene): 'stand' | 'walk' | 'run' {
  return scene.camera === 'pov-walk' ? 'walk' : scene.camera === 'pov-run' ? 'run' : 'stand';
}

export const POV_ZOOM = 1.7;

// the camera of a scene as keys from its start: a push goes in, a pull comes back, a pan travels, a shake
// trembles, a close-up goes near a face, a first person shot sees through the eyes of a character
function shot(doc: Doc, scene: Scene, frames: number, focus: Vec | null): ShotKey[] {
  const W = doc.width;
  const H = doc.height;
  const fps = doc.fps;
  const rest = restCamera(W, H);
  const last = Math.max(1, frames - 1);
  const at = (zoom: number, dx = 0, extra: Partial<CameraKey> = {}): CameraKey => ({ ...rest, zoom, x: rest.x + dx, ...extra });
  const on = (v: Vec, zoom: number, extra: Partial<CameraKey> = {}): CameraKey => ({ ...rest, x: v.x, y: v.y, zoom, ...extra });
  const two = (a: CameraKey, b: CameraKey, ease: string | null = 'inout'): ShotKey[] => [
    { f: 0, cam: a, ease },
    { f: last, cam: b, ease: null }
  ];
  const head = (id?: string) => (id ? jointAt(doc, id, 0, 'Head') : null);
  // positions come from the scene start, worked out by the caller for its frame
  const subject = focus ?? { x: rest.x, y: H * 0.4 };
  switch (scene.camera) {
    case 'push':
      return two(at(1), at(1.18));
    case 'pull':
      return two(at(1.2), at(1));
    case 'pan':
      return two(at(1.15, -W * 0.06), at(1.15, W * 0.06));
    case 'shake':
      return two(at(1.05, 0, { shake: 14 }), at(1.08, 0, { shake: 14 }));
    case 'closeup':
      return two(on(subject, 1.9), on(subject, 2.05));
    case 'wide':
      return two(at(1.06), at(1));
    case 'low':
      // from below the eyes: the camera sits low, looks up a little tilted, the figure grows tall
      return two(on({ x: subject.x, y: subject.y + H * 0.16 }, 1.3, { rotation: -0.03 }), on({ x: subject.x, y: subject.y + H * 0.14 }, 1.38, { rotation: -0.03 }));
    case 'high':
      return two(on({ x: subject.x, y: subject.y - H * 0.02 }, 1.25, { rotation: 0.02 }), on({ x: subject.x, y: subject.y }, 1.3, { rotation: 0.02 }));
    case 'push-in':
      return two(on(subject, 1.05), on(subject, 1.55), 'in');
    case 'handheld':
      return two(on(subject, 1.2, { shake: 5 }), on(subject, 1.24, { shake: 5 }));
    case 'dramatic':
      return two(on(subject, 1.6, { rotation: 0.035 }), on(subject, 2.2, { rotation: 0.035 }), 'inout');
    case 'scare': {
      // a jolt toward the face and a tremble that settles
      const k = Math.min(last - 1, Math.max(2, Math.round(fps * 0.2)));
      return [
        { f: 0, cam: on(subject, 1.1), ease: 'in' },
        { f: k, cam: on(subject, 1.9, { shake: 22 }), ease: 'out' },
        { f: last, cam: on(subject, 2, { shake: 3 }), ease: null }
      ];
    }
    case 'whip': {
      // a fast pan from the side onto the subject
      const k = Math.min(last - 1, Math.max(2, Math.round(fps * 0.3)));
      return [
        { f: 0, cam: on({ x: subject.x - W * 0.5, y: subject.y }, 1.4), ease: 'inout' },
        { f: k, cam: on(subject, 1.4), ease: 'inout' },
        { f: last, cam: on(subject, 1.45), ease: null }
      ];
    }
    case 'reveal': {
      // starts on the empty side and travels to the one it introduces
      const from = subject.x < W / 2 ? subject.x + W * 0.45 : subject.x - W * 0.45;
      const k = Math.min(last - 1, Math.round(frames * 0.6));
      return [
        { f: 0, cam: on({ x: from, y: subject.y }, 1.5), ease: 'inout' },
        { f: k, cam: on(subject, 1.5), ease: 'inout' },
        { f: last, cam: on(subject, 1.55), ease: null }
      ];
    }
    case 'over-shoulder': {
      // behind the subject toward the partner: the subject's shoulder fills an edge of the picture
      const a = head(scene.subject) ?? subject;
      const b = head(scene.partner) ?? { x: a.x + W * 0.3, y: a.y };
      const c = { x: a.x * 0.35 + b.x * 0.65, y: (a.y + b.y) / 2 + H * 0.06 };
      return two(on(c, 1.75), on(c, 1.85));
    }
    case 'tracking': {
      // follows the hip of the subject through the scene, a key every half second
      const id = scene.subject ?? scene.cast[0];
      const step = Math.max(2, Math.round(fps * 0.5));
      const out: ShotKey[] = [];
      for (let f = 0; f <= last; f += step) {
        const hip = id ? jointAt(doc, id, focusStart + f, 'Hip') : null;
        out.push({ f, cam: on({ x: hip?.x ?? subject.x, y: (hip?.y ?? subject.y) - H * 0.08 }, 1.4), ease: 'linear' });
      }
      if (out[out.length - 1].f !== last) {
        const hip = id ? jointAt(doc, id, focusStart + last, 'Hip') : null;
        out.push({ f: last, cam: on({ x: hip?.x ?? subject.x, y: (hip?.y ?? subject.y) - H * 0.08 }, 1.4), ease: null });
      } else out[out.length - 1].ease = null;
      return out;
    }
    default:
      if (POV_MOVES.includes(scene.camera)) return povShot(doc, scene, frames);
      return two(at(1), at(1));
  }
}

// the frame the scene being shot starts at, for shots that follow a character
let focusStart = 0;

const LOOK: Record<string, [number, number]> = { ahead: [0, 0], left: [-0.2, 0], right: [0.2, 0], up: [0, -0.12], down: [0, 0.14], around: [0, 0] };

// the eyes of the actor: the camera at its head looking the way it faces, bobbing while walking, shaking
// while running, turning where it looks, going down to what it picks up and through a door
function povShot(doc: Doc, scene: Scene, frames: number): ShotKey[] {
  const W = doc.width;
  const H = doc.height;
  const fps = doc.fps;
  const pov = scene.pov!;
  const info = characterFolders(doc.layers).find((f) => f.id === pov.actor)?.character;
  const eye = jointAt(doc, pov.actor, focusStart, 'Head') ?? (info ? { x: info.face.x, y: info.face.y } : { x: W / 2, y: H * 0.4 });
  const facing = info?.face.facing ?? 1;
  const motion = povMotion(scene);
  const last = Math.max(1, frames - 1);
  const Z = POV_ZOOM;
  const bob = motion === 'walk' ? 10 : motion === 'run' ? 20 : pov.action === 'drive' ? 3 : 0;
  const shake = motion === 'run' ? 6 : pov.action === 'drive' ? 2 : pov.action === 'fight' ? 4 : 0;
  // ahead is a little the way the character faces
  const ahead = { x: eye.x + facing * W * 0.12, y: eye.y + H * 0.03 };
  const look = (dir: string, zoom: number, extra: Partial<CameraKey> = {}): CameraKey => {
    const [dx, dy] = LOOK[dir] ?? [0, 0];
    return { x: ahead.x + dx * W, y: ahead.y + dy * H, zoom, rotation: dx * 0.08, shake, bob, transition: null, ...extra };
  };
  // walking goes forward: the world comes closer
  const far = motion === 'walk' ? Z * 1.15 : motion === 'run' ? Z * 1.3 : Z * 1.03;
  const zoomAt = (share: number) => Z * Math.pow(far / Z, share);
  const keys: ShotKey[] = [];
  const put = (share: number, dir: string, extra: Partial<CameraKey> = {}, ease: string | null = 'inout') => {
    const f = Math.min(last, Math.max(0, Math.round(share * last)));
    const k = { f, cam: look(dir, extra.zoom ?? zoomAt(share), extra), ease };
    const i = keys.findIndex((x) => x.f === f);
    if (i >= 0) keys[i] = k;
    else keys.push(k);
  };
  const dir = scene.camera === 'pov-look' && pov.look === 'ahead' ? 'around' : pov.look;
  put(0, 'ahead');
  if (dir === 'around') {
    put(0.22, 'left');
    put(0.42, 'left');
    put(0.64, 'right');
    put(0.82, 'right');
  } else if (dir !== 'ahead') {
    put(0.3, dir);
  }
  const t = Math.max(0.05, Math.min(0.9, pov.at));
  const s = (sec: number) => sec / Math.max(0.1, frames / fps);
  const held = dir === 'around' || dir === 'ahead' ? 'ahead' : dir;
  switch (pov.action) {
    case 'pickup':
      // the eyes go down to it, follow the hand and come back up holding it
      put(t - s(0.5), held);
      put(t, 'down', { zoom: zoomAt(t) * 1.12 });
      put(t + s(0.6), 'ahead', { zoom: zoomAt(t) * 1.05 });
      break;
    case 'door':
      put(t - s(0.3), 'ahead');
      put(t + s(0.4), 'ahead', { zoom: zoomAt(t) * 1.05 });
      // and through it
      put(t + s(1.2), 'ahead', { zoom: zoomAt(t) * 1.6, bob: 10 });
      break;
    case 'phone':
      put(t - s(0.4), held);
      put(t, 'down', { zoom: zoomAt(t) * 1.08 });
      break;
    case 'fight':
      put(t, 'ahead', { shake: 12 });
      break;
  }
  put(1, keys.length > 1 && pov.action === 'phone' ? 'down' : dir === 'around' ? 'ahead' : held, {}, null);
  keys.sort((a, b) => a.f - b.f);
  keys[keys.length - 1].ease = null;
  return keys;
}

// the arms and hands of the actor in the first person scenes, on a layer that stays on the screen, and
// the thing it picks up or the door it opens in the world
function buildPov(doc: Doc, p: Production, spans: ReturnType<typeof sceneStarts>, camAt: (frame: number) => CameraKey) {
  const W = doc.width;
  const H = doc.height;
  const fps = doc.fps;
  const povScenes = spans.filter(({ scene }) => isPov(scene));
  let hands = doc.layers.find((l) => l.name === HANDS && !l.parent && l.type === 'normal');
  let props = doc.layers.find((l) => l.name === PROPS && !l.parent && l.type === 'normal');
  if (!povScenes.length && !hands && !props) return;
  if (!props) {
    props = makeLayer(PROPS, LAYER_COLORS[4]);
    const above = doc.layers.findIndex((l) => l.name === 'Midground' && !l.parent);
    doc.layers.splice(above >= 0 ? above + 1 : doc.layers.length, 0, props);
  }
  if (!hands) {
    hands = makeLayer(HANDS, LAYER_COLORS[5]);
    const cam = doc.layers.findIndex((l) => l.type === 'camera');
    doc.layers.splice(cam >= 0 ? cam : doc.layers.length, 0, hands);
  }
  // the hands stay on the screen, the camera bob moves them on its own keys
  hands.parallax = 0;
  for (const l of [hands, props]) {
    l.keyframes = l.keyframes.filter((k) => k.frame === 0 || !marked(k));
    if (l.keyframes.length === 0) l.keyframes.push({ frame: 0, items: [], pose: {}, tween: null, label: '' });
    if (marked(l.keyframes[0]) || l.keyframes[0].items.every((i) => i.id.startsWith('pov.'))) {
      l.keyframes[0].items = [];
      l.keyframes[0].label = '';
      l.keyframes[0].tween = null;
    }
  }
  for (const { scene, start, end } of povScenes) {
    const pov = scene.pov!;
    const info = characterFolders(doc.layers).find((f) => f.id === pov.actor)?.character;
    const skin = info?.colors.skin ?? '#e2c4a6';
    const sleeve = info?.colors.shirt ?? '#5b6b82';
    const frames = end - start;
    const motion = povMotion(scene);
    const poses = actionPoses(pov.action, motion, frames, pov.at, fps);
    // a little sway of the hands while walking, between the poses
    if (motion === 'walk') {
      const step = Math.round(fps * 0.5);
      const planned = [...poses];
      for (let f = step; f < frames; f += step) if (!planned.some((k) => Math.abs(k.f - f) < step * 0.6)) poses.push({ f, pose: planned.filter((k) => k.f < f).pop()!.pose });
      poses.sort((a, b) => a.f - b.f);
    }
    const holdFrom = poses.find((k) => k.pose === 'hold')?.f ?? null;
    const phoneFrom = poses.find((k) => k.pose === 'phone')?.f ?? null;
    const label = `${MARK}${scene.name} pov`;
    if (pov.hands) {
      for (const [i, { f, pose }] of poses.entries()) {
        const bob = motion === 'walk' ? (i % 2 ? -1 : 1) * H * 0.008 : 0;
        const items: Item[] = [];
        if (pov.action === 'drive') items.push(wheelItem(W, H, sleeve));
        items.push(...handItems(pose, W, H, skin, sleeve, 6, bob));
        if (holdFrom !== null && f >= holdFrom && pov.item) {
          const h = heldItem(pov.item, heldAt(pose, W, H), 1.1, 'pov.held');
          if (h) items.splice(items.length - 3, 0, h);
        }
        if (phoneFrom !== null && f >= phoneFrom) {
          // a phone with a screen to read is held big, its lower edge in the hands
          const screen = !!pov.item && pov.item.startsWith('phone-');
          const h = heldItem(screen ? pov.item : 'phone', { x: W / 2, y: H * (screen ? 0.64 : 0.7) }, screen ? 1.6 : 2.2, 'pov.phone');
          if (h) items.splice(items.length - 6, 0, h);
        }
        const k = keyAt(hands, start + f);
        k.items = items;
        k.tween = i < poses.length - 1 ? { ease: 'inout' } : null;
        k.label = label;
      }
    }
    // the world: the thing lies ahead below the eyes, the door stands ahead
    const kind = pov.action === 'pickup' ? pov.item || 'box' : pov.action === 'door' ? 'door' : '';
    if (kind) {
      const t = start + Math.round(frames * Math.max(0.05, Math.min(0.9, pov.at)));
      const c = camAt(t);
      const z = Math.max(0.1, c.zoom);
      const spot = pov.action === 'door' ? { x: c.x, y: c.y + (H * 0.05) / z } : { x: c.x + (W * 0.08) / z, y: c.y + (H * 0.26) / z };
      const size = pov.action === 'door' ? (H * 0.85) / z / 540 : 0.9;
      const thing = makeVisual(kind, spot, size);
      if (thing) {
        thing.id = 'pov.world';
        if (thing.type === 'group') thing.children.forEach((ch, n) => (ch.id = `pov.world.${n}`));
        const k0 = keyAt(props, start);
        k0.items = [thing];
        k0.label = label;
        if (pov.action === 'pickup') {
          // gone from the world the moment the hand closes on it
          k0.tween = null;
          const gone = keyAt(props, start + (holdFrom ?? Math.round(frames * pov.at)));
          gone.items = [];
          gone.label = label;
          gone.tween = null;
        } else {
          // the door swings open on its hinge
          const swing = keyAt(props, Math.min(end - 1, t + Math.round(fps * 0.15)));
          swing.items = [thing];
          swing.label = label;
          swing.tween = { ease: 'inout' };
          k0.tween = null;
          const hinge = spot.x - 120 * size;
          const open = JSON.parse(JSON.stringify(thing)) as Item;
          open.transform = multiply(multiply(translate(hinge, 0), [0.12, 0.04, 0, 1, 0, 0]), multiply(translate(-hinge, 0), thing.transform));
          const opened = keyAt(props, Math.min(end - 1, t + Math.round(fps * 0.75)));
          opened.items = [open];
          opened.label = label;
          opened.tween = null;
        }
      }
    }
    // after the scene the hands and the world things go
    for (const l of [hands, props]) {
      if (end >= spans[spans.length - 1].end) continue;
      const next = spans.find((x) => x.start === end);
      if (next && isPov(next.scene)) continue;
      const k = keyAt(l, end);
      if (!marked(k) || k.items.every((i) => i.id.startsWith('pov.'))) {
        k.items = [];
        k.tween = null;
        k.label = `${MARK}${scene.name} pov end`;
      }
    }
  }
}

// the camera kept over the stage, so no edge of the drawn place comes into the picture; a tilt and the
// shake are left as they are
export function inside(c: CameraKey, W: number, H: number): CameraKey {
  const z = Math.max(1, c.zoom);
  const tilt = 1 + Math.abs(c.rotation) * 2;
  const hw = Math.min(W / 2, ((W / 2) * tilt) / z);
  const hh = Math.min(H / 2, ((H / 2) * tilt) / z);
  return { ...c, zoom: Math.max(1, c.zoom), x: Math.max(hw, Math.min(W - hw, c.x)), y: Math.max(hh, Math.min(H - hh, c.y)) };
}

export const HANDS = 'POV hands';
export const PROPS = 'POV props';

// how a scene comes in: a dip to black is a short fade through black
function transitionOf(scene: Scene, fps: number) {
  if (scene.transition === 'cut') return makeTransition('cut', fps);
  if (scene.transition === 'black') return { ...makeTransition('fade', fps), color: '#000000', duration: Math.max(2, Math.round(fps * 0.35)) };
  // an emotional scene takes its time
  const t = makeTransition(scene.transition, fps);
  return scene.mood === 'emotion' ? { ...t, duration: Math.round(t.duration * 1.8) } : t;
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

  const folders = characterFolders(doc.layers);
  const known = new Set(folders.map((f) => f.id));
  // the recordings linked to lines decide how long they take
  const clips = clipSeconds(doc);
  const cues = cuesFrom(p, fps, 6, clips);
  // and play exactly where their line starts
  for (const l of p.lines) {
    if (!l.clip) continue;
    const clip = doc.audio?.find((c) => c.id === l.clip);
    const first = cues.find((c) => c.line === l.id);
    if (clip && first) {
      clip.start = first.start;
      clip.track ??= l.speaker === 'narrator' ? 'narration' : 'dialogue';
      clip.speaker ??= l.speaker;
    }
  }
  // who is seen in a scene: the cast, without the one whose eyes the camera is
  const seen = (scene: Scene, id: string) => (scene.cast.length === 0 || scene.cast.includes(id)) && !(isPov(scene) && scene.pov?.actor === id);

  // the moves of the characters: what an earlier build put on the rigs goes first
  for (const f of folders) {
    const rig = characterLayers(doc.layers, f.id)?.rig;
    if (!rig) continue;
    rig.keyframes = rig.keyframes.filter((k) => k.frame === 0 || !marked(k));
    if (marked(rig.keyframes[0])) rig.keyframes[0].label = '';
  }
  for (const { scene, start, end } of spans) {
    const moves = [...(scene.moves ?? [])].filter((m) => known.has(m.actor) && ANIMATIONS.some((a) => a.kind === m.kind));
    // characters talk with their hands when the production asks for it and nothing else is planned
    if (p.gestures) {
      for (const c of cues) {
        if (c.start < start || c.start >= end || !known.has(c.speaker) || !seen(scene, c.speaker)) continue;
        if (moves.some((m) => m.actor === c.speaker)) continue;
        moves.push({ actor: c.speaker, kind: 'talk', at: (c.start - start) / Math.max(1, end - start) });
      }
    }
    moves.sort((a, b) => a.at - b.at);
    for (const m of moves) {
      const at = start + Math.round(Math.max(0, Math.min(0.95, m.at)) * (end - start));
      const done = animateMove(doc, m.actor, m.kind as AnimKind, at, end, scene.slow ? 0.5 : 1);
      if (done !== null) {
        const rig = characterLayers(doc.layers, m.actor)!.rig!;
        for (const k of rig.keyframes) if (k.frame >= at && k.frame <= done && k.frame !== 0 && k.label === '') k.label = `${MARK}move`;
      }
    }
  }

  // the camera: its shots, a transition in front of each
  let cam = doc.layers.find((l) => l.type === 'camera');
  if (!cam) {
    cam = makeLayer('Camera', '#e0b341', 'camera');
    cam.keyframes[0].camera = restCamera(doc.width, doc.height);
    doc.layers.push(cam);
  }
  cam.keyframes = cam.keyframes.filter((k) => k.frame === 0 || !marked(k));
  for (const [i, { scene, start, end }] of spans.entries()) {
    focusStart = start;
    // the face of the subject, else the middle of the faces of the cast
    const subjectHead = scene.subject && known.has(scene.subject) ? jointAt(doc, scene.subject, start, 'Head') : null;
    const heads = folders
      .filter((f) => seen(scene, f.id))
      .map((f) => jointAt(doc, f.id, start, 'Head') ?? { x: f.character!.face.x, y: f.character!.face.y });
    const focus = subjectHead ?? (heads.length ? { x: heads.reduce((n, f) => n + f.x, 0) / heads.length, y: heads.reduce((n, f) => n + f.y, 0) / heads.length } : null);
    const keys = shot(doc, scene, end - start, focus ? { x: focus.x, y: focus.y + doc.height * 0.05 } : null);
    for (const [n, sk] of keys.entries()) {
      const k = keyAt(cam, start + sk.f);
      k.camera = { ...inside(sk.cam, doc.width, doc.height), transition: n === 0 ? (i === 0 ? null : transitionOf(scene, fps)) : null };
      k.tween = sk.ease ? { ease: sk.ease } : null;
      k.label = `${MARK}${scene.name}${n === 0 ? '' : n === keys.length - 1 ? ' end' : ` ${n}`}`;
    }
  }
  const camLayer = cam;
  buildPov(doc, p, spans, (frame) => cameraKeyAt(camLayer, frame, doc.width, doc.height));

  // the characters a scene leaves out are hidden in it
  for (const folder of folders) {
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
      const inIt = seen(scene, folder.id);
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

  // the mouths move while their lines are said, six shapes a second keep the file light
  for (const c of cues) {
    if (!known.has(c.speaker)) continue;
    const span = spans.find((x) => c.start >= x.start && c.start < x.end);
    if (!span || !seen(span.scene, c.speaker)) continue;
    const body = characterLayers(doc.layers, c.speaker)?.body;
    if (!body) continue;
    const before = new Set(body.keyframes);
    const pattern = talkPattern(c.start, Math.max(2, c.end - c.start - 1), c.start + 7).filter((_, n, all) => n % 2 === 0 || n === all.length - 1);
    faceDraft(doc, c.speaker, pattern.map((m) => ({ frame: m.frame, state: { mouth: m.mouth } })));
    for (const k of body.keyframes) if (!before.has(k) && k.label === '') k.label = `${MARK}talk`;
  }

  for (const l of doc.layers) if (l.type !== 'folder') l.length = Math.max(l.length, total);
  // in a first person scene with a phone in the hands the subtitles move up, the screen stays free
  for (const c of cues) {
    const span = spans.find((x) => c.start >= x.start && c.start < x.end);
    if (span && isPov(span.scene) && span.scene.pov?.action === 'phone') c.position = 0.92;
  }
  p.cues = cues;
  doc.production = p;
  return { scenes: spans.length, frames: total, cues: p.cues.length };
}

// a move of the library put on a character for a scene: walking goes on to the end of the scene, a
// pointing hand comes back down, a sitting one stays seated
function animateMove(doc: Doc, id: string, kind: AnimKind, at: number, end: number, speed: number): number | null {
  const info = characterFolders(doc.layers).find((f) => f.id === id)?.character;
  if (!info) return null;
  const a = ANIMATIONS.find((x) => x.kind === kind)!;
  const fps = doc.fps;
  const room = Math.max(1, end - at) / fps;
  const cycleLen = (a.seconds / speed) || 1;
  let cycles = a.cycle ? Math.max(1, Math.floor((room * 0.95) / cycleLen)) : 0;
  const u = Math.abs(info.face.r) * 7;
  const distance = kind === 'walk' ? info.face.facing * u * 0.35 : kind === 'run' ? info.face.facing * u * 0.45 : 0;
  // walking stays on the stage: as many steps as there is room ahead
  if (distance !== 0) {
    const hip = jointAt(doc, id, at, 'Hip')?.x ?? info.face.x;
    const ahead = distance > 0 ? doc.width * 0.76 - hip : hip - doc.width * 0.24;
    cycles = Math.max(1, Math.min(cycles, Math.floor(Math.max(0, ahead) / Math.abs(distance))));
  }
  const back = ['point', 'reach', 'fall'].includes(kind);
  return animateDraft(doc, id, { kind, repeat: a.cycle ? cycles : back ? 0.8 : 0, speed, mirror: false, distance, back }, at);
}

// seconds of every recording whose length is known
export function clipSeconds(doc: Doc): ClipSeconds {
  const out: ClipSeconds = {};
  for (const c of doc.audio ?? []) {
    const n = clipLength(c);
    if (n) out[c.id] = n / doc.fps;
  }
  return out;
}

export function sceneLabelId(): string {
  return newId();
}
