import { derived, get, writable } from 'svelte/store';
import { preferences, type Preferences } from '$lib/stores/preferences';
import type { ToolId } from '$lib/tools/tool';
import type { ToolEvent } from '$lib/tools/tool';
import type { GestureOptions } from './gestures';
import { keyDown } from '$lib/tools';
import { endTextEdit, textEditing } from './text';

// a tablet without keyboard and mouse: the keys a tool asks for come from buttons, fingers move the
// view and the pencil draws

// what the browser tells about its pointers, handed in so tests can play any device
export interface PointerEnv {
  coarse: boolean;
  touchPoints: number;
}

export function readPointerEnv(): PointerEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { coarse: false, touchPoints: 0 };
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches;
  return { coarse, touchPoints: navigator.maxTouchPoints ?? 0 };
}

// an ipad says coarse and several touch points, also with a trackpad attached. a laptop with a
// touch screen too, which then gets the bigger buttons as well
export function isTouchDevice(env: PointerEnv): boolean {
  return env.coarse && env.touchPoints > 0;
}

export function touchUiOn(pref: Preferences['touch']['ui'], env: PointerEnv): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return isTouchDevice(env);
}

const env = writable<PointerEnv>({ coarse: false, touchPoints: 0 });

// the stage and the layout read this, true with the touch bar and the bigger targets
export const touchUi = derived([preferences, env], ([p, e]) => touchUiOn(p.touch.ui, e));

// the pencil was used on the stage since the app opened, from then on fingers only navigate
export const penSeen = writable(false);

// sticky shift, alt and ctrl from the touch bar: they stay on until tapped again
export const touchModifiers = writable({ shift: false, alt: false, ctrl: false });

export function toggleModifier(key: 'shift' | 'alt' | 'ctrl') {
  touchModifiers.update((m) => ({ ...m, [key]: !m[key] }));
}

export function clearModifiers() {
  touchModifiers.set({ shift: false, alt: false, ctrl: false });
}

// a held key or a sticky button, either one counts
export function withModifiers(e: ToolEvent, m = get(touchModifiers)): ToolEvent {
  if (!m.shift && !m.alt && !m.ctrl) return e;
  return { ...e, shift: e.shift || m.shift, alt: e.alt || m.alt, ctrl: e.ctrl || m.ctrl };
}

// the tools that put down marks: a finger tap must not make a dot or an anchor in navigate mode, and
// a still press is part of drawing, not a request for the menu
export const DRAWING_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'brush',
  'pencil',
  'eraser',
  'pen',
  'curvature',
  'line',
  'rect',
  'ellipse',
  'polygon',
  'gradient',
  'bone'
]);

// auto lets fingers draw until the pencil shows up, like the drawing apps of the ipad do
export function fingerMode(pref: Preferences['touch']['fingers'], pen: boolean): 'draw' | 'navigate' {
  if (pref === 'draw' || pref === 'navigate') return pref;
  return pen ? 'navigate' : 'draw';
}

export function gestureOptions(tool: ToolId, p: Preferences, pen: boolean): GestureOptions {
  const drawing = DRAWING_TOOLS.has(tool);
  return {
    // the hand and the zoom tool are for navigating anyway, fingers do it themselves
    fingers: tool === 'hand' ? 'navigate' : fingerMode(p.touch.fingers, pen),
    tapToTool: !drawing && tool !== 'hand',
    // the bucket fills on the press already, a menu after it would come too late
    longPress: !drawing && tool !== 'hand' && tool !== 'zoom' && tool !== 'bucket'
  };
}

// a key for the tool and the shortcuts as if it was typed: done is enter, cancel is escape. the
// target is the window, where the shortcuts listen, so no field or dialog swallows it
export function pressKey(key: 'Enter' | 'Escape' | 'Backspace' | 'Delete', target: EventTarget | null = typeof window === 'undefined' ? null : window): boolean {
  if (!target || typeof KeyboardEvent === 'undefined') return false;
  const e = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return true;
}

// a key only for the active tool, true when the tool took it
export function toolKey(key: string): boolean {
  if (typeof KeyboardEvent === 'undefined') return false;
  const e = new KeyboardEvent('keydown', { key, code: key, cancelable: true });
  keyDown(e);
  return e.defaultPrevented;
}

// done stands in for enter: it ends typed text, a pen path and a bone chain. it never reaches the
// shortcuts, enter there would start playback
export function touchDone() {
  if (get(textEditing)) {
    endTextEdit();
    return;
  }
  toolKey('Enter');
}

// cancel stands in for escape: the tool drops what it does, without one it deselects or leaves the
// symbol like escape on a keyboard
export function touchCancel() {
  if (get(textEditing)) {
    endTextEdit();
    return;
  }
  if (!toolKey('Escape')) pressKey('Escape');
}

// a press held on a layer, a frame, a symbol or a swatch opens its menu like a right click. the stage
// has its own, it has to tell a press from a stroke. a press that opened a menu clicks nothing
export const LONG_PRESS_SKIP = '.stage, input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]';

export function installLongPress(root: Document = document, delay = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { id: number; x: number; y: number; target: Element } | null = null;
  let swallowUntil = 0;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el || el.closest(LONG_PRESS_SKIP)) return;
    clear();
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, target: el };
    timer = setTimeout(() => {
      const s = start;
      clear();
      if (!s) return;
      const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: s.x, clientY: s.y, button: 2 });
      s.target.dispatchEvent(menu);
      if (menu.defaultPrevented) swallowUntil = performance.now() + 700;
    }, delay);
  };
  const move = (e: PointerEvent) => {
    if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear();
  };
  const up = (e: PointerEvent) => {
    if (start && e.pointerId === start.id) clear();
  };
  const click = (e: MouseEvent) => {
    if (performance.now() < swallowUntil) {
      e.preventDefault();
      e.stopPropagation();
      swallowUntil = 0;
    }
  };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointermove', move, true);
  root.addEventListener('pointerup', up, true);
  root.addEventListener('pointercancel', up, true);
  root.addEventListener('click', click, true);
  return () => {
    clear();
    root.removeEventListener('pointerdown', down, true);
    root.removeEventListener('pointermove', move, true);
    root.removeEventListener('pointerup', up, true);
    root.removeEventListener('pointercancel', up, true);
    root.removeEventListener('click', click, true);
  };
}

// the page may not zoom in the editor: a pinch belongs to the stage and a field that gets the focus
// must not make safari zoom in on it. the landing page keeps the zoom for reading
function lockViewport(): () => void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return () => {};
  const before = meta.content;
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
  return () => {
    meta.content = before;
  };
}

// the device is looked at once, a trackpad plugged in later changes the media query
export function installTouch(): () => void {
  if (typeof window === 'undefined') return () => {};
  const update = () => env.set(readPointerEnv());
  update();
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(any-pointer: coarse)') : null;
  query?.addEventListener?.('change', update);
  // safari zooms the whole page on a pinch outside the stage and on a double tap, an app must not
  const stop = (e: Event) => e.preventDefault();
  const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
  for (const type of gestures) document.addEventListener(type, stop, { passive: false });
  const offAttr = touchUi.subscribe((on) => {
    document.documentElement.toggleAttribute('data-touch', on);
  });
  const unlock = lockViewport();
  const offLong = installLongPress();
  return () => {
    unlock();
    offLong();
    query?.removeEventListener?.('change', update);
    for (const type of gestures) document.removeEventListener(type, stop);
    offAttr();
    document.documentElement.removeAttribute('data-touch');
  };
}
