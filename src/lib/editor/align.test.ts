import { beforeEach, describe, expect, it } from 'vitest';
import { editor } from './editor';
import { alignMoves, alignSelection, alignToStage, distributeMoves, distributeSelection } from './align';
import { fromRect } from '$lib/core/bbox';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { selection } from '$lib/stores/app';

describe('align math', () => {
  const boxes = [fromRect(10, 0, 10, 10), fromRect(40, 20, 20, 10), fromRect(100, 50, 10, 30)];

  it('lines boxes up on an edge or the middle', () => {
    const to = fromRect(10, 0, 100, 80);
    expect(alignMoves(boxes, 'left', to).map((m) => m.x)).toEqual([0, -30, -90]);
    expect(alignMoves(boxes, 'right', to).map((m) => m.x)).toEqual([90, 50, 0]);
    expect(alignMoves(boxes, 'vcenter', to).map((m) => m.y)).toEqual([35, 15, -25]);
    expect(alignMoves(boxes, 'top', to).every((m) => m.x === 0)).toBe(true);
  });

  it('spreads the middles evenly between the outer two', () => {
    const moves = distributeMoves(boxes, 'hcenters');
    // middles at 15, 50 and 105 become 15, 60 and 105
    expect(moves.map((m) => m.x)).toEqual([0, 10, 0]);
  });

  it('makes the gaps between the boxes the same', () => {
    const moves = distributeMoves(boxes, 'hspace');
    // 100 wide with 40 of boxes leaves two gaps of 30
    expect(moves.map((m) => m.x)).toEqual([0, 10, 0]);
    const down = distributeMoves(boxes, 'vspace');
    // 80 high with 50 of boxes, gaps of 15
    expect(down.map((m) => m.y)).toEqual([0, 5, 0]);
  });

  it('spreads over a span when one is given', () => {
    const moves = distributeMoves([fromRect(0, 0, 10, 10), fromRect(20, 0, 10, 10)], 'hspace', fromRect(0, 0, 100, 10));
    expect(moves.map((m) => m.x)).toEqual([0, 70]);
  });
});

describe('align commands', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    alignToStage.set(false);
  });

  function add(x: number, y: number, w: number) {
    const item = makePathItem('r', rectPath(0, 0, w, 20), defaultStyle(), translate(x, y));
    editor.insertItem(editor.activeLayer()!.id, item);
    return item.id;
  }

  it('aligns three rects to the left edge of the leftmost one in one step', () => {
    const ids = [add(50, 10, 30), add(120, 60, 40), add(300, 200, 10)];
    selection.set(new Set(ids));
    alignSelection('left');
    for (const id of ids) expect(editor.itemWorldBounds(id).minX).toBeCloseTo(50);
    expect(editor.history.undoLabel).toBe('Align left');
    editor.undo();
    expect(editor.itemWorldBounds(ids[1]).minX).toBeCloseTo(120);
  });

  it('aligns one item to the stage and distributes needs three', () => {
    const id = add(50, 10, 30);
    selection.set(new Set([id]));
    alignSelection('hcenter');
    expect(editor.itemWorldBounds(id).minX).toBeCloseTo(385);
    const before = editor.history.length;
    distributeSelection('hcenters');
    expect(editor.history.length).toBe(before);
  });
});
