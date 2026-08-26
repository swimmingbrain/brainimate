import { describe, expect, it } from 'vitest';
import type { Bone, Mat, PathData, PathItem } from '$lib/core/types';
import { identity, multiply, rotate, translate } from '$lib/core/mat';
import { makePathItem } from '$lib/core/items';
import { flattenPath, makeAnchor, pathBounds } from '$lib/core/path';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { makeRig, restWorld, worldMatrices } from './bones';
import { anchorList, autoWeights, bindItem, deform, posed, refinePath, restContour } from './skin';

function bone(id: string, parent: string | null, x: number, y: number, length: number): Bone {
  return { id, name: id, parent, x, y, length, radius: length * 0.35, rotation: 0, bind: identity(), pinned: false, color: '#fff' };
}

// two bones along y = 0: a from 0 to 100, b from 100 to 200, bound at rest
function arm(): Bone[] {
  const bones = [bone('a', null, 0, 0, 100), bone('b', 'a', 100, 0, 100)];
  for (const b of bones) b.bind = restWorld(bones, b);
  return bones;
}

function dot(x: number, y: number): PathItem {
  return makePathItem('p', { anchors: [makeAnchor(x, y)], closed: false }, defaultStyle(solid('#000000'), null));
}

function shape(path: PathData): PathItem {
  return makePathItem('s', path, defaultStyle(solid('#000000'), null));
}

function sum(list: { w: number }[]): number {
  return list.reduce((s, x) => s + x.w, 0);
}

describe('auto weights', () => {
  it('gives a point on a bone all its weight', () => {
    const [w] = autoWeights(dot(50, 0), identity(), arm());
    expect(w).toEqual([{ bone: 'a', w: 1 }]);
  });

  it('splits a point near the joint between both bones', () => {
    const [w] = autoWeights(dot(100, 10), identity(), arm());
    expect(w.map((x) => x.bone).sort()).toEqual(['a', 'b']);
    expect(sum(w)).toBeCloseTo(1);
    expect(w[0].w).toBeCloseTo(0.5);
  });

  it('falls back to the closest bone when no reach gets there', () => {
    const [w] = autoWeights(dot(20, 500), identity(), arm());
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].bone).toBe('a');
    expect(sum(w)).toBeCloseTo(1);
  });

  it('keeps at most four bones per anchor', () => {
    const bones = [0, 1, 2, 3, 4, 5].map((i) => bone('b' + i, null, i * 2, 0, 1));
    for (const b of bones) b.bind = restWorld(bones, b);
    const [w] = autoWeights(dot(5, 0), identity(), bones);
    expect(w.length).toBeLessThanOrEqual(4);
    expect(sum(w)).toBeCloseTo(1);
  });
});

describe('deform', () => {
  it('leaves a shape as it is at the bind pose', () => {
    const bones = arm();
    const item = shape(rectPath(10, -20, 180, 40, 10));
    item.skin = { weights: autoWeights(item, identity(), bones), rigid: null };
    const out = deform(item, makeRig(bones, {}), identity());
    out.path.anchors.forEach((a, i) => {
      const r = item.path.anchors[i];
      for (const k of ['x', 'y', 'ix', 'iy', 'ox', 'oy'] as const) expect(a[k]).toBeCloseTo(r[k], 9);
    });
  });

  it('moves a rigid item by its bone times the inverse bind', () => {
    const bones = arm();
    const item = shape(rectPath(120, -10, 40, 20));
    item.skin = { weights: [], rigid: 'b' };
    const pose = { a: { rotation: 0.4, x: 0, y: 0, scale: 1 }, b: { rotation: -0.7, x: 0, y: 0, scale: 1 } };
    const rig = makeRig(bones, pose);
    const delta: Mat = multiply(worldMatrices(bones, pose).get('b')!, [1, 0, 0, 1, -100, 0]);
    const out = deform(item, rig, translate(5, 5));
    const m = multiply(delta, translate(5, 5));
    out.path.anchors.forEach((a, i) => {
      const r = item.path.anchors[i];
      expect(a.x).toBeCloseTo(m[0] * r.x + m[2] * r.y + m[4], 9);
      expect(a.y).toBeCloseTo(m[1] * r.x + m[3] * r.y + m[5], 9);
    });
  });

  it('bends the far end, leaves the near end and keeps smooth handles in line', () => {
    const bones = arm();
    const item = shape(refinePath(rectPath(0, -15, 200, 30, 10), identity(), 25));
    item.skin = { weights: autoWeights(item, identity(), bones), rigid: null };
    const rig = makeRig(bones, { b: { rotation: Math.PI / 3, x: 0, y: 0, scale: 1 } });
    const out = deform(item, rig, identity());
    const anchors = item.path.anchors;
    let smooth = 0;
    out.path.anchors.forEach((a, i) => {
      if (anchors[i].x < 50) {
        expect(a.x).toBeCloseTo(anchors[i].x, 6);
        expect(a.y).toBeCloseTo(anchors[i].y, 6);
      }
      if (anchors[i].kind === 'smooth' && (a.ix || a.iy) && (a.ox || a.oy)) {
        expect(a.ix * a.oy - a.iy * a.ox).toBeCloseTo(0, 6);
        expect(a.ix * a.ox + a.iy * a.oy).toBeLessThan(0);
        smooth++;
      }
    });
    expect(smooth).toBeGreaterThan(4);
    const tip = out.path.anchors[anchors.findIndex((a) => a.x === 190 && a.y === 15)];
    expect(tip.y).toBeGreaterThan(60);
  });
});

describe('refine', () => {
  it('splits long segments and keeps the outline where it was', () => {
    const rect = rectPath(0, 0, 200, 40, 8);
    const fine = refinePath(rect, identity(), 25);
    expect(fine.anchors.length).toBeGreaterThan(rect.anchors.length + 8);
    const a = pathBounds(rect);
    const b = pathBounds(fine);
    expect(b.minX).toBeCloseTo(a.minX);
    expect(b.maxY).toBeCloseTo(a.maxY);
    for (const p of flattenPath(fine, 0.2)) {
      const onEdge = Math.abs(p.y) < 0.3 || Math.abs(p.y - 40) < 0.3 || p.x < 8.5 || p.x > 191.5;
      expect(onEdge).toBe(true);
    }
  });
});

describe('editing a bent shape', () => {
  it('carries an edit back through the blend, unchanged anchors keep their rest', () => {
    const bones = arm();
    const item = shape(refinePath(rectPath(0, -15, 200, 30), identity(), 40));
    item.skin = { weights: autoWeights(item, identity(), bones), rigid: null };
    const rig = makeRig(bones, { b: { rotation: 0.8, x: 0, y: 0, scale: 1 } });
    const shown = posed(item, identity(), rig) as PathItem;
    const back = restContour(item, identity(), rig, 0, shown.path);
    back.anchors.forEach((a, i) => {
      expect(a.x).toBeCloseTo(item.path.anchors[i].x, 6);
      expect(a.y).toBeCloseTo(item.path.anchors[i].y, 6);
    });
  });
});

describe('binding', () => {
  it('keeps a shape bound on a posed rig where it shows', () => {
    const bones = arm();
    const rig = makeRig(bones, { a: { rotation: 0.5, x: 0, y: 0, scale: 1 } });
    const item = shape(rectPath(30, 30, 150, 30));
    const bound = bindItem(item, identity(), bones, rig, 'smooth') as PathItem;
    expect(bound.skin?.weights.length).toBe(anchorList(bound).length);
    const shown = posed(bound, identity(), rig) as PathItem;
    const before = pathBounds(item.path);
    const after = pathBounds(shown.path);
    expect(after.minX).toBeCloseTo(before.minX, 4);
    expect(after.maxY).toBeCloseTo(before.maxY, 4);
  });

  it('binds a small shape inside one reach rigidly in auto mode', () => {
    const bones = arm();
    const item = shape(rectPath(140, -5, 20, 10));
    const bound = bindItem(item, identity(), bones, makeRig(bones, {}), 'auto');
    expect(bound.skin).toEqual({ weights: [], rigid: 'b' });
  });

  it('keeps a rigid item in place when bound on a posed rig', () => {
    const bones = arm();
    const rig = makeRig(bones, { b: { rotation: 1, x: 0, y: 0, scale: 1 } });
    const item = shape(rectPath(140, -5, 20, 10));
    item.transform = multiply(translate(3, 4), rotate(0.2));
    const bound = bindItem(item, identity(), bones, rig, 'rigid', 'b');
    const shown = posed(bound, identity(), rig);
    shown.transform.forEach((v, i) => expect(v).toBeCloseTo(item.transform[i], 9));
  });
});
