import { isDraft } from 'immer';
import type { BonePose, Item, Keyframe, Layer } from '$lib/core/types';
import { applyEase } from '$lib/anim/easing';
import { tweenItems, tweenPose } from '$lib/anim/tween';

// folders hold no frames of their own
export function hasFrames(layer: Layer): boolean {
  return layer.type !== 'folder';
}

// the frames the longest layer runs for, at least one
export function layersLength(layers: Layer[]): number {
  let n = 1;
  for (const l of layers) if (hasFrames(l)) n = Math.max(n, l.length);
  return n;
}

export function parentFolder(layers: Layer[], layer: Layer): Layer | null {
  if (!layer.parent) return null;
  const p = layers.find((l) => l.id === layer.parent);
  return p && p.type === 'folder' ? p : null;
}

// a hidden folder hides what is in it
export function isLayerShown(layers: Layer[], layer: Layer): boolean {
  let depth = 0;
  for (let l: Layer | null = layer; l && depth <= layers.length; l = parentFolder(layers, l), depth++) {
    if (!l.visible) return false;
  }
  return true;
}

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

// the first keyframe after frame
export function nextKeyframe(layer: Layer, frame: number): Keyframe | null {
  return layer.keyframes.find((k) => k.frame > frame) ?? null;
}

export interface TweenSpot {
  key: Keyframe;
  next: Keyframe;
  // eased, 0 at key and 1 at next
  t: number;
}

// where frame sits inside a tween, null on a keyframe, a hold or a tween with no keyframe to go to
export function tweenAt(layer: Layer, frame: number): TweenSpot | null {
  const i = keyframeIndexAt(layer, frame);
  if (i < 0) return null;
  const key = layer.keyframes[i];
  const next = layer.keyframes[i + 1];
  if (!key.tween || !next || frame <= key.frame) return null;
  return { key, next, t: applyEase(key.tween.ease, (frame - key.frame) / (next.frame - key.frame)) };
}

interface TweenCache {
  next: Keyframe;
  a: Item[];
  b: Item[];
  span: number;
  ease: string;
  // offset from the keyframe to the items there
  frames: Map<number, Item[]>;
}

// a frame resolved once gives the same objects every time, so selections, hit tests and
// the Path2D cache all agree. playback and onion skins visit a handful of frames per keyframe
const cache = new WeakMap<Keyframe, TweenCache>();
const CACHED_FRAMES = 32;

// what the layer shows at frame without looking at where it ends, a tween in progress included
export function resolveItems(layer: Layer, frame: number): Item[] {
  const i = keyframeIndexAt(layer, frame);
  if (i < 0) return [];
  const key = layer.keyframes[i];
  const next = layer.keyframes[i + 1];
  if (!key.tween || !next || frame <= key.frame) return key.items;
  const offset = frame - key.frame;
  const span = next.frame - key.frame;
  const ease = key.tween.ease;
  const t = applyEase(ease, offset / span);
  // a draft inside a commit can still change, it is never cached
  if (isDraft(key) || isDraft(next)) return tweenItems(key.items, next.items, t);
  let entry = cache.get(key);
  const stale = !entry || entry.next !== next || entry.a !== key.items || entry.b !== next.items;
  if (!entry || stale || entry.span !== span || entry.ease !== ease) {
    entry = { next, a: key.items, b: next.items, span, ease, frames: new Map() };
    cache.set(key, entry);
  }
  let items = entry.frames.get(offset);
  if (!items) {
    items = tweenItems(key.items, next.items, t);
    if (entry.frames.size >= CACHED_FRAMES) entry.frames.delete(entry.frames.keys().next().value as number);
    entry.frames.set(offset, items);
  }
  return items;
}

// what the layer shows at frame, nothing past its end
export function itemsAt(layer: Layer, frame: number): Item[] {
  if (frame < 0 || frame >= layer.length) return [];
  return resolveItems(layer, frame);
}

// the bone pose of a rig layer at frame, tweened like the items
export function poseAt(layer: Layer, frame: number): Record<string, BonePose> {
  const key = keyframeAt(layer, frame);
  if (!key) return {};
  const spot = tweenAt(layer, frame);
  return spot ? tweenPose(spot.key.pose, spot.next.pose, spot.t) : key.pose;
}
