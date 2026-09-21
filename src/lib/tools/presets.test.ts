import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { defaultPreferences, preferences } from '$lib/stores/preferences';
import { strokeWidth } from '$lib/stores/app';
import {
  addPresetFromCurrent,
  applyPreset,
  currentPen,
  deletePreset,
  matchingPreset,
  renamePreset,
  setDefaultPreset,
  withPreset
} from './presets';

describe('pen presets', () => {
  it('match the settings the tool has now', () => {
    const p = defaultPreferences();
    expect(matchingPreset(p, 'brush', 1.5)?.id).toBe('brush-round');
    expect(matchingPreset(p, 'pencil', 1.5)?.id).toBe('pencil-clean');
    expect(matchingPreset(p, 'pencil', 3)).toBeNull();
    const changed = { ...p, drawing: { ...p.drawing, brushSize: 9 } };
    expect(matchingPreset(changed, 'brush', 1.5)).toBeNull();
  });

  it('set the brush and the pencil to a preset', () => {
    const p = defaultPreferences();
    const marker = p.pens.brush.find((q) => q.id === 'brush-marker')!;
    const next = withPreset(p, 'brush', marker);
    expect(currentPen(next, 'brush', 1)).toEqual({ size: 24, smoothing: 40, pressure: false, mode: 'normal' });
    const ink = p.pens.pencil.find((q) => q.id === 'pencil-ink')!;
    expect(withPreset(p, 'pencil', ink).drawing.pencilMode).toBe('ink');
  });

  it('give the pencil size to the stroke width', () => {
    preferences.set(defaultPreferences());
    applyPreset('pencil', 'pencil-shapes');
    expect(get(strokeWidth)).toBe(2);
    expect(get(preferences).drawing.pencilMode).toBe('straighten');
    strokeWidth.set(1.5);
  });

  it('are added from the tool, renamed, made the default and deleted', () => {
    preferences.set(defaultPreferences());
    preferences.update((p) => ({ ...p, drawing: { ...p.drawing, brushSize: 13, brushMode: 'behind' } }));
    const id = addPresetFromCurrent('brush');
    let pens = get(preferences).pens;
    const added = pens.brush.find((q) => q.id === id)!;
    expect(added.name).toBe('Brush 5');
    expect(added.size).toBe(13);
    expect(added.mode).toBe('behind');
    renamePreset('brush', id, '  Thick  ');
    renamePreset('brush', id, '   ');
    expect(get(preferences).pens.brush.find((q) => q.id === id)!.name).toBe('Thick');
    setDefaultPreset('brush', id);
    expect(get(preferences).pens.brushDefault).toBe(id);
    deletePreset('brush', id);
    pens = get(preferences).pens;
    expect(pens.brush.some((q) => q.id === id)).toBe(false);
    expect(pens.brushDefault).toBe('brush-fine');
  });
});
