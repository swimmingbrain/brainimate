import { describe, expect, it } from 'vitest';
import type { Bone, Vec } from '$lib/core/types';
import { identity } from '$lib/core/mat';
import { originOf, tipOf, worldMatrices } from './bones';
import { bendSide, fabrik, ikChain, rotateBone, solveChain, twoBoneIK } from './ik';

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function bone(id: string, parent: string | null, x: number, y: number, length: number, rotation = 0): Bone {
  return { id, name: id, parent, x, y, length, radius: 10, rotation, bind: identity(), pinned: false, color: '#fff' };
}

// shoulder at 0,0, upper arm 100 and forearm 80, a little bent
function arm(): Bone[] {
  return [bone('u', null, 0, 0, 100, 0.2), bone('f', 'u', 100, 0, 80, -0.4)];
}

describe('two bone ik', () => {
  it('reaches a reachable target and keeps both lengths', () => {
    const root = { x: 0, y: 0 };
    const mid = { x: 100, y: 0 };
    const end = { x: 150, y: 60 };
    const target = { x: 60, y: 90 };
    const r = twoBoneIK(root, mid, end, target);
    expect(dist(r.end, target)).toBeLessThan(1e-6);
    expect(dist(root, r.mid)).toBeCloseTo(100, 9);
    expect(dist(r.mid, r.end)).toBeCloseTo(dist(mid, end), 6);
  });

  it('keeps the elbow on the side it was on', () => {
    const root = { x: 0, y: 0 };
    const mid = { x: 70, y: -70 };
    const end = { x: 140, y: 0 };
    const side = bendSide(root, mid, end);
    for (const target of [
      { x: 50, y: 10 },
      { x: 100, y: 40 },
      { x: -30, y: 80 }
    ]) {
      const r = twoBoneIK(root, mid, end, target);
      expect(bendSide(root, r.mid, r.end)).toBe(side);
    }
  });

  it('stretches straight at a target out of reach', () => {
    const r = twoBoneIK({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 180, y: 0 }, { x: 0, y: 500 });
    expect(r.end.x).toBeCloseTo(0, 3);
    expect(r.end.y).toBeCloseTo(180, 3);
  });
});

describe('fabrik', () => {
  it('converges on a reachable target with every length kept', () => {
    const points = [0, 1, 2, 3, 4].map((i) => ({ x: i * 50, y: 0 }));
    const lengths = [50, 50, 50, 50];
    const target = { x: 120, y: 90 };
    const out = fabrik(points, lengths, target);
    expect(dist(out[4], target)).toBeLessThan(0.1 + 1e-9);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < 4; i++) expect(dist(out[i], out[i + 1])).toBeCloseTo(50, 6);
  });
});

describe('solving a chain', () => {
  it('puts the wrist on the target with exact lengths', () => {
    const bones = arm();
    const target = { x: 120, y: 80 };
    const pose = solveChain(bones, {}, 'f', { x: 80, y: 0 }, target);
    const w = worldMatrices(bones, pose);
    expect(dist(tipOf(w.get('f')!, bones[1]), target)).toBeLessThan(1e-4);
    expect(dist(originOf(w.get('u')!), { x: 0, y: 0 })).toBeLessThan(1e-9);
    expect(dist(originOf(w.get('f')!), originOf(w.get('u')!))).toBeCloseTo(100, 6);
  });

  it('stops at a pinned bone, the bones above it stay', () => {
    const bones = arm();
    bones[1].pinned = true;
    expect(ikChain(bones, 'f', 4).map((b) => b.id)).toEqual(['f']);
    const pose = solveChain(bones, {}, 'f', { x: 80, y: 0 }, { x: 100, y: 120 });
    expect(pose.u).toBeUndefined();
    expect(pose.f.rotation).not.toBe(0);
  });

  it('turns a longer chain with fabrik and keeps the root in place', () => {
    const bones = [bone('a', null, 0, 0, 50), bone('b', 'a', 50, 0, 50), bone('c', 'b', 50, 0, 50), bone('d', 'c', 50, 0, 50)];
    const target = { x: 90, y: 110 };
    const pose = solveChain(bones, {}, 'd', { x: 50, y: 0 }, target, { limit: 4 });
    const w = worldMatrices(bones, pose);
    expect(dist(tipOf(w.get('d')!, bones[3]), target)).toBeLessThan(0.5);
    expect(dist(originOf(w.get('a')!), { x: 0, y: 0 })).toBeLessThan(1e-9);
  });

  it('honors the chain limit', () => {
    const bones = [bone('a', null, 0, 0, 50), bone('b', 'a', 50, 0, 50), bone('c', 'b', 50, 0, 50)];
    expect(ikChain(bones, 'c', 2).map((b) => b.id)).toEqual(['c', 'b']);
  });

  it('turns one bone around its start for forward kinematics', () => {
    const bones = arm();
    const pose = rotateBone(bones, {}, 'u', { x: 100, y: 0 }, { x: 0, y: 100 });
    const w = worldMatrices(bones, pose);
    const o = originOf(w.get('f')!);
    expect(Math.atan2(o.y, o.x)).toBeCloseTo(Math.PI / 2 + 0.2, 6);
  });
});
