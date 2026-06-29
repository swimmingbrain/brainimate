import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { booleanSelection, setGradientAngle, setPaint, shownPaint, swapColors } from './commands';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { translate } from '$lib/core/mat';
import { makeGradient } from '$lib/core/gradient';
import { fillPaint, selection } from '$lib/stores/app';
import type { PathItem } from '$lib/core/types';

const BW = [
  { t: 0, color: '#ffffff', alpha: 1 },
  { t: 1, color: '#000000', alpha: 1 }
];

function first(): PathItem {
  return editor.layerItems(editor.doc.layers[0])[0] as PathItem;
}

describe('paint commands', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    const item = makePathItem('box', rectPath(0, 0, 200, 100), defaultStyle(solid('#ff0000'), solid('#0000ff')));
    editor.insertItem(editor.activeLayer()!.id, item);
    selection.set(new Set([item.id]));
  });

  it('lays a new gradient across the selected shape and keeps the current one unplaced', () => {
    setPaint('fill', makeGradient('linear', BW));
    expect(first().style.fill).toMatchObject({ type: 'linear', x1: 0, y1: 50, x2: 200, y2: 50 });
    expect(get(fillPaint)).toMatchObject({ type: 'linear', x1: 0, x2: 0 });
  });

  it('keeps the place of a gradient when only its stops change', () => {
    setPaint('fill', makeGradient('linear', BW));
    setGradientAngle('fill', 90);
    const placed = first().style.fill;
    expect(placed).toMatchObject({ x1: 100, x2: 100 });
    setPaint('fill', { ...makeGradient('linear', BW), stops: [{ t: 0, color: '#00ff00', alpha: 1 }, BW[1]] });
    const after = first().style.fill;
    expect(after).toMatchObject({ x1: 100, x2: 100 });
    expect(after?.type === 'linear' && after.stops[0].color).toBe('#00ff00');
  });

  it('shows the paint of the selection and swaps fill and stroke on it', () => {
    expect(shownPaint('fill')).toEqual(solid('#ff0000'));
    swapColors();
    expect(first().style.fill).toEqual(solid('#0000ff'));
    selection.set(new Set());
    expect(shownPaint('fill')).toEqual(get(fillPaint));
  });

  it('folds quick color changes into one undo step', () => {
    setPaint('fill', solid('#111111'));
    setPaint('fill', solid('#222222'));
    editor.undo();
    expect(first().style.fill).toEqual(solid('#ff0000'));
  });

  it('a divided piece keeps its gradient where it was on the page', async () => {
    const upper = makePathItem('up', rectPath(-50, -50, 100, 100), defaultStyle(), translate(100, 50));
    editor.insertItem(editor.activeLayer()!.id, upper);
    selection.set(new Set([upper.id]));
    setPaint('fill', makeGradient('linear', BW));
    // the gradient runs from x -50 to 50 in its own space, that is 50 to 150 on the page
    selection.set(new Set([first().id, upper.id]));
    await booleanSelection('divide');
    const pieces = editor.layerItems(editor.doc.layers[0]) as PathItem[];
    const fromUpper = pieces.filter((p) => p.style.fill?.type === 'linear');
    expect(fromUpper.length).toBeGreaterThan(0);
    for (const p of fromUpper) expect(p.style.fill).toMatchObject({ x1: 50, x2: 150 });
  });
});
