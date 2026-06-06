import { get } from 'svelte/store';
import type { Paint } from '$lib/core/types';
import { clonePaint, solid } from '$lib/core/style';
import { around, compose, decompose, rotate, scale } from '$lib/core/mat';
import { boxCenter, isEmpty } from '$lib/core/bbox';
import { closePath, reversePath } from '$lib/core/path';
import { insertKeyframe } from '$lib/anim/timeline';
import { addToast, colorTarget, fillPaint, outlineMode, showDockTab, strokePaint } from '$lib/stores/app';
import { preferences, setGroup } from '$lib/stores/preferences';
import { editor } from './editor';
import { clearSelection, transformSelection } from './selection';

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

function selectedPathIds(): string[] {
  return editor
    .selectedItems(false)
    .filter((it) => it.type === 'path')
    .map((it) => it.id);
}

// around the middle of the selection, like the transform submenus of the other apps
export function flipSelection(horizontal: boolean) {
  const b = editor.selectionBounds();
  if (isEmpty(b)) return;
  const m = around(scale(horizontal ? -1 : 1, horizontal ? 1 : -1), boxCenter(b));
  transformSelection(m, horizontal ? 'Flip horizontal' : 'Flip vertical');
}

export function rotateSelection(degrees: number) {
  const b = editor.selectionBounds();
  if (isEmpty(b)) return;
  transformSelection(around(rotate((degrees * Math.PI) / 180), boxCenter(b)), 'Rotate');
}

// rotation, scale and skew go, the position stays
export function removeTransform() {
  const ids = editor.selectedItems(false).map((it) => it.id);
  editor.updateItems(
    ids,
    (item) => {
      const d = decompose(item.transform);
      item.transform = compose({ x: d.x, y: d.y, rotation: 0, scaleX: 1, scaleY: 1, skew: 0 });
    },
    'Remove transform'
  );
}

export function reverseSelectedPaths() {
  editor.updateItems(
    selectedPathIds(),
    (item) => {
      if (item.type === 'path') reversePath(item.path);
    },
    'Reverse path'
  );
}

export function closeSelectedPaths() {
  editor.updateItems(
    selectedPathIds(),
    (item) => {
      if (item.type === 'path') closePath(item.path);
    },
    'Close path'
  );
}

// a keyframe on the active layer at the current frame, the real frame tools come with the timeline work
export function insertKeyframeHere() {
  const layer = editor.activeLayer();
  if (!layer) return;
  const at = editor.frame;
  editor.commit('Insert keyframe', (draft) => {
    const target = draft.layers.find((l) => l.id === layer.id);
    if (target) insertKeyframe(target, at);
  });
}

// nothing selected shows the document in the properties panel
export function showDocumentSettings() {
  clearSelection();
  showDockTab('properties');
}
