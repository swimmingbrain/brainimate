import type { Component } from 'svelte';
import type { View } from '$lib/stores/app';

export const TOOL_IDS = [
  'select',
  'direct',
  'transform',
  'pen',
  'curvature',
  'pencil',
  'brush',
  'eraser',
  'line',
  'rect',
  'ellipse',
  'polygon',
  'text',
  'bucket',
  'eyedropper',
  'gradient',
  'bone',
  'bind',
  'zoom',
  'hand'
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

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
  transform: { id: 'transform', name: 'Free transform', icon: 'transform', shortcut: 'Q', group: 0, cursor: 'default' },
  pen: { id: 'pen', name: 'Pen', icon: 'pen', shortcut: 'P', group: 1, cursor: 'crosshair' },
  curvature: { id: 'curvature', name: 'Curvature', icon: 'curvature', shortcut: 'Shift+P', group: 1, cursor: 'crosshair' },
  pencil: { id: 'pencil', name: 'Pencil', icon: 'pencil', shortcut: 'Y', group: 1, cursor: 'crosshair' },
  brush: { id: 'brush', name: 'Brush', icon: 'brush', shortcut: 'B', group: 1, cursor: 'crosshair' },
  eraser: { id: 'eraser', name: 'Eraser', icon: 'eraser', shortcut: 'E', group: 1, cursor: 'crosshair' },
  line: { id: 'line', name: 'Line', icon: 'line', shortcut: 'N', group: 2, cursor: 'crosshair' },
  rect: { id: 'rect', name: 'Rectangle', icon: 'rect', shortcut: 'R', group: 2, cursor: 'crosshair' },
  ellipse: { id: 'ellipse', name: 'Ellipse', icon: 'ellipse', shortcut: 'O', group: 2, cursor: 'crosshair' },
  polygon: { id: 'polygon', name: 'Polygon and star', icon: 'polygon', shortcut: '', group: 2, cursor: 'crosshair' },
  text: { id: 'text', name: 'Text', icon: 'text', shortcut: 'T', group: 3, cursor: 'text' },
  bucket: { id: 'bucket', name: 'Paint bucket', icon: 'bucket', shortcut: 'K', group: 4, cursor: 'crosshair' },
  eyedropper: { id: 'eyedropper', name: 'Eyedropper', icon: 'eyedropper', shortcut: 'I', group: 4, cursor: 'crosshair' },
  gradient: { id: 'gradient', name: 'Gradient', icon: 'gradient', shortcut: 'G', group: 4, cursor: 'crosshair' },
  bone: { id: 'bone', name: 'Bone', icon: 'bone', shortcut: 'M', group: 5, cursor: 'crosshair' },
  bind: { id: 'bind', name: 'Bind', icon: 'bind', shortcut: 'Shift+M', group: 5, cursor: 'pointer' },
  zoom: { id: 'zoom', name: 'Zoom', icon: 'zoom', shortcut: 'Z', group: 6, cursor: 'zoom-in' },
  hand: { id: 'hand', name: 'Hand', icon: 'hand', shortcut: 'H', group: 6, cursor: 'grab' }
};

// one pointer event as the stage hands it to a tool
export interface ToolEvent {
  // world coordinates
  x: number;
  y: number;
  // css pixels from the top left of the stage
  sx: number;
  sy: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  pressure: number;
  button: number;
  pointerType: string;
  // the view at the time of the event, tools need the zoom for screen tolerances
  zoom: number;
}

export interface Tool {
  id: ToolId;
  name: string;
  icon: string;
  shortcut: string;
  cursor: string;
  down?(e: ToolEvent): void;
  move?(e: ToolEvent): void;
  up?(e: ToolEvent): void;
  dblclick?(e: ToolEvent): void;
  // a tool that uses a key calls preventDefault, so the shortcuts leave it alone
  key?(e: KeyboardEvent): void;
  // drawn in world space on top of the overlay
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  activate?(): void;
  deactivate?(): void;
  // settings shown in the stage bar while the tool is active
  options?: Component;
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value);
}

const registry: Partial<Record<ToolId, Tool>> = {};

export function registerTool(tool: Tool) {
  registry[tool.id] = tool;
}

export function getTool(id: ToolId): Tool | undefined {
  return registry[id];
}

// the shared fields of a tool from its entry in TOOL_INFO
export function toolBase(id: ToolId): Pick<Tool, 'id' | 'name' | 'icon' | 'shortcut' | 'cursor'> {
  const info = TOOL_INFO[id];
  return { id, name: info.name, icon: info.icon, shortcut: info.shortcut, cursor: info.cursor };
}

export function makeEvent(e: PointerEvent | MouseEvent, rect: DOMRect, v: View): ToolEvent {
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const pointer = typeof PointerEvent !== 'undefined' && e instanceof PointerEvent ? e : null;
  return {
    x: (sx - v.panX) / v.zoom,
    y: (sy - v.panY) / v.zoom,
    sx,
    sy,
    shift: e.shiftKey,
    alt: e.altKey,
    ctrl: e.ctrlKey || e.metaKey,
    pressure: pointer && pointer.pointerType === 'pen' ? pointer.pressure : 0.5,
    button: e.button,
    pointerType: pointer?.pointerType ?? 'mouse',
    zoom: v.zoom
  };
}

// a pen sends more points than frames, the drawing tools want all of them
export function coalescedEvents(e: PointerEvent): PointerEvent[] {
  const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  return list.length > 0 ? list : [e];
}
