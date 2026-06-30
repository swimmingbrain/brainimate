import { beforeEach, describe, expect, it } from 'vitest';
import { editor } from './editor';
import { collectCandidates, snapPoint, snapToCandidates, type SnapCandidates } from './snap';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { fromRect } from '$lib/core/bbox';
import { translate } from '$lib/core/mat';
import { defaultPreferences, preferences } from '$lib/stores/preferences';

function prefs() {
  const p = defaultPreferences();
  p.snapping = { enabled: true, points: true, objects: true, pixels: false, smartGuides: true };
  p.guides.snap = true;
  p.guides.show = true;
  p.grid.snap = false;
  return p;
}

describe('snap math', () => {
  const c: SnapCandidates = {
    xs: [{ value: 100, kind: 'guide' }],
    ys: [{ value: 50, kind: 'anchor' }],
    grid: null
  };

  it('pulls a point onto the closest line on each axis within the tolerance', () => {
    const r = snapToCandidates({ x: 97, y: 54 }, c, 6);
    expect(r).toMatchObject({ x: 100, y: 50 });
    expect(r.lines).toHaveLength(2);
    expect(r.label).toBe('guide');
    const far = snapToCandidates({ x: 90, y: 60 }, c, 6);
    expect(far).toMatchObject({ x: 90, y: 60, lines: [], label: null });
  });

  it('snaps the edges or the middle of a box that moves with the point', () => {
    // the box right edge sits at 98, so the point moves by 2
    const r = snapToCandidates({ x: 10, y: 0 }, c, 6, fromRect(48, 100, 50, 10));
    expect(r.x).toBe(12);
    expect(r.lines[0]).toEqual({ axis: 'x', value: 100, kind: 'guide' });
  });

  it('falls back to the grid and only moves along one axis when asked', () => {
    const grid = { xs: [], ys: [], grid: 20 };
    expect(snapToCandidates({ x: 38, y: 63 }, grid, 6)).toMatchObject({ x: 40, y: 60 });
    expect(snapToCandidates({ x: 38, y: 63 }, grid, 6, null, 'x')).toMatchObject({ x: 40, y: 63 });
  });
});

describe('snap candidates', () => {
  beforeEach(() => {
    editor.newDoc(800, 600, 24);
    editor.commit('Guides', (d) => {
      d.guides.v.push(300);
      d.guides.h.push(120);
    });
  });

  it('collects guides, the stage and the bounds and anchors of the items', () => {
    const item = makePathItem('box', rectPath(0, 0, 100, 50), defaultStyle(), translate(10, 20));
    editor.insertItem(editor.activeLayer()!.id, item);
    const c = collectCandidates(prefs(), new Set());
    const xs = c.xs.map((t) => `${t.kind}:${t.value}`);
    expect(xs).toContain('guide:300');
    expect(xs).toContain('stage:800');
    expect(xs).toContain('center:400');
    expect(xs).toContain('edge:110');
    expect(xs).toContain('center:60');
    expect(xs).toContain('anchor:10');
    expect(c.ys.map((t) => `${t.kind}:${t.value}`)).toContain('guide:120');
  });

  it('leaves out excluded items and what the preferences turn off', () => {
    const item = makePathItem('box', rectPath(0, 0, 100, 50), defaultStyle(), translate(10, 20));
    editor.insertItem(editor.activeLayer()!.id, item);
    const without = collectCandidates(prefs(), new Set([item.id]));
    expect(without.xs.some((t) => t.value === 110)).toBe(false);
    const p = prefs();
    p.snapping.smartGuides = false;
    p.grid.snap = true;
    const plain = collectCandidates(p, new Set());
    expect(plain.xs.map((t) => t.kind)).toEqual(['guide']);
    expect(plain.grid).toBe(p.grid.size);
    p.snapping.enabled = false;
    expect(collectCandidates(p, new Set()).xs).toHaveLength(0);
  });

  it('snaps a dragged point onto a guide at the current zoom', () => {
    preferences.set(prefs());
    const r = snapPoint({ x: 296, y: 400 }, { zoom: 1 });
    expect(r.x).toBe(300);
    const zoomedOut = snapPoint({ x: 290, y: 400 }, { zoom: 0.5 });
    expect(zoomedOut.x).toBe(300);
  });
});
