import { describe, expect, it } from 'vitest';
import { makeDoc } from '$lib/editor/editor';
import { docLength, insertFrame } from '$lib/anim/timeline';
import { exportFrames, exportRange, scaledSize } from './render';

describe('export frames', () => {
  it('counts the document length from its longest layer', () => {
    const doc = makeDoc(100, 100, 24);
    expect(docLength(doc)).toBe(1);
    insertFrame(doc.layers[0], 0, 9);
    expect(docLength(doc)).toBe(10);
  });

  it('takes all frames without a range and keeps a range inside the document', () => {
    expect(exportRange(10, null)).toEqual({ from: 0, to: 9 });
    expect(exportRange(10, { from: 2, to: 5 })).toEqual({ from: 2, to: 5 });
    expect(exportRange(10, { from: 7, to: 3 })).toEqual({ from: 3, to: 7 });
    expect(exportRange(10, { from: -4, to: 40 })).toEqual({ from: 0, to: 9 });
    expect(exportRange(0, null)).toEqual({ from: 0, to: 0 });
  });

  it('plays every frame once at the document rate', () => {
    expect(exportFrames({ from: 2, to: 6 }, 24, 24)).toEqual([2, 3, 4, 5, 6]);
  });

  it('skips frames at a lower rate and holds them at a higher one', () => {
    expect(exportFrames({ from: 0, to: 23 }, 24, 12)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    expect(exportFrames({ from: 0, to: 2 }, 12, 24)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(exportFrames({ from: 5, to: 5 }, 24, 10)).toEqual([5]);
  });

  it('scales the size and evens it out for video', () => {
    expect(scaledSize({ width: 1920, height: 1080 }, 0.5)).toEqual({ width: 960, height: 540 });
    expect(scaledSize({ width: 101, height: 51 }, 1, true)).toEqual({ width: 100, height: 50 });
    expect(scaledSize({ width: 3, height: 3 }, 0.1)).toEqual({ width: 1, height: 1 });
    expect(scaledSize({ width: 3, height: 3 }, 0.1, true)).toEqual({ width: 2, height: 2 });
  });
});
