import { get } from 'svelte/store';
import { translate } from '$lib/core/mat';
import { rectPath } from '$lib/core/shapes';
import { toolOptions } from '$lib/stores/app';
import { dragBox, shapeTool } from './shape';
import RectOptions from './options/RectOptions.svelte';

// the path sits around the local origin and the transform carries the position,
// so a later rotation or tween turns the rect around its middle
export const rectTool = {
  ...shapeTool('rect', 'Rectangle', (start, e) => {
    const b = dragBox(start, e);
    const w = Math.abs(b.w);
    const h = Math.abs(b.h);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return { path: rectPath(-w / 2, -h / 2, w, h, get(toolOptions).rectRadius), transform: translate(cx, cy) };
  }),
  options: RectOptions
};
