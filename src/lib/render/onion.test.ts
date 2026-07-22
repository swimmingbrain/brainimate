import { describe, expect, it } from 'vitest';
import type { Keyframe, Layer } from '$lib/core/types';
import { onionAlpha, onionFrames } from './onion';

function layer(frames: number[], length: number, visible = true): Layer {
  const keyframes: Keyframe[] = frames.map((frame) => ({ frame, items: [], pose: {}, tween: null, label: '' }));
  return {
    id: String(Math.random()),
    name: 'l',
    type: 'normal',
    visible,
    locked: false,
    outline: false,
    color: '#5b7fc9',
    parent: null,
    keyframes,
    length,
    bones: []
  };
}

describe('onion skin', () => {
  it('takes the frames next to the playhead inside the animation', () => {
    expect(onionFrames([], 1, 3, 2, false, 3)).toEqual({ before: [0], after: [2] });
    expect(onionFrames([], 5, 2, 2, false, 20)).toEqual({ before: [4, 3], after: [6, 7] });
  });

  it('takes the keyframes of the visible layers with keyframes only', () => {
    const layers = [layer([0, 4, 9], 12), layer([0, 6], 12), layer([0, 2, 7], 12, false)];
    expect(onionFrames(layers, 5, 2, 2, true, 12)).toEqual({ before: [4, 0], after: [6, 9] });
  });

  it('fades with the distance and never quite vanishes', () => {
    expect(onionAlpha(1)).toBeCloseTo(0.5);
    expect(onionAlpha(2)).toBeCloseTo(0.35);
    expect(onionAlpha(3)).toBeCloseTo(0.2);
    expect(onionAlpha(9)).toBeCloseTo(0.05);
  });
});
