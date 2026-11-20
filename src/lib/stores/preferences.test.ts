import { describe, expect, it } from 'vitest';
import { defaultPreferences, mergePreferences, offerComicPresets, visibleTools } from './preferences';
import { TOOL_IDS } from '$lib/tools/tool';

describe('mergePreferences', () => {
  it('gives the defaults for nothing stored', () => {
    expect(mergePreferences(null)).toEqual(defaultPreferences());
    expect(mergePreferences('not an object')).toEqual(defaultPreferences());
  });

  it('keeps stored values and fills in keys added later', () => {
    const merged = mergePreferences({ workspace: 'rig', grid: { show: true } });
    expect(merged.workspace).toBe('rig');
    expect(merged.grid.show).toBe(true);
    expect(merged.grid.size).toBe(20);
    expect(merged.grid.subdivisions).toBe(1);
    expect(merged.timeline).toEqual(defaultPreferences().timeline);
    expect(merged.general).toEqual(defaultPreferences().general);
  });

  it('drops values of the wrong type or outside the allowed set', () => {
    const merged = mergePreferences({
      workspace: 7,
      grid: { size: 'big', color: 'red', opacity: 500 },
      timeline: { fps: 1000, frameWidth: 1, onionStart: -1 },
      panels: { topTab: 'layers', hidden: ['color', 'nope', 'color'] },
      stage: { shade: 'pink', wheel: 'zoom' },
      pen: { anchorSize: 30, hitTolerance: 1 },
      general: { undoLimit: 5, startWith: 'somewhere' }
    });
    expect(merged.workspace).toBe('essentials');
    expect(merged.grid.size).toBe(20);
    expect(merged.grid.color).toBe('#8a8a94');
    expect(merged.grid.opacity).toBe(100);
    expect(merged.timeline.fps).toBe(120);
    expect(merged.timeline.frameWidth).toBe(4);
    expect(merged.timeline.onionStart).toBe(0.05);
    expect(merged.panels.topTab).toBe('properties');
    expect(merged.panels.hidden).toEqual(['color']);
    expect(merged.stage.shade).toBe('deep');
    expect(merged.stage.wheel).toBe('zoom');
    expect(merged.pen.anchorSize).toBe(9);
    expect(merged.pen.hitTolerance).toBe(4);
    expect(merged.general.undoLimit).toBe(20);
    expect(merged.general.startWith).toBe('blank');
  });

  it('keeps the toolbar order, fills in missing tools and leaves out unknown or repeated ones', () => {
    const merged = mergePreferences({ toolbar: { order: ['pen', 'select', 'laser', 'pen'], hidden: ['zoom', 'zoom', 'x'] } });
    expect(merged.toolbar.order.slice(0, 2)).toEqual(['pen', 'select']);
    expect(merged.toolbar.order).toHaveLength(TOOL_IDS.length);
    expect(new Set(merged.toolbar.order).size).toBe(TOOL_IDS.length);
    expect(merged.toolbar.hidden).toEqual(['zoom']);
    expect(visibleTools(merged)).not.toContain('zoom');
    expect(visibleTools(merged)[0]).toBe('pen');
  });

  it('turns the older list of visible tools into an order with the rest hidden', () => {
    const merged = mergePreferences({ toolbar: { tools: ['brush', 'select'] } });
    expect(merged.toolbar.order.slice(0, 2)).toEqual(['brush', 'select']);
    expect(visibleTools(merged)).toEqual(['brush', 'select']);
    expect(merged.toolbar.hidden).toHaveLength(TOOL_IDS.length - 2);
  });

  it('keeps shortcut overrides that are strings, an empty one takes a key away', () => {
    const merged = mergePreferences({ shortcuts: { 'tool.pen': 'Q', 'tool.brush': 4, 'tool.zoom': '' } });
    expect(merged.shortcuts).toEqual({ 'tool.pen': 'Q', 'tool.zoom': '' });
  });

  it('keeps recent colors that are hex and recent commands, once each', () => {
    const merged = mergePreferences({
      recentColors: ['#ff0000', 'red', '#ff0000', '#00ff00', 5],
      recentCommands: ['edit.undo', 'edit.undo', 3, 'view.grid']
    });
    expect(merged.recentColors).toEqual(['#ff0000', '#00ff00']);
    expect(merged.recentCommands).toEqual(['edit.undo', 'view.grid']);
  });

  it('keeps pen presets that are whole and puts their numbers in range', () => {
    const merged = mergePreferences({
      pens: {
        brush: [
          { id: 'a', name: 'Big', size: 9000, smoothing: 50, pressure: true, mode: 'behind' },
          { id: 'b', name: 'Broken' },
          { id: 'a', name: 'Twice', size: 3, smoothing: 1, pressure: false, mode: 'normal' },
          { id: 'c', name: 'Odd mode', size: 3, smoothing: 1, pressure: false, mode: 'sideways' }
        ]
      }
    });
    expect(merged.pens.brush.map((b) => b.id)).toEqual(['a', 'c']);
    expect(merged.pens.brush[0].size).toBe(500);
    expect(merged.pens.brush[1].mode).toBe('normal');
    expect(merged.pens.pencil).toEqual(defaultPreferences().pens.pencil);
  });

  it('keeps saved workspaces with their fields set right', () => {
    const merged = mergePreferences({
      workspaces: [
        { id: 'w1', name: 'Mine', hidden: ['rig', 'bogus'], timeline: false, topTab: 'rig', dockWidth: 9999 },
        { name: 'no id' }
      ]
    });
    expect(merged.workspaces).toHaveLength(1);
    const w = merged.workspaces[0];
    expect(w.hidden).toEqual(['rig']);
    expect(w.timeline).toBe(false);
    expect(w.topTab).toBe('rig');
    expect(w.bottomTab).toBe('color');
    expect(w.dockWidth).toBe(520);
    expect(w.toolbarSide).toBe('left');
  });
});

describe('comic defaults', () => {
  it('turn on the comic palette and the safe zones', () => {
    const p = defaultPreferences();
    expect(p.swatches.comic).toBe(true);
    expect(p.stage.safeZones).toBe(true);
    // a choice made before stays
    const off = mergePreferences({ swatches: { comic: false }, stage: { safeZones: false } });
    expect(off.swatches.comic).toBe(false);
    expect(off.stage.safeZones).toBe(false);
    // preferences saved before the comic palette existed get it
    expect(mergePreferences({ grid: { show: true } }).swatches.comic).toBe(true);
  });

  it('give saved pen presets the comic ones once, after their own and with their default', () => {
    const stored = {
      pens: {
        brush: [{ id: 'mine', name: 'Mine', size: 5, smoothing: 10, pressure: true, mode: 'normal' }],
        brushDefault: 'mine'
      }
    };
    const p = offerComicPresets(mergePreferences(stored), stored);
    expect(p.pens.brush.map((q) => q.id)).toEqual([
      'mine',
      'brush-comic-ink',
      'brush-comic-bold',
      'brush-comic-detail',
      'brush-comic-cel'
    ]);
    expect(p.pens.pencil.filter((q) => q.id.startsWith('pencil-comic'))).toHaveLength(2);
    expect(p.pens.brushDefault).toBe('mine');
    expect(p.pens.comic).toBe(true);
    // once offered, a deleted comic preset stays deleted
    const later = { pens: { ...p.pens, brush: p.pens.brush.filter((q) => q.id !== 'brush-comic-bold') } };
    const again = offerComicPresets(mergePreferences(later), later);
    expect(again.pens.brush.some((q) => q.id === 'brush-comic-bold')).toBe(false);
    // nothing saved, nothing to add: the defaults hold them already
    expect(offerComicPresets(defaultPreferences(), null)).toEqual(defaultPreferences());
  });
});
