import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  DRAWING_TOOLS,
  clearModifiers,
  fingerMode,
  gestureOptions,
  isTouchDevice,
  pressKey,
  toggleModifier,
  touchModifiers,
  touchUiOn,
  withModifiers
} from './touch';
import { pictureSize, MAX_PICTURE_PIXELS } from './importer';
import { defaultPreferences, mergePreferences } from '$lib/stores/preferences';
import type { ToolEvent } from '$lib/tools/tool';

const IPAD = { coarse: true, touchPoints: 5 };
const LAPTOP = { coarse: false, touchPoints: 0 };

describe('the touch interface', () => {
  it('turns on for an ipad, off for a mouse, unless the preferences say otherwise', () => {
    expect(isTouchDevice(IPAD)).toBe(true);
    expect(isTouchDevice(LAPTOP)).toBe(false);
    // a coarse pointer that has no touch points is a tv remote or a broken report, not a tablet
    expect(isTouchDevice({ coarse: true, touchPoints: 0 })).toBe(false);
    expect(touchUiOn('auto', IPAD)).toBe(true);
    expect(touchUiOn('auto', LAPTOP)).toBe(false);
    expect(touchUiOn('on', LAPTOP)).toBe(true);
    expect(touchUiOn('off', IPAD)).toBe(false);
  });

  it('lets fingers draw until the pencil shows up', () => {
    expect(fingerMode('auto', false)).toBe('draw');
    expect(fingerMode('auto', true)).toBe('navigate');
    expect(fingerMode('draw', true)).toBe('draw');
    expect(fingerMode('navigate', false)).toBe('navigate');
  });

  it('keeps taps and long presses away from the tools that draw', () => {
    const p = defaultPreferences();
    expect(gestureOptions('brush', p, false)).toEqual({ fingers: 'draw', tapToTool: false, longPress: false });
    expect(gestureOptions('select', p, true)).toEqual({ fingers: 'navigate', tapToTool: true, longPress: true });
    // the hand only navigates, the bucket fills on the press so a menu after it would come too late
    expect(gestureOptions('hand', p, false).fingers).toBe('navigate');
    expect(gestureOptions('bucket', p, false)).toMatchObject({ tapToTool: true, longPress: false });
    for (const id of ['brush', 'pencil', 'eraser', 'pen', 'rect', 'bone'] as const) expect(DRAWING_TOOLS.has(id)).toBe(true);
    for (const id of ['select', 'direct', 'text', 'eyedropper'] as const) expect(DRAWING_TOOLS.has(id)).toBe(false);
  });
});

describe('sticky keys', () => {
  afterEach(() => clearModifiers());
  const event: ToolEvent = { x: 0, y: 0, sx: 0, sy: 0, shift: false, alt: false, ctrl: false, pressure: 0.5, button: 0, pointerType: 'touch', zoom: 1 };

  it('stay on until tapped again and count like held keys', () => {
    expect(withModifiers(event)).toBe(event);
    toggleModifier('shift');
    expect(get(touchModifiers)).toEqual({ shift: true, alt: false, ctrl: false });
    expect(withModifiers(event)).toMatchObject({ shift: true, alt: false, ctrl: false });
    toggleModifier('alt');
    toggleModifier('shift');
    expect(withModifiers(event)).toMatchObject({ shift: false, alt: true });
    // a key held on a keyboard still counts with the buttons off
    clearModifiers();
    expect(withModifiers({ ...event, ctrl: true }).ctrl).toBe(true);
  });
});

describe('done and cancel', () => {
  it('send the key where the shortcuts listen', () => {
    class FakeKey extends Event {
      key: string;
      constructor(type: string, init: { key: string; cancelable?: boolean; bubbles?: boolean }) {
        super(type, init);
        this.key = init.key;
      }
    }
    const before = (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent;
    (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent = FakeKey;
    try {
      const target = new EventTarget();
      const seen: string[] = [];
      target.addEventListener('keydown', (e) => seen.push((e as FakeKey).key));
      expect(pressKey('Escape', target)).toBe(true);
      expect(pressKey('Enter', target)).toBe(true);
      expect(seen).toEqual(['Escape', 'Enter']);
      expect(pressKey('Enter', null)).toBe(false);
    } finally {
      (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent = before;
    }
  });
});

describe('touch preferences', () => {
  it('start on auto and keep what was chosen, nothing else', () => {
    expect(defaultPreferences().touch).toEqual({ ui: 'auto', fingers: 'auto', fingerTaps: true, dock: true });
    const kept = mergePreferences({ touch: { ui: 'off', fingers: 'navigate', fingerTaps: false, dock: false } });
    expect(kept.touch).toEqual({ ui: 'off', fingers: 'navigate', fingerTaps: false, dock: false });
    const odd = mergePreferences({ touch: { ui: 'sometimes', fingers: 'toes' } });
    expect(odd.touch.ui).toBe('auto');
    expect(odd.touch.fingers).toBe('auto');
  });
});

describe('imported pictures', () => {
  it('come in smaller when they are far larger than the stage could show', () => {
    // a photo of an ipad camera on a 1080 by 1920 story
    const photo = pictureSize(4032, 3024, 1080, 1920);
    expect(photo.scaled).toBe(true);
    expect(photo.width * photo.height).toBeLessThanOrEqual(MAX_PICTURE_PIXELS);
    expect(photo.width / photo.height).toBeCloseTo(4032 / 3024, 2);
    // a long panorama is held to twice the long side of the stage
    expect(pictureSize(12000, 2000, 1080, 1920)).toEqual({ width: 3840, height: 640, scaled: true });
    // a picture that fits stays as it is
    expect(pictureSize(1080, 1920, 1080, 1920)).toEqual({ width: 1080, height: 1920, scaled: false });
    // a small stage still takes pictures up to 2048 pixels
    expect(pictureSize(2048, 1365, 800, 600)).toEqual({ width: 2048, height: 1365, scaled: false });
    expect(pictureSize(2400, 1600, 800, 600)).toEqual({ width: 2048, height: 1365, scaled: true });
  });
});

describe('the autosave delay', () => {
  it('grows with the pictures of the document, at most 20 s more', async () => {
    const { autosaveDelay } = await import('$lib/io/autosave');
    const asset = (mb: number) => ({ id: 'a', type: 'image' as const, name: 'a', data: 'x'.repeat(Math.round((mb * 1_000_000) / 0.75)) });
    expect(autosaveDelay(2, {})).toBe(2);
    expect(autosaveDelay(2, { a: asset(0.5) })).toBe(2);
    expect(autosaveDelay(2, { a: asset(6.2) })).toBe(8);
    expect(autosaveDelay(2, { a: asset(80) })).toBe(22);
    expect(autosaveDelay(0, {})).toBe(1);
  });
});
