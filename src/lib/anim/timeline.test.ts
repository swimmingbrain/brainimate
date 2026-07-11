import { describe, expect, it } from 'vitest';
import type { Item, Keyframe, Layer, PathItem } from '$lib/core/types';
import { cloneItem, makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { itemsAt, poseAt } from '$lib/render/frame';
import {
  clearKeyframe,
  docLength,
  insertBlankKeyframe,
  insertFrame,
  insertKeyframe,
  keyframeAt,
  nextKeyframe,
  removeFrame,
  setLabel,
  setTween
} from './timeline';

function key(frame: number, items: Item[] = [], tween: string | null = null): Keyframe {
  return { frame, items, pose: {}, tween: tween ? { ease: tween } : null, label: '' };
}

function layer(keys: Keyframe[], length: number, type: Layer['type'] = 'normal', id = 'l1'): Layer {
  return {
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    outline: false,
    color: '#5b7fc9',
    parent: null,
    keyframes: keys,
    length,
    bones: []
  };
}

function box(x: number, id = 'box'): PathItem {
  const item = makePathItem('Rectangle', rectPath(-5, -5, 10, 10), defaultStyle(), translate(x, 0));
  item.id = id;
  return item;
}

function frames(l: Layer): number[] {
  return l.keyframes.map((k) => k.frame);
}

// a box at x 0 on frame 0 moving to x 100 on frame 10, tweened linearly
function moving(): Layer {
  const a = box(0);
  const b = cloneItem(a);
  b.transform = translate(100, 0);
  return layer([key(0, [a], 'linear'), key(10, [b])], 15);
}

describe('frames', () => {
  it('finds the keyframe holding a frame and the next one', () => {
    const l = layer([key(0), key(5), key(9)], 12);
    expect(keyframeAt(l, 7)?.frame).toBe(5);
    expect(nextKeyframe(l, 5)?.frame).toBe(9);
    expect(nextKeyframe(l, 9)).toBeNull();
  });

  it('inserts frames after a frame and pushes later keyframes', () => {
    const l = layer([key(0), key(5)], 8);
    insertFrame(l, 2, 3);
    expect(frames(l)).toEqual([0, 8]);
    expect(l.length).toBe(11);
    // on a keyframe the frame goes after it, the keyframe stays
    insertFrame(l, 8);
    expect(frames(l)).toEqual([0, 8]);
    expect(l.length).toBe(12);
  });

  it('stretches the layer when a frame is inserted at or past the end', () => {
    const l = layer([key(0)], 4);
    insertFrame(l, 3);
    expect(l.length).toBe(5);
    insertFrame(l, 20);
    expect(l.length).toBe(21);
  });

  it('removes a frame, shortens the span and drops a one frame keyframe', () => {
    const l = layer([key(0), key(5), key(6)], 10);
    removeFrame(l, 2);
    expect(frames(l)).toEqual([0, 4, 5]);
    expect(l.length).toBe(9);
    removeFrame(l, 4);
    expect(frames(l)).toEqual([0, 4]);
    expect(l.length).toBe(8);
    // past the end nothing happens, a layer keeps its last frame
    removeFrame(l, 30);
    expect(l.length).toBe(8);
    const one = layer([key(0)], 1);
    removeFrame(one, 0);
    expect(one.length).toBe(1);
  });

  it('moves the next keyframe onto frame 0 when the first one goes', () => {
    const l = layer([key(0), key(1, [box(0)])], 4);
    removeFrame(l, 0);
    expect(frames(l)).toEqual([0]);
    expect(l.keyframes[0].items).toHaveLength(1);
    expect(l.length).toBe(3);
  });

  it('is as long as the longest layer', () => {
    const doc = { layers: [layer([key(0)], 4), layer([key(0)], 9, 'normal', 'l2'), layer([key(0)], 30, 'folder', 'f')] };
    expect(docLength(doc as never)).toBe(9);
  });
});

describe('keyframes', () => {
  it('tweens a box halfway at frame 5', () => {
    const l = moving();
    expect(itemsAt(l, 5)[0].transform[4]).toBeCloseTo(50);
    expect(itemsAt(l, 10)[0].transform[4]).toBeCloseTo(100);
    expect(itemsAt(l, 12)[0].transform[4]).toBeCloseTo(100);
    expect(itemsAt(l, 15)).toHaveLength(0);
  });

  it('gives the same objects for the same frame', () => {
    const l = moving();
    expect(itemsAt(l, 4)).toBe(itemsAt(l, 4));
  });

  it('eases the tween', () => {
    const l = moving();
    setTween(l, 3, 'in');
    expect(itemsAt(l, 5)[0].transform[4]).toBeLessThan(50);
    setTween(l, 0, null);
    expect(itemsAt(l, 5)[0].transform[4]).toBeCloseTo(0);
  });

  it('freezes the in between state when a keyframe goes into a tween and tweens on', () => {
    const l = moving();
    const k = insertKeyframe(l, 5);
    expect(k.items[0].transform[4]).toBeCloseTo(50);
    expect(k.tween?.ease).toBe('linear');
    expect(frames(l)).toEqual([0, 5, 10]);
    expect(itemsAt(l, 7)[0].transform[4]).toBeCloseTo(70);
    // an existing keyframe is kept
    expect(insertKeyframe(l, 5)).toBe(k);
  });

  it('copies the last keyframe past the end and stretches the layer', () => {
    const l = layer([key(0, [box(3)])], 4);
    const k = insertKeyframe(l, 9);
    expect(k.items[0].transform[4]).toBe(3);
    expect(k.items[0]).not.toBe(l.keyframes[0].items[0]);
    expect(k.tween).toBeNull();
    expect(l.length).toBe(10);
  });

  it('copies the tweened pose on a rig layer', () => {
    const l = layer(
      [
        { ...key(0, [], 'linear'), pose: { arm: { rotation: 0, x: 0, y: 0, scale: 1 } } },
        { ...key(4), pose: { arm: { rotation: 1, x: 8, y: 0, scale: 1 } } }
      ],
      6,
      'rig'
    );
    expect(poseAt(l, 2).arm.rotation).toBeCloseTo(0.5);
    const k = insertKeyframe(l, 2);
    expect(k.pose.arm.x).toBeCloseTo(4);
  });

  it('inserts a blank keyframe that shows nothing', () => {
    const l = layer([key(0, [box(0)])], 10);
    insertBlankKeyframe(l, 4);
    expect(itemsAt(l, 3)).toHaveLength(1);
    expect(itemsAt(l, 6)).toHaveLength(0);
  });

  it('clears a keyframe so the one before holds through, but never the first', () => {
    const l = layer([key(0, [box(0)]), key(4)], 10);
    expect(clearKeyframe(l, 4)).toBe(true);
    expect(itemsAt(l, 6)).toHaveLength(1);
    expect(clearKeyframe(l, 0)).toBe(false);
    expect(clearKeyframe(l, 3)).toBe(false);
  });

  it('labels the keyframe whose span holds the frame', () => {
    const l = layer([key(0), key(4)], 10);
    setLabel(l, 6, '  walk ');
    expect(l.keyframes[1].label).toBe('walk');
  });
});
