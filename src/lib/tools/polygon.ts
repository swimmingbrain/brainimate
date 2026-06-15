import { get } from 'svelte/store';
import { multiply, rotate, translate } from '$lib/core/mat';
import { polygonPath, starPath } from '$lib/core/shapes';
import { preferences } from '$lib/stores/preferences';
import { shapeTool } from './shape';
import PolygonOptions from './options/PolygonOptions.svelte';

// shift turns the shape in steps of 15 degrees, which keeps it upright too
const STEP = Math.PI / 12;

// a drag from the middle: the distance is the radius and the first corner points at the pointer
export const polygonTool = {
  ...shapeTool('polygon', 'Polygon', (start, e) => {
    const d = get(preferences).drawing;
    const r = Math.hypot(e.x - start.x, e.y - start.y);
    let angle = Math.atan2(e.y - start.y, e.x - start.x) + Math.PI / 2;
    if (e.shift) angle = Math.round(angle / STEP) * STEP;
    const path = d.polygonStar
      ? starPath(0, 0, r, (r * d.polygonInner) / 100, d.polygonSides)
      : polygonPath(0, 0, r, d.polygonSides);
    return {
      path,
      transform: multiply(translate(start.x, start.y), rotate(angle)),
      name: d.polygonStar ? 'Star' : 'Polygon'
    };
  }),
  options: PolygonOptions
};
