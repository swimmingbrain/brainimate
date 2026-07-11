import type { Doc, Keyframe, Layer } from '$lib/core/types';
import { cloneItems } from '$lib/core/items';
import { keyframeAt, keyframeIndexAt, nextKeyframe, poseAt, resolveItems, tweenAt } from '$lib/render/frame';

// every function here changes the layer in place, the editor calls them on a draft inside one commit

export { keyframeAt, keyframeIndexAt, nextKeyframe };

export function blankKeyframe(frame: number): Keyframe {
  return { frame, items: [], pose: {}, tween: null, label: '' };
}

export function isKeyframe(layer: Layer, frame: number): boolean {
  return layer.keyframes.some((k) => k.frame === frame);
}

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

export function docLength(doc: Doc): number {
  return layersLength(doc.layers);
}

// frames after the last keyframe that still show it
export function holdOf(layer: Layer): number {
  const last = layer.keyframes[layer.keyframes.length - 1];
  return last ? layer.length - last.frame : layer.length;
}

// sorted, a keyframe at frame 0 and the length reaching past the last keyframe
function tidy(layer: Layer) {
  layer.keyframes.sort((a, b) => a.frame - b.frame);
  if (layer.keyframes.length === 0 || layer.keyframes[0].frame !== 0) layer.keyframes.unshift(blankKeyframe(0));
  const last = layer.keyframes[layer.keyframes.length - 1];
  layer.length = Math.max(layer.length, last.frame + 1, 1);
}

// count frames go in after frame, later keyframes move along. past the end the layer is
// stretched so its last keyframe holds up to there
export function insertFrame(layer: Layer, frame: number, count = 1) {
  if (!hasFrames(layer) || count <= 0 || frame < 0) return;
  if (frame >= layer.length) {
    layer.length = frame + count;
    return;
  }
  for (const k of layer.keyframes) if (k.frame > frame) k.frame += count;
  layer.length += count;
}

function removeOne(layer: Layer, frame: number): boolean {
  if (frame < 0 || frame >= layer.length || layer.length <= 1) return false;
  const i = keyframeIndexAt(layer, frame);
  const key = layer.keyframes[i];
  const end = layer.keyframes[i + 1]?.frame ?? layer.length;
  // a keyframe that only lasts this one frame goes with it
  if (end - key.frame === 1) layer.keyframes.splice(i, 1);
  for (const k of layer.keyframes) if (k.frame > frame) k.frame -= 1;
  layer.length -= 1;
  tidy(layer);
  return true;
}

// the frame goes and everything after it moves back, a span gets shorter by one
export function removeFrame(layer: Layer, frame: number, count = 1) {
  if (!hasFrames(layer)) return;
  for (let i = 0; i < count; i++) if (!removeOne(layer, frame)) return;
}

function addKey(layer: Layer, key: Keyframe): Keyframe {
  const index = layer.keyframes.findIndex((k) => k.frame > key.frame);
  if (index < 0) layer.keyframes.push(key);
  else layer.keyframes.splice(index, 0, key);
  layer.length = Math.max(layer.length, key.frame + 1);
  // the array hands back the draft when this runs inside a commit
  return layer.keyframes.find((k) => k.frame === key.frame)!;
}

// a keyframe holding a copy of what the layer shows there, so inside a tween the in between
// state is frozen and tweens on to the next keyframe. ids stay so later tweens still match
export function insertKeyframe(layer: Layer, frame: number): Keyframe {
  const existing = layer.keyframes.find((k) => k.frame === frame);
  if (existing || !hasFrames(layer)) return existing ?? layer.keyframes[0];
  const spot = tweenAt(layer, frame);
  return addKey(layer, {
    frame,
    items: cloneItems(resolveItems(layer, frame)),
    pose: JSON.parse(JSON.stringify(poseAt(layer, frame))),
    tween: spot ? { ease: spot.key.tween!.ease } : null,
    label: ''
  });
}

// an empty keyframe, what came before stops showing there
export function insertBlankKeyframe(layer: Layer, frame: number): Keyframe {
  const existing = layer.keyframes.find((k) => k.frame === frame);
  if (existing || !hasFrames(layer)) return existing ?? layer.keyframes[0];
  return addKey(layer, blankKeyframe(frame));
}

// the keyframe goes and the one before holds through its frames, the first one always stays
export function clearKeyframe(layer: Layer, frame: number): boolean {
  const i = layer.keyframes.findIndex((k) => k.frame === frame);
  if (i <= 0) return false;
  layer.keyframes.splice(i, 1);
  return true;
}

// the keyframe an edit at frame lands in, with auto key (or past the end) a new one is made first
export function keyframeForEdit(layer: Layer, frame: number, autoKey: boolean): Keyframe {
  if (autoKey || frame >= layer.length) return insertKeyframe(layer, frame);
  return keyframeAt(layer, frame) ?? insertKeyframe(layer, frame);
}

// on the keyframe whose span holds frame, null turns the tween off
export function setTween(layer: Layer, frame: number, ease: string | null) {
  const key = keyframeAt(layer, frame);
  if (key) key.tween = ease === null ? null : { ease };
}

export function setLabel(layer: Layer, frame: number, label: string) {
  const key = keyframeAt(layer, frame);
  if (key) key.label = label.trim();
}
