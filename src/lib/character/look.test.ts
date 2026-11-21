import { beforeEach, describe, expect, it } from 'vitest';
import type { Item, Layer, PathItem } from '$lib/core/types';
import { worldMatrices } from '$lib/rig/bones';
import { animationKeys, toPose } from './anim';
import { applyPoint } from '$lib/core/mat';
import {
  BONES,
  DEFAULT_FACE,
  EMOTIONS,
  FACE_ROLES,
  HAIR_STYLES,
  HAND_POSES,
  MOUTHS,
  PART_BONE,
  buildCharacter,
  characterLayers,
  defaultCharacter,
  facePaths,
  faceStyleOf,
  handPoseValues,
  hairShapes,
  type HairStyle
} from './model';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { applyFaceStyle, createCharacter, faceHere, hairOf, hasFingers, setEmotion, setHair, setHandPose } from '$lib/editor/character';

const W = 1080;
const H = 1920;
const opts = () => defaultCharacter(W, H);
const items = (layers: Layer[], id: string, k = 0) => characterLayers(layers, id)!.body!.keyframes[k].items;
const role = (list: Item[], r: string) => list.find((i) => i.role === r)!;

describe('the face style', () => {
  it('leaves the nose out of a new character but keeps it on old ones', () => {
    const c = buildCharacter(opts());
    const list = c.layers[0].keyframes[0].items;
    expect(role(list, 'nose').visible).toBe(false);
    expect(role(list, 'eyeR').visible).toBe(true);
    expect(c.info.style?.nose).toBe(false);
    expect(faceStyleOf({}).nose).toBe(true);
    expect(faceStyleOf(c.info).nose).toBe(false);
  });

  it('keeps the anchor count of every face part for every eye shape, brow, mouth and mood', () => {
    const frame = { x: 0, y: 0, r: 100, facing: 1 as const };
    const base = facePaths(frame, 'neutral', 'closed');
    for (const eyes of ['round', 'oval', 'dot', 'almond', 'sleepy'] as const)
      for (const e of EMOTIONS)
        for (const m of MOUTHS) {
          const p = facePaths(frame, e.id, m.id, false, { ...DEFAULT_FACE, eyes, noseShape: 'wedge' });
          for (const r of FACE_ROLES) expect(p[r].anchors.length, `${eyes} ${e.id} ${m.id} ${r}`).toBe(base[r].anchors.length);
        }
  });

  it('moves and sizes the parts as asked', () => {
    const frame = { x: 0, y: 0, r: 100, facing: 1 as const };
    const width = (p: { anchors: { x: number }[] }) => Math.max(...p.anchors.map((a) => a.x)) - Math.min(...p.anchors.map((a) => a.x));
    const plain = facePaths(frame, 'neutral', 'closed');
    const big = facePaths(frame, 'neutral', 'closed', false, { ...DEFAULT_FACE, eyeSize: 1.5, mouthWidth: 1.5, noseSize: 2 });
    expect(width(big.eyeR)).toBeCloseTo(width(plain.eyeR) * 1.5, 1);
    expect(width(big.mouth)).toBeCloseTo(width(plain.mouth) * 1.5, 1);
    expect(width(big.nose)).toBeGreaterThan(width(plain.nose) * 1.8);
    const up = facePaths(frame, 'neutral', 'closed', false, { ...DEFAULT_FACE, eyeY: -0.1 });
    expect(up.eyeR.anchors[0].y).toBeCloseTo(plain.eyeR.anchors[0].y - 10, 5);
    const wide = facePaths(frame, 'neutral', 'closed', false, { ...DEFAULT_FACE, eyeSpacing: 1.3 });
    expect(wide.eyeR.anchors[0].x - wide.eyeL.anchors[0].x).toBeGreaterThan(plain.eyeR.anchors[0].x - plain.eyeL.anchors[0].x);
    // a smile lifts the corners above the middle of the lips, a frown drops them
    const smile = facePaths(frame, 'neutral', 'smile').mouth.anchors;
    const frown = facePaths(frame, 'neutral', 'frown').mouth.anchors;
    expect(smile[0].y).toBeLessThan(smile[1].y);
    expect(frown[0].y).toBeGreaterThan(frown[1].y);
  });

  it('draws every hairstyle, the long ones with a part behind the head', () => {
    const head = { x: 0, y: 0, rx: 80, ry: 90 };
    for (const h of HAIR_STYLES) {
      const s = hairShapes(head, 1, h.id);
      if (h.id === 'bald') expect(s.front).toBeNull();
      else expect(s.front, h.id).not.toBeNull();
    }
    for (const h of ['long', 'ponytail', 'bun', 'afro'] as HairStyle[]) expect(hairShapes(head, 1, h).back, h).not.toBeNull();
  });
});

describe('fingers', () => {
  it('give every hand a thumb, an index finger and the other fingers, bound to their bones', () => {
    const c = buildCharacter(opts());
    const rig = c.layers[1];
    expect(rig.bones).toHaveLength(BONES.length);
    for (const side of ['L', 'R']) {
      const hand = rig.bones.find((b) => b.name === `Hand ${side}`)!;
      for (const n of ['Fingers', 'Index', 'Thumb']) expect(rig.bones.find((b) => b.name === `${n} ${side}`)!.parent).toBe(hand.id);
    }
    const list = c.layers[0].keyframes[0].items;
    for (const r of ['fingersR', 'indexR', 'thumbR', 'fingersL', 'indexL', 'thumbL']) {
      const bone = rig.bones.find((b) => b.id === role(list, r).skin?.rigid);
      expect(bone?.name, r).toBe(PART_BONE[r]);
    }
  });

  it('curl in a fist and stay straight to point, mirrored for a character looking left', () => {
    const fist = handPoseValues('fist', 1);
    const point = handPoseValues('point', 1);
    expect(Math.abs(fist.Fingers)).toBeGreaterThan(2);
    expect(Math.abs(point.Index)).toBeLessThan(0.1);
    expect(Math.abs(point.Fingers)).toBeGreaterThan(2);
    expect(handPoseValues('fist', -1).Fingers).toBe(-fist.Fingers);
    expect(HAND_POSES.map((p) => p.id)).toEqual(['relaxed', 'open', 'fist', 'point', 'grab', 'hold']);
    // a fist keeps the finger tips close to the palm
    const c = buildCharacter(opts());
    const rig = c.layers[1];
    const bone = (n: string) => rig.bones.find((b) => b.name === n)!;
    const pose = { [bone('Fingers R').id]: { rotation: fist.Fingers, x: 0, y: 0, scale: 1 } };
    const tip = (p: object) => {
      const m = worldMatrices(rig.bones, p as never).get(bone('Fingers R').id)!;
      return applyPoint(m, { x: bone('Fingers R').length, y: 0 });
    };
    const wrist = worldMatrices(rig.bones, {}).get(bone('Hand R').id)!;
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - wrist[4], p.y - wrist[5]);
    expect(d(tip(pose))).toBeLessThan(d(tip({})) * 0.6);
  });
});

describe('the look in the editor', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('restyles a face in every keyframe and keeps the moods', () => {
    const id = createCharacter(opts())!;
    frame.set(10);
    setEmotion(id, 'happy', 0);
    applyFaceStyle(id, { nose: true, eyes: 'oval', brows: 'none' });
    const doc = editor.doc;
    for (const k of characterLayers(doc.layers, id)!.body!.keyframes) {
      expect(role(k.items, 'nose').visible).toBe(true);
      expect(role(k.items, 'browR').visible).toBe(false);
    }
    expect(faceHere(id).emotion).toBe('happy');
    // the happy eye is flatter than the neutral one in the same style
    const h = (it: Item) => {
      const ys = (it as PathItem).path.anchors.map((a) => a.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const keys = characterLayers(doc.layers, id)!.body!.keyframes;
    expect(h(role(keys[keys.length - 1].items, 'eyeR'))).toBeLessThan(h(role(keys[0].items, 'eyeR')));
    editor.undo();
    expect(role(items(editor.doc.layers, id), 'nose').visible).toBe(false);
  });

  it('changes the hair in every keyframe with the same ids, bound to the head', () => {
    const id = createCharacter(opts())!;
    frame.set(8);
    setEmotion(id, 'sad', 0);
    setHair(id, 'ponytail');
    expect(hairOf(id)).toBe('ponytail');
    const parts = characterLayers(editor.doc.layers, id)!;
    const head = parts.rig!.bones.find((b) => b.name === 'Head')!;
    const ids = parts.body!.keyframes.map((k) => role(k.items, 'hairBack').id);
    expect(new Set(ids).size).toBe(1);
    for (const k of parts.body!.keyframes) {
      expect(role(k.items, 'hairBack').skin?.rigid).toBe(head.id);
      expect(k.items[0].role).toBe('hairBack');
      expect(k.items.findIndex((i) => i.role === 'hair')).toBe(k.items.findIndex((i) => i.role === 'head') + 1);
    }
    setHair(id, 'bald');
    expect(parts.body!.keyframes[0].items.some((i) => i.role === 'hair')).toBe(true);
    expect(items(editor.doc.layers, id).some((i) => i.role === 'hair' || i.role === 'hairBack')).toBe(false);
  });

  it('poses the hands at the playhead, a character without fingers says so', () => {
    const id = createCharacter(opts())!;
    expect(hasFingers(id)).toBe(true);
    frame.set(12);
    expect(setHandPose(id, 'R', 'point')).toBe(true);
    const rig = characterLayers(editor.doc.layers, id)!.rig!;
    const index = rig.bones.find((b) => b.name === 'Fingers R')!;
    const key = rig.keyframes.find((k) => k.frame === 12)!;
    expect(Math.abs(key.pose[index.id].rotation)).toBeGreaterThan(2);
    // it closes over a few frames
    expect(rig.keyframes.find((k) => k.frame === 9)?.tween).toBeTruthy();
    // an old character: the finger bones taken away
    editor.commit('old', (d) => {
      const r = characterLayers(d.layers, id)!.rig!;
      r.bones = r.bones.filter((b) => !/^(Fingers|Index|Thumb) /.test(b.name));
    });
    expect(hasFingers(id)).toBe(false);
    expect(setHandPose(id, 'R', 'fist')).toBe(false);
  });
});

describe('the gait', () => {
  const W2 = 1080;
  const bodyOf = (layers: Layer[]) => {
    const rig = layers.find((l) => l.type === 'rig')!;
    const byName = new Map(rig.bones.map((b) => [b.name, b.id]));
    return { height: defaultCharacter(W2, 1920).height, facing: 1 as const, bones: rig.bones, start: {}, id: (n: string) => byName.get(n) ?? null };
  };
  // where the ankles are on the stage for every key of a walk
  const ankles = (kind: 'walk' | 'run' | 'idle', facing: 1 | -1, distance: number, sx = 1) => {
    const o = { ...defaultCharacter(W2, 1920), facing };
    const c = buildCharacter(o);
    const rig = c.layers[1];
    const b = { ...bodyOf(c.layers), facing };
    const hip = rig.bones.find((x) => x.name === 'Hip')!;
    if (sx !== 1) (b as { start: object }).start = { [hip.id]: { rotation: 0, x: 0, y: 0, scale: 1, sx } };
    const keys = animationKeys(kind, b as never, { at: 0, fps: 24, repeat: 2, speed: 1, mirror: false, distance, back: false });
    const foot = (s: string) => rig.bones.find((x) => x.name === `Foot ${s}`)!;
    return keys.map((k) => {
      const pose = toPose(k.pose, b.id as never);
      const w = worldMatrices(rig.bones, pose);
      const at = (s: string) => {
        const m = w.get(foot(s).id)!;
        return { x: m[4], y: m[5] };
      };
      return { frame: k.frame, R: at('R'), L: at('L'), ground: o.ground };
    });
  };

  for (const [kind, facing, distance, sx] of [
    ['walk', 1, 300, 1],
    ['walk', -1, -300, 1],
    ['walk', 1, -300, -1],
    ['run', 1, 600, 1]
  ] as const) {
    it(`plants the feet: a ${kind} looking ${facing > 0 ? 'right' : 'left'}${sx < 0 ? ', turned' : ''} does not slide a foot on the ground`, () => {
      const list = ankles(kind, facing, distance, sx);
      const lowest = Math.max(...list.flatMap((a) => [a.R.y, a.L.y]));
      for (const s of ['R', 'L'] as const) {
        // runs of keys where the foot is on the ground stay at one x
        let run: number[] = [];
        let checked = 0;
        const flush = () => {
          if (run.length >= 3) {
            checked++;
            expect(Math.max(...run) - Math.min(...run), `${s} slides`).toBeLessThan(3);
          }
          run = [];
        };
        for (const a of list) {
          if (lowest - a[s].y < 1) run.push(a[s].x);
          else flush();
        }
        flush();
        expect(checked, s).toBeGreaterThan(0);
      }
      // the body really goes the distance
      expect(Math.sign(list[list.length - 1].R.x - list[0].R.x)).toBe(Math.sign(distance));
    });
  }

  it('shifts the weight standing without moving the feet', () => {
    const list = ankles('idle', 1, 0);
    for (const s of ['R', 'L'] as const) {
      const xs = list.map((a) => a[s].x);
      const ys = list.map((a) => a[s].y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
    }
  });
});
