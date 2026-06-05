import { translate } from '$lib/core/mat';
import { linePath } from '$lib/core/shapes';
import { snapAngle } from '$lib/core/vec';
import { shapeTool } from './shape';
import StrokeOptions from './options/StrokeOptions.svelte';

// shift keeps the line at 45 degree steps, alt grows it both ways from the start point
export const lineTool = {
  ...shapeTool(
    'line',
    'Line',
    (start, e) => {
      const end = e.shift ? snapAngle(start, e) : { x: e.x, y: e.y };
      const from = e.alt ? { x: 2 * start.x - end.x, y: 2 * start.y - end.y } : start;
      const cx = (from.x + end.x) / 2;
      const cy = (from.y + end.y) / 2;
      return { path: linePath(from.x - cx, from.y - cy, end.x - cx, end.y - cy), transform: translate(cx, cy) };
    },
    false
  ),
  options: StrokeOptions
};
