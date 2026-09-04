import { describe, expect, it } from 'vitest';
import type { Bone, Layer } from '$lib/core/types';
import { identity } from '$lib/core/mat';
import {
  addBone,
  chainToRoot,
  hitBody,
  hitJoint,
  jointsOf,
  makeRig,
  nextBoneColor,
  originOf,
  removeBone,
  restWorld,
  rigFor,
  tipOf,
  worldAt,
  worldMatrices
} from './bones';
import { PALETTE } from '$lib/core/palette';

function bone(id: string, parent: string | null, x: number, y: number, length: number, rotation: number): Bone {
  const radius = length * 0.35;
  return { id, name: id, parent, x, y, length, radius, rotation, bind: identity(), pinned: false, color: '#fff' };
}

// a horizontal arm from 100,100: upper 100 long, lower 80 long
function arm(): Bone[] {
  return [bone('u', null, 100, 100, 100, 0), bone('l', 'u', 100, 0, 80, 0)];
}

function close(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
}

describe('bone matrices', () => {
  it('places the tips along the chain at rest', () => {
    const bones = arm();
    close(tipOf(restWorld(bones, bones[0]), bones[0]), { x: 200, y: 100 });
    close(tipOf(restWorld(bones, bones[1]), bones[1]), { x: 280, y: 100 });
  });

  it('turns the children with a posed parent', () => {
    const bones = arm();
    const pose = { u: { rotation: Math.PI / 2, x: 0, y: 0, scale: 1 } };
    const m = worldAt(bones, bones[1], pose);
    close(originOf(m), { x: 100, y: 200 });
    close(tipOf(m, bones[1]), { x: 100, y: 280 });
  });

  it('moves and scales with the pose deltas', () => {
    const bones = arm();
    const pose = { u: { rotation: 0, x: 10, y: -5, scale: 2 } };
    close(tipOf(worldAt(bones, bones[1], pose), bones[1]), { x: 110 + 360, y: 95 });
  });

  it('works out all matrices at once like one by one', () => {
    const bones = arm();
    const pose = { l: { rotation: 0.3, x: 0, y: 0, scale: 1 }, u: { rotation: -0.2, x: 0, y: 0, scale: 1 } };
    const all = worldMatrices(bones, pose);
    for (const b of bones) expect(all.get(b.id)).toEqual(worldAt(bones, b, pose));
  });

  it('walks from a bone up to the root', () => {
    expect(chainToRoot(arm(), 'l').map((b) => b.id)).toEqual(['l', 'u']);
  });
});

describe('adding and removing bones', () => {
  it('turns world points into the local placement under a posed parent', () => {
    const bones = arm();
    const pose = { u: { rotation: Math.PI / 2, x: 0, y: 0, scale: 1 } };
    // the upper arm points down, its tip is at 100, 200
    const b = addBone(bones, 'u', { x: 100, y: 200 }, { x: 160, y: 200 }, pose, { name: 'h', color: '#000' });
    expect(b.x).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(0);
    expect(b.length).toBeCloseTo(60);
    expect(b.rotation).toBeCloseTo(-Math.PI / 2);
    expect(b.radius).toBeCloseTo(21);
    const m = worldAt(bones, b, pose);
    close(originOf(m), { x: 100, y: 200 });
    close(tipOf(m, b), { x: 160, y: 200 });
    expect(b.bind).toEqual(m);
  });

  it('places a root bone in world space', () => {
    const bones: Bone[] = [];
    const b = addBone(bones, null, { x: 10, y: 20 }, { x: 10, y: 70 }, {}, { name: 'r', color: '#000' });
    expect([b.x, b.y, b.length]).toEqual([10, 20, 50]);
    expect(b.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('keeps the children where they were when their parent goes', () => {
    const bones = arm();
    bones.push(bone('h', 'l', 80, 0, 30, 0.5));
    const before = tipOf(restWorld(bones, bones[2]), bones[2]);
    removeBone(bones, 'l');
    expect(bones.map((b) => b.id)).toEqual(['u', 'h']);
    expect(bones[1].parent).toBe('u');
    close(tipOf(restWorld(bones, bones[1]), bones[1]), before);
  });

  it('gives a new chain the next color and a branch its parent color', () => {
    const bones = arm();
    bones[0].color = PALETTE[0];
    expect(nextBoneColor(bones)).toBe(PALETTE[1]);
    expect(nextBoneColor(bones, 'u')).toBe(PALETTE[0]);
  });
});

describe('hitting bones', () => {
  it('finds the joints, the leaf tip included', () => {
    const bones = arm();
    const joints = jointsOf(bones, worldMatrices(bones, {}));
    expect(joints.map((j) => `${j.bone.id}:${j.end}`)).toEqual(['u:origin', 'l:origin', 'l:tip']);
    expect(hitJoint(joints, { x: 203, y: 101 }, 6)?.bone.id).toBe('l');
    expect(hitJoint(joints, { x: 278, y: 98 }, 6)?.end).toBe('tip');
    expect(hitJoint(joints, { x: 150, y: 100 }, 6)).toBeNull();
  });

  it('finds the bone under a point near its body', () => {
    const bones = arm();
    const worlds = worldMatrices(bones, {});
    expect(hitBody(bones, worlds, { x: 150, y: 104 }, 5)?.id).toBe('u');
    expect(hitBody(bones, worlds, { x: 240, y: 96 }, 5)?.id).toBe('l');
    expect(hitBody(bones, worlds, { x: 150, y: 120 }, 5)).toBeNull();
  });
});

describe('rigs', () => {
  function rigLayer(bones: Bone[]): Layer {
    return {
      id: 'rig',
      name: 'Rig',
      type: 'rig',
      visible: true,
      locked: false,
      outline: false,
      color: '#fff',
      parent: null,
      keyframes: [
        { frame: 0, items: [], pose: {}, tween: { ease: 'linear' }, label: '' },
        { frame: 10, items: [], pose: { u: { rotation: 1, x: 0, y: 0, scale: 1 } }, tween: null, label: '' }
      ],
      length: 11,
      bones
    };
  }

  it('tweens the pose between keyframes and gives back the same rig for the same frame', () => {
    const layers = [rigLayer(arm())];
    const half = rigFor(layers, 5)!;
    expect(half.pose.u.rotation).toBeCloseTo(0.5);
    expect(rigFor(layers, 5)).toBe(half);
    expect(rigFor([], 5)).toBeNull();
  });

  it('skins through world times inverse bind, identity at the bind pose', () => {
    const bones = arm();
    for (const b of bones) b.bind = restWorld(bones, b);
    const rig = makeRig(bones, {});
    for (const m of rig.skin.values()) m.forEach((v, i) => expect(v).toBeCloseTo(identity()[i]));
  });
});
