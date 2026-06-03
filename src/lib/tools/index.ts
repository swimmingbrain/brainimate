import { get } from 'svelte/store';
import { activeTool, addToast, toolCursor } from '$lib/stores/app';
import { TOOL_IDS, TOOL_INFO, getTool, registerTool, toolBase, type Tool, type ToolEvent, type ToolId } from './tool';
import { handTool } from './hand';
import { zoomTool } from './zoom';

export { TOOL_INFO, type ToolInfo } from './tool';

// a tool that comes in a later step says so once each time it is picked
function placeholder(id: ToolId): Tool {
  let told = false;
  return {
    ...toolBase(id),
    activate() {
      told = false;
    },
    down() {
      if (told) return;
      told = true;
      addToast(`The ${TOOL_INFO[id].name.toLowerCase()} tool is not there yet`);
    }
  };
}

for (const tool of [handTool, zoomTool]) registerTool(tool);
for (const id of TOOL_IDS) if (!getTool(id)) registerTool(placeholder(id));

export function currentTool(): Tool | undefined {
  return getTool(get(activeTool));
}

export function cursorFor(id: ToolId): string {
  return getTool(id)?.cursor ?? TOOL_INFO[id].cursor;
}

export function selectTool(id: ToolId) {
  const prev = currentTool();
  if (prev?.id === id) return;
  prev?.deactivate?.();
  activeTool.set(id);
  toolCursor.set(cursorFor(id));
  currentTool()?.activate?.();
}

export function pointerDown(e: ToolEvent) {
  currentTool()?.down?.(e);
}

export function pointerMove(e: ToolEvent) {
  currentTool()?.move?.(e);
}

export function pointerUp(e: ToolEvent) {
  currentTool()?.up?.(e);
}

export function doubleClick(e: ToolEvent) {
  currentTool()?.dblclick?.(e);
}

export function keyDown(e: KeyboardEvent) {
  currentTool()?.key?.(e);
}

export function drawToolOverlay(ctx: CanvasRenderingContext2D) {
  currentTool()?.drawOverlay?.(ctx);
}
