import type { CharacterInfo, Doc, Layer, Turn } from '$lib/core/types';
import { insertKeyframe } from '$lib/anim/timeline';
import { BASE_TURN, BACK, FRONT, SIDE, normalize, turnAt } from '$lib/rig/turn';
import { characterLayers } from '$lib/character/model';
import { VIEW_ANGLES, modelOf, type CharacterModel, type ViewId, type ViewTweak } from '$lib/character/views';
import { deriveModel, rebuildAll, rebuildKey, rebuildRig } from '$lib/character/rebuild';
import { addToast } from '$lib/stores/app';
import { BODY_PRESETS, wearOutfit, type BodyType, type Identity, type Look, type Outfit } from '$lib/character/wardrobe';
import { editor } from './editor';
import { reach, turnable, withModel } from './character';

// turning characters: the angle a character is seen from at the playhead, a turn over some frames that
// steps through the angles in between, the head turned apart from the body, and the model of the
// turnaround editor. one undo step each

export function isTurnable(folderId: string): boolean {
  return turnable(characterLayers(editor.doc.layers, folderId));
}

export function turnHere(folderId: string, frame = editor.frame): Turn | null {
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!turnable(parts)) return null;
  return turnAt(parts.body, frame) ?? { ...BASE_TURN };
}

// the head turns about as far as a neck lets it from where the body looks
const NECK = 110;

function clampHead(body: number, head: number): number {
  const d = normalize(head - body);
  return body + Math.max(-NECK, Math.min(NECK, d));
}

// the way from one angle to another: the short one, front to back goes round by the side it looks to
function path(from: number, to: number): number {
  let d = normalize(to - from);
  if (Math.abs(Math.abs(d) - 180) < 1e-6) {
    const viaPlus = normalize(from + 90);
    const viaMinus = normalize(from - 90);
    d = Math.abs(normalize(viaPlus - SIDE)) <= Math.abs(normalize(viaMinus - SIDE)) ? 180 : -180;
  }
  return d;
}

const near = (a: Turn, b: Turn) => Math.abs(normalize(a.body - b.body)) < 0.5 && Math.abs(normalize(a.head - b.head)) < 0.5;

// the turn inside a change: keyframes every few degrees from at to at + frames, the keyframes in between
// at the angle they fall on, the ones after it that showed the old angle show the new one
export function turnDraft(draft: Doc, folderId: string, target: Partial<Turn>, frames: number, at: number): number {
  const parts = characterLayers(draft.layers, folderId);
  if (!turnable(parts) || !parts.body) return at;
  const body = parts.body;
  const info = parts.folder.character!;
  const from = turnAt(body, at) ?? { ...BASE_TURN };
  const toBody = target.body ?? from.body;
  const dBody = path(from.body, toBody);
  const endBody = from.body + dBody;
  const wantHead = target.head ?? (target.body !== undefined ? toBody : from.head);
  const endHead = clampHead(endBody, from.head + path(from.head, wantHead));
  const to: Turn = { body: endBody, head: endHead };
  if (near(from, to)) return at;
  const span = Math.max(0, Math.round(frames));
  const end = at + span;
  const lerp = (t: number): Turn => ({ body: from.body + (to.body - from.body) * t, head: from.head + (to.head - from.head) * t });
  const old = { ...from };
  if (span > 0) {
    const start = insertKeyframe(body, at);
    start.turn = { ...from };
    start.tween = { ease: 'linear' };
    rebuildKey(info, parts.rig, body, start);
    // a key every 30 degrees or so, so the parts move round the body and not straight across it
    const steps = Math.max(1, Math.min(span, Math.round(Math.max(Math.abs(to.body - from.body), Math.abs(to.head - from.head)) / 30)));
    for (let i = 1; i <= steps; i++) {
      const f = at + Math.round((span * i) / steps);
      const key = insertKeyframe(body, f);
      key.turn = lerp(i / steps);
      key.tween = i < steps ? { ease: 'linear' } : null;
    }
    for (const k of body.keyframes) {
      if (k.frame <= at || k.frame > end) continue;
      k.turn = lerp((k.frame - at) / span);
      rebuildKey(info, parts.rig, body, k);
    }
  } else {
    const key = insertKeyframe(body, at);
    key.turn = { ...to };
    rebuildKey(info, parts.rig, body, key);
  }
  // what came after with the old angle keeps up with the new one, a later turn of its own stays
  for (const k of body.keyframes) {
    if (k.frame <= end) continue;
    if (!k.turn || !near(k.turn, old)) break;
    k.turn = { ...to };
    rebuildKey(info, parts.rig, body, k);
  }
  reach(draft, end);
  return end;
}

function turnCommand(folderId: string, label: string, target: Partial<Turn>, frames: number): boolean {
  if (editor.editStack.length > 0) return false;
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!turnable(parts)) {
    addToast('This character was made before characters could turn: use Make turnable first', 'info');
    return false;
  }
  editor.commit(label, (draft) => {
    turnDraft(draft, folderId, target, frames, editor.frame);
  });
  return true;
}

// the whole character to a view, over frames, 0 at once
export function turnToView(folderId: string, view: ViewId, frames = 0): boolean {
  return turnCommand(folderId, `View: ${view}`, { body: VIEW_ANGLES[view], head: VIEW_ANGLES[view] }, frames);
}

export function turnToAngle(folderId: string, body: number, head = body, frames = 0): boolean {
  return turnCommand(folderId, 'Turn', { body, head }, frames);
}

// the other side: from looking right to looking left by the front
export function turnAround(folderId: string, frames = 8): boolean {
  const t = turnHere(folderId);
  if (!t) return turnCommand(folderId, 'Turn around', {}, frames);
  const to = normalize(180 - t.body);
  return turnCommand(folderId, 'Turn around', { body: to, head: to }, frames);
}

export function turnToCamera(folderId: string, frames = 8): boolean {
  return turnCommand(folderId, 'Turn to the camera', { body: FRONT, head: FRONT }, frames);
}

export function turnAway(folderId: string, frames = 8): boolean {
  return turnCommand(folderId, 'Turn away', { body: BACK, head: BACK }, frames);
}

// the head alone looks at the camera, as far as the neck goes
export function lookAtCamera(folderId: string, frames = 5): boolean {
  return turnCommand(folderId, 'Look at the camera', { head: FRONT }, frames);
}

// the back to the camera, the head turned to look over the shoulder on the side it faces
export function overShoulder(folderId: string, frames = 8): boolean {
  const t = turnHere(folderId);
  const side = t && Math.cos((t.body * Math.PI) / 180) < 0 ? 180 - SIDE : SIDE;
  return turnCommand(folderId, 'Look over the shoulder', { body: BACK, head: side }, frames);
}

// the head back in line with the body
export function headForward(folderId: string, frames = 4): boolean {
  const t = turnHere(folderId);
  if (!t) return false;
  return turnCommand(folderId, 'Head forward', { head: t.body }, frames);
}

// ---------------------------------------------------------------- the turnaround editor

export function modelHere(folderId: string): CharacterModel | null {
  const parts = characterLayers(editor.doc.layers, folderId);
  return turnable(parts) ? modelOf(parts.folder.character) : null;
}

// the model changed: clothes, accessories, proportions or what one view changes. every keyframe is
// drawn again, a change of proportions places the skeleton again with the same bones
export function setModel(folderId: string, change: Partial<CharacterModel>, key?: string, label = 'Turnaround'): boolean {
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!turnable(parts)) return false;
  const before = modelOf(parts.folder.character)!;
  // a main character keeps its look until it is unlocked
  if (before.locked && !(Object.keys(change).length === 1 && 'locked' in change)) {
    addToast('The look of this character is locked: unlock it under Save to change it', 'info');
    return false;
  }
  const ident = change.identity;
  const moved = !!ident && (['shoulders', 'hips', 'legs'] as const).some((k) => Math.abs((ident[k] ?? before.identity[k]) - before.identity[k]) > 1e-9);
  const proportions = 'height' in change || 'build' in change || 'headSize' in change || moved;
  editor.commit(
    label,
    (draft) => {
      const p = characterLayers(draft.layers, folderId);
      if (!turnable(p) || !p.body) return;
      let info = withModel(p.folder.character!, change);
      const m = modelOf(info)!;
      if (proportions) {
        rebuildRig(p.rig, m);
        info = { ...info, face: { ...info.face, r: 0.088 * m.height * Math.max(0.7, Math.min(1.4, m.headSize)) } };
      }
      if (change.face) info = { ...info, style: { ...m.face } };
      if (change.hair) info = { ...info, look: { ...info.look!, hair: m.hair } };
      if (change.colors) info = { ...info, colors: { ...m.colors } };
      p.folder.character = info;
      rebuildAll(info, p.rig, p.body);
    },
    key
  );
  return true;
}

export function lookLocked(folderId: string): boolean {
  return !!modelHere(folderId)?.locked;
}

export function setLocked(folderId: string, locked: boolean) {
  setModel(folderId, { locked }, undefined, locked ? 'Lock look' : 'Unlock look');
}

// a part of the identity changed: the body, the face details, the clothes, the shoes, the extras
export function setIdentity(folderId: string, change: Partial<Identity>, key?: string): boolean {
  const m = modelHere(folderId);
  if (!m) return false;
  return setModel(folderId, { identity: { ...m.identity, ...change } }, key ? `identity-${folderId}-${key}` : undefined, 'Character look');
}

// a whole new look from the generator, or an outfit put on
export function applyLook(folderId: string, look: Look): boolean {
  const m = modelHere(folderId);
  if (!m) return false;
  return setModel(folderId, { identity: look.identity, colors: { ...look.colors, outline: m.colors.outline }, hair: look.hair, headSize: look.headSize }, undefined, 'New look');
}

export function applyOutfit(folderId: string, outfit: Outfit): boolean {
  const m = modelHere(folderId);
  if (!m) return false;
  const worn = wearOutfit(m.identity, m.colors, outfit);
  return setModel(folderId, { identity: worn.identity, colors: worn.colors }, undefined, 'Outfit');
}

// a body type with its proportions, everything else stays
export function setBodyType(folderId: string, type: BodyType): boolean {
  const m = modelHere(folderId);
  if (!m) return false;
  const p = BODY_PRESETS[type];
  return setModel(folderId, { identity: { ...m.identity, type, shoulders: p.shoulders, waist: p.waist, hips: p.hips, legs: p.legs, bust: p.bust }, headSize: p.headSize }, undefined, 'Body type');
}

export function setTweak(folderId: string, view: ViewId, change: Partial<ViewTweak>, key?: string) {
  const m = modelHere(folderId);
  if (!m) return;
  setModel(folderId, { tweaks: { ...m.tweaks, [view]: { ...(m.tweaks[view] ?? {}), ...change } } }, key);
}

export function resetTweak(folderId: string, view: ViewId) {
  const m = modelHere(folderId);
  if (!m) return;
  const tweaks = { ...m.tweaks };
  delete tweaks[view];
  setModel(folderId, { tweaks });
}

// a character from before gets a model and a rig that knows the room: it can turn from then on. its
// moves stay, its body is drawn again from the model in every keyframe
export function makeTurnable(folderId: string): boolean {
  const parts = characterLayers(editor.doc.layers, folderId);
  if (!parts?.rig || !parts.body || turnable(parts)) return false;
  editor.commit('Make turnable', (draft) => {
    const p = characterLayers(draft.layers, folderId);
    if (!p?.rig || !p.body) return;
    const m = deriveModel(p.folder.character!, p.rig);
    const info: CharacterInfo = { ...p.folder.character!, model: m as unknown as CharacterInfo['model'], style: { ...m.face } };
    p.folder.character = info;
    rebuildRig(p.rig, m);
    for (const k of p.body.keyframes) k.turn = { ...BASE_TURN };
    rebuildAll(info, p.rig, p.body);
  });
  addToast('The character can turn now', 'success', 2000);
  return true;
}

export function viewName(angle: number): string {
  const a = normalize(angle);
  const entries = Object.entries(VIEW_ANGLES) as [ViewId, number][];
  let best = entries[0];
  for (const e of entries) if (Math.abs(normalize(a - e[1])) < Math.abs(normalize(a - best[1]))) best = e;
  // the side view seen from the other side
  const mirrored = Math.abs(normalize(a - (180 - SIDE))) < Math.abs(normalize(a - best[1]));
  return mirrored ? 'side' : best[0];
}

export type { Layer };
