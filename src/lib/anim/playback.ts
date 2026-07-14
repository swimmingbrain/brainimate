import { get } from 'svelte/store';
import { frame, playing } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import { editor, hover } from '$lib/editor/editor';
import { docLength } from './timeline';

// whole frames that fit into the time that passed, what is left over carries to the next tick.
// after a hidden tab or a long stall it plays on from where it was instead of racing to catch up
export function takeFrames(acc: number, dt: number, fps: number): { steps: number; acc: number } {
  const step = 1000 / Math.max(1, fps);
  let total = acc + Math.max(0, dt);
  if (total > step * 8) total = step;
  const steps = Math.floor(total / step);
  return { steps, acc: total - steps * step };
}

// where playback lands after steps frames, at the end it loops or stops on the last frame
export function playFrame(current: number, steps: number, length: number, loop: boolean): { frame: number; stop: boolean } {
  const last = Math.max(0, length - 1);
  const next = current + steps;
  if (next <= last) return { frame: next, stop: false };
  if (!loop) return { frame: last, stop: true };
  // a playhead parked past the end starts over at the first frame
  return { frame: current > last ? 0 : next % (last + 1), stop: false };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// mm:ss:ff, ff counts the frames within the second
export function formatTime(f: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const seconds = Math.floor(f / rate);
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(f % rate)}`;
}

let raf = 0;
let acc = 0;
let last = 0;

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = last ? now - last : 0;
  last = now;
  const taken = takeFrames(acc, dt, editor.doc.fps);
  acc = taken.acc;
  if (taken.steps === 0) return;
  const loop = get(preferences).timeline.loop;
  const next = playFrame(get(frame), taken.steps, docLength(editor.doc), loop);
  frame.set(next.frame);
  if (next.stop) pause();
}

export function play() {
  if (get(playing)) return;
  const length = docLength(editor.doc);
  // from the last frame without loop it plays again from the start
  if (get(frame) >= length - 1 && !get(preferences).timeline.loop) frame.set(0);
  hover.set(null);
  acc = 0;
  last = 0;
  playing.set(true);
  raf = requestAnimationFrame(tick);
}

export function pause() {
  if (!get(playing)) return;
  cancelAnimationFrame(raf);
  playing.set(false);
  editor.markAll();
}

export function togglePlay() {
  if (get(playing)) pause();
  else play();
}

export function stepFrame(by: number) {
  pause();
  frame.update((f) => Math.max(0, f + by));
}

export function goToFrame(f: number) {
  pause();
  frame.set(Math.max(0, Math.round(f)));
}

export function firstFrame() {
  goToFrame(0);
}

export function lastFrame() {
  goToFrame(docLength(editor.doc) - 1);
}
