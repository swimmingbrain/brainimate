import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { editor } from './editor';
import { DOC_PRESETS } from './document';
import { addComicSceneLayers, isUntouched } from './layers';
import { makePathItem } from '$lib/core/items';
import { rectPath } from '$lib/core/shapes';
import { defaultStyle } from '$lib/core/style';
import { hexToHsv } from '$lib/core/color';
import {
  COMIC_PALETTE,
  COMIC_SCENE_LAYERS,
  TIKTOK_SAFE,
  isVertical916,
  safeZoneFor
} from '$lib/core/comic';
import { scaledSize } from '$lib/io/render';
import { videoBitrate } from '$lib/io/video';
import { createDocument } from '$lib/io/files';
import { activeLayer, dialog } from '$lib/stores/app';
import { BUILTIN_WORKSPACES, findWorkspace, withWorkspace } from '$lib/stores/workspace';
import { defaultPreferences } from '$lib/stores/preferences';

describe('the tiktok format', () => {
  it('is the first preset, exactly 1080 by 1920, with the comic layers', () => {
    const tiktok = DOC_PRESETS.filter((p) => p.label.startsWith('TikTok'));
    expect(DOC_PRESETS[0]).toBe(tiktok[0]);
    expect(tiktok.map((p) => [p.width, p.height, p.fps])).toEqual([
      [1080, 1920, 24],
      [1080, 1920, 30]
    ]);
    expect(tiktok.every((p) => p.comic)).toBe(true);
    // the presets that were there keep their sizes and start without comic layers
    expect(DOC_PRESETS.find((p) => p.label === 'Full HD video')).toMatchObject({ width: 1920, height: 1080 });
    expect(DOC_PRESETS.filter((p) => !p.label.startsWith('TikTok')).every((p) => !p.comic)).toBe(true);
  });

  it('exports as a video of exactly 1080 by 1920 at scale 1', () => {
    expect(scaledSize({ width: 1080, height: 1920 }, 1, true)).toEqual({ width: 1080, height: 1920 });
    const bits = videoBitrate(1080, 1920, 24, 0.7);
    expect(bits).toBeGreaterThan(1_000_000);
    expect(bits).toBeLessThanOrEqual(40_000_000);
  });

  it('knows 9 by 16 at any size and scales the safe zone with it', () => {
    expect(isVertical916(1080, 1920)).toBe(true);
    expect(isVertical916(720, 1280)).toBe(true);
    expect(isVertical916(1920, 1080)).toBe(false);
    expect(isVertical916(1080, 1080)).toBe(false);
    expect(isVertical916(0, 0)).toBe(false);
    expect(safeZoneFor(1080, 1920)).toEqual(TIKTOK_SAFE);
    expect(safeZoneFor(540, 960)).toEqual({ top: 75, bottom: 240, left: 30, right: 70 });
    expect(safeZoneFor(1920, 1080)).toBeNull();
    // something is left to draw in
    const z = TIKTOK_SAFE;
    expect(1080 - z.left - z.right).toBeGreaterThan(800);
    expect(1920 - z.top - z.bottom).toBeGreaterThan(1200);
  });
});

describe('the comic palette', () => {
  it('holds muted colors, each once, with a name', () => {
    const colors = COMIC_PALETTE.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const c of COMIC_PALETTE) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.name.length).toBeGreaterThan(0);
      // desaturated: no bright, fully saturated hues
      expect(hexToHsv(c.color).s, c.name).toBeLessThanOrEqual(0.6);
    }
    expect(COMIC_PALETTE[0]).toEqual({ name: 'Ink', color: '#1d1b19' });
  });
});

describe('comic scene layers', () => {
  beforeEach(() => {
    editor.newDoc(1080, 1920, 24);
    dialog.set(null);
  });

  it('take the place of an untouched timeline in one undo step', () => {
    expect(isUntouched(editor.doc.layers)).toBe(true);
    addComicSceneLayers();
    expect(editor.doc.layers.map((l) => l.name)).toEqual(COMIC_SCENE_LAYERS);
    expect(editor.doc.layers.every((l) => l.type === 'normal')).toBe(true);
    expect(editor.activeLayer()?.name).toBe('Characters');
    editor.undo();
    expect(editor.doc.layers.map((l) => l.name)).toEqual(['Layer 1']);
  });

  it('go on top of a timeline that holds a drawing', () => {
    const first = editor.doc.layers[0];
    editor.insertItem(first.id, makePathItem('Rect', rectPath(0, 0, 10, 10), defaultStyle()));
    expect(isUntouched(editor.doc.layers)).toBe(false);
    addComicSceneLayers();
    expect(editor.doc.layers.map((l) => l.name)).toEqual(['Layer 1', ...COMIC_SCENE_LAYERS]);
    expect(editor.layerItems(editor.doc.layers[0])).toHaveLength(1);
  });

  it('start a comic document, the characters layer active', () => {
    createDocument(1080, 1920, 24, '#ffffff', true);
    expect([editor.doc.width, editor.doc.height]).toEqual([1080, 1920]);
    expect(editor.doc.layers.map((l) => l.name)).toEqual(COMIC_SCENE_LAYERS);
    expect(editor.doc.layers.find((l) => l.id === get(activeLayer))?.name).toBe('Characters');
    // without the switch a document starts as before
    createDocument(1080, 1920, 24);
    expect(editor.doc.layers.map((l) => l.name)).toEqual(['Layer 1']);
  });
});

describe('the comic workspace', () => {
  it('shows the swatches with the timeline and keeps the four built in ones', () => {
    expect(BUILTIN_WORKSPACES.map((w) => w.id)).toEqual(['essentials', 'illustrate', 'animate', 'rig', 'comic']);
    const comic = findWorkspace(defaultPreferences(), 'comic')!;
    const p = withWorkspace(defaultPreferences(), comic);
    expect(p.panels.timeline).toBe(true);
    expect(p.panels.bottomTab).toBe('swatches');
    expect(p.panels.hidden).not.toContain('swatches');
    expect(p.swatches.comic).toBe(true);
  });
});
