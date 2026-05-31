import { get } from 'svelte/store';
import type { Paint } from '$lib/core/types';
import { clonePaint, solid } from '$lib/core/style';
import { addToast, colorTarget, fillPaint, outlineMode, strokePaint } from '$lib/stores/app';
import { preferences, setGroup } from '$lib/stores/preferences';
import { editor } from './editor';

// menu entries whose work comes later say so instead of doing nothing
export function notYet(what = 'This') {
  addToast(`${what} is not there yet`);
}

export function undo() {
  if (editor.undo() === null) addToast('Nothing to undo');
}

export function redo() {
  if (editor.redo() === null) addToast('Nothing to redo');
}

export function toggleGrid() {
  setGroup('grid', { show: !get(preferences).grid.show });
}

export function toggleRulers() {
  setGroup('rulers', { show: !get(preferences).rulers.show });
}

export function toggleGuides() {
  setGroup('guides', { show: !get(preferences).guides.show });
}

export function toggleSnapping() {
  setGroup('snapping', { enabled: !get(preferences).snapping.enabled });
}

export function toggleOnion() {
  setGroup('timeline', { onion: !get(preferences).timeline.onion });
}

export function togglePasteboard() {
  setGroup('stage', { pasteboard: !get(preferences).stage.pasteboard });
}

export function toggleOutline() {
  outlineMode.update((on) => !on);
}

export function swapColors() {
  const fill = get(fillPaint);
  fillPaint.set(get(strokePaint));
  strokePaint.set(fill);
}

// black stroke and white fill, like the other drawing apps
export function resetColors() {
  fillPaint.set(solid('#ffffff'));
  strokePaint.set(solid('#000000'));
}

// the active chip gets no color
export function clearColor() {
  setPaint(get(colorTarget), null);
}

export function toggleColorTarget() {
  colorTarget.update((t) => (t === 'fill' ? 'stroke' : 'fill'));
}

// sets the current color and gives it to the selected shapes too, like illustrator
export function setPaint(target: 'fill' | 'stroke', paint: Paint | null) {
  (target === 'fill' ? fillPaint : strokePaint).set(clonePaint(paint));
  const ids = editor
    .selectedItems(false)
    .filter((it) => it.type === 'path' || it.type === 'text')
    .map((it) => it.id);
  if (ids.length === 0) return;
  editor.updateItems(
    ids,
    (item) => {
      if (item.type === 'path' || item.type === 'text') item.style[target] = clonePaint(paint);
    },
    target === 'fill' ? 'Fill color' : 'Stroke color',
    `paint-${target}`
  );
}
