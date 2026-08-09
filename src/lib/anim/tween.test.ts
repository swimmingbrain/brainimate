import { describe, expect, it } from 'vitest';
import type { GroupItem, InstanceItem, PathItem, TextItem } from '$lib/core/types';
import { cloneItem, makeInstance, makePathItem, makeTextItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { compose, decompose, multiply, rotate, scale, translate } from '$lib/core/mat';
import { angleDelta, rebaseEdit, tweenItem, tweenItems, tweenPaint, tweenPose, tweenTransform } from './tween';

function rect(x = 0, y = 0): PathItem {
  return makePathItem('Rectangle', rectPath(-10, -10, 20, 20), defaultStyle(solid('#000000'), null), translate(x, y));
}

function moved(item: PathItem, x: number, y: number): PathItem {
  const c = cloneItem(item);
  c.transform = translate(x, y);
  return c;
}

describe('tween transforms', () => {
  it('moves halfway at t 0.5', () => {
    const m = tweenTransform(translate(0, 0), translate(100, 40), 0.5);
    expect(m[4]).toBeCloseTo(50);
    expect(m[5]).toBeCloseTo(20);
  });

  it('turns the short way round', () => {
    expect(angleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2);
    const a = rotate((170 * Math.PI) / 180);
    const b = rotate((-170 * Math.PI) / 180);
    const d = decompose(tweenTransform(a, b, 0.5));
    expect(Math.abs(d.rotation)).toBeCloseTo(Math.PI);
  });

  it('scales and skews in between and lands on b', () => {
    const a = compose({ x: 10, y: 0, rotation: 0.3, scaleX: 1, scaleY: 2, skew: 0 });
    const b = compose({ x: 30, y: 10, rotation: 0.9, scaleX: 3, scaleY: 1, skew: 0.4 });
    const mid = decompose(tweenTransform(a, b, 0.5));
    expect(mid.scaleX).toBeCloseTo(2);
    expect(mid.scaleY).toBeCloseTo(1.5);
    expect(mid.skew).toBeCloseTo(0.2);
    expect(mid.rotation).toBeCloseTo(0.6);
    const end = tweenTransform(a, b, 1);
    b.forEach((n, i) => expect(end[i]).toBeCloseTo(n));
  });

  it('gives back the same matrix when nothing moves', () => {
    const a = multiply(translate(5, 5), scale(2));
    expect(tweenTransform(a, [...a] as typeof a, 0.4)).toBe(a);
  });
});

describe('tween items', () => {
  it('matches items by id and holds the ones the next keyframe lacks', () => {
    const a = rect(0, 0);
    const lonely = rect(500, 0);
    const b = moved(a, 100, 0);
    const out = tweenItems([a, lonely], [b], 0.25);
    expect(out[0].transform[4]).toBeCloseTo(25);
    expect(out[1]).toBe(lonely);
  });

  it('keeps the path object when only the transform tweens', () => {
    const a = rect();
    const b = moved(a, 50, 0) as PathItem;
    const mid = tweenItem(a, b, 0.5) as PathItem;
    expect(mid.path).toBe(a.path);
    expect(mid.style).toBe(a.style);
  });

  it('blends anchors and handles when the counts match', () => {
    const a = rect();
    const b = cloneItem(a);
    b.path = rectPath(-20, -20, 40, 40);
    b.path.anchors[0].ox = 10;
    const mid = tweenItem(a, b, 0.5) as PathItem;
    expect(mid.path.anchors[0].x).toBeCloseTo(-15);
    expect(mid.path.anchors[0].ox).toBeCloseTo(5);
  });

  it('holds the path of a when the anchor counts differ', () => {
    const a = rect();
    const b = cloneItem(a);
    b.path.anchors.pop();
    b.transform = translate(10, 0);
    const mid = tweenItem(a, b, 0.5) as PathItem;
    expect(mid.path).toBe(a.path);
    expect(mid.transform[4]).toBeCloseTo(5);
  });

  it('blends each subpath that keeps its anchor count', () => {
    const a = rect();
    a.subpaths = [rectPath(-2, -2, 4, 4), rectPath(5, 5, 2, 2)];
    const b = cloneItem(a);
    b.subpaths[0] = rectPath(-4, -4, 8, 8);
    b.subpaths[1].anchors.pop();
    const mid = tweenItem(a, b, 0.5) as PathItem;
    expect(mid.subpaths[0].anchors[0].x).toBeCloseTo(-3);
    expect(mid.subpaths[1]).toBe(a.subpaths[1]);
  });

  it('mixes solid colors, alpha, width and dash', () => {
    const a = rect();
    a.style = { ...defaultStyle(solid('#000000', 1), solid('#ff0000')), width: 2, dash: [4, 2] };
    const b = cloneItem(a);
    b.style.fill = solid('#ffffff', 0);
    b.style.width = 6;
    b.style.dash = [8, 6];
    const mid = tweenItem(a, b, 0.5) as PathItem;
    expect(mid.style.fill).toEqual({ type: 'solid', color: '#808080', alpha: 0.5 });
    expect(mid.style.stroke).toBe(a.style.stroke);
    expect(mid.style.width).toBeCloseTo(4);
    expect(mid.style.dash).toEqual([6, 4]);
  });

  it('blends gradients only with the same number of stops', () => {
    const g = (c: string, n: number) => ({
      type: 'linear' as const,
      stops: Array.from({ length: n }, (_, i) => ({ t: i / Math.max(1, n - 1), color: c, alpha: 1 })),
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0
    });
    const mid = tweenPaint(g('#000000', 2), { ...g('#ffffff', 2), x2: 200 }, 0.5);
    expect(mid?.type === 'linear' && mid.stops[0].color).toBe('#808080');
    expect(mid?.type === 'linear' && mid.x2).toBeCloseTo(150);
    const a = g('#000000', 2);
    expect(tweenPaint(a, g('#ffffff', 3), 0.5)).toBe(a);
    const s = solid('#000000');
    expect(tweenPaint(s, a, 0.5)).toBe(s);
  });

  it('goes into groups by child id', () => {
    const child = rect();
    const group: GroupItem = {
      id: 'g',
      name: 'Group',
      type: 'group',
      transform: translate(0, 0),
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'normal',
      children: [child],
      skin: null
    };
    const later = cloneItem(group);
    later.opacity = 0;
    (later.children[0] as PathItem).transform = translate(0, 40);
    const mid = tweenItem(group, later, 0.5) as GroupItem;
    expect(mid.opacity).toBeCloseTo(0.5);
    expect(mid.children[0].transform[5]).toBeCloseTo(20);
  });

  it('blends the move, first frame, alpha and tint of an instance', () => {
    const a = makeInstance('s', 'Ball', translate(0, 0));
    const b = { ...cloneItem(a), transform: translate(100, 0), first: 4, alpha: 0.2, tint: '#ff0000', tintAmount: 1 };
    const mid = tweenItem(a, b, 0.5) as InstanceItem;
    expect(mid.transform[4]).toBeCloseTo(50);
    expect(mid.first).toBe(2);
    expect(mid.alpha).toBeCloseTo(0.6);
    // the tint fades in from nothing
    expect(mid.tint).toBe('#ff0000');
    expect(mid.tintAmount).toBeCloseTo(0.5);
  });

  it('blends the size, spacing and width of box text', () => {
    const a = makeTextItem('Hi', 'Inter', 20, defaultStyle(solid('#000000'), null), translate(0, 0), 100);
    const b = { ...cloneItem(a), size: 40, spacing: 4, width: 200, style: defaultStyle(solid('#ffffff'), null) };
    const mid = tweenItem(a, b, 0.5) as TextItem;
    expect([mid.size, mid.spacing, mid.width]).toEqual([30, 2, 150]);
    expect(mid.style.fill?.type === 'solid' && mid.style.fill.color).toBe('#808080');
  });
});

describe('tween poses', () => {
  it('blends bone deltas and treats a missing bone as rest', () => {
    const a = { arm: { rotation: 0.2, x: 0, y: 0, scale: 1 } };
    const b = { arm: { rotation: 0.6, x: 10, y: 0, scale: 2 }, leg: { rotation: 1, x: 0, y: 0, scale: 1 } };
    const mid = tweenPose(a, b, 0.5);
    expect(mid.arm.rotation).toBeCloseTo(0.4);
    expect(mid.arm.x).toBeCloseTo(5);
    expect(mid.arm.scale).toBeCloseTo(1.5);
    expect(mid.leg.rotation).toBeCloseTo(0.5);
  });
});

describe('rebase an edit', () => {
  it('moves the keyframe item by the move made on the shown one', () => {
    const key = rect(0, 0);
    const shown = moved(key, 50, 0);
    const edited = moved(key, 60, 5);
    const out = rebaseEdit(key, shown, edited);
    expect(out.transform[4]).toBeCloseTo(10);
    expect(out.transform[5]).toBeCloseTo(5);
    expect((out as PathItem).path).toEqual(key.path);
  });

  it('takes a changed style as it is', () => {
    const key = rect();
    const shown = cloneItem(key);
    const edited = cloneItem(key);
    edited.style.fill = solid('#ff0000');
    const out = rebaseEdit(key, shown, edited) as PathItem;
    expect(out.style.fill).toEqual(solid('#ff0000'));
    expect(out.transform).toEqual(key.transform);
  });
});
