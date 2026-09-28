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

// the direct selection has the hollow arrow of its toolbar icon, like illustrator's white arrow
const HOLLOW = ARROW.replace("fill='black' stroke='white'", "fill='white' stroke='black'");

export const DIRECT_CURSOR = svgCursor(HOLLOW, 3, 2, 'default');
export const DIRECT_BEND_CURSOR = svgCursor(HOLLOW + glyph('M13 21.5q4.5-7 9 0'), 3, 2, 'default');

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
  "<path d='M2 2l9 4 3.5 3.5-5 5L6 11z' fill='black' stroke='white' stroke-width='1' stroke-linejoin='round'/>" +
  "<path d='M2.6 2.6l4.6 4.6' stroke='white' stroke-width='1'/>" +
  "<circle cx='8' cy='8' r='1.2' fill='white'/>" +
  "<path d='M10.4 15.4l5-5 1.6 1.6-5 5z' fill='black' stroke='white' stroke-width='1' stroke-linejoin='round'/>";

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

// the bucket of the toolbar icon tipped over, the hot spot is the drop it pours
const BUCKET =
  "<g transform='translate(3 2) scale(1.15)'>" +
  glyph('M12.7 7.3 7.3 2 1.6 7.7a1.3 1.3 0 0 0 0 1.9l3.5 3.5c.5.5 1.3.5 1.9 0zM3.3 1.3l3.4 3.4M1.5 8.7h10') +
  "<path d='M14.7 13.3a1.35 1.35 0 1 1-2.7 0c0-1.1 1.1-1.6 1.35-2.7.25 1.1 1.35 1.6 1.35 2.7z' " +
  "fill='black' stroke='white' stroke-width='.9'/>" +
  '</g>';

export const BUCKET_CURSOR = svgCursor(BUCKET, 18, 19, 'crosshair');

// a small ink bottle with a drop at the hot spot, for the stroke mode of the bucket
export const INK_CURSOR = svgCursor(
  glyph('M10 10h8v9.5a1.5 1.5 0 0 1-1.5 1.5h-5a1.5 1.5 0 0 1-1.5-1.5zM12 10V6.5h4V10M12.5 6.5V4h3v2.5M10 14.5h8') +
    "<path d='M5 15.5a1.6 1.6 0 1 1-3.2 0c0-1.3 1.3-1.9 1.6-3.2.3 1.3 1.6 1.9 1.6 3.2z' " +
    "fill='black' stroke='white' stroke-width='.9'/>",
  3,
  17,
  'crosshair'
);

// the eyedropper of the toolbar icon, the hot spot is its tip
export const EYEDROPPER_CURSOR = svgCursor(
  "<g transform='translate(1 3) scale(1.25)'>" +
    glyph('M1.5 14.5 2 14h2l6-6M2 14v-2l6-6m2-2 2.3-2.3a1.4 1.4 0 1 1 2 2L12 6l.3.3a1.4 1.4 0 1 1-2 2' +
      'L7.7 5.7a1.4 1.4 0 1 1 2-2z') +
    '</g>',
  3,
  21,
  'crosshair'
);
