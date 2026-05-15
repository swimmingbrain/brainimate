import type { Component } from 'svelte';

export const TOOL_IDS = [
  'select',
  'direct',
  'pen',
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
  'pose',
  'zoom',
  'hand'
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

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
  key?(e: KeyboardEvent): void;
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  activate?(): void;
  deactivate?(): void;
  // settings shown in the stage bar while the tool is active
  options?: Component;
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value);
}
