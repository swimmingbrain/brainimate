import { get } from 'svelte/store';
import type { Vec } from '$lib/core/types';
import { pointerFactor } from '$lib/core/hit';
import { editor } from '$lib/editor/editor';
import { clearSnap, snapEvent } from '$lib/editor/snap';
import { createText, endTextEdit, startTextEdit, textEditing } from '$lib/editor/text';
import { view } from '$lib/stores/app';
import { pickItem } from './pick';
import { toolBase, type Tool, type ToolEvent } from './tool';

// screen pixels before a press becomes a box
const DRAG = 4;
// box text narrower than this is not much of a box
const MIN_WIDTH = 20;

// a click starts point text, a drag a box that wraps its words, a click on text types into it
function createTextTool(): Tool {
  let start: ToolEvent | null = null;
  let end: Vec | null = null;
  let dragging = false;

  function reset() {
    start = null;
    end = null;
    dragging = false;
    clearSnap();
    editor.markOverlay();
  }

  return {
    ...toolBase('text'),

    down(e) {
      // the first click away from the text being typed only ends the typing
      if (get(textEditing)) {
        endTextEdit();
        return;
      }
      const hit = pickItem(e, e.zoom, pointerFactor(e.pointerType));
      if (hit?.type === 'text' && startTextEdit(hit.id)) return;
      start = snapEvent(e, { show: true });
      end = { x: start.x, y: start.y };
    },

    move(e) {
      if (!start) return;
      if (!dragging && Math.hypot(e.sx - start.sx, e.sy - start.sy) < DRAG) return;
      dragging = true;
      const at = snapEvent(e, { show: true });
      end = { x: at.x, y: at.y };
      editor.markOverlay();
    },

    up() {
      if (!start || !end) return;
      const from = start;
      const to = end;
      const box = dragging;
      reset();
      if (!box) {
        createText(from);
        return;
      }
      const width = Math.max(MIN_WIDTH, Math.abs(to.x - from.x));
      createText({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) }, width);
    },

    key(e) {
      if (e.key === 'Escape' && start) {
        e.preventDefault();
        reset();
      }
    },

    drawOverlay(ctx) {
      if (!start || !end || !dragging) return;
      const zoom = get(view).zoom;
      ctx.save();
      ctx.strokeStyle = '#d19a66';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      ctx.strokeRect(x, y, Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      ctx.restore();
    },

    deactivate() {
      reset();
    }
  };
}

export const textTool = createTextTool();
