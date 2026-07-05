import { get } from 'svelte/store';
import type { Vec } from '$lib/core/types';
import { preferences, setGroup } from '$lib/stores/preferences';
import { addToast } from '$lib/stores/app';
import { editor } from './editor';

// h guides are horizontal lines at a y, v guides vertical lines at an x
export type GuideAxis = 'h' | 'v';

export interface GuideDrag {
  axis: GuideAxis;
  // -1 while a new guide is pulled out of a ruler
  index: number;
  value: number;
  // over the ruler on release the guide goes away
  remove: boolean;
}

// screen pixels around a guide that grab it
export const GUIDE_REACH = 4;

// the guide being dragged, the overlay draws it
export const guideState: { drag: GuideDrag | null } = { drag: null };

export function guidesLocked(): boolean {
  return get(preferences).guides.lock;
}

// the guide under a world point, horizontal ones first
export function guideAt(p: Vec, zoom: number, factor = 1): { axis: GuideAxis; index: number } | null {
  const reach = (GUIDE_REACH * factor) / zoom;
  const g = editor.doc.guides;
  let best: { axis: GuideAxis; index: number; d: number } | null = null;
  g.h.forEach((y, index) => {
    const d = Math.abs(y - p.y);
    if (d <= reach && (!best || d < best.d)) best = { axis: 'h', index, d };
  });
  g.v.forEach((x, index) => {
    const d = Math.abs(x - p.x);
    if (d <= reach && (!best || d < best.d)) best = { axis: 'v', index, d };
  });
  if (!best) return null;
  const { axis, index } = best;
  return { axis, index };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addGuide(axis: GuideAxis, value: number) {
  editor.commit('Add guide', (d) => {
    d.guides[axis].push(round(value));
  });
}

export function moveGuide(axis: GuideAxis, index: number, value: number) {
  editor.commit('Move guide', (d) => {
    if (index < d.guides[axis].length) d.guides[axis][index] = round(value);
  });
}

export function removeGuide(axis: GuideAxis, index: number) {
  editor.commit('Delete guide', (d) => {
    d.guides[axis].splice(index, 1);
  });
}

export function clearGuides() {
  const g = editor.doc.guides;
  if (g.h.length === 0 && g.v.length === 0) {
    addToast('There are no guides');
    return;
  }
  editor.commit('Clear guides', (d) => {
    d.guides = { h: [], v: [] };
  });
}

export function toggleGuideLock() {
  setGroup('guides', { lock: !get(preferences).guides.lock });
}

// ends a drag: a new guide is added, a moved one moves, one dropped on its ruler goes
export function finishGuideDrag() {
  const drag = guideState.drag;
  guideState.drag = null;
  editor.markOverlay();
  if (!drag) return;
  if (drag.remove) {
    if (drag.index >= 0) removeGuide(drag.axis, drag.index);
    return;
  }
  if (drag.index < 0) addGuide(drag.axis, drag.value);
  else moveGuide(drag.axis, drag.index, drag.value);
}
