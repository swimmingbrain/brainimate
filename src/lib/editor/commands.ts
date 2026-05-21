import { get } from 'svelte/store';
import { addToast, colorTarget, fillColor, outlineMode, strokeColor } from '$lib/stores/app';
import { preferences, setGroup } from '$lib/stores/preferences';

// menu entries whose work comes later say so instead of doing nothing
export function notYet(what = 'This') {
  addToast(`${what} is not there yet`);
}

// there is no document yet, so there is nothing to undo
export function undo() {
  addToast('Nothing to undo');
}

export function redo() {
  addToast('Nothing to redo');
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
  const fill = get(fillColor);
  fillColor.set(get(strokeColor));
  strokeColor.set(fill);
}

// black stroke and white fill, like the other drawing apps
export function resetColors() {
  fillColor.set('#ffffff');
  strokeColor.set('#000000');
}

// the active chip gets no color
export function clearColor() {
  if (get(colorTarget) === 'fill') fillColor.set(null);
  else strokeColor.set(null);
}
