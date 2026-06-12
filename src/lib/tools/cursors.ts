// small svg cursors for what css has no name for, drawn black with a white edge so they read on any color

const ARROW = "<path d='M3 2v14l3.6-3.4 2.4 5.4 2.2-1-2.4-5.3H14z' fill='black' stroke='white' stroke-width='1' stroke-linejoin='round'/>";

function glyph(d: string): string {
  return `<path d='${d}' fill='none' stroke='white' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<path d='${d}' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/>`;
}

function svgCursor(body: string, x: number, y: number, fallback: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

// the arrow with a little arc, over a segment that bends when dragged
export const BEND_CURSOR = svgCursor(ARROW + glyph('M13 21.5q4.5-7 9 0'), 3, 2, 'default');

// the arrow with a little corner, over an anchor or when ctrl pulls a new corner out
export const CORNER_CURSOR = svgCursor(ARROW + glyph('M14 22l4-6 4 6'), 3, 2, 'default');

// a curved arrow just outside a corner of the handle box
export const ROTATE_CURSOR = svgCursor(glyph('M5.5 15.5a7 7 0 0 1 11.5-8.2M17 3.5v4h-4'), 12, 12, 'crosshair');

// the resize cursor closest to the direction a handle points on screen, degrees with y down
export function resizeCursor(angle: number): string {
  const a = ((angle % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

// a pen nib with its tip on the hot spot, the small mark next to it says what a click does
const NIB =
  "<path d='M2 2l8.5 3.5 3 7-7-3z' fill='black' stroke='white' stroke-width='1' stroke-linejoin='round'/>" +
  "<path d='M2 2l5.6 5.6' stroke='white' stroke-width='1'/>" +
  "<path d='M13.5 12.5l2.2 2.2-2 2-2.2-2.2' fill='black' stroke='white' stroke-width='1' stroke-linejoin='round'/>";

function pen(mark: string): string {
  return svgCursor(NIB + (mark ? glyph(mark) : ''), 2, 2, 'crosshair');
}

export const PEN_CURSORS = {
  // a new path starts here
  start: pen('M17.5 17.5l4 4M21.5 17.5l-4 4'),
  // the next anchor of the path being drawn
  draw: pen(''),
  // goes on from the end of a selected open path
  continue: pen('M17.5 21.5l4-4'),
  close: pen('M19.5 17.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4'),
  add: pen('M19.5 16.5v6M16.5 19.5h6'),
  remove: pen('M16.5 19.5h6'),
  convert: pen('M16.5 21.5l3-4.5 3 4.5'),
  // the curvature tool, a pen with a small wave
  curve: pen('M16 20.5q1.8-3 3.5 0t3.5 0')
};
