import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { Item, Layer, PathItem } from '$lib/core/types';
import { applyPoint } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { rigFor, worldMatrices, tipOf } from '$lib/rig/bones';
import { posed } from '$lib/rig/skin';
import { ikChain } from '$lib/rig/ik';
import { poseAt } from '$lib/render/frame';
import {
  BONES,
  EMOTIONS,
  FACE_ROLES,
  PART_BONE,
  buildCharacter,
  characterLayers,
  defaultCharacter,
  facePaths,
  findRole,
  recolorItems,
  shadeOf
} from './model';
import { ANIMATIONS, animationKeys, blinkFrames, lipSync, mirrorPose, talkPattern, toPose, type Body } from './anim';
import { isCharacterPackage, packCharacter, unpackCharacter } from './pack';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import {
  applyAnimation,
  createCharacter,
  currentCharacter,
  cutAnimation,
  duplicateCharacter,
  faceHere,
  pickUp,
  putDown,
  recolorCharacter,
  setEmotion,
  setMouth,
  setPartVisible,
  talk,
  blink
} from '$lib/editor/character';

const W = 1080;
const H = 1920;

function opts() {
  return defaultCharacter(W, H);
}

function body(layers: Layer[]): Body {
  const rig = layers.find((l) => l.type === 'rig')!;
  const byName = new Map(rig.bones.map((b) => [b.name, b.id]));
  return { height: opts().height, facing: 1, bones: rig.bones, start: {}, id: (n) => byName.get(n) ?? null };
}

describe('the character creator', () => {
  it('builds a folder with a skeleton of seventeen bones and a body with every part bound', () => {
    const c = buildCharacter(opts());
    const [bodyLayer, rig, folder] = c.layers;
    expect(folder.type).toBe('folder');
    expect(folder.character?.name).toBe('Character');
    expect(rig.type).toBe('rig');
    expect(rig.parent).toBe(folder.id);
    expect(bodyLayer.parent).toBe(folder.id);
    expect(rig.bones.map((b) => b.name).sort()).toEqual([...BONES].sort());
    const items = bodyLayer.keyframes[0].items;
    for (const role of ['head', 'hair', 'neck', 'torso', 'upperArmL', 'lowerArmR', 'handR', 'upperLegL', 'lowerLegR', 'footL', ...FACE_ROLES]) {
      const item = items.find((i) => i.role === role);
      expect(item, role).toBeTruthy();
      const bone = rig.bones.find((b) => b.id === item!.skin?.rigid);
      expect(bone?.name, role).toBe(PART_BONE[role]);
    }
  });

  it('draws parts in the graphic novel style: a flat fill, a darker cel shadow and a dark outline', () => {
    const items = buildCharacter(opts()).layers[0].keyframes[0].items;
    const arm = items.find((i) => i.role === 'upperArmR')!;
    expect(arm.type).toBe('group');
    const [fill, shadow, outline] = (arm as Extract<Item, { type: 'group' }>).children as PathItem[];
    expect(fill.style.fill).toMatchObject({ color: '#5b6b82' });
    expect(fill.style.stroke).toBeNull();
    expect(shadow.style.fill).toMatchObject({ color: shadeOf('#5b6b82') });
    expect(outline.style.fill).toBeNull();
    expect(outline.style.stroke).toMatchObject({ color: '#1d1b19' });
    expect(outline.style.width).toBeGreaterThan(4);
    // the wobble: the same seed draws the same line, another seed another one
    const again = buildCharacter(opts()).layers[0].keyframes[0].items.find((i) => i.role === 'upperArmR') as Extract<Item, { type: 'group' }>;
    expect((again.children[0] as PathItem).path).toEqual(fill.path);
    const other = buildCharacter({ ...opts(), seed: 99 }).layers[0].keyframes[0].items.find((i) => i.role === 'upperArmR') as Extract<Item, { type: 'group' }>;
    expect((other.children[0] as PathItem).path).not.toEqual(fill.path);
  });

  it('faces left when asked, with the hair and the face turned', () => {
    const right = buildCharacter(opts());
    const left = buildCharacter({ ...opts(), facing: -1 });
    expect(right.info.face.facing).toBe(1);
    expect(left.info.face.facing).toBe(-1);
    const noseX = (c: typeof right) => (c.layers[0].keyframes[0].items.find((i) => i.role === 'nose') as PathItem).path.anchors[0].x;
    expect(noseX(right)).toBeGreaterThan(right.info.face.x);
    expect(noseX(left)).toBeLessThan(left.info.face.x);
  });

  it('recolors every part by its role, outlines and face included', () => {
    const items = buildCharacter(opts()).layers[0].keyframes[0].items;
    const out = recolorItems(items, { skin: '#aa7755', hair: '#ccaa00', shirt: '#336633', pants: '#222244', shoes: '#111111', outline: '#000000' });
    const head = findRole(out, 'head') as Extract<Item, { type: 'group' }>;
    expect((head.children[0] as PathItem).style.fill).toMatchObject({ color: '#aa7755' });
    expect((head.children[2] as PathItem).style.stroke).toMatchObject({ color: '#000000' });
    expect((findRole(out, 'mouth') as PathItem).style.fill).toMatchObject({ color: '#000000' });
    const shirt = findRole(out, 'torso') as Extract<Item, { type: 'group' }>;
    expect((shirt.children[1] as PathItem).style.fill).toMatchObject({ color: shadeOf('#336633') });
  });
});

describe('the skeleton', () => {
  it('keeps the parts together when a joint turns: the forearm stays on the elbow', () => {
    const c = buildCharacter(opts());
    const rig = c.layers[1];
    const items = c.layers[0].keyframes[0].items;
    const id = (n: string) => rig.bones.find((b) => b.name === n)!.id;
    const pose = { [id('Upper arm R')]: { rotation: -1.2, x: 0, y: 0, scale: 1 }, [id('Lower arm R')]: { rotation: -0.8, x: 0, y: 0, scale: 1 } };
    rig.keyframes[0].pose = pose;
    const r = rigFor([rig], 0)!;
    const elbow = tipOf(r.world.get(id('Upper arm R'))!, rig.bones.find((b) => b.name === 'Upper arm R')!);
    const lowerStart = { x: r.world.get(id('Lower arm R'))![4], y: r.world.get(id('Lower arm R'))![5] };
    expect(lowerStart.x).toBeCloseTo(elbow.x);
    expect(lowerStart.y).toBeCloseTo(elbow.y);
    // the posed forearm part moved with its bone: its first anchor followed the bone's move
    const fore = items.find((i) => i.role === 'lowerArmR')!;
    const shown = posed(fore, [1, 0, 0, 1, 0, 0], r);
    expect(shown.transform).not.toEqual(fore.transform);
  });

  it('bends an arm or a leg dragged by its end at the elbow or the knee only', () => {
    const rig = buildCharacter(opts()).layers[1];
    const id = (n: string) => rig.bones.find((b) => b.name === n)!.id;
    expect(ikChain(rig.bones, id('Lower arm R'), 4).map((b) => b.name)).toEqual(['Lower arm R', 'Upper arm R']);
    expect(ikChain(rig.bones, id('Lower leg L'), 4).map((b) => b.name)).toEqual(['Lower leg L', 'Upper leg L']);
    // the head still leans the body along
    expect(ikChain(rig.bones, id('Head'), 4).map((b) => b.name)).toEqual(['Head', 'Neck', 'Chest', 'Spine']);
  });

  it('turns around on the hip: the whole character mirrors', () => {
    const c = buildCharacter(opts());
    const rig = c.layers[1];
    const hip = rig.bones.find((b) => b.name === 'Hip')!;
    const hand = rig.bones.find((b) => b.name === 'Hand R')!;
    const before = worldMatrices(rig.bones, {}).get(hand.id)!;
    const after = worldMatrices(rig.bones, { [hip.id]: { rotation: 0, x: 0, y: 0, scale: 1, sx: -1 } }).get(hand.id)!;
    const hx = hip.x;
    expect(after[4] - hx).toBeCloseTo(-(before[4] - hx));
    expect(after[5]).toBeCloseTo(before[5]);
  });
});

describe('animations', () => {
  const base = { at: 10, fps: 24, repeat: 2, speed: 1, mirror: false, distance: 300, back: false };

  it('walk in cycles that swing the legs opposite and carry the hip along', () => {
    const c = buildCharacter(opts());
    const keys = animationKeys('walk', body(c.layers), base);
    expect(keys[0].frame).toBe(10);
    expect(keys[keys.length - 1].frame).toBe(10 + 48);
    // worked out every other frame
    expect(keys).toHaveLength(25);
    const k0 = keys[0].pose;
    // the near leg reaches forward, turning against the clock for a character looking right
    expect(k0['Upper leg R']!.rotation!).toBeLessThan(k0['Upper leg L']!.rotation! - 0.2);
    expect(Math.sign(k0['Upper arm R']!.rotation!)).toBe(-Math.sign(k0['Upper leg R']!.rotation!));
    expect(keys[keys.length - 1].pose.Hip!.x).toBeCloseTo(600);
    expect(keys.slice(0, -1).every((k) => k.ease === 'linear')).toBe(true);
    expect(keys[keys.length - 1].ease).toBeNull();
  });

  it('run faster, with more swing and a forward lean, and speed shortens a cycle', () => {
    const c = buildCharacter(opts());
    const walk = animationKeys('walk', body(c.layers), { ...base, repeat: 1 });
    const run = animationKeys('run', body(c.layers), { ...base, repeat: 1 });
    expect(run[run.length - 1].frame - run[0].frame).toBeLessThan(walk[walk.length - 1].frame - walk[0].frame);
    const most = (keys: typeof walk, bone: 'Upper leg R' | 'Lower leg R') => Math.max(...keys.map((k) => Math.abs(k.pose[bone]!.rotation!)));
    expect(most(run, 'Lower leg R')).toBeGreaterThan(most(walk, 'Lower leg R'));
    expect(Math.abs(run[0].pose.Spine!.rotation!)).toBeGreaterThan(Math.abs(walk[0].pose.Spine!.rotation!));
    const fast = animationKeys('walk', body(c.layers), { ...base, repeat: 1, speed: 2 });
    expect(fast[fast.length - 1].frame - fast[0].frame).toBe(12);
  });

  it('mirror swaps the near and the far side', () => {
    expect(mirrorPose({ 'Upper arm R': { rotation: 1 }, Head: { rotation: 0.2 } })).toEqual({ 'Upper arm L': { rotation: 1 }, Head: { rotation: 0.2 } });
    const c = buildCharacter(opts());
    const wave = animationKeys('wave', body(c.layers), { ...base, mirror: true });
    expect(wave.some((k) => k.pose['Upper arm L']?.rotation)).toBe(true);
    expect(wave.some((k) => k.pose['Upper arm R']?.rotation)).toBe(false);
  });

  it('has every move: jump up and back down, sit with the hip lowered, turn to the mirror image', () => {
    const c = buildCharacter(opts());
    const b = body(c.layers);
    for (const a of ANIMATIONS) expect(animationKeys(a.kind, b, base).length, a.kind).toBeGreaterThan(1);
    const jump = animationKeys('jump', b, { ...base, distance: 0 });
    const ys = jump.map((k) => k.pose.Hip?.y ?? 0);
    expect(Math.min(...ys)).toBeLessThan(-100);
    expect(ys[ys.length - 1]).toBe(0);
    const sit = animationKeys('sit', b, base);
    expect(sit[sit.length - 1].pose.Hip!.y).toBeGreaterThan(50);
    const turn = animationKeys('turn', b, base);
    expect(turn[0].pose.Hip!.sx).toBe(1);
    expect(turn[turn.length - 1].pose.Hip!.sx).toBe(-1);
    const point = animationKeys('point', b, { ...base, back: true, repeat: 1 });
    expect(point[point.length - 1].pose['Upper arm R']).toBeUndefined();
  });

  it('reach the hand to a target with the arm solved by ik', () => {
    const c = buildCharacter(opts());
    const b = body(c.layers);
    const rig = c.layers[1];
    // within reach: the arm is about 0.27 of the height long
    const target = { x: opts().x + 100, y: opts().ground - opts().height * 0.55 };
    const keys = animationKeys('reach', b, { ...base, target });
    const pose = toPose(keys[keys.length - 1].pose, b.id);
    const lower = rig.bones.find((x) => x.name === 'Lower arm R')!;
    const wrist = applyPoint(worldMatrices(rig.bones, pose).get(lower.id)!, { x: lower.length, y: 0 });
    expect(Math.hypot(wrist.x - target.x, wrist.y - target.y)).toBeLessThan(2);
  });
});

describe('faces', () => {
  const frameOf = { x: 500, y: 700, r: 80, facing: 1 as const };

  it('keep the anchor count of every part in every mood, so a change morphs', () => {
    const neutral = facePaths(frameOf, 'neutral', 'closed');
    for (const e of EMOTIONS) {
      for (const m of ['closed', 'slight', 'wide'] as const) {
        const p = facePaths(frameOf, e.id, m);
        for (const role of FACE_ROLES) expect(p[role].anchors.length, `${e.id} ${m} ${role}`).toBe(neutral[role].anchors.length);
      }
    }
  });

  it('change the face: a smile lifts the corners, surprise opens wide, a blink closes the eyes', () => {
    const corners = (p: ReturnType<typeof facePaths>) => (p.mouth.anchors[0].y + p.mouth.anchors[3].y) / 2;
    const open = (p: ReturnType<typeof facePaths>) => p.mouth.anchors[4].y - p.mouth.anchors[2].y;
    const eyeH = (p: ReturnType<typeof facePaths>) => p.eyeR.anchors[1].y - p.eyeR.anchors[3].y;
    const n = facePaths(frameOf, 'neutral', 'closed');
    expect(corners(facePaths(frameOf, 'happy', 'closed'))).toBeLessThan(corners(n));
    expect(corners(facePaths(frameOf, 'sad', 'closed'))).toBeGreaterThan(corners(n));
    expect(open(facePaths(frameOf, 'surprised', 'closed'))).toBeGreaterThan(open(n) * 4);
    expect(open(facePaths(frameOf, 'neutral', 'wide'))).toBeGreaterThan(open(facePaths(frameOf, 'neutral', 'slight')));
    expect(eyeH(facePaths(frameOf, 'neutral', 'closed', true))).toBeLessThan(eyeH(n) * 0.2);
    // angry brows go down to the middle, sad ones up
    const inner = (p: ReturnType<typeof facePaths>) => p.browR.anchors[0].y;
    expect(inner(facePaths(frameOf, 'angry', 'closed'))).toBeGreaterThan(inner(n));
    expect(inner(facePaths(frameOf, 'sad', 'closed'))).toBeLessThan(inner(n));
  });

  it('talk and lip sync in mouth shapes that hold at least two frames, blinks now and then', () => {
    const t = talkPattern(0, 48, 3);
    expect(t.length).toBeGreaterThan(8);
    expect(t[t.length - 1]).toEqual({ frame: 48, mouth: 'closed' });
    expect(talkPattern(0, 48, 3)).toEqual(t);
    const levels = [0, 0, 0.3, 0.35, 0.8, 0.9, 0.85, 0.2, 0.1, 0.05, 0.6, 0.02];
    const sync = lipSync(levels, 100);
    expect(sync[0]).toEqual({ frame: 100, mouth: 'closed' });
    expect(sync.map((s) => s.mouth)).toContain('wide');
    for (let i = 1; i < sync.length - 1; i++) expect(sync[i].frame - sync[i - 1].frame).toBeGreaterThanOrEqual(2);
    expect(sync[sync.length - 1].mouth).toBe('closed');
    const blinks = blinkFrames(0, 24 * 10, 24, 1);
    expect(blinks.length).toBeGreaterThan(1);
    for (let i = 1; i < blinks.length; i++) expect(blinks[i] - blinks[i - 1]).toBeGreaterThan(24);
  });
});

describe('packing a character', () => {
  it('keeps everything, gives fresh ids and moves it, its bones and its parts together', () => {
    editor.newDoc(W, H, 24);
    const id = createCharacter(opts())!;
    const pkg = packCharacter(editor.doc, id)!;
    expect(isCharacterPackage(pkg)).toBe(true);
    expect(isCharacterPackage({ layers: [] })).toBe(false);
    const out = unpackCharacter(pkg, 200, 0, 'Mia');
    const folder = out.layers.find((l) => l.character)!;
    expect(folder.name).toBe('Mia');
    expect(folder.id).not.toBe(id);
    const rig = out.layers.find((l) => l.type === 'rig')!;
    const oldRig = pkg.layers.find((l) => l.type === 'rig')!;
    expect(rig.bones.every((b) => !oldRig.bones.some((o) => o.id === b.id))).toBe(true);
    const bodyItems = out.layers.find((l) => l.type === 'normal')!.keyframes[0].items;
    // every binding points at a bone of the copy
    for (const item of bodyItems) expect(rig.bones.some((b) => b.id === item.skin?.rigid), item.role).toBe(true);
    // the hand shows 200 pixels further right, bones and part together
    const hand = (layers: Layer[]) => {
      const r = rigFor(layers, 0)!;
      const it = layers.find((l) => l.type === 'normal')!.keyframes[0].items.find((i) => i.role === 'handR')!;
      return { bone: r.world.get(it.skin!.rigid!)![4], part: posed(it, [1, 0, 0, 1, 0, 0], r).transform[4] };
    };
    const a = hand(pkg.layers);
    const b = hand(out.layers);
    expect(b.bone - a.bone).toBeCloseTo(200);
    expect(b.part - a.part).toBeCloseTo(200);
  });
});

describe('characters in the editor', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('are made, duplicated and recolored in single undo steps', () => {
    const id = createCharacter(opts())!;
    expect(get(currentCharacter)).toBe(id);
    expect(editor.doc.layers.filter((l) => l.character)).toHaveLength(1);
    const copy = duplicateCharacter(id)!;
    expect(editor.doc.layers.filter((l) => l.character)).toHaveLength(2);
    expect(copy).not.toBe(id);
    editor.undo();
    expect(editor.doc.layers.filter((l) => l.character)).toHaveLength(1);
    recolorCharacter(id, { shirt: '#aa3333' });
    const torso = characterLayers(editor.doc.layers, id)!.body!.keyframes[0].items.find((i) => i.role === 'torso') as Extract<Item, { type: 'group' }>;
    expect((torso.children[0] as PathItem).style.fill).toMatchObject({ color: '#aa3333' });
    setPartVisible(id, 'hair', false);
    expect(characterLayers(editor.doc.layers, id)!.body!.keyframes[0].items.find((i) => i.role === 'hair')!.visible).toBe(false);
  });

  it('get animations from the playhead, cut short where asked', () => {
    const id = createCharacter(opts())!;
    frame.set(12);
    expect(applyAnimation(id, { kind: 'walk', repeat: 2, speed: 1, mirror: false, distance: 300, back: false })).toBe(true);
    const rig = () => characterLayers(editor.doc.layers, id)!.rig!;
    const frames = rig().keyframes.map((k) => k.frame);
    expect(frames[0]).toBe(0);
    expect(frames).toContain(12);
    expect(Math.max(...frames)).toBeGreaterThan(50);
    const hip = rig().bones.find((b) => b.name === 'Hip')!;
    expect(poseAt(rig(), Math.max(...frames))[hip.id].x).toBeCloseTo(600);
    // every layer reaches the end, the scene stays
    expect(editor.doc.layers.every((l) => l.type === 'folder' || l.length > Math.max(...frames))).toBe(true);
    // a move keeps what it does not touch: the arm pointing stays up through a turn
    frame.set(70);
    applyAnimation(id, { kind: 'point', repeat: 0, speed: 1, mirror: false, distance: 0, back: false });
    const arm = rig().bones.find((b) => b.name === 'Upper arm R')!;
    const raised = poseAt(rig(), 90)[arm.id].rotation;
    expect(Math.abs(raised)).toBeGreaterThan(1);
    frame.set(90);
    applyAnimation(id, { kind: 'turn', repeat: 0, speed: 1, mirror: false, distance: 0, back: false });
    expect(poseAt(rig(), 110)[arm.id].rotation).toBeCloseTo(raised);
    expect(poseAt(rig(), 110)[hip.id].sx).toBe(-1);
    frame.set(30);
    cutAnimation(id);
    expect(Math.max(...rig().keyframes.map((k) => k.frame))).toBe(30);
    editor.undo();
    expect(Math.max(...rig().keyframes.map((k) => k.frame))).toBeGreaterThan(50);
  });

  it('change faces over the timeline: a mood with a blend, a mouth, a blink and talking', () => {
    const id = createCharacter(opts())!;
    frame.set(20);
    setEmotion(id, 'surprised', 4);
    const bodyL = () => characterLayers(editor.doc.layers, id)!.body!;
    expect(bodyL().keyframes.map((k) => k.frame)).toEqual([0, 16, 20]);
    expect(bodyL().keyframes.find((k) => k.frame === 16)!.tween).toEqual({ ease: 'inout' });
    expect(faceHere(id)).toEqual({ emotion: 'surprised', mouth: 'closed' });
    setMouth(id, 'wide');
    expect(faceHere(id)).toEqual({ emotion: 'surprised', mouth: 'wide' });
    frame.set(10);
    expect(faceHere(id).emotion).toBe('neutral');
    frame.set(40);
    blink(id);
    const closed = bodyL().keyframes.find((k) => k.frame === 40)!.items.find((i) => i.role === 'eyeR') as PathItem;
    const open = bodyL().keyframes.find((k) => k.frame === 42)!.items.find((i) => i.role === 'eyeR') as PathItem;
    const height = (p: PathItem) => p.path.anchors[1].y - p.path.anchors[3].y;
    expect(height(closed)).toBeLessThan(height(open) * 0.2);
    frame.set(50);
    talk(id, 2);
    expect(bodyL().keyframes.filter((k) => k.frame >= 50).length).toBeGreaterThan(8);
    // the body parts are untouched by the face keys
    expect(bodyL().keyframes.every((k) => k.items.length === bodyL().keyframes[0].items.length)).toBe(true);
  });

  it('hold an object in a hand from the playhead on and put it down later', () => {
    const id = createCharacter(opts())!;
    const props = editor.doc.layers[0];
    const phone = makePathItem('Phone', rectPath(0, 0, 40, 70), defaultStyle(), translate(700, 1300));
    editor.insertItem(props.id, phone);
    frame.set(24);
    selection.set(new Set([phone.id]));
    expect(pickUp(id, 'R')).toBe(true);
    const layer = () => editor.doc.layers.find((l) => l.id === props.id)!;
    const held = layer().keyframes.find((k) => k.frame === 24)!.items.find((i) => i.id === phone.id)!;
    const rig = characterLayers(editor.doc.layers, id)!.rig!;
    expect(rig.bones.find((b) => b.id === held.skin?.rigid)?.name).toBe('Hand R');
    expect(held.role).toBe('prop');
    // before the playhead it is where it was
    expect(layer().keyframes[0].items.find((i) => i.id === phone.id)!.skin).toBeNull();
    // the arm goes up, the phone follows the hand
    frame.set(24);
    applyAnimation(id, { kind: 'wave', repeat: 1, speed: 1, mirror: false, distance: 0, back: false });
    const at = 34;
    const r = rigFor(editor.doc.layers, at)!;
    const handBone = rig.bones.find((b) => b.name === 'Hand R')!;
    const tip = applyPoint(r.world.get(handBone.id)!, { x: handBone.length * 0.6, y: 0 });
    const shown = posed(held, [1, 0, 0, 1, 0, 0], r);
    const center = applyPoint(shown.transform, { x: 20, y: 35 });
    expect(Math.hypot(center.x - tip.x, center.y - tip.y)).toBeLessThan(1);
    // put down where it is at frame 60
    frame.set(60);
    selection.set(new Set([phone.id]));
    expect(putDown()).toBe(true);
    const free = layer().keyframes.find((k) => k.frame === 60)!.items.find((i) => i.id === phone.id)!;
    expect(free.skin).toBeNull();
  });
});
