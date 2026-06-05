import { translate } from '$lib/core/mat';
import { ellipsePath } from '$lib/core/shapes';
import { dragBox, shapeTool } from './shape';
import StrokeOptions from './options/StrokeOptions.svelte';

export const ellipseTool = {
  ...shapeTool('ellipse', 'Ellipse', (start, e) => {
    const b = dragBox(start, e);
    return {
      path: ellipsePath(0, 0, Math.abs(b.w) / 2, Math.abs(b.h) / 2),
      transform: translate(b.x + b.w / 2, b.y + b.h / 2)
    };
  }),
  options: StrokeOptions
};
