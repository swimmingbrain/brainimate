import { get, writable } from 'svelte/store';
import type { AudioClip, Doc } from '$lib/core/types';
import { makeAsset } from '$lib/core/assets';
import { newId } from '$lib/core/ids';
import { dataUrlBytes } from './project';
import { frame, playing, addToast } from '$lib/stores/app';
import { editor, docVersion } from '$lib/editor/editor';

// sounds on the timeline: a voice for lip sync, music, an effect. they play with the timeline in the
// editor and go into the video. nothing leaves the browser, the files are kept in the document

export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/x-m4a'];
export const AUDIO_ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,.webm,audio/*';

export function isAudioFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name);
}

type Ctx = AudioContext;
let ctx: Ctx | null = null;

function audioContext(): Ctx | null {
  if (ctx) return ctx;
  const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  return ctx;
}

// decoded sounds by asset id, decoded once
const buffers = new Map<string, Promise<AudioBuffer>>();

// the file of an asset as an audio buffer. safari wants a fresh copy of the bytes each time
export function decodeAsset(doc: Pick<Doc, 'assets'>, assetId: string): Promise<AudioBuffer> {
  const known = buffers.get(assetId);
  if (known) return known;
  const asset = doc.assets[assetId];
  const c = audioContext();
  if (!asset || !c) return Promise.reject(new Error('This browser cannot play sound'));
  const { bytes } = dataUrlBytes(asset.data);
  const copy = bytes.slice().buffer;
  const p = new Promise<AudioBuffer>((resolve, reject) => {
    // the callback form works in every safari, the promise form not in old ones
    c.decodeAudioData(copy, resolve, (e) => reject(e ?? new Error('The sound could not be read')));
  });
  buffers.set(assetId, p);
  p.catch(() => buffers.delete(assetId));
  return p;
}

// the loudness of a sound on each frame from 0 to 1: the root mean square of the frame's samples, against
// the loud end of the whole sound so a quiet recording still moves the mouth
export function frameLevels(samples: Float32Array, sampleRate: number, fps: number): number[] {
  const per = Math.max(1, Math.round(sampleRate / Math.max(1, fps)));
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += per) {
    let sum = 0;
    const end = Math.min(samples.length, i + per);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  const sorted = [...out].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] || 0;
  if (loud <= 1e-6) return out.map(() => 0);
  return out.map((v) => Math.min(1, v / loud));
}

// the channels of a buffer mixed down to one
export function monoSamples(buffer: { numberOfChannels: number; length: number; getChannelData(c: number): Float32Array }): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

export async function clipLevels(doc: Doc, clip: AudioClip): Promise<number[]> {
  const buffer = await decodeAsset(doc, clip.asset);
  return frameLevels(monoSamples(buffer), buffer.sampleRate, doc.fps).map((v) => v * clip.volume);
}

// the length of a sound in frames
export function clipFrames(seconds: number, fps: number): number {
  return Math.max(1, Math.ceil(seconds * fps));
}

// a sound file into the document at the playhead, the timeline grows to hold it
export async function importAudio(file: File): Promise<AudioClip | null> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const asset = makeAsset('audio', file.name, data);
  const start = editor.editStack.length === 0 ? editor.frame : 0;
  const clip: AudioClip = { id: newId(), asset: asset.id, name: file.name.replace(/\.\w+$/, ''), start, volume: 1 };
  let frames = 0;
  try {
    const probe = { assets: { [asset.id]: asset } };
    const buffer = await decodeAsset(probe, asset.id);
    frames = clipFrames(buffer.duration, editor.doc.fps);
    clip.frames = frames;
  } catch {
    addToast(`${file.name} could not be read as a sound`, 'error');
    return null;
  }
  editor.commit('Import sound', (draft) => {
    draft.assets[asset.id] = asset;
    draft.audio = [...(draft.audio ?? []), clip];
    for (const l of draft.layers) if (l.type !== 'folder') l.length = Math.max(l.length, start + frames);
  });
  addToast(`${clip.name}: ${(frames / editor.doc.fps).toFixed(1)} s from frame ${start + 1}`, 'success', 2500);
  return clip;
}

export function setClip(id: string, patch: Partial<Pick<AudioClip, 'start' | 'volume' | 'name' | 'rate'>>, key?: string) {
  editor.commit(
    'Sound',
    (draft) => {
      const clip = draft.audio?.find((c) => c.id === id);
      if (!clip) return;
      if (patch.start !== undefined) clip.start = Math.max(0, Math.round(patch.start));
      if (patch.volume !== undefined) clip.volume = Math.max(0, Math.min(1, patch.volume));
      if (patch.rate !== undefined) clip.rate = clipRate({ rate: patch.rate });
      if (patch.name !== undefined && patch.name.trim()) clip.name = patch.name.trim().slice(0, 80);
    },
    key
  );
}

export function removeClip(id: string) {
  editor.commit('Remove sound', (draft) => {
    draft.audio = (draft.audio ?? []).filter((c) => c.id !== id);
  });
}

// playback: when the timeline plays, every sound that is on starts where the playhead is, a pause stops
// them. a sound is never played while scrubbing
let nodes: AudioBufferSourceNode[] = [];
export const muted = writable(false);

function stopAll() {
  for (const n of nodes) {
    try {
      n.stop();
    } catch {
      // already stopped
    }
  }
  nodes = [];
}

async function startAll() {
  stopAll();
  const doc = editor.doc;
  const clips = doc.audio ?? [];
  if (clips.length === 0 || get(muted)) return;
  const c = audioContext();
  if (!c) return;
  // the tap that started playback lets the context run on an ipad
  if (c.state === 'suspended') void c.resume();
  const at = get(frame) / doc.fps;
  for (const clip of clips) {
    let buffer: AudioBuffer;
    try {
      buffer = await decodeAsset(doc, clip.asset);
    } catch {
      continue;
    }
    if (!get(playing)) return;
    const speed = clipRate(clip);
    // seconds into the recording: a faster clip gets through more of it in the same time
    const offset = (at - clip.start / doc.fps) * speed;
    if (offset >= buffer.duration) continue;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speed;
    const gain = c.createGain();
    gain.gain.value = clipGain(doc, clip);
    src.connect(gain).connect(c.destination);
    const when = c.currentTime + Math.max(0, -offset / speed);
    src.start(when, Math.max(0, offset));
    nodes.push(src);
  }
}

export function installAudio(): () => void {
  // made on the first play, inside the tap, or safari keeps it silent
  const offPlay = playing.subscribe((on) => {
    if (on) void startAll();
    else stopAll();
  });
  // a sound removed while playing stops
  const offDoc = docVersion.subscribe(() => {
    if (!get(playing)) return;
    const ids = new Set((editor.doc.audio ?? []).map((c) => c.asset));
    if (nodes.length > 0 && ids.size === 0) stopAll();
  });
  return () => {
    offPlay();
    offDoc();
    stopAll();
  };
}

// the sounds of the export range mixed into one buffer at 48 kHz, null when there is nothing to hear
// how fast a clip plays, a recording of a slow speaker can go a little faster. the pitch moves with it,
// so it stays within a small range
export function clipRate(clip: Pick<AudioClip, 'rate'>): number {
  return Math.max(0.8, Math.min(1.25, clip.rate ?? 1));
}

// how long a clip lasts on the timeline in frames, null when it was never read
export function clipLength(clip: Pick<AudioClip, 'frames' | 'rate'>): number | null {
  return clip.frames ? Math.max(1, Math.round(clip.frames / clipRate(clip))) : null;
}

// how loud a clip plays: its own volume times the volume of its track in a production, nothing when muted
export function clipGain(doc: Doc, clip: AudioClip): number {
  const mix = clip.track ? doc.production?.tracks?.[clip.track] : undefined;
  // the loudness set for the voice of its speaker
  const voice = clip.speaker ? (doc.production?.voices.find((v) => v.speaker === clip.speaker)?.volume ?? 1) : 1;
  if (!mix) return clip.volume * voice;
  return mix.muted ? 0 : clip.volume * mix.volume * voice;
}

// a sound made in the browser added as an asset and a clip on a track, a generated effect or a music bed
export async function addGeneratedClip(dataUrl: string, name: string, start: number, track: NonNullable<AudioClip['track']>, speaker?: string): Promise<string> {
  const asset = makeAsset('audio', name, dataUrl);
  const clip: AudioClip = { id: newId(), asset: asset.id, name, start: Math.max(0, start), volume: 1, track, ...(speaker ? { speaker } : {}) };
  let frames = 1;
  try {
    frames = clipFrames((await decodeAsset({ assets: { [asset.id]: asset } }, asset.id)).duration, editor.doc.fps);
    clip.frames = frames;
  } catch {
    // a sound the browser cannot read back still goes in, the timeline just does not grow for it
  }
  editor.commit(`Sound: ${name}`, (draft) => {
    draft.assets[asset.id] = asset;
    draft.audio = [...(draft.audio ?? []), clip];
    for (const l of draft.layers) if (l.type !== 'folder') l.length = Math.max(l.length, clip.start + frames);
  });
  return clip.id;
}

// the track and the speaker of a clip
export function setClipTrack(id: string, track: NonNullable<AudioClip['track']>, speaker?: string) {
  editor.commit('Sound track', (draft) => {
    const clip = draft.audio?.find((c) => c.id === id);
    if (!clip) return;
    clip.track = track;
    if (speaker !== undefined) clip.speaker = speaker || undefined;
  });
}

export async function mixAudio(doc: Doc, from: number, to: number): Promise<AudioBuffer | null> {
  const clips = (doc.audio ?? []).filter((c) => clipGain(doc, c) > 0);
  if (clips.length === 0) return null;
  const O = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext })
    .OfflineAudioContext ?? (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!O) return null;
  const rate = 48000;
  const seconds = (to - from + 1) / doc.fps;
  const off = new O(2, Math.max(1, Math.ceil(seconds * rate)), rate);
  const out: AudioNode = off.destination;
  let any = false;
  for (const clip of clips) {
    let buffer: AudioBuffer;
    try {
      buffer = await decodeAsset(doc, clip.asset);
    } catch {
      continue;
    }
    const speed = clipRate(clip);
    const offset = ((from - clip.start) / doc.fps) * speed;
    if (offset >= buffer.duration || clip.start > to) continue;
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speed;
    const gain = off.createGain();
    gain.gain.value = clipGain(doc, clip);
    src.connect(gain).connect(out);
    src.start(Math.max(0, -offset / speed), Math.max(0, offset));
    any = true;
  }
  if (!any) return null;
  const mixed = await off.startRendering();
  // voices, music and effects added up can go past full scale: the peaks are brought down, the rest stays
  for (let c = 0; c < mixed.numberOfChannels; c++) limitPeaks(mixed.getChannelData(c), mixed.sampleRate);
  return mixed;
}

// a peak limiter: looks a few milliseconds ahead, turns down just before a peak above the ceiling and
// comes back up slowly, so nothing clips and nothing pumps
export function limitPeaks(x: Float32Array, rate: number, ceiling = 0.94) {
  const ahead = Math.max(1, Math.round(rate * 0.005));
  const release = Math.exp(-1 / (rate * 0.25));
  const need = new Float32Array(x.length);
  let any = false;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    need[i] = a > ceiling ? ceiling / a : 1;
    if (a > ceiling) any = true;
  }
  if (!any) return;
  // each peak reaches back over the look-ahead window, only the samples above the ceiling cost time
  const pre = new Float32Array(need);
  for (let i = 0; i < x.length; i++) {
    if (need[i] >= 1) continue;
    for (let k = Math.max(0, i - ahead); k < i; k++) if (pre[k] > need[i]) pre[k] = need[i];
  }
  // then the gain follows: down at once, back up with a smooth release
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    const target = pre[i];
    g = target < g ? target : Math.min(target, 1 - (1 - g) * release);
    x[i] *= g;
  }
}
