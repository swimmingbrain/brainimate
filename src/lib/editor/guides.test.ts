import { beforeEach, describe, expect, it } from 'vitest';
import { editor } from './editor';
import { addGuide, clearGuides, finishGuideDrag, guideAt, guideState, moveGuide, removeGuide } from './guides';

describe('guides', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
  });

  it('adds, moves and removes guides with undo', () => {
    addGuide('h', 100.004);
    addGuide('v', 250);
    expect(editor.doc.guides).toEqual({ h: [100], v: [250] });
    moveGuide('v', 0, 260);
    expect(editor.doc.guides.v).toEqual([260]);
    removeGuide('h', 0);
    expect(editor.doc.guides.h).toEqual([]);
    editor.undo();
    expect(editor.doc.guides.h).toEqual([100]);
    clearGuides();
    expect(editor.doc.guides).toEqual({ h: [], v: [] });
  });

  it('finds the guide near a point within a few screen pixels', () => {
    addGuide('h', 100);
    addGuide('v', 300);
    expect(guideAt({ x: 10, y: 102 }, 1)).toEqual({ axis: 'h', index: 0 });
    expect(guideAt({ x: 297, y: 400 }, 1)).toEqual({ axis: 'v', index: 0 });
    expect(guideAt({ x: 10, y: 110 }, 1)).toBeNull();
    // zoomed in the same distance is too far
    expect(guideAt({ x: 10, y: 102 }, 4)).toBeNull();
  });

  it('a drag that ends on the ruler removes the guide, a new one is added', () => {
    guideState.drag = { axis: 'v', index: -1, value: 42, remove: false };
    finishGuideDrag();
    expect(editor.doc.guides.v).toEqual([42]);
    guideState.drag = { axis: 'v', index: 0, value: 0, remove: true };
    finishGuideDrag();
    expect(editor.doc.guides.v).toEqual([]);
  });
});
