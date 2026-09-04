import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Bone, Doc, PathItem } from '$lib/core/types';
import { identity } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { makeDoc, makeLayer } from '$lib/editor/editor';
import { restWorld } from './bones';
import { autoWeights } from './skin';
import { skinRepairs } from './repair';

function bone(id: string, parent: string | null, x: number, length: number): Bone {
  const radius = length * 0.35;
  return { id, name: id, parent, x, y: 0, length, radius, rotation: 0, bind: identity(), pinned: false, color: '#fff' };
}

// a rig layer with two bones and a bound rectangle on the layer below
function rigged(): Doc {
  const doc = makeDoc(400, 300, 24);
  const rig = makeLayer('Rig', '#fff', 'rig');
  rig.bones = [bone('a', null, 0, 100), bone('b', 'a', 100, 100)];
  for (const b of rig.bones) b.bind = restWorld(rig.bones, b);
  const item = makePathItem('arm', rectPath(0, -10, 200, 20), defaultStyle(solid('#000000'), null));
  item.skin = { weights: autoWeights(item, identity(), rig.bones), rigid: null };
  doc.layers[0].keyframes[0].items.push(item);
  doc.layers.push(rig);
  return doc;
}

function apply(prev: Doc, next: Doc): Doc {
  const fix = skinRepairs(prev, next);
  return fix ? produce(next, fix) : next;
}

function armOf(doc: Doc): PathItem {
  return doc.layers[0].keyframes[0].items[0] as PathItem;
}

describe('skin repairs', () => {
  it('leaves a document alone when nothing broke', () => {
    const doc = rigged();
    const next = produce(doc, (d) => {
      d.name = 'x';
    });
    expect(skinRepairs(doc, next)).toBeNull();
  });

  it('unbinds the items when the rig layer goes', () => {
    const doc = rigged();
    const next = apply(
      doc,
      produce(doc, (d) => {
        d.layers.pop();
      })
    );
    expect(armOf(next).skin).toBeNull();
  });

  it('drops a removed bone from the weights and keeps them summed to 1', () => {
    const doc = rigged();
    const next = apply(
      doc,
      produce(doc, (d) => {
        d.layers[1].bones.splice(1, 1);
      })
    );
    const weights = armOf(next).skin!.weights;
    expect(weights.length).toBe(4);
    for (const list of weights) {
      expect(list.every((w) => w.bone === 'a')).toBe(true);
      expect(list.reduce((s, w) => s + w.w, 0)).toBeCloseTo(1);
    }
  });

  it('weighs the anchors again when their number changed', () => {
    const doc = rigged();
    const next = apply(
      doc,
      produce(doc, (d) => {
        const arm = d.layers[0].keyframes[0].items[0] as PathItem;
        arm.path.anchors.splice(1, 0, { x: 100, y: -10, ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' });
      })
    );
    expect(armOf(next).skin!.weights.length).toBe(5);
  });
});
