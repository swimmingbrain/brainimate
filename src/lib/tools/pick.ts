import type { Item, Vec } from '$lib/core/types';
import { identity } from '$lib/core/mat';
import { hitTest } from '$lib/core/hit';
import { intersects, type Box } from '$lib/core/bbox';
import { itemBounds } from '$lib/core/items';
import { editor } from '$lib/editor/editor';

// the topmost item under p on the layers that can be edited, a group counts as one item
export function pickItem(p: Vec, zoom: number, factor: number): Item | null {
  const layers = editor.currentLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!editor.isEditable(layer)) continue;
    const hit = hitTest(editor.layerItems(layer), identity(), p, zoom, factor);
    if (hit) return hit;
  }
  return null;
}

// top level items whose bounds touch the box, like a marquee in intersect mode
export function itemsInBox(box: Box): string[] {
  const ids: string[] = [];
  for (const layer of editor.currentLayers()) {
    if (!editor.isEditable(layer)) continue;
    for (const item of editor.layerItems(layer)) {
      if (item.locked || !item.visible) continue;
      if (intersects(box, itemBounds(item, item.transform))) ids.push(item.id);
    }
  }
  return ids;
}
