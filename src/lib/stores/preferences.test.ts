import { describe, expect, it } from 'vitest';
import { defaultPreferences, mergePreferences } from './preferences';

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
    expect(merged.timeline).toEqual(defaultPreferences().timeline);
  });

  it('drops values of the wrong type or outside the allowed set', () => {
    const merged = mergePreferences({
      workspace: 'cinema',
      grid: { size: 'big', color: 'red' },
      timeline: { fps: 1000, frameWidth: 1 },
      panels: { topTab: 'layers', hidden: ['color', 'nope'] }
    });
    expect(merged.workspace).toBe('essentials');
    expect(merged.grid.size).toBe(20);
    expect(merged.grid.color).toBe('#8a8a94');
    expect(merged.timeline.fps).toBe(120);
    expect(merged.timeline.frameWidth).toBe(4);
    expect(merged.panels.topTab).toBe('properties');
    expect(merged.panels.hidden).toEqual(['color']);
  });

  it('keeps the toolbar order and leaves out unknown or repeated tools', () => {
    const merged = mergePreferences({ toolbar: { tools: ['pen', 'select', 'laser', 'pen'] } });
    expect(merged.toolbar.tools).toEqual(['pen', 'select']);
    expect(merged.toolbar.side).toBe('left');
  });

  it('keeps shortcut overrides that are strings', () => {
    const merged = mergePreferences({ shortcuts: { 'tool.pen': 'Q', 'tool.brush': 4 } });
    expect(merged.shortcuts).toEqual({ 'tool.pen': 'Q' });
  });
});
