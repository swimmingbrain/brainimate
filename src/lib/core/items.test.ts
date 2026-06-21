import { describe, expect, it } from 'vitest';
import { contourOf, contours, itemBounds, localBounds, makePathItem, withContour } from './items';
import { rectPath } from './shapes';
import { defaultStyle } from './style';
import { translate } from './mat';

describe('items', () => {
  it('bounds a path item around its subpaths too', () => {
    const item = makePathItem('ring', rectPath(0, 0, 10, 10), defaultStyle(), translate(5, 0), [rectPath(12, 2, 3, 3)]);
    expect(localBounds(item)).toEqual({ minX: 0, minY: 0, maxX: 15, maxY: 10 });
    expect(itemBounds(item, item.transform)).toEqual({ minX: 5, minY: 0, maxX: 20, maxY: 10 });
  });

  it('numbers the contours from the outline', () => {
    const hole = rectPath(2, 2, 2, 2);
    const item = makePathItem('ring', rectPath(0, 0, 10, 10), defaultStyle(), undefined, [hole]);
    expect(contours(item)).toHaveLength(2);
    expect(contourOf(item, 1)).toBe(hole);
    expect(contourOf(item, 2)).toBeNull();
    const moved = withContour(item, 1, rectPath(3, 3, 2, 2));
    expect(moved.subpaths[0].anchors[0].x).toBe(3);
    expect(item.subpaths[0]).toBe(hole);
  });
});
