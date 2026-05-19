import { get } from 'svelte/store';
import { activeTool } from '$lib/stores/app';
import type { Tool, ToolEvent, ToolId } from './tool';

export interface ToolInfo {
  id: ToolId;
  name: string;
  icon: string;
  shortcut: string;
  // the toolbar draws a thin line where the group changes
  group: number;
  cursor: string;
}

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select: { id: 'select', name: 'Selection', icon: 'select', shortcut: 'V', group: 0, cursor: 'default' },
  direct: { id: 'direct', name: 'Direct selection', icon: 'direct', shortcut: 'A', group: 0, cursor: 'default' },
  pen: { id: 'pen', name: 'Pen', icon: 'pen', shortcut: 'P', group: 1, cursor: 'crosshair' },
  pencil: { id: 'pencil', name: 'Pencil', icon: 'pencil', shortcut: 'N', group: 1, cursor: 'crosshair' },
  brush: { id: 'brush', name: 'Brush', icon: 'brush', shortcut: 'B', group: 1, cursor: 'crosshair' },
  eraser: { id: 'eraser', name: 'Eraser', icon: 'eraser', shortcut: 'E', group: 1, cursor: 'crosshair' },
  line: { id: 'line', name: 'Line', icon: 'line', shortcut: '\', group: 2, cursor: 'crosshair' },
  rect: { id: 'rect', name: 'Rectangle', icon: 'rect', shortcut: 'M', group: 2, cursor: 'crosshair' },
  ellipse: { id: 'ellipse', name: 'Ellipse', icon: 'ellipse', shortcut: 'L', group: 2, cursor: 'crosshair' },
  polygon: { id: 'polygon', name: 'Polygon and star', icon: 'polygon', shortcut: '', group: 2, cursor: 'crosshair' },
  text: { id: 'text', name: 'Text', icon: 'text', shortcut: 'T', group: 3, cursor: 'text' },
  bucket: { id: 'bucket', name: 'Paint bucket', icon: 'bucket', shortcut: 'K', group: 4, cursor: 'crosshair' },
  eyedropper: { id: 'eyedropper', name: 'Eyedropper', icon: 'eyedropper', shortcut: 'I', group: 4, cursor: 'crosshair' },
  gradient: { id: 'gradient', name: 'Gradient', icon: 'gradient', shortcut: 'G', group: 4, cursor: 'crosshair' },
  bone: { id: 'bone', name: 'Bone', icon: 'bone', shortcut: 'X', group: 5, cursor: 'crosshair' },
  bind: { id: 'bind', name: 'Bind', icon: 'bind', shortcut: 'Shift+X', group: 5, cursor: 'pointer' },
  pose: { id: 'pose', name: 'Pose', icon: 'pose', shortcut: 'Y', group: 5, cursor: 'default' },
  zoom: { id: 'zoom', name: 'Zoom', icon: 'zoom', shortcut: 'Z', group: 6, cursor: 'zoom-in' },
  hand: { id: 'hand', name: 'Hand', icon: 'hand', shortcut: 'H', group: 6, cursor: 'grab' }
};

// the tools themselves come with the drawing phases, until then the stage talks to nobody
const tools: Partial<Record<ToolId, Tool>> = {};

export function registerTool(tool: Tool) {
  tools[tool.id] = tool;
}

function current(): Tool | undefined {
  return tools[get(activeTool)];
}

export function selectTool(id: ToolId) {
  const prev = current();
  if (prev?.id === id) return;
  prev?.deactivate?.();
  activeTool.set(id);
  current()?.activate?.();
}

export function cursorFor(id: ToolId): string {
  return tools[id]?.cursor ?? TOOL_INFO[id].cursor;
}

export function pointerDown(e: ToolEvent) {
  current()?.down?.(e);
}

export function pointerMove(e: ToolEvent) {
  current()?.move?.(e);
}

export function pointerUp(e: ToolEvent) {
  current()?.up?.(e);
}

export function doubleClick(e: ToolEvent) {
  current()?.dblclick?.(e);
}

export function keyDown(e: KeyboardEvent) {
  current()?.key?.(e);
}

export function drawToolOverlay(ctx: CanvasRenderingContext2D) {
  current()?.drawOverlay?.(ctx);
}
