import { describe, expect, it } from 'vitest';
import type { Bone } from '$lib/core/types';
import { fromRect } from '$lib/core/bbox';
import { boneById, originOf, restWorld, tipOf } from './bones';
import { addTemplate, stageBox, templateBones } from './templates';

function parentName(bones: Bone[], b: Bone): string | null {
  return boneById(bones, b.parent)?.name ?? null;
}

describe('templates', () => {
  it('builds a humanoid with a hip at the root and limbs on the chest and hip', () => {
    const bones: Bone[] = [];
    const added = addTemplate(bones, 'humanoid', fromRect(100, 100, 200, 400), 0.35);
    expect(added.length).toBe(17);
    expect(bones.filter((b) => b.parent === null).map((b) => b.name)).toEqual(['Hip']);
    const byName = (n: string) => bones.find((b) => b.name === n)!;
    expect(parentName(bones, byName('Head'))).toBe('Neck');
    expect(parentName(bones, byName('Upper arm L'))).toBe('Chest');
    expect(parentName(bones, byName('Hand R'))).toBe('Lower arm R');
    expect(parentName(bones, byName('Upper leg R'))).toBe('Hip');
    expect(parentName(bones, byName('Foot L'))).toBe('Lower leg L');
  });

  it('fits the figure into the box at rest with the bind matrices set', () => {
    const bones: Bone[] = [];
    addTemplate(bones, 'humanoid', fromRect(100, 100, 200, 400), 0.35);
    for (const b of bones) {
      const m = restWorld(bones, b);
      b.bind.forEach((v, i) => expect(v).toBeCloseTo(m[i], 9));
      for (const p of [originOf(m), tipOf(m, b)]) {
        expect(p.x).toBeGreaterThanOrEqual(100 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(300 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(100 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(500 + 1e-6);
      }
    }
  });

  it('builds four legs with a tail, and an arm of three bones', () => {
    const four: Bone[] = [];
    addTemplate(four, 'quadruped', fromRect(0, 0, 300, 200), 0.35);
    expect(four.length).toBe(18);
    expect(parentName(four, four.find((b) => b.name === 'Tail')!)).toBe('Hip');
    const arm: Bone[] = [];
    addTemplate(arm, 'arm', fromRect(0, 0, 300, 50), 0.35);
    expect(arm.map((b) => parentName(arm, b))).toEqual([null, 'Upper arm', 'Lower arm']);
  });

  it('runs an arm along the long side of the box', () => {
    const t = templateBones('arm', fromRect(0, 0, 40, 300));
    expect(Math.abs(t[0].to.y - t[0].from.y)).toBeGreaterThan(100);
  });

  it('numbers names that are taken and puts the next chain in the next color', () => {
    const bones: Bone[] = [];
    addTemplate(bones, 'arm', fromRect(0, 0, 300, 50), 0.35);
    addTemplate(bones, 'arm', fromRect(0, 100, 300, 50), 0.35);
    expect(bones[3].name).toBe('Upper arm 2');
    expect(bones[3].color).not.toBe(bones[0].color);
  });

  it('centers on the stage at 60 percent of its height', () => {
    const b = stageBox(1920, 1080);
    expect(b.maxY - b.minY).toBeCloseTo(648);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(960);
  });
});
