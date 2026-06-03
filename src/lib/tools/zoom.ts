import { fromPoints } from '$lib/core/bbox';
import { zoomStepAt, zoomToRect } from '$lib/editor/view';
import { editor } from '$lib/editor/editor';
import { overlayState } from '$lib/render/overlay';
import { toolCursor } from '$lib/stores/app';
import { toolBase, type Tool, type ToolEvent } from './tool';

// screen pixels the pointer has to travel before a click becomes a drag
const DRAG = 4;

let start: ToolEvent | null = null;
let dragging = false;

export const zoomTool: Tool = {
  ...toolBase('zoom'),

  down(e) {
    start = e;
    dragging = false;
  },

  move(e) {
    toolCursor.set(e.alt ? 'zoom-out' : 'zoom-in');
    if (!start) return;
    if (!dragging && Math.hypot(e.sx - start.sx, e.sy - start.sy) > DRAG) dragging = true;
    if (dragging) {
      overlayState.marquee = fromPoints([start, e]);
      editor.markOverlay();
    }
  },

  up(e) {
    if (!start) return;
    if (dragging) {
      const b = fromPoints([start, e]);
      zoomToRect(b.minX, b.minY, b.maxX, b.maxY);
    } else {
      zoomStepAt(e.sx, e.sy, e.alt);
    }
    start = null;
    dragging = false;
    overlayState.marquee = null;
    editor.markOverlay();
  },

  deactivate() {
    start = null;
    overlayState.marquee = null;
  }
};
