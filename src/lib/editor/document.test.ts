import { beforeEach, describe, expect, it } from 'vitest';
import type { Bone, Item } from '$lib/core/types';
import { applyPoint, identity, translate } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { editor, makeDoc, makeLayer } from './editor';
import { rigFor, restWorld } from '$lib/rig/bones';
import { posed } from '$lib/rig/skin';
import { applyDocSettings, fitMatrix, scaleContent } from './document';

function bone(id: string, parent: string | null, x: number, y: number, length: number, rotation = 0): Bone {
  const radius = length * 0.35;
  return { id, name: id, parent, x, y, length, radius, rotation, bind: identity(), pinned: false, color: '#fff' };
}

// a two bone arm on a rig layer, a rect bound rigidly to the second bone and posed on frame 0
function rigged() {
  const doc = makeDoc(200, 100, 24);
  const rig = makeLayer('Rig', '#fff', 'rig');
  rig.bones = [bone('a', null, 20, 50, 60), bone('b', 'a', 60, 0, 40, 0.3)];
  for (const b of rig.bones) b.bind = restWorld(rig.bones, b);
  rig.keyframes[0].pose = { b: { rotation: 0.5, x: 3, y: -2, scale: 1 } };
  doc.layers.push(rig);
  const item = makePathItem('Hand', rectPath(0, 0, 10, 10), defaultStyle(), translate(100, 40));
  item.skin = { weights: [], rigid: 'b' };
  doc.layers[0].keyframes[0].items.push(item);
  return { doc, item };
}

function shownCorner(layers: ReturnType<typeof rigged>['doc']['layers'], item: Item) {
  const shown = posed(item, identity(), rigFor(layers, 0)!);
  return applyPoint(shown.transform, { x: 10, y: 10 });
}

describe('document settings', () => {
  beforeEach(() => editor.newDoc(800, 600, 24));

  it('fits the old stage into the new one in the middle', () => {
    expect(fitMatrix(200, 100, 400, 200)).toEqual([2, 0, 0, 2, 0, 0]);
    expect(fitMatrix(200, 100, 400, 400)).toEqual([2, 0, 0, 2, 0, 100]);
    expect(fitMatrix(100, 100, 50, 100)).toEqual([0.5, 0, 0, 0.5, 0, 25]);
  });

  it('scales items and guides with the stage', () => {
    const doc = makeDoc(200, 100, 24);
    const item = makePathItem('Rect', rectPath(0, 0, 10, 10), defaultStyle(), translate(100, 50));
    doc.layers[0].keyframes[0].items.push(item);
    doc.guides = { h: [50], v: [10] };
    scaleContent(doc, fitMatrix(200, 100, 400, 400));
    expect(doc.layers[0].keyframes[0].items[0].transform).toEqual([2, 0, 0, 2, 200, 200]);
    expect(doc.guides).toEqual({ h: [200], v: [20] });
  });

  it('keeps a posed rig and what is bound to it in place, only scaled', () => {
    const { doc: rest, item } = rigged();
    const before = shownCorner(rest.layers, item);
    const m = fitMatrix(200, 100, 300, 150);
    // a copy, the rig and the posed shapes are cached per object like immer hands them out
    const doc = structuredClone(rest);
    scaleContent(doc, m);
    const after = shownCorner(doc.layers, doc.layers[0].keyframes[0].items[0]);
    const want = applyPoint(m, before);
    expect(after.x).toBeCloseTo(want.x, 6);
    expect(after.y).toBeCloseTo(want.y, 6);
    const tip = rigFor(doc.layers, 0)!.world.get('a')!;
    expect(applyPoint(tip, { x: 0, y: 0 }).x).toBeCloseTo(applyPoint(m, { x: 20, y: 50 }).x, 6);
    expect(m[0]).toBe(1.5);
  });

  it('applies name, size, rate and background as one undo step', () => {
    applyDocSettings({ name: ' Walk ', width: 1000.4, height: 0, fps: 300, bg: '#000000', scaleContent: false });
    expect(editor.doc.name).toBe('Walk');
    expect(editor.doc.width).toBe(1000);
    expect(editor.doc.height).toBe(1);
    expect(editor.doc.fps).toBe(120);
    expect(editor.doc.bg).toBe('#000000');
    editor.undo();
    expect(editor.doc.width).toBe(800);
    expect(editor.doc.name).toBe('Untitled');
  });
});
