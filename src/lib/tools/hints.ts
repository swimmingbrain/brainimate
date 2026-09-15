import type { ToolId } from './tool';

// one line per tool for the status bar, what a click and a drag do and the keys that change them
export const TOOL_HINTS: Record<ToolId, string> = {
  select: 'Click to select, drag to move, drag an edge to bend it. Shift adds, Alt drags a copy',
  direct: 'Click an anchor to pick it, drag it or its handles. Double click toggles a corner',
  transform: 'Drag the handles to scale or turn. Shift keeps the proportions, Alt works from the center',
  pen: 'Click to add a corner, drag for a curve. Click the first anchor to close, Enter ends the path',
  curvature: 'Click to place points, the curve runs through them. Double click toggles a corner',
  pencil: 'Drag to draw a line. Shift draws it straight, Alt closes it',
  brush: 'Drag to paint a filled stroke. Shift paints it straight',
  eraser: 'Drag over shapes to rub them out',
  line: 'Drag to draw a line. Shift keeps it at 45 degree steps',
  rect: 'Drag to draw a rectangle. Shift makes a square, Alt draws from the center',
  ellipse: 'Drag to draw an ellipse. Shift makes a circle, Alt draws from the center',
  polygon: 'Drag to draw a polygon or a star. Shift turns it in 15 degree steps',
  text: 'Click to type a line of text, drag to type into a box',
  bucket: 'Click inside a shape to fill it. Shift click colors its stroke',
  eyedropper: 'Click a shape to take its colors. Alt click gives them to the selection',
  gradient: 'Drag across a selected shape to lay a gradient, drag its ends to move it',
  bone: 'Click to place a joint, each next click adds a bone. Escape ends the chain',
  bind: 'Click a bone, then click shapes to bind them to it or let them go',
  zoom: 'Click to zoom in, Alt click to zoom out, drag around an area to fit it',
  hand: 'Drag to move the view. Space held does the same with any tool'
};
