// offscreen canvases for the ghosts, tints and dimmed layers, a plain canvas where there is no OffscreenCanvas
export type Surface = OffscreenCanvas | HTMLCanvasElement;
export type SurfaceCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function surface(w: number, h: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function context(s: Surface): SurfaceCtx {
  return s.getContext('2d') as SurfaceCtx;
}

// the same surface again while the size fits, a new one when it does not
export function sized(s: Surface | null, w: number, h: number): Surface {
  if (s && s.width === w && s.height === h) return s;
  return surface(w, h);
}
