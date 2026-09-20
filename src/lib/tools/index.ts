import { get } from 'svelte/store';
import { activeTool, toolCursor } from '$lib/stores/app';
import { TOOL_INFO, getTool, registerTool, type Tool, type ToolEvent, type ToolId } from './tool';
import { selectionTool, transformTool } from './select';
import { directTool } from './direct';
import { handTool } from './hand';
import { zoomTool } from './zoom';
import { rectTool } from './rect';
import { ellipseTool } from './ellipse';
import { lineTool } from './line';
import { penTool } from './pen';
import { curvatureTool } from './curvature';
import { pencilTool } from './pencil';
import { brushTool } from './brush';
import { eraserTool } from './eraser';
import { polygonTool } from './polygon';
import { gradientTool } from './gradient';
import { bucketTool } from './bucket';
import { eyedropperTool } from './eyedropper';
import { textTool } from './text';
import { boneTool } from './bone';
import { bindTool } from './bind';

export { TOOL_INFO, type ToolInfo } from './tool';

const TOOLS = [
  selectionTool,
  directTool,
  transformTool,
  penTool,
  curvatureTool,
  pencilTool,
  brushTool,
  eraserTool,
  lineTool,
  rectTool,
  ellipseTool,
  polygonTool,
  textTool,
  bucketTool,
  eyedropperTool,
  gradientTool,
  boneTool,
  bindTool,
  zoomTool,
  handTool
];
for (const tool of TOOLS) registerTool(tool);

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
