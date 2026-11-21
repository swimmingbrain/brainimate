import { get, writable } from 'svelte/store';
import type { CharacterColors, CharacterInfo, Doc, Item, Keyframe, Layer, Mat, Vec } from '$lib/core/types';
import { modelOf, type CharacterModel } from '$lib/character/views';
import { blinking, rebuildAll, rebuildKey } from '$lib/character/rebuild';
import { applyPoint, invert, multiply, translate } from '$lib/core/mat';
import { itemBounds } from '$lib/core/items';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { insertKeyframe, layersLength, keyframeAt } from '$lib/anim/timeline';
import { resolveItems } from '$lib/render/frame';
import { poseAt } from '$lib/render/frame';
import { rigFor, worldMatrices, type Pose } from '$lib/rig/bones';
import { bodyAngleAt, bonesAt } from '$lib/rig/turn';
import {
  BONES,
  FACE_ROLES,
  buildCharacter,
  characterFolders,
  characterLayers,
  recolorItems,
  browWidth,
  faceStyleOf,
  handPoseValues,
  type HandPose,
  hairParts,
  lookOf,
  seeded,
  type BoneName,
  type CharacterOptions,
  type Emotion,
  type FaceStyle,
  type HairStyle,
  type MouthShape
} from '$lib/character/model';
import {
  animationKeys,
  blinkFrames,
  faceAt,
  faceShapes,
  lipSync,
  talkPattern,
  toPose,
  type AnimKind,
  type Body,
  type FaceState
} from '$lib/character/anim';
import { packCharacter, unpackCharacter, type CharacterPackage } from '$lib/character/pack';
import { activeLayer, addToast, selection } from '$lib/stores/app';
import { editor } from './editor';

// the characters of the main timeline: making them, moving them with animations, their faces, what they
// hold. everything is a keyframe on their rig or body layer and one undo step

// the character the panel works on, the id of its folder
export const currentCharacter = writable<string | null>(null);

export function characters(): Layer[] {
  return characterFolders(editor.doc.layers);
}

// the one picked, or the one holding the active layer, or the first
export function pickedCharacter(): Layer | null {
  const list = characters();
  const id = get(currentCharacter);
  const own = list.find((l) => l.id === id);
  if (own) return own;
  const active = editor.activeLayer();
  const holding = list.find((f) => active && (active.parent === f.id || active.id === f.id));
  return holding ?? list[0] ?? null;
}

function mainOnly(): boolean {
  if (editor.editStack.length === 0) return true;
  addToast('Leave the symbol first, characters live on the main timeline', 'info');
  return false;
}

// the layers of a character in a draft
function draftParts(draft: Doc, folderId: string) {
  return characterLayers(draft.layers, folderId);
}

// every layer reaches frame, so the scene does not go empty while a move plays
export function reach(draft: Doc, frame: number) {
  for (const l of draft.layers) if (l.type !== 'folder') l.length = Math.max(l.length, frame + 1);
}

export function createCharacter(o: CharacterOptions): string | null {
  if (!mainOnly()) return null;
  const built = buildCharacter(o);
  const length = Math.max(1, layersLength(editor.doc.layers));
  for (const l of built.layers) l.length = length;
  const target = editor.activeLayer();
  editor.commit('New character', (draft) => {
    // above the active layer when it sits at the top level, else on top
    const at = target && !target.parent ? draft.layers.findIndex((l) => l.id === target.id) + 1 : draft.layers.length;
    draft.layers.splice(at > 0 ? at : draft.layers.length, 0, ...built.layers);
  });
  const folder = built.layers[built.layers.length - 1];
  currentCharacter.set(folder.id);
  activeLayer.set(built.layers[0].id);
  return folder.id;
}

// a copy next to it, with new ids everywhere, animations included
export function duplicateCharacter(folderId: string): string | null {
  if (!mainOnly()) return null;
  const pkg = packCharacter(editor.doc, folderId);
  if (!pkg) return null;
  return insertPackage(pkg, editor.doc.width * 0.18, 0, `${pkg.info.name} copy`);
}

// a character from the library or a file put into this document, moved by dx and dy
export function insertPackage(pkg: CharacterPackage, dx = 0, dy = 0, name?: string): string | null {
  if (!mainOnly()) return null;
  const out = unpackCharacter(pkg, dx, dy, name);
  const length = Math.max(1, layersLength(editor.doc.layers));
  editor.commit('Insert character', (draft) => {
    for (const l of out.layers) l.length = Math.max(l.length, length);
    draft.layers.push(...out.layers);
    for (const [id, a] of Object.entries(out.assets)) if (!draft.assets[id]) draft.assets[id] = a;
    for (const [id, s] of Object.entries(out.symbols)) if (!draft.symbols[id]) draft.symbols[id] = s;
  });
  const folder = out.layers.find((l) => l.character)!;
  currentCharacter.set(folder.id);
  return folder.id;
}

export function renameCharacter(folderId: string, name: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  editor.commit('Rename character', (draft) => {
    const parts = draftParts(draft, folderId);
    if (!parts) return;
    const old = parts.folder.name;
    parts.folder.name = clean;
    parts.folder.character = { ...parts.folder.character!, name: clean };
    for (const l of [parts.rig, parts.body]) if (l && l.name.startsWith(old)) l.name = clean + l.name.slice(old.length);
  });
}

// new colors on every part in every keyframe, the outlines and the face included
export function recolorCharacter(folderId: string, colors: Partial<CharacterColors>, key?: string) {
  if (isLocked(folderId)) return;
  editor.commit(
    'Character colors',
    (draft) => {
      const parts = draftParts(draft, folderId);
      if (!parts?.body) return;
      const next = { ...parts.folder.character!.colors, ...colors };
      parts.folder.character = { ...parts.folder.character!, colors: next };
      if (turnable(parts) && parts.rig) {
        parts.folder.character = withModel(parts.folder.character, { colors: next });
        rebuildAll(parts.folder.character, parts.rig, parts.body);
      } else for (const k of parts.body.keyframes) k.items = recolorItems(k.items, next);
    },
    key
  );
}

export function faceStyle(folderId: string): FaceStyle | null {
  const folder = characterLayers(editor.doc.layers, folderId)?.folder;
  return folder ? faceStyleOf(folder.character) : null;
}

// the face of a character drawn in a new style in every keyframe, the moods and mouths it had stay
export function applyFaceStyle(folderId: string, change: Partial<FaceStyle>, key?: string) {
  if (isLocked(folderId)) return;
  editor.commit(
    'Face style',
    (draft) => {
      const parts = draftParts(draft, folderId);
      if (!parts?.body) return;
      const info = parts.folder.character!;
      const style = { ...faceStyleOf(info), ...change };
      parts.folder.character = { ...info, style: { ...style } };
      if (turnable(parts) && parts.rig) {
        parts.folder.character = withModel(parts.folder.character, { face: style });
        rebuildAll(parts.folder.character, parts.rig, parts.body);
        return;
      }
      const look = lookOf(info);
      for (const k of parts.body.keyframes) {
        const shapes = faceShapes(info.face, faceAt(parts.body, k.frame), blinking(k.items), style);
        for (const item of k.items) {
          const role = item.role ?? '';
          if (!FACE_ROLES.includes(role) || item.type !== 'path') continue;
          if (shapes[role]) item.path = shapes[role];
          if (role === 'nose') item.visible = style.nose;
          if (role === 'browL' || role === 'browR') {
            item.visible = style.brows !== 'none';
            item.style = { ...item.style, width: browWidth(style, look.outline) };
          }
        }
      }
    },
    key
  );
}

export function hairOf(folderId: string): HairStyle {
  const folder = characterLayers(editor.doc.layers, folderId)?.folder;
  return (folder?.character ? lookOf(folder.character).hair : 'short') as HairStyle;
}

// new hair for a character in every keyframe: the front over the head, the back behind everything
export function setHair(folderId: string, hair: HairStyle) {
  if (isLocked(folderId)) return;
  editor.commit('Hair', (draft) => {
    const parts = draftParts(draft, folderId);
    if (!parts?.body || !parts.rig) return;
    const info = parts.folder.character!;
    const look = { ...lookOf(info), hair };
    parts.folder.character = { ...info, look };
    if (turnable(parts)) {
      parts.folder.character = withModel(parts.folder.character, { hair });
      rebuildAll(parts.folder.character, parts.rig, parts.body);
      return;
    }
    const head = parts.rig.bones.find((b) => b.name === 'Head');
    const made = hairParts(look.head, info.face.facing, { hair, colors: info.colors, outline: look.outline, wobble: look.wobble }, seeded(look.seed + 101));
    for (const item of [made.front, made.back]) if (item && head) item.skin = { weights: [], rigid: head.id };
    for (const k of parts.body.keyframes) {
      // hair shown before stays shown, hidden stays hidden
      const old = k.items.find((i) => i.role === 'hair');
      const shown = old ? old.visible : true;
      const items = k.items.filter((i) => i.role !== 'hair' && i.role !== 'hairBack');
      if (made.back) items.unshift({ ...structuredClone(made.back), visible: shown });
      if (made.front) {
        const at = items.findIndex((i) => i.role === 'head');
        items.splice(at + 1, 0, { ...structuredClone(made.front), visible: shown });
      }
      k.items = items;
    }
  });
}

// a part shown or hidden in every keyframe, a character without hair or with the far arm out of view
export function setPartVisible(folderId: string, role: string, visible: boolean) {
  editor.commit(visible ? 'Show part' : 'Hide part', (draft) => {
    const body = draftParts(draft, folderId)?.body;
    if (!body) return;
    for (const k of body.keyframes) for (const item of k.items) if (item.role === role) item.visible = visible;
  });
}

export function partVisible(folderId: string, role: string): boolean {
  const body = characterLayers(editor.doc.layers, folderId)?.body;
  const item = body?.keyframes[0]?.items.find((i) => i.role === role);
  return item ? item.visible : false;
}

// the parts of a character with their roles, for the panel
export function characterRoles(folderId: string): string[] {
  const body = characterLayers(editor.doc.layers, folderId)?.body;
  return (body?.keyframes[0]?.items ?? []).map((i) => i.role).filter((r): r is string => !!r && r !== 'prop');
}

// the part of a character picked for editing with the selection tool
export function selectPart(folderId: string, role: string) {
  const body = characterLayers(editor.doc.layers, folderId)?.body;
  if (!body) return;
  const item = editor.layerItems(body).find((i) => i.role === role);
  if (!item) return;
  activeLayer.set(body.id);
  selection.set(new Set([item.id]));
}

// a main character keeps its look until it is unlocked
function isLocked(folderId: string): boolean {
  const info = characterLayers(editor.doc.layers, folderId)?.folder.character;
  if (!modelOf(info)?.locked) return false;
  addToast('The look of this character is locked: unlock it under Save to change it', 'info');
  return true;
}

// a character that can be seen from every side: it keeps a model and its rig knows the room
export function turnable(parts: { folder: Layer; rig: Layer | null } | null): parts is { folder: Layer; rig: Layer; body: Layer | null } {
  return !!parts?.rig?.turnRig && !!modelOf(parts.folder.character);
}

// the model of a character changed, kept on its info
export function withModel(info: CharacterInfo, change: Partial<CharacterModel>): CharacterInfo {
  const m = modelOf(info);
  if (!m) return info;
  return { ...info, model: { ...m, ...change } as unknown as CharacterInfo['model'] };
}

// what an animation knows of a character: its size, where it looked, its bones and the pose at frame
function bodyOf(folderId: string, at: number): (Body & { rig: Layer }) | null {
  return bodyIn(editor.doc.layers, folderId, at);
}

export function bodyIn(layers: Layer[], folderId: string, at: number): (Body & { rig: Layer }) | null {
  const parts = characterLayers(layers, folderId);
  if (!parts?.rig) return null;
  const rig = parts.rig;
  // a turned character has its bones where its angle at the frame puts them
  const bones = bonesAt(layers, rig, at);
  const angle = rig.turnRig ? bodyAngleAt(layers, rig, at) : null;
  const byName = new Map(bones.map((b) => [b.name, b.id]));
  const rest = worldMatrices(bones, {});
  let top = Infinity;
  let bottom = -Infinity;
  for (const b of bones) {
    const m = rest.get(b.id)!;
    const tip = applyPoint(m, { x: b.length, y: 0 });
    top = Math.min(top, m[5], tip.y);
    bottom = Math.max(bottom, m[5], tip.y);
  }
  // the head bone stops at the top of the head, the feet at the floor
  const height = Math.max(1, bottom - top);
  return {
    height,
    // a character turned to its other side looks the other way on the screen, the moves follow
    facing: (parts.folder.character!.face.facing * (angle !== null && Math.cos((angle * Math.PI) / 180) < -0.2 ? -1 : 1)) as 1 | -1,
    angle: angle ?? undefined,
    bones,
    start: poseAt(rig, at),
    id: (name: BoneName) => byName.get(name) ?? null,
    rig
  };
}

export interface AnimChoice {
  kind: AnimKind;
  // cycles for a cycle, seconds of hold for a single move
  repeat: number;
  speed: number;
  mirror: boolean;
  // stage pixels a cycle of walking or running goes, signed: plus is right on the screen
  distance: number;
  back: boolean;
}

// an animation from the playhead on. the keyframes of the rig inside its stretch give way to it, a move
// already playing is cut there. the first keyframe holds the pose the character has at the playhead and
// the animation blends from it
export function applyAnimation(folderId: string, choice: AnimChoice, target?: Vec | null): boolean {
  if (!mainOnly()) return false;
  const at = editor.frame;
  if (!bodyOf(folderId, at)) {
    addToast('This character has no skeleton', 'warning');
    return false;
  }
  let done = false;
  editor.commit(`Animation: ${choice.kind}`, (draft) => {
    done = animateDraft(draft, folderId, choice, at, target ?? null) !== null;
  });
  return done;
}

// an animation put on a character inside a change, for moves made of several. the frame it ends on
export function animateDraft(draft: Doc, folderId: string, choice: AnimChoice, at: number, target: Vec | null = null): number | null {
  const body = bodyIn(draft.layers, folderId, at);
  if (!body) return null;
  const fps = draft.fps;
  let keys = animationKeys(choice.kind, body, { at, fps, repeat: choice.repeat, speed: choice.speed, mirror: choice.mirror, distance: choice.distance, back: choice.back, target });
  if (keys.length === 0) return null;
  // a cycle starts a moment later and blends in from the pose there
  const cycle = ['idle', 'walk', 'run'].includes(choice.kind);
  const blend = cycle ? Math.max(1, Math.round(fps * 0.15)) : 0;
  if (blend > 0) keys = keys.map((k) => ({ ...k, frame: k.frame + blend }));
  const end = keys[keys.length - 1].frame;
  const rig = body.rig;
  const first = insertKeyframe(rig, at);
  first.tween = { ease: cycle ? 'inout' : (keys[0].ease ?? 'inout') };
  rig.keyframes = rig.keyframes.filter((k) => k.frame <= at || k.frame > end);
  // the bones a move leaves alone keep the pose they had at the playhead: a turn keeps the arm that
  // holds a phone, pointing while sitting keeps the legs bent
  const kept = JSON.parse(JSON.stringify(body.start)) as Pose;
  for (const k of keys) {
    // the first key of a single move is the pose the character has, the move starts from it
    if (k.frame === at) continue;
    const key = insertKeyframe(rig, k.frame);
    key.pose = { ...kept, ...toPose(k.pose, body.id) };
    key.tween = k.ease ? { ease: k.ease } : null;
  }
  reach(draft, end);
  return end;
}

// a move stops at the playhead: the pose there holds and the keyframes after it go
export function cutAnimation(folderId: string) {
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!parts?.rig) return;
  const at = editor.frame;
  const rigId = parts.rig.id;
  editor.commit('Stop animation', (draft) => {
    const rig = draft.layers.find((l) => l.id === rigId);
    if (!rig) return;
    const k = insertKeyframe(rig, at);
    k.tween = null;
    rig.keyframes = rig.keyframes.filter((f) => f.frame <= at);
  });
}

// the pose of the rig back to rest at the playhead, a keyframe holding it
export function restPose(folderId: string) {
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!parts?.rig) return;
  const at = editor.frame;
  const rigId = parts.rig.id;
  editor.commit('Rest pose', (draft) => {
    const rig = draft.layers.find((l) => l.id === rigId);
    if (!rig) return;
    const k = insertKeyframe(rig, at);
    const hip = rig.bones.find((b) => b.name === 'Hip');
    // the character stays where it walked to
    const kept: Pose = {};
    if (hip && k.pose[hip.id]) kept[hip.id] = { rotation: 0, x: k.pose[hip.id].x, y: k.pose[hip.id].scale !== 1 ? k.pose[hip.id].y : 0, scale: k.pose[hip.id].scale ?? 1, ...(k.pose[hip.id].sx ? { sx: k.pose[hip.id].sx } : {}) };
    k.pose = kept;
  });
}

// the face parts of a keyframe set to a state, every face part keeps its id, style and binding
function setFace(layer: Layer, key: Keyframe, frame: Parameters<typeof faceShapes>[0], state: FaceState, blink: boolean, style?: FaceStyle, turned?: { info: CharacterInfo; rig: Layer }) {
  if (turned) {
    // a turnable character draws the face at the angle of the keyframe
    rebuildKey(turned.info, turned.rig, layer, key, state, blink);
    if (!blink) key.face = { emotion: state.emotion, mouth: state.mouth };
    return;
  }
  const shapes = faceShapes(frame, state, blink, style);
  key.items = key.items.map((item) => {
    const role = item.role ?? '';
    if (!FACE_ROLES.includes(role) || item.type !== 'path' || !shapes[role]) return item;
    return { ...item, path: shapes[role] };
  });
  if (!blink) key.face = { emotion: state.emotion, mouth: state.mouth };
}

// a face from frame on. blend frames before it the face starts to morph from what it was
export function faceDraft(draft: Doc, folderId: string, changes: { frame: number; state: Partial<FaceState>; blink?: boolean; blend?: number }[]) {
  const parts = characterLayers(draft.layers, folderId);
  if (!parts?.body) return;
  const frame = parts.folder.character!.face;
  const style = faceStyleOf(parts.folder.character);
  const body = parts.body;
  const turned = turnable(parts) && parts.rig ? { info: parts.folder.character!, rig: parts.rig } : undefined;
  for (const c of changes) {
    const now = faceAt(body, c.frame);
    const state = { ...now, ...c.state } as FaceState;
    const blend = c.blend ?? 0;
    if (blend > 0 && c.frame - blend > 0) {
      const before = insertKeyframe(body, c.frame - blend);
      before.tween = { ease: 'inout' };
    }
    const key = insertKeyframe(body, c.frame);
    setFace(body, key, frame, state, !!c.blink, style, turned);
    key.tween = null;
  }
  reach(draft, Math.max(...changes.map((c) => c.frame)));
}

function faceKeys(folderId: string, label: string, changes: { frame: number; state: Partial<FaceState>; blink?: boolean; blend?: number }[]) {
  if (!mainOnly()) return;
  if (!characterLayers(editor.doc.layers, folderId)?.body) return;
  editor.commit(label, (draft) => faceDraft(draft, folderId, changes));
}

export function setEmotion(folderId: string, emotion: Emotion, blend = 4) {
  faceKeys(folderId, 'Expression', [{ frame: editor.frame, state: { emotion }, blend }]);
}

export function setMouth(folderId: string, mouth: MouthShape) {
  faceKeys(folderId, 'Mouth', [{ frame: editor.frame, state: { mouth } }]);
}

// the eyes close for two frames
export function blink(folderId: string) {
  const at = editor.frame;
  faceKeys(folderId, 'Blink', [
    { frame: at, state: {}, blink: true },
    { frame: at + 2, state: {} }
  ]);
}

// blinks every few seconds over the next seconds
export function autoBlink(folderId: string, seconds: number) {
  const at = editor.frame;
  const fps = editor.doc.fps;
  const frames = blinkFrames(at, Math.round(seconds * fps), fps, at + 17);
  if (frames.length === 0) return;
  faceKeys(
    folderId,
    'Blinks',
    frames.flatMap((f) => [
      { frame: f, state: {}, blink: true },
      { frame: f + 2, state: {} }
    ])
  );
}

// talking without a sound for so many seconds
export function talk(folderId: string, seconds: number) {
  const at = editor.frame;
  const pattern = talkPattern(at, Math.max(1, Math.round(seconds * editor.doc.fps)), at + 3);
  faceKeys(folderId, 'Talk', pattern.map((p) => ({ frame: p.frame, state: { mouth: p.mouth } })));
}

// the mouth follows how loud a voice is, one level a frame from start on
export function lipSyncLevels(folderId: string, levels: number[], start: number) {
  const pattern = lipSync(levels, start);
  if (pattern.length === 0) {
    addToast('The sound is too quiet to move the mouth', 'info');
    return;
  }
  faceKeys(folderId, 'Lip sync', pattern.map((p) => ({ frame: p.frame, state: { mouth: p.mouth } })));
  addToast(`${pattern.length} mouth shapes from the sound`, 'success', 2000);
}

export function faceHere(folderId: string): FaceState {
  const body = characterLayers(editor.doc.layers, folderId)?.body ?? null;
  return faceAt(body, editor.frame);
}

// where a hand of a character is at frame, its tip on the stage, and what it takes to bind to it
function handAt(doc: Doc, folderId: string, side: 'L' | 'R', at: number) {
  const parts = characterLayers(doc.layers, folderId);
  const hand = parts?.rig?.bones.find((b) => b.name === `Hand ${side}`);
  if (!hand) return null;
  const rig = rigFor(doc.layers, at);
  const world = rig?.world.get(hand.id);
  const delta = rig?.skin.get(hand.id);
  if (!world || !delta) return null;
  return { bone: hand.id, tip: applyPoint(world, { x: hand.length * 0.6, y: 0 }), delta };
}

// the item on a layer of the main timeline at frame, at the top of its keyframe
export function findTop(doc: Doc, id: string, at: number): { layer: Layer; item: Item } | null {
  for (const layer of doc.layers) {
    if (layer.type !== 'normal' && layer.type !== 'guide') continue;
    const item = resolveItems(layer, at).find((i) => i.id === id);
    if (item) return { layer, item };
  }
  return null;
}

// where an item shows: its own transform, through the bone it follows
export function shownTransform(doc: Doc, item: Item, at: number): Mat {
  const bone = item.skin?.rigid;
  if (!bone) return item.transform;
  const delta = rigFor(doc.layers, at)?.skin.get(bone);
  return delta ? multiply(delta, item.transform) : item.transform;
}

// the picked object goes into a hand at the playhead and moves with it from there, before the playhead
// it stays where it was. snap puts its middle into the hand
// the fingers of a hand in a pose from the playhead on, closing over a few frames before it
export function hasFingers(folderId: string): boolean {
  return !!characterLayers(editor.doc.layers, folderId)?.rig?.bones.some((b) => b.name.startsWith('Index '));
}

export function setHandPose(folderId: string, side: 'L' | 'R', pose: HandPose, blend = 3, at = editor.frame, label = 'Hand pose'): boolean {
  if (!mainOnly()) return false;
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!parts?.rig) return false;
  if (!hasFingers(folderId)) {
    addToast('This character was made without fingers, make it again to pose its hands', 'info');
    return false;
  }
  const rigId = parts.rig.id;
  const facing = parts.folder.character!.face.facing;
  editor.commit(label, (draft) => {
    const rig = draft.layers.find((l) => l.id === rigId);
    if (!rig) return;
    handKeys(rig, side, pose, facing, at, blend);
    reach(draft, at);
  });
  return true;
}

// the keys of a hand pose on a rig in a draft
export function handKeys(rig: Layer, side: 'L' | 'R', pose: HandPose, facing: number, at: number, blend: number) {
  const values = handPoseValues(pose, facing);
  if (blend > 0 && at - blend > 0) {
    const before = insertKeyframe(rig, at - blend);
    before.tween = { ease: 'inout' };
  }
  const key = insertKeyframe(rig, at);
  for (const [name, rotation] of Object.entries(values)) {
    const bone = rig.bones.find((b) => b.name === `${name} ${side}`);
    if (bone) key.pose[bone.id] = { ...(key.pose[bone.id] ?? { x: 0, y: 0, scale: 1 }), rotation };
  }
}

export function pickUp(folderId: string, side: 'L' | 'R', snap = true): boolean {
  if (!mainOnly()) return false;
  const doc = editor.doc;
  const at = editor.frame;
  const ids = [...get(selection)];
  if (ids.length !== 1) {
    addToast('Pick one object for the hand', 'info');
    return false;
  }
  const found = findTop(doc, ids[0], at);
  if (!found) return false;
  const body = characterLayers(doc.layers, folderId)?.body;
  if (found.layer.id === body?.id && found.item.role && found.item.role !== 'prop') {
    addToast('That is a part of the character, pick an object', 'info');
    return false;
  }
  const hand = handAt(doc, folderId, side, at);
  if (!hand) return false;
  let shown = shownTransform(doc, found.item, at);
  if (snap) {
    const box = itemBounds(found.item, shown);
    if (!isEmpty(box)) {
      const c = boxCenter(box);
      shown = multiply(translate(hand.tip.x - c.x, hand.tip.y - c.y), shown);
    }
  }
  const transform = multiply(invert(hand.delta), shown);
  const layerId = found.layer.id;
  const id = found.item.id;
  editor.commit('Pick up', (draft) => {
    const layer = draft.layers.find((l) => l.id === layerId);
    if (!layer) return;
    holdFrom(layer, at);
    const key = insertKeyframe(layer, at);
    key.tween = null;
    key.items = key.items.map((i) => (i.id === id ? { ...i, transform, skin: { weights: [], rigid: hand.bone }, role: 'prop' } : i));
    // the fingers close round it
    const rig = characterLayers(draft.layers, folderId)?.rig;
    if (rig?.bones.some((b) => b.name === `Index ${side}`)) handKeys(rig, side, 'hold', draft.layers.find((l) => l.id === folderId)!.character!.face.facing, at, 2);
  });
  return true;
}

// the picked object leaves the hand at the playhead and stays where it is
export function putDown(): boolean {
  if (!mainOnly()) return false;
  const doc = editor.doc;
  const at = editor.frame;
  const ids = [...get(selection)];
  const found = ids.length === 1 ? findTop(doc, ids[0], at) : null;
  if (!found || !found.item.skin?.rigid) {
    addToast('Pick an object a hand holds', 'info');
    return false;
  }
  const transform = shownTransform(doc, found.item, at);
  const layerId = found.layer.id;
  const id = found.item.id;
  editor.commit('Put down', (draft) => {
    const layer = draft.layers.find((l) => l.id === layerId);
    if (!layer) return;
    holdFrom(layer, at);
    const key = insertKeyframe(layer, at);
    key.tween = null;
    key.items = key.items.map((i) => (i.id === id ? { ...i, transform, skin: null } : i));
    // the hand that let go relaxes
    const bone = found.item.skin!.rigid!;
    for (const folder of characterFolders(draft.layers)) {
      const rig = characterLayers(draft.layers, folder.id)?.rig;
      const hand = rig?.bones.find((b) => b.id === bone);
      if (!rig || !hand || !hand.name.startsWith('Hand ')) continue;
      const side = hand.name.endsWith('L') ? 'L' : 'R';
      if (rig.bones.some((b) => b.name === `Index ${side}`)) handKeys(rig, side, 'relaxed', folder.character!.face.facing, at, 2);
    }
  });
  return true;
}

// a tween running into frame would blend a free object into one in a hand, it holds instead
export function holdFrom(layer: Layer, at: number) {
  const before = keyframeAt(layer, at - 1);
  if (before && before.frame < at && before.tween) before.tween = null;
}

// the stage point of a picked object, for a reach to go to it
export function selectionTarget(): Vec | null {
  if (get(selection).size === 0) return null;
  const box = editor.selectionBounds();
  return isEmpty(box) ? null : boxCenter(box);
}

export { BONES };
