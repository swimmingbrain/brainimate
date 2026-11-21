import type { Bone, CharacterInfo, Item, Keyframe, Layer, Turn } from '$lib/core/types';
import { newId } from '$lib/core/ids';
import { applyPoint } from '$lib/core/mat';
import { worldMatrices } from '$lib/rig/bones';
import { BASE_TURN, SIDE, turnAt, turnedBones } from '$lib/rig/turn';
import { BONES, BONE_PARENT, FACE_ROLES, PART_BONE, bindParts, faceStyleOf, lookOf, type BoneName, type HairStyle } from './model';
import { boneSpots, buildView, modelOf, type CharacterModel } from './views';
import { identityOf } from './wardrobe';
import { faceAt, type FaceState } from './anim';

// a turnable character drawn again from its model: one keyframe of its body at the angle the keyframe
// holds, or its skeleton after its proportions changed. the parts keep their ids, the mood and the
// mouth of the keyframe stay, objects held on the body layer stay on top

// the roles the view decides to show or hide, a hidden one of the others stays hidden
const VIEW_ROLES = new Set([...FACE_ROLES, 'glassL', 'glassR', 'glassBridge']);

// a closed eye is a flat one, a keyframe of a blink keeps it closed when the face is redrawn
export function blinking(items: Item[]): boolean {
  const eye = items.find((i) => i.role === 'eyeR');
  if (!eye || eye.type !== 'path') return false;
  const ys = eye.path.anchors.map((a) => a.y);
  const xs = eye.path.anchors.map((a) => a.x);
  const w = Math.max(...xs) - Math.min(...xs);
  return w > 0 && (Math.max(...ys) - Math.min(...ys)) / w < 0.2;
}

function idsOf(items: Item[], into: Map<string, string>) {
  for (const item of items) {
    if (!item.role || into.has(item.role)) continue;
    into.set(item.role, item.id);
    if (item.type === 'group') for (const c of item.children) into.set(`${item.role}/${c.name}`, c.id);
  }
}

export function rebuildKey(info: CharacterInfo, rig: Layer, body: Layer, key: Keyframe, state?: FaceState, blink?: boolean) {
  const m = modelOf(info);
  if (!m) return;
  const turn: Turn = key.turn ?? turnAt(body, key.frame) ?? BASE_TURN;
  const ids = new Map<string, string>();
  idsOf(key.items, ids);
  for (const k of body.keyframes) idsOf(k.items, ids);
  const idFor = (role: string, child?: string) => {
    const k = child ? `${role}/${child}` : role;
    let id = ids.get(k);
    if (!id) {
      id = `${body.id}.${role}${child ? `.${child}` : ''}`;
      ids.set(k, id);
    }
    return id;
  };
  const face = state ?? faceAt(body, key.frame);
  const closed = blink ?? blinking(key.items);
  const items = buildView(m, turn, { emotion: face.emotion, mouth: face.mouth, blink: closed }, idFor);
  const byName = new Map(rig.bones.map((b) => [b.name, b.id]));
  bindParts(items, (n) => byName.get(n));
  const hidden = new Set(key.items.filter((i) => i.role && !i.visible && !VIEW_ROLES.has(i.role)).map((i) => i.role!));
  for (const item of items) if (hidden.has(item.role ?? '')) item.visible = false;
  // what is not a part of the character, an object put on the body layer, stays on top
  const extras = key.items.filter((i) => !i.role || i.role === 'prop' || !PART_BONE[i.role]);
  key.items = [...items, ...extras];
  key.turn = { ...turn };
}

// every keyframe of a body drawn again, after the look or the clothes changed
export function rebuildAll(info: CharacterInfo, rig: Layer, body: Layer) {
  for (const k of body.keyframes) rebuildKey(info, rig, body, k);
}

// the skeleton of a turnable character placed again from its model: the same bone ids, so poses and
// what the hands hold stay, missing bones like fingers are added
export function rebuildRig(rig: Layer, m: CharacterModel) {
  const spots = boneSpots(m);
  const color = rig.bones[0]?.color ?? '#c99c7c';
  for (const name of BONES) {
    if (rig.bones.some((b) => b.name === name)) continue;
    const parentName = BONE_PARENT[name];
    const parent = parentName ? (rig.bones.find((b) => b.name === parentName)?.id ?? null) : null;
    const bone: Bone = { id: newId(), name, parent, x: 0, y: 0, length: 1, radius: 1, rotation: 0, bind: [1, 0, 0, 1, 0, 0], pinned: false, color };
    rig.bones.push(bone);
  }
  const turnBones: NonNullable<Layer['turnRig']>['bones'] = {};
  for (const b of rig.bones) {
    const spot = spots[b.name as BoneName];
    if (spot) turnBones[b.id] = { from: spot.from, to: spot.to };
  }
  rig.turnRig = { x: m.x, ground: m.ground, facing: m.facing, bones: turnBones };
  const placed = turnedBones(rig.bones, rig.turnRig, SIDE);
  rig.bones = placed.map((b) => ({ ...b, radius: b.length * 0.5, pinned: b.name.startsWith('Upper arm') || b.name.startsWith('Upper leg') }));
  // the cache keyed by the rig object goes with a new one
  rig.turnRig = { ...rig.turnRig };
}

// a character made before characters could turn gets a model from what it is: its size and place from
// the skeleton, its hair, colors and face from what it kept
export function deriveModel(info: CharacterInfo, rig: Layer): CharacterModel {
  const rest = worldMatrices(rig.bones, {});
  let top = Infinity;
  let bottom = -Infinity;
  let hipX = info.face.x;
  for (const b of rig.bones) {
    const w = rest.get(b.id)!;
    const tip = applyPoint(w, { x: b.length, y: 0 });
    top = Math.min(top, w[5], tip.y);
    bottom = Math.max(bottom, w[5], tip.y);
    if (b.name === 'Hip') hipX = w[4];
  }
  const height = Math.max(10, bottom - top) / 0.975;
  const look = lookOf(info);
  return {
    height,
    x: hipX,
    ground: top + height,
    build: 'regular',
    headSize: Math.max(0.8, Math.min(1.35, info.face.r / (0.088 * height))),
    hair: look.hair as HairStyle,
    facing: info.face.facing,
    colors: { ...info.colors },
    outline: look.outline,
    wobble: look.wobble,
    seed: look.seed,
    face: faceStyleOf(info),
    sleeves: 'short',
    glasses: 'none',
    hat: 'none',
    tweaks: {},
    identity: identityOf(null)
  };
}
