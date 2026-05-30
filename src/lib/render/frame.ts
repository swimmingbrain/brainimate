import type { Item, Keyframe, Layer } from '$lib/core/types';

// index of the keyframe that holds at frame, the last one at or before it
export function keyframeIndexAt(layer: Layer, frame: number): number {
  const keys = layer.keyframes;
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i].frame <= frame) return i;
  return -1;
}

export function keyframeAt(layer: Layer, frame: number): Keyframe | null {
  const i = keyframeIndexAt(layer, frame);
  return i >= 0 ? layer.keyframes[i] : null;
}

// what the layer shows at frame, nothing past its end. tweening comes later
export function itemsAt(layer: Layer, frame: number): Item[] {
  if (frame >= layer.length) return [];
  return keyframeAt(layer, frame)?.items ?? [];
}
