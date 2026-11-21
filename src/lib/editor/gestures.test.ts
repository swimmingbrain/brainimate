import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_MS,
  GestureTracker,
  HOLD_MS,
  LONG_PRESS_MS,
  pinchView,
  type GestureAction,
  type GestureOptions,
  type PointerKind
} from './gestures';

type Data = string;

function setup(opts: Partial<GestureOptions> = {}) {
  const options: GestureOptions = { fingers: 'draw', tapToTool: true, longPress: true, ...opts };
  const g = new GestureTracker<Data>(() => options);
  const p = (id: number, x: number, y: number, t: number, kind: PointerKind = 'touch') => ({
    id,
    kind,
    x,
    y,
    t,
    data: `${id}@${x},${y}`
  });
  return { g, p, options };
}

const types = (list: GestureAction<Data>[]) => list.map((a) => a.type);

describe('one finger in draw mode', () => {
  it('waits for the hold, then gives the tool the press and every point since', () => {
    const { g, p } = setup();
    expect(g.down(p(1, 0, 0, 0))).toEqual([]);
    expect(g.move(p(1, 2, 0, 30))).toEqual([]);
    expect(g.deadline()).toBe(HOLD_MS);
    const flushed = g.tick(HOLD_MS);
    expect(flushed).toEqual([
      { type: 'tool-down', data: '1@0,0' },
      { type: 'tool-move', data: '1@2,0' }
    ]);
    expect(types(g.move(p(1, 40, 0, 150)))).toEqual(['tool-move']);
    expect(g.up(p(1, 40, 0, 200))).toEqual([{ type: 'tool-up', data: '1@40,0' }]);
  });

  it('starts the stroke at once when the finger moves before the hold', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.move(p(1, 3, 0, 10));
    expect(g.move(p(1, 30, 0, 20))).toEqual([
      { type: 'tool-down', data: '1@0,0' },
      { type: 'tool-move', data: '1@3,0' },
      { type: 'tool-move', data: '1@30,0' }
    ]);
  });

  it('hands a quick tap to the tool in one go', () => {
    const { g, p } = setup();
    g.down(p(1, 5, 5, 0));
    expect(types(g.up(p(1, 6, 5, 60)))).toEqual(['tool-down', 'tool-up']);
  });

  it('makes a double tap of two taps close together', () => {
    const { g, p } = setup();
    g.down(p(1, 5, 5, 0));
    g.up(p(1, 5, 5, 50));
    g.down(p(2, 8, 6, 150));
    expect(types(g.up(p(2, 8, 6, 200)))).toEqual(['tool-down', 'tool-up', 'double-tap']);
    // a third tap starts over
    g.down(p(3, 8, 6, 260));
    expect(types(g.up(p(3, 8, 6, 300)))).toEqual(['tool-down', 'tool-up']);
  });

  it('keeps two taps apart when they are too slow or too far', () => {
    const { g, p } = setup();
    g.down(p(1, 5, 5, 0));
    g.up(p(1, 5, 5, 50));
    g.down(p(2, 5, 5, 50 + DOUBLE_TAP_MS + 100));
    expect(types(g.up(p(2, 5, 5, DOUBLE_TAP_MS + 200)))).not.toContain('double-tap');
    g.down(p(3, 200, 5, DOUBLE_TAP_MS + 260));
    expect(types(g.up(p(3, 200, 5, DOUBLE_TAP_MS + 300)))).not.toContain('double-tap');
  });
});

describe('two fingers', () => {
  it('make a pinch and never reach the tool when they land within the hold', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.move(p(1, 1, 0, 20));
    expect(g.down(p(2, 100, 0, 60))).toEqual([{ type: 'pinch-start' }]);
    const moved = g.move(p(2, 140, 0, 90));
    expect(moved).toEqual([
      { type: 'pinch', a0: expect.objectContaining({ x: 1 }), b0: expect.objectContaining({ x: 100 }), a1: expect.objectContaining({ x: 1 }), b1: expect.objectContaining({ x: 140 }) }
    ]);
    expect(types(g.up(p(1, 1, 0, 200)))).toEqual(['pinch-end']);
    expect(g.up(p(2, 140, 0, 210))).toEqual([]);
    // the next finger draws again
    g.down(p(3, 0, 0, 400));
    expect(types(g.tick(400 + HOLD_MS))).toEqual(['tool-down']);
  });

  it('drop a stroke the tool already started', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.move(p(1, 50, 0, 30));
    expect(g.down(p(2, 100, 100, 300))).toEqual([{ type: 'tool-cancel', data: '1@50,0' }, { type: 'pinch-start' }]);
    // the first finger moving on is part of the pinch now, not of a stroke
    expect(types(g.move(p(1, 60, 0, 320)))).toEqual(['pinch']);
  });

  it('tapped together undo, three fingers redo', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.down(p(2, 50, 0, 20));
    g.up(p(1, 0, 0, 120));
    expect(g.up(p(2, 50, 0, 140))).toEqual([{ type: 'multi-tap', fingers: 2 }]);
    g.down(p(3, 0, 0, 500));
    g.down(p(4, 50, 0, 510));
    g.down(p(5, 100, 0, 520));
    g.up(p(3, 0, 0, 600));
    g.up(p(4, 50, 0, 610));
    expect(g.up(p(5, 100, 0, 620))).toEqual([{ type: 'multi-tap', fingers: 3 }]);
  });

  it('are no tap when they moved or stayed down long', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.down(p(2, 50, 0, 20));
    g.move(p(2, 90, 0, 60));
    g.up(p(1, 0, 0, 100));
    expect(types(g.up(p(2, 90, 0, 120)))).not.toContain('multi-tap');
    g.down(p(3, 0, 0, 500));
    g.down(p(4, 50, 0, 510));
    g.up(p(3, 0, 0, 1200));
    expect(types(g.up(p(4, 50, 0, 1210)))).not.toContain('multi-tap');
  });
});

describe('the pencil', () => {
  it('reaches the tool at once, without the hold', () => {
    const { g, p } = setup({ fingers: 'navigate' });
    expect(g.down(p(9, 0, 0, 0, 'pen'))).toEqual([{ type: 'tool-down', data: '9@0,0' }]);
    expect(types(g.move(p(9, 1, 0, 5, 'pen')))).toEqual(['tool-move']);
    expect(types(g.up(p(9, 30, 0, 50, 'pen')))).toEqual(['tool-up']);
  });

  it('ignores the hand that rests on the screen while it draws', () => {
    const { g, p } = setup();
    g.down(p(9, 0, 0, 0, 'pen'));
    expect(g.down(p(1, 300, 300, 10))).toEqual([]);
    expect(g.move(p(1, 340, 300, 20))).toEqual([]);
    expect(types(g.move(p(9, 30, 0, 30, 'pen')))).toEqual(['tool-move']);
    expect(g.up(p(1, 340, 300, 40))).toEqual([]);
    expect(types(g.up(p(9, 30, 0, 50, 'pen')))).toEqual(['tool-up']);
  });

  it('takes over from a finger stroke and from a pinch', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.move(p(1, 40, 0, 20));
    expect(types(g.down(p(9, 5, 5, 30, 'pen')))).toEqual(['tool-cancel', 'tool-down']);
    g.up(p(9, 5, 5, 60, 'pen'));
    expect(g.up(p(1, 40, 0, 70))).toEqual([]);
    g.down(p(2, 0, 0, 100));
    g.down(p(3, 80, 0, 110));
    expect(types(g.down(p(9, 5, 5, 130, 'pen')))).toEqual(['pinch-end', 'tool-down']);
  });
});

describe('navigate mode', () => {
  it('pans with one finger and taps the tool without a stroke', () => {
    const { g, p } = setup({ fingers: 'navigate' });
    g.down(p(1, 0, 0, 0));
    expect(g.move(p(1, 4, 0, 10))).toEqual([]);
    expect(g.move(p(1, 20, 5, 20))).toEqual([{ type: 'pan', dx: 16, dy: 5 }]);
    expect(g.move(p(1, 25, 5, 30))).toEqual([{ type: 'pan', dx: 5, dy: 0 }]);
    expect(g.up(p(1, 25, 5, 40))).toEqual([]);
    g.down(p(2, 7, 7, 400));
    expect(types(g.up(p(2, 7, 7, 450)))).toEqual(['tool-down', 'tool-up']);
  });

  it('leaves a tap out for the tools that only draw', () => {
    const { g, p } = setup({ fingers: 'navigate', tapToTool: false });
    g.down(p(1, 7, 7, 0));
    expect(g.up(p(1, 7, 7, 50))).toEqual([]);
  });
});

describe('a long press', () => {
  it('drops what the tool started and asks for the menu', () => {
    const { g, p } = setup();
    g.down(p(1, 10, 10, 0));
    g.tick(HOLD_MS);
    expect(g.deadline()).toBe(LONG_PRESS_MS);
    expect(g.tick(LONG_PRESS_MS)).toEqual([
      { type: 'tool-cancel', data: '1@10,10' },
      { type: 'long-press', data: '1@10,10' }
    ]);
    // nothing more reaches the tool until the finger is lifted
    expect(g.move(p(1, 60, 10, 600))).toEqual([]);
    expect(g.up(p(1, 60, 10, 700))).toEqual([]);
  });

  it('does not come while the press moves or for the drawing tools', () => {
    const { g, p } = setup();
    g.down(p(1, 10, 10, 0));
    g.move(p(1, 40, 10, 50));
    expect(types(g.tick(LONG_PRESS_MS + 10))).toEqual([]);
    g.up(p(1, 40, 10, 700));
    const drawing = setup({ longPress: false });
    drawing.g.down(drawing.p(1, 10, 10, 0, 'pen'));
    expect(drawing.g.tick(LONG_PRESS_MS + 10)).toEqual([]);
  });

  it('works with the pencil and in navigate mode', () => {
    const pen = setup();
    pen.g.down(pen.p(9, 10, 10, 0, 'pen'));
    expect(types(pen.g.tick(LONG_PRESS_MS))).toEqual(['tool-cancel', 'long-press']);
    const nav = setup({ fingers: 'navigate' });
    nav.g.down(nav.p(1, 10, 10, 0));
    expect(nav.g.tick(LONG_PRESS_MS)).toEqual([{ type: 'long-press', data: '1@10,10' }]);
  });
});

describe('a cancelled pointer', () => {
  it('never leaves a stroke behind', () => {
    const { g, p } = setup();
    g.down(p(1, 0, 0, 0));
    g.move(p(1, 50, 0, 20));
    expect(g.cancel(p(1, 50, 0, 30))).toEqual([{ type: 'tool-cancel', data: '1@50,0' }]);
    g.down(p(2, 0, 0, 100));
    expect(g.cancel(p(2, 0, 0, 120))).toEqual([]);
  });
});

describe('pinchView', () => {
  const start = { zoom: 1, panX: 0, panY: 0 };

  it('zooms by the spread around the middle of the fingers', () => {
    const v = pinchView(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 });
    expect(v.zoom).toBeCloseTo(2);
    // the world point under the middle stays under it
    expect((150 - v.panX) / v.zoom).toBeCloseTo(150);
    expect((100 - v.panY) / v.zoom).toBeCloseTo(100);
  });

  it('pans when the fingers move together', () => {
    const v = pinchView(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 130, y: 140 }, { x: 230, y: 140 });
    expect(v).toEqual({ zoom: 1, panX: 30, panY: 40 });
  });

  it('keeps the zoom in range and survives fingers on one spot', () => {
    expect(pinchView(start, { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 499, y: 0 }, { x: 500, y: 0 }).zoom).toBe(1);
    expect(pinchView({ zoom: 60, panX: 0, panY: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }).zoom).toBe(64);
  });
});
