import { describe, expect, it } from 'vitest';
import type { Item, Keyframe, Layer, PathItem } from '$lib/core/types';
import { cloneItem, makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { itemsAt, poseAt } from '$lib/render/frame';
import {
  clearKeyframe,
  copyFrames,
  descendantIds,
  docLength,
  duplicateKeyframes,
  insertBlankKeyframe,
  insertFrame,
  insertKeyframe,
  isLayerLocked,
  isLayerShown,
  keyframeAt,
  layerDepth,
  layerRows,
  moveKeyframes,
  moveLayer,
  nextKeyframe,
  pasteFrames,
  removeFrame,
  reverseFrames,
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

describe('moving keyframes', () => {
  it('moves keyframes on several layers by the same amount', () => {
    const a = layer([key(0), key(4)], 8, 'normal', 'a');
    const b = layer([key(0), key(6)], 10, 'normal', 'b');
    moveKeyframes(
      [a, b],
      [
        { layer: 'a', frame: 4 },
        { layer: 'b', frame: 6 }
      ],
      2
    );
    expect(frames(a)).toEqual([0, 6]);
    expect(frames(b)).toEqual([0, 8]);
    // the last keyframe keeps its hold
    expect(a.length).toBe(10);
    expect(b.length).toBe(12);
  });

  it('overwrites the keyframe it lands on', () => {
    const l = layer([key(0), key(3, [box(1)]), key(5, [box(2, 'other')])], 8);
    moveKeyframes([l], [{ layer: 'l1', frame: 3 }], 2);
    expect(frames(l)).toEqual([0, 5]);
    expect(l.keyframes[1].items[0].id).toBe('box');
  });

  it('puts an empty keyframe on frame 0 when the first one moves away', () => {
    const l = layer([key(0, [box(0)])], 4);
    moveKeyframes([l], [{ layer: 'l1', frame: 0 }], 3);
    expect(frames(l)).toEqual([0, 3]);
    expect(l.keyframes[0].items).toHaveLength(0);
    expect(l.length).toBe(7);
  });

  it('never moves before frame 0', () => {
    const l = layer([key(0), key(2), key(5)], 8);
    moveKeyframes(
      [l],
      [
        { layer: 'l1', frame: 2 },
        { layer: 'l1', frame: 5 }
      ],
      -4
    );
    expect(frames(l)).toEqual([0, 3]);
  });

  it('duplicates keyframes and leaves the originals', () => {
    const l = layer([key(0, [box(0)]), key(4, [box(9)])], 6);
    duplicateKeyframes([l], [{ layer: 'l1', frame: 4 }], 4);
    expect(frames(l)).toEqual([0, 4, 8]);
    expect(l.keyframes[2].items[0]).not.toBe(l.keyframes[1].items[0]);
    expect(l.keyframes[2].items[0].transform[4]).toBe(9);
    expect(l.length).toBe(9);
  });
});

describe('copy and paste frames', () => {
  it('starts the copy with what shows at the first frame', () => {
    const l = moving();
    const clip = copyFrames([l], { layers: ['l1'], from: 5, to: 12 });
    expect(clip.length).toBe(8);
    expect(clip.rows[0].keys.map((k) => k.frame)).toEqual([0, 5]);
    expect(clip.rows[0].keys[0].items[0].transform[4]).toBeCloseTo(50);
    expect(clip.rows[0].keys[0].tween?.ease).toBe('linear');
  });

  it('pastes over the frames from the playhead and keeps what follows', () => {
    const l = layer([key(0, [box(0)]), key(10, [box(5)])], 20);
    const clip = copyFrames([l], { layers: ['l1'], from: 0, to: 1 });
    pasteFrames([l], clip, ['l1'], 4);
    expect(frames(l)).toEqual([0, 4, 6, 10]);
    expect(itemsAt(l, 7)[0].transform[4]).toBe(0);
    expect(l.length).toBe(20);
    // the same layer keeps the ids so tweens still match
    expect(l.keyframes[1].items[0].id).toBe('box');
  });

  it('gives pasted items new ids on another layer, the same in every keyframe', () => {
    const src = moving();
    const dst = layer([key(0)], 1, 'normal', 'l2');
    const clip = copyFrames([src, dst], { layers: ['l1'], from: 0, to: 14 });
    pasteFrames([src, dst], clip, ['l2'], 0);
    expect(frames(dst)).toEqual([0, 10]);
    const ids = dst.keyframes.map((k) => k.items[0].id);
    expect(ids[0]).not.toBe('box');
    expect(ids[0]).toBe(ids[1]);
    expect(dst.length).toBe(15);
    expect(itemsAt(dst, 5)[0].transform[4]).toBeCloseTo(50);
  });
});

describe('reverse frames', () => {
  it('plays a tween backwards', () => {
    const l = moving();
    reverseFrames([l], { layers: ['l1'], from: 0, to: 10 });
    // the keyframe after the range keeps the hold that follows
    expect(frames(l)).toEqual([0, 10, 11]);
    expect(itemsAt(l, 0)[0].transform[4]).toBeCloseTo(100);
    expect(itemsAt(l, 5)[0].transform[4]).toBeCloseTo(50);
    expect(itemsAt(l, 10)[0].transform[4]).toBeCloseTo(0);
    expect(l.keyframes[0].tween?.ease).toBe('linear');
    expect(l.keyframes[1].tween).toBeNull();
  });

  it('mirrors spans and leaves the frames after the range alone', () => {
    const l = layer([key(0, [box(0)]), key(2, [box(2)]), key(8, [box(8)])], 12);
    reverseFrames([l], { layers: ['l1'], from: 0, to: 4 });
    expect(frames(l)).toEqual([0, 3, 5, 8]);
    expect(itemsAt(l, 0)[0].transform[4]).toBe(2);
    expect(itemsAt(l, 3)[0].transform[4]).toBe(0);
    expect(itemsAt(l, 6)[0].transform[4]).toBe(2);
    expect(itemsAt(l, 9)[0].transform[4]).toBe(8);
  });

  it('keeps the tween that leads into the range', () => {
    const l = moving();
    reverseFrames([l], { layers: ['l1'], from: 4, to: 8 });
    expect(itemsAt(l, 2)[0].transform[4]).toBeCloseTo(20);
    expect(itemsAt(l, 3)[0].transform[4]).toBeCloseTo(30);
    expect(itemsAt(l, 4)[0].transform[4]).toBeCloseTo(80);
    expect(itemsAt(l, 6)[0].transform[4]).toBeCloseTo(60);
    expect(itemsAt(l, 8)[0].transform[4]).toBeCloseTo(40);
    expect(itemsAt(l, 9)[0].transform[4]).toBeCloseTo(90);
  });

  it('turns an ease round', () => {
    const l = moving();
    setTween(l, 0, 'in');
    reverseFrames([l], { layers: ['l1'], from: 0, to: 10 });
    expect(l.keyframes[0].tween?.ease).toBe('out');
  });
});

describe('folders', () => {
  // bottom first: c and b sit in f, a is at the top
  function tree(): Layer[] {
    const f = layer([key(0)], 1, 'folder', 'f');
    const b = { ...layer([key(0)], 1, 'normal', 'b'), parent: 'f' };
    const c = { ...layer([key(0)], 1, 'normal', 'c'), parent: 'f' };
    return [layer([key(0)], 1, 'normal', 'z'), c, b, f, layer([key(0)], 1, 'normal', 'a')];
  }

  const ids = (layers: Layer[]) => layers.map((l) => l.id);

  it('lists the content of a folder under it and hides it when collapsed', () => {
    const layers = tree();
    const rows = layerRows(layers, new Set());
    expect(rows.map((r) => r.layer.id + r.depth)).toEqual(['a0', 'f0', 'b1', 'c1', 'z0']);
    expect(layerRows(layers, new Set(['f'])).map((r) => r.layer.id)).toEqual(['a', 'f', 'z']);
    expect(descendantIds(layers, 'f')).toEqual(['c', 'b']);
    expect(layerDepth(layers, layers[1])).toBe(1);
  });

  it('hides and locks what is in a hidden or locked folder', () => {
    const layers = tree();
    layers[3].visible = false;
    layers[3].locked = true;
    expect(isLayerShown(layers, layers[1])).toBe(false);
    expect(isLayerLocked(layers, layers[2])).toBe(true);
    expect(isLayerShown(layers, layers[0])).toBe(true);
  });

  it('moves a layer into a folder, to the top of it', () => {
    const layers = tree();
    moveLayer(layers, 'a', 'f', 'into');
    expect(ids(layers)).toEqual(['z', 'c', 'b', 'a', 'f']);
    expect(layers.find((l) => l.id === 'a')?.parent).toBe('f');
    expect(layerRows(layers, new Set()).map((r) => r.layer.id)).toEqual(['f', 'a', 'b', 'c', 'z']);
  });

  it('moves a folder with its content and takes a layer out of it', () => {
    const layers = tree();
    moveLayer(layers, 'f', 'z', 'below');
    expect(ids(layers)).toEqual(['c', 'b', 'f', 'z', 'a']);
    moveLayer(layers, 'b', 'a', 'above');
    expect(ids(layers)).toEqual(['c', 'f', 'z', 'a', 'b']);
    expect(layers.find((l) => l.id === 'b')?.parent).toBeNull();
    // a folder never goes into itself
    moveLayer(layers, 'f', 'c', 'above');
    expect(ids(layers)).toEqual(['c', 'f', 'z', 'a', 'b']);
  });
});
