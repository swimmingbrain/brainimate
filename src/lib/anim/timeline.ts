import type { Keyframe, Layer } from '$lib/core/types';
import { cloneItems } from '$lib/core/items';
import { keyframeAt } from '$lib/render/frame';

export function isKeyframe(layer: Layer, frame: number): boolean {
  return layer.keyframes.some((k) => k.frame === frame);
}

// a new keyframe holding a copy of what the layer shows there, ids stay so a tween can match items
export function insertKeyframe(layer: Layer, frame: number): Keyframe {
  const existing = layer.keyframes.find((k) => k.frame === frame);
  if (existing) return existing;
  const from = keyframeAt(layer, frame);
  const key: Keyframe = {
    frame,
    items: from ? cloneItems(from.items) : [],
    pose: from ? JSON.parse(JSON.stringify(from.pose)) : {},
    tween: null,
    label: ''
  };
  const index = layer.keyframes.findIndex((k) => k.frame > frame);
  if (index < 0) layer.keyframes.push(key);
  else layer.keyframes.splice(index, 0, key);
  layer.length = Math.max(layer.length, frame + 1);
  return layer.keyframes.find((k) => k.frame === frame)!;
}

// the keyframe an edit at frame lands in, with auto key (or past the end) a new one is made first
export function keyframeForEdit(layer: Layer, frame: number, autoKey: boolean): Keyframe {
  if (autoKey || frame >= layer.length) return insertKeyframe(layer, frame);
  return keyframeAt(layer, frame) ?? insertKeyframe(layer, frame);
}
