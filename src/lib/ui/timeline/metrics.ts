// sizes shared by the ruler, the layer list and the frame grid, in css pixels
export const ROW_H = 24;
export const RULER_H = 28;
export const MIN_FRAME_W = 4;
export const MAX_FRAME_W = 24;
// frames past the end of the document the grid still scrolls to, room to add more
export const EXTRA_FRAMES = 60;

// the canvases cannot use css variables, so the tokens are read once
export interface TimelineColors {
  bg: string;
  surface: string;
  border: string;
  line: string;
  fifth: string;
  hold: string;
  holdEdge: string;
  empty: string;
  folder: string;
  keyframe: string;
  tween: string;
  tweenEdge: string;
  pose: string;
  poseEdge: string;
  label: string;
  text: string;
  muted: string;
  accent: string;
  accentDim: string;
}

const FALLBACK: TimelineColors = {
  bg: '#111113',
  surface: '#19191c',
  border: '#2e2e33',
  line: 'rgba(255, 255, 255, 0.04)',
  fifth: 'rgba(0, 0, 0, 0.22)',
  hold: '#2c2c31',
  holdEdge: '#3a3a41',
  empty: 'rgba(255, 255, 255, 0.025)',
  folder: '#1d1d21',
  keyframe: '#d4d4d8',
  tween: '#4f2c5b',
  tweenEdge: '#b04dbd',
  pose: '#2c4664',
  poseEdge: '#4d7fb8',
  label: '#e06c75',
  text: '#d4d4d8',
  muted: '#85858e',
  accent: '#d19a66',
  accentDim: 'rgba(209, 154, 102, 0.10)'
};

let colors: TimelineColors | null = null;

export function timelineColors(): TimelineColors {
  if (colors) return colors;
  if (typeof document === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  colors = {
    bg: read('--bg-deep', FALLBACK.bg),
    surface: read('--bg-surface', FALLBACK.surface),
    border: read('--border', FALLBACK.border),
    line: read('--frame-line', FALLBACK.line),
    fifth: read('--frame-fifth', FALLBACK.fifth),
    hold: read('--frame-hold', FALLBACK.hold),
    holdEdge: read('--frame-hold-edge', FALLBACK.holdEdge),
    empty: read('--frame-empty', FALLBACK.empty),
    folder: read('--frame-folder', FALLBACK.folder),
    keyframe: read('--keyframe', FALLBACK.keyframe),
    tween: read('--tween', FALLBACK.tween),
    tweenEdge: read('--tween-edge', FALLBACK.tweenEdge),
    pose: read('--pose', FALLBACK.pose),
    poseEdge: read('--pose-edge', FALLBACK.poseEdge),
    label: read('--frame-label', FALLBACK.label),
    text: read('--text-primary', FALLBACK.text),
    muted: read('--text-muted', FALLBACK.muted),
    accent: read('--accent', FALLBACK.accent),
    accentDim: read('--accent-dim', FALLBACK.accentDim)
  };
  return colors;
}

// a canvas sized to w by h css pixels on this screen, cleared and scaled for the dpr
export function prepareCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
