import { beforeEach, describe, expect, it } from 'vitest';
import type { Item, Layer, PathItem } from '$lib/core/types';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { rigFor } from '$lib/rig/bones';
import { FRONT, BACK, SIDE, project, turnAt, turnedBones } from '$lib/rig/turn';
import { buildCharacter, characterLayers, defaultCharacter } from './model';
import { boneSpots, buildView, modelFrom, tweakAt, turnedFace } from './views';
import { createCharacter, setEmotion, applyFaceStyle, setHair, recolorCharacter } from '$lib/editor/character';
import { headForward, isTurnable, lookAtCamera, makeTurnable, overShoulder, setModel, setTweak, turnAround, turnHere, turnToCamera, turnToView } from '$lib/editor/turn';

const W = 1080;
const H = 1920;
const opts = () => defaultCharacter(W, H);

// every part with the number of anchors of each of its paths, the colors of its fills
function signature(items: Item[]) {
  const out: Record<string, string> = {};
  for (const i of items) {
    if (!i.role) continue;
    const paths = i.type === 'group' ? i.children : [i];
    // the far limbs are a shade darker, so only the parts in the middle keep their exact color
    const color = ['torso', 'head', 'hair', 'pelvis', 'neck'].includes(i.role);
    out[i.role] = paths.map((p) => `${(p as PathItem).path.anchors.length}${color ? JSON.stringify((p as PathItem).style.fill) : ''}`).join('|');
  }
  return out;
}

describe('views of a character', () => {
  it('stand the same bones in the room at every angle: lengths of arms and legs stay, the shoulders spread from the front', () => {
    const c = buildCharacter(opts());
    const rig = c.layers[1];
    const at = (angle: number) => turnedBones(rig.bones, rig.turnRig!, angle);
    const side = at(SIDE);
    const front = at(FRONT);
    expect(front.map((b) => b.id)).toEqual(rig.bones.map((b) => b.id));
    const len = (bones: typeof side, name: string) => bones.find((b) => b.name === name)!.length;
    for (const n of ['Upper arm R', 'Lower leg L', 'Spine', 'Head']) expect(len(front, n)).toBeCloseTo(len(side, n), 0);
    // the side view is the rest the rig was made at
    for (let i = 0; i < side.length; i++) {
      expect(side[i].x).toBeCloseTo(rig.bones[i].x, 3);
      expect(side[i].rotation).toBeCloseTo(rig.bones[i].rotation, 3);
    }
    const spots = boneSpots(modelFrom(opts()));
    const pivot = rig.turnRig!;
    const gap = (angle: number) => Math.abs(project(spots['Upper arm R'].from, angle, pivot).x - project(spots['Upper arm L'].from, angle, pivot).x);
    expect(gap(FRONT)).toBeGreaterThan(gap(SIDE) * 3);
    // the near arm is on the left of a character looking right when it faces the camera, on the right from behind
    expect(project(spots['Upper arm R'].from, FRONT, pivot).x).toBeLessThan(pivot.x);
    expect(project(spots['Upper arm R'].from, BACK, pivot).x).toBeGreaterThan(pivot.x);
  });

  it('keep every part, its anchors and its colors from every side, so a turn morphs and it stays the same character', () => {
    const m = modelFrom({ ...opts(), hair: 'ponytail', glasses: 'round', hat: 'cap' } as never);
    m.glasses = 'round';
    m.hat = 'cap';
    const ids = (role: string, child?: string) => `x.${role}${child ? `.${child}` : ''}`;
    const view = (a: number) => buildView(m, { body: a, head: a }, { emotion: 'happy', mouth: 'smile', blink: false }, ids);
    const base = signature(view(SIDE));
    for (const a of [FRONT, 50, -50, BACK, 168, 130]) expect(signature(view(a)), String(a)).toEqual(base);
    // the same ids everywhere
    expect(view(FRONT).map((i) => i.id).sort()).toEqual(view(BACK).map((i) => i.id).sort());
  });

  it('show the face toward the viewer: two eyes from the front, one from the side, none from the back', () => {
    const m = modelFrom(opts());
    const shown = (a: number) => turnedFace({ x: 0, y: 0, rx: 80, ry: 90 }, 1, a, 'neutral', 'closed', false, { ...m.face, nose: true }, tweakAt(m, a)).shown;
    expect(shown(FRONT)).toMatchObject({ eyeL: true, eyeR: true, mouth: true, nose: true });
    expect(shown(SIDE)).toMatchObject({ eyeR: true, eyeL: false, mouth: true });
    expect(shown(BACK)).toMatchObject({ eyeL: false, eyeR: false, mouth: false, nose: false });
    // the nose can go entirely
    expect(turnedFace({ x: 0, y: 0, rx: 80, ry: 90 }, 1, FRONT, 'neutral', 'closed', false, { ...m.face, nose: false }, tweakAt(m, FRONT)).shown.nose).toBe(false);
  });

  it('blend what a view changes between the views around it', () => {
    const m = { tweaks: { front: { headScale: 1.2 }, three: { headScale: 1 } } };
    expect(tweakAt(m, FRONT).headScale).toBeCloseTo(1.2);
    expect(tweakAt(m, 70).headScale).toBeCloseTo(1.1);
    expect(tweakAt(m, SIDE).headScale).toBeCloseTo(1);
  });
});

describe('turning in the editor', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  const parts = (id: string) => characterLayers(editor.doc.layers, id)!;
  const shoulderGap = (id: string, at: number) => {
    const rig = rigFor(editor.doc.layers, at)!;
    const b = (n: string) => rig.world.get(parts(id).rig!.bones.find((x) => x.name === n)!.id)!;
    return Math.abs(b('Upper arm R')[4] - b('Upper arm L')[4]);
  };

  it('turns to the camera over frames with a keyframe every few degrees, the bones going with it', () => {
    const id = createCharacter(opts())!;
    expect(isTurnable(id)).toBe(true);
    frame.set(10);
    expect(turnToCamera(id, 8)).toBe(true);
    const body = parts(id).body!;
    expect(turnAt(body, 10)!.body).toBeCloseTo(SIDE);
    expect(turnAt(body, 18)!.body).toBeCloseTo(FRONT);
    const mid = turnAt(body, 14)!.body;
    expect(mid).toBeGreaterThan(SIDE);
    expect(mid).toBeLessThan(FRONT);
    expect(body.keyframes.filter((k) => k.frame > 10 && k.frame <= 18).length).toBeGreaterThanOrEqual(2);
    expect(shoulderGap(id, 18)).toBeGreaterThan(shoulderGap(id, 10) * 3);
    editor.undo();
    expect(turnAt(parts(id).body!, 18)?.body ?? SIDE).toBeCloseTo(SIDE);
  });

  it('keeps the new view for what comes after and keeps moods across a turn', () => {
    const id = createCharacter(opts())!;
    frame.set(20);
    setEmotion(id, 'surprised', 0);
    frame.set(5);
    turnToView(id, 'back', 6);
    const body = parts(id).body!;
    expect(turnAt(body, 25)!.body).toBeCloseTo(BACK);
    // the face is hidden from behind
    const k = body.keyframes.find((x) => x.frame === 20)!;
    expect(k.items.find((i) => i.role === 'eyeR')!.visible).toBe(false);
    expect(k.face?.emotion).toBe('surprised');
  });

  it('turns the head apart: over the shoulder, at the camera, as far as a neck goes', () => {
    const id = createCharacter(opts())!;
    overShoulder(id, 0);
    let t = turnHere(id)!;
    expect(t.body).toBeCloseTo(BACK);
    expect(Math.abs(t.head - t.body)).toBeLessThanOrEqual(110);
    expect(Math.cos((t.head * Math.PI) / 180)).toBeGreaterThan(0.5);
    headForward(id, 0);
    t = turnHere(id)!;
    expect(t.head).toBeCloseTo(t.body);
    turnToView(id, 'side', 0);
    lookAtCamera(id, 0);
    t = turnHere(id)!;
    expect(t.head).toBeCloseTo(FRONT);
    expect(t.body).toBeCloseTo(SIDE);
    turnAround(id, 0);
    expect(Math.cos((turnHere(id)!.body * Math.PI) / 180)).toBeLessThan(0);
  });

  it('draws faces, hair and colors again at the angle of each keyframe', () => {
    const id = createCharacter(opts())!;
    turnToView(id, 'front', 0);
    applyFaceStyle(id, { nose: true });
    setHair(id, 'long');
    recolorCharacter(id, { shirt: '#aa3333' });
    const items = parts(id).body!.keyframes[0].items;
    expect(items.find((i) => i.role === 'nose')!.visible).toBe(true);
    expect(items.some((i) => i.role === 'hairBack')).toBe(true);
    const torso = items.find((i) => i.role === 'torso') as Extract<Item, { type: 'group' }>;
    expect((torso.children[0] as PathItem).style.fill).toMatchObject({ color: '#aa3333' });
    // still turned to the front after all of it
    expect(turnHere(id)!.body).toBeCloseTo(FRONT);
  });

  it('changes clothes, accessories, proportions and single views from the turnaround editor', () => {
    const id = createCharacter(opts())!;
    const bones = parts(id).rig!.bones.map((b) => b.id);
    setModel(id, { glasses: 'square', hat: 'beanie', sleeves: 'long' });
    let items = parts(id).body!.keyframes[0].items;
    expect(items.some((i) => i.role === 'glassR')).toBe(true);
    expect(items.some((i) => i.role === 'hat')).toBe(true);
    setModel(id, { headSize: 1.25, build: 'broad' });
    expect(parts(id).rig!.bones.map((b) => b.id)).toEqual(bones);
    setTweak(id, 'side', { headScale: 1.15 });
    items = parts(id).body!.keyframes[0].items;
    expect(items.some((i) => i.role === 'head')).toBe(true);
    setModel(id, { glasses: 'none' });
    expect(parts(id).body!.keyframes[0].items.some((i) => i.role === 'glassR')).toBe(false);
  });

  it('makes a character from before turnable, its moves and bones stay', () => {
    const id = createCharacter(opts())!;
    // an old character: no model, no room for its rig, no fingers
    editor.commit('old', (d) => {
      const p = characterLayers(d.layers, id)!;
      delete p.folder.character!.model;
      delete p.rig!.turnRig;
      p.rig!.bones = p.rig!.bones.filter((b) => !/^(Fingers|Index|Thumb) /.test(b.name));
      for (const k of p.body!.keyframes) delete k.turn;
    });
    expect(isTurnable(id)).toBe(false);
    expect(turnToCamera(id)).toBe(false);
    const hip = parts(id).rig!.bones.find((b) => b.name === 'Hip')!.id;
    expect(makeTurnable(id)).toBe(true);
    expect(isTurnable(id)).toBe(true);
    expect(parts(id).rig!.bones.find((b) => b.name === 'Hip')!.id).toBe(hip);
    expect(parts(id).rig!.bones.some((b) => b.name === 'Index R')).toBe(true);
    expect(turnToCamera(id, 0)).toBe(true);
  });
});

export type { Layer };
