import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import {
  booleanSelection,
  breakApart,
  joinSelectedPaths,
  outlineSelectedStrokes,
  simplifySelectedPaths,
  smoothSelectedPaths
} from './commands';
import { makePathItem } from '$lib/core/items';
import { linePath, rectPath } from '$lib/core/shapes';
import { defaultStyle, solid } from '$lib/core/style';
import { identity, translate } from '$lib/core/mat';
import { pathArea } from '$lib/core/path';
import { selection } from '$lib/stores/app';
import { setGroup } from '$lib/stores/preferences';
import type { PathItem } from '$lib/core/types';

function items(): PathItem[] {
  return editor.layerItems(editor.doc.layers[0]) as PathItem[];
}

function add(...list: PathItem[]) {
  editor.insertItems(editor.activeLayer()!.id, list, 'Add');
  selection.set(new Set(list.map((it) => it.id)));
}

describe('path commands', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    setGroup('timeline', { autoKey: true });
  });

  it('unites two rects into one path with the style of the bottom one', async () => {
    const a = makePathItem('a', rectPath(0, 0, 100, 100), defaultStyle(solid('#ff0000')));
    const b = makePathItem('b', rectPath(-50, -50, 100, 100), defaultStyle(solid('#00ff00')), translate(100, 100));
    add(a, b);
    await booleanSelection('unite');
    expect(items()).toHaveLength(1);
    const out = items()[0];
    expect(Math.abs(pathArea(out.path))).toBeCloseTo(17500, 0);
    expect(out.style.fill).toEqual(solid('#ff0000'));
    expect(get(selection).has(out.id)).toBe(true);
    expect(editor.history.undoLabel).toBe('Unite');
    editor.undo();
    expect(items()).toHaveLength(2);
  });

  it('subtracts the upper paths from the bottom one', async () => {
    add(
      makePathItem('a', rectPath(0, 0, 100, 100), defaultStyle()),
      makePathItem('b', rectPath(80, 40, 50, 20), defaultStyle())
    );
    await booleanSelection('subtract');
    expect(items()).toHaveLength(1);
    expect(Math.abs(pathArea(items()[0].path))).toBeCloseTo(9600, 0);
  });

  it('a hole made by subtract breaks apart into two paths', async () => {
    add(
      makePathItem('a', rectPath(0, 0, 100, 100), defaultStyle()),
      makePathItem('b', rectPath(40, 40, 20, 20), defaultStyle())
    );
    await booleanSelection('subtract');
    expect(items()).toHaveLength(1);
    breakApart();
    expect(items()).toHaveLength(2);
  });

  it('joins two open paths and closes a single one', () => {
    add(
      makePathItem('a', linePath(0, 0, 10, 0), defaultStyle()),
      makePathItem('b', linePath(10, 0, 10, 10), defaultStyle())
    );
    joinSelectedPaths();
    expect(items()).toHaveLength(1);
    expect(items()[0].path.anchors).toHaveLength(3);
    joinSelectedPaths();
    expect(items()[0].path.closed).toBe(true);
  });

  it('outlines a stroke into a filled shape in the stroke color', async () => {
    const style = defaultStyle(null, solid('#123456'), 10);
    style.cap = 'butt';
    add(makePathItem('line', linePath(0, 0, 100, 0), style, identity()));
    await outlineSelectedStrokes();
    const out = items();
    expect(out).toHaveLength(1);
    expect(out[0].style.stroke).toBeNull();
    expect(out[0].style.fill).toEqual(solid('#123456'));
    expect(Math.abs(pathArea(out[0].path))).toBeCloseTo(1000, 0);
  });

  it('simplifies and smooths the selected paths', () => {
    const pts = [];
    for (let i = 0; i <= 50; i++) pts.push({ x: i * 4, y: 0, ix: 0, iy: 0, ox: 0, oy: 0, kind: 'corner' as const });
    add(makePathItem('dense', { anchors: pts, closed: false }, defaultStyle()));
    simplifySelectedPaths();
    expect(items()[0].path.anchors).toHaveLength(2);
    smoothSelectedPaths();
    expect(items()[0].path.anchors.every((a) => a.kind === 'smooth')).toBe(true);
  });
});
