import { get } from 'svelte/store';
import type { Paint } from '$lib/core/types';
import { clonePaint } from '$lib/core/style';
import { isGradient, makeGradient } from '$lib/core/gradient';
import { pointerFactor } from '$lib/core/hit';
import { editor, hover } from '$lib/editor/editor';
import { styledItems } from '$lib/editor/commands';
import { addToast, fillPaint, strokePaint, strokeWidth, toolCursor } from '$lib/stores/app';
import { pickDeep } from './pick';
import { EYEDROPPER_CURSOR } from './cursors';
import { toolBase, type Tool, type ToolEvent } from './tool';

// a gradient picked up from one shape is laid across the next one again
function loose(p: Paint | null): Paint | null {
  return isGradient(p) ? makeGradient(p.type, p.stops) : clonePaint(p);
}

// click: the fill, stroke and width under the pointer become the current ones,
// alt click: they go onto the selected shapes instead
function sample(e: ToolEvent) {
  const hit = pickDeep(e, e.zoom, pointerFactor(e.pointerType));
  if (!hit || (hit.type !== 'path' && hit.type !== 'text')) return;
  const { fill, stroke, width } = hit.style;
  if (!e.alt) {
    fillPaint.set(loose(fill));
    strokePaint.set(loose(stroke));
    strokeWidth.set(width);
    return;
  }
  const ids = styledItems()
    .map((it) => it.id)
    .filter((id) => id !== hit.id);
  if (ids.length === 0) {
    addToast('Select the shapes that should get this style');
    return;
  }
  editor.updateItems(
    ids,
    (item) => {
      if (item.type !== 'path' && item.type !== 'text') return;
      item.style.fill = loose(fill);
      item.style.stroke = loose(stroke);
      item.style.width = width;
    },
    'Apply style'
  );
}

export const eyedropperTool: Tool = {
  ...toolBase('eyedropper'),
  cursor: EYEDROPPER_CURSOR,

  down(e) {
    if (e.button === 0) sample(e);
  },

  move() {
    if (get(hover)) hover.set(null);
  },

  activate() {
    toolCursor.set(EYEDROPPER_CURSOR);
  }
};
