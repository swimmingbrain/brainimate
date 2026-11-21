import { beforeEach, describe, expect, it } from 'vitest';
import type { Item, Layer } from '$lib/core/types';
import { applyPoint } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { rigFor } from '$lib/rig/bones';
import { poseAt, resolveItems } from '$lib/render/frame';
import { characterLayers, defaultCharacter } from '$lib/character/model';
import { faceAt } from '$lib/character/anim';
import { editor } from './editor';
import { frame, selection } from '$lib/stores/app';
import { createCharacter } from './character';
import { applyTemplate, giveItem, handshake, hug, lookAt, pointAtCharacter, react, waveTo, walkTo } from './interact';

const W = 1080;
const H = 1920;

function two() {
  const a = createCharacter({ ...defaultCharacter(W, H), name: 'Ann', x: 250, height: 700 })!;
  const b = createCharacter({ ...defaultCharacter(W, H), name: 'Ben', x: 850, height: 700, facing: -1 })!;
  return { a, b };
}

const hipX = (id: string, at: number) => {
  const rig = characterLayers(editor.doc.layers, id)!.rig!;
  const hip = rig.bones.find((b) => b.name === 'Hip')!;
  return rigFor(editor.doc.layers, at)!.world.get(hip.id)![4];
};
const handTip = (id: string, side: string, at: number) => {
  const rig = characterLayers(editor.doc.layers, id)!.rig!;
  const hand = rig.bones.find((b) => b.name === `Hand ${side}`)!;
  return applyPoint(rigFor(editor.doc.layers, at)!.world.get(hand.id)!, { x: hand.length * 0.6, y: 0 });
};
const lastFrame = () => Math.max(...editor.doc.layers.map((l) => l.length)) - 1;
// the character looks right on the screen
const looksRight = (id: string, at: number) => {
  const parts = characterLayers(editor.doc.layers, id)!;
  const hip = parts.rig!.bones.find((b) => b.name === 'Hip')!;
  const sx = poseAt(parts.rig!, at)[hip.id]?.sx ?? 1;
  return parts.folder.character!.face.facing * Math.sign(sx) > 0;
};

function product(x: number, y: number): string {
  const item = makePathItem('Product', rectPath(x - 30, y - 45, 60, 90), defaultStyle(solid('#c94f3d'), solid('#1d1b19'), 4));
  editor.commit('product', (d) => {
    const layer = d.layers.find((l) => l.type === 'normal' && !l.parent) as Layer;
    layer.keyframes[0].items.push(item as Item);
  });
  return item.id;
}

describe('characters together', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('two characters move on their own: a walk of one leaves the other where it is', () => {
    const { a, b } = two();
    const bx = hipX(b, 0);
    expect(walkTo(a, 600)).toBe(true);
    const end = lastFrame();
    expect(hipX(a, end)).toBeCloseTo(600, -1);
    expect(hipX(b, end)).toBeCloseTo(bx, 5);
    // one undo step
    editor.undo();
    expect(lastFrame()).toBeLessThan(end);
  });

  it('turn to look at each other', () => {
    const { a, b } = two();
    // ann looks right toward ben already, ben left toward ann; ann walks past ben and looks back
    walkTo(a, 1000);
    frame.set(lastFrame());
    expect(looksRight(a, editor.frame)).toBe(true);
    lookAt(a, b);
    expect(looksRight(a, lastFrame())).toBe(false);
  });

  it('shake hands: they walk together and both near hands meet in the middle', () => {
    const { a, b } = two();
    expect(handshake(a, b)).toBe(true);
    const parts = characterLayers(editor.doc.layers, a)!;
    // somewhere along the timeline the two hands are close
    let best = Infinity;
    for (let f = 0; f <= lastFrame(); f++) {
      const p = handTip(a, 'R', f);
      const q = handTip(b, 'R', f);
      best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    }
    expect(best).toBeLessThan(60);
    expect(faceAt(parts.body, lastFrame()).emotion).toBe('happy');
  });

  it('hand an object over: it goes from the first character to the second one', () => {
    const { a, b } = two();
    const id = product(400, 1200);
    selection.set(new Set([id]));
    expect(applyTemplate(a, 'take')).toBe(true);
    const took = lastFrame();
    const near = (who: string, f: number) => {
      const layer = editor.doc.layers.find((l) => resolveItems(l, f).some((i) => i.id === id))!;
      const item = resolveItems(layer, f).find((i) => i.id === id)!;
      return characterLayers(editor.doc.layers, who)!.rig!.bones.some((x) => x.id === item.skin?.rigid);
    };
    expect(near(a, took)).toBe(true);
    frame.set(took);
    expect(giveItem(a, b, id)).toBe(true);
    const end = lastFrame();
    expect(near(b, end)).toBe(true);
    expect(near(a, end)).toBe(false);
    // b holds it: the product follows b's hand
    const tip = handTip(b, 'R', end);
    expect(tip.x).toBeGreaterThan(0);
  });

  it('wave, point, hug and react make keyframes and moods', () => {
    const { a, b } = two();
    expect(waveTo(a, b)).toBe(true);
    frame.set(lastFrame());
    expect(pointAtCharacter(b, a)).toBe(true);
    frame.set(lastFrame());
    expect(react(b, 'surprised')).toBe(true);
    expect(faceAt(characterLayers(editor.doc.layers, b)!.body, lastFrame()).emotion).toBe('surprised');
    frame.set(lastFrame());
    expect(hug(a, b)).toBe(true);
    expect(lookAt(a, a)).toBe(false);
  });

  it('templates: walk in from outside, walk toward the camera, leave', () => {
    const { a } = two();
    expect(applyTemplate(a, 'enter')).toBe(true);
    expect(hipX(a, 0)).toBeLessThan(0);
    expect(hipX(a, lastFrame())).toBeCloseTo(250, -1);
    frame.set(lastFrame());
    const rig = characterLayers(editor.doc.layers, a)!.rig!;
    const hip = rig.bones.find((x) => x.name === 'Hip')!;
    expect(applyTemplate(a, 'toward')).toBe(true);
    expect(poseAt(characterLayers(editor.doc.layers, a)!.rig!, lastFrame())[hip.id].scale).toBeGreaterThan(1.2);
    frame.set(lastFrame());
    expect(applyTemplate(a, 'leave')).toBe(true);
    expect(hipX(a, lastFrame())).toBeGreaterThan(W);
    // present needs something in the hand
    expect(applyTemplate(a, 'present')).toBe(false);
  });
});

describe('the cast', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
  });

  it('groups characters into a folder, moves a group together and folds the others away', async () => {
    const { groupCharacters, groupMembers, shiftCharacters, focusCharacter } = await import('./cast');
    const { collapsedFolders } = await import('$lib/stores/app');
    const { get } = await import('svelte/store');
    const { a, b } = two();
    const g = groupCharacters([a, b], 'Shop people')!;
    expect(groupMembers(g).sort()).toEqual([a, b].sort());
    // the rigs and bodies stay inside their characters
    expect(characterLayers(editor.doc.layers, a)!.rig).toBeTruthy();
    const ax = hipX(a, 0);
    const bx = hipX(b, 0);
    shiftCharacters([a, b], 100);
    expect(hipX(a, 0)).toBeCloseTo(ax + 100, 5);
    expect(hipX(b, 0)).toBeCloseTo(bx + 100, 5);
    focusCharacter(a);
    expect(get(collapsedFolders).has(b)).toBe(true);
    expect(get(collapsedFolders).has(a)).toBe(false);
  });
});
