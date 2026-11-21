import { describe, expect, it } from 'vitest';
import { clipFrames, frameLevels, isAudioFile, monoSamples } from './audio';
import { usedAssets } from '$lib/core/assets';
import { makeDoc } from '$lib/editor/editor';
import { packDoc, parseBytes } from './project';

describe('sound', () => {
  it('knows sound files by type or name', () => {
    expect(isAudioFile({ type: 'audio/mpeg', name: 'x' })).toBe(true);
    expect(isAudioFile({ type: '', name: 'voice.M4A' })).toBe(true);
    expect(isAudioFile({ type: 'image/png', name: 'a.png' })).toBe(false);
  });

  it('measures how loud each frame is, against the loud end of the sound', () => {
    const rate = 4800;
    const fps = 24;
    const per = rate / fps;
    // a quiet frame, a loud one, a half loud one
    const samples = new Float32Array(per * 3);
    for (let i = 0; i < per; i++) {
      samples[i] = 0;
      samples[per + i] = i % 2 ? 0.4 : -0.4;
      samples[2 * per + i] = i % 2 ? 0.2 : -0.2;
    }
    const levels = frameLevels(samples, rate, fps);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toBe(0);
    expect(levels[1]).toBeCloseTo(1);
    expect(levels[2]).toBeCloseTo(0.5);
    expect(frameLevels(new Float32Array(400), rate, fps).every((v) => v === 0)).toBe(true);
  });

  it('mixes the channels down and counts frames', () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([0, 1]);
    const mono = monoSamples({ numberOfChannels: 2, length: 2, getChannelData: (c) => (c ? right : left) });
    expect([...mono]).toEqual([0.5, 0.5]);
    expect(clipFrames(2.01, 24)).toBe(49);
  });

  it('keeps the sound of the timeline when the document is saved', () => {
    const doc = makeDoc(1080, 1920, 24);
    const data = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    doc.assets.snd = { id: 'snd', type: 'audio', name: 'voice.wav', data };
    doc.assets.unused = { id: 'unused', type: 'audio', name: 'old.wav', data };
    doc.audio = [{ id: 'c1', asset: 'snd', name: 'voice', start: 12, volume: 0.8 }];
    expect(usedAssets(doc).has('snd')).toBe(true);
    expect(usedAssets(doc).has('unused')).toBe(false);
    const back = parseBytes(packDoc(doc)).doc;
    expect(back.audio).toEqual(doc.audio);
    expect(back.assets.snd.data).toBe(data);
    expect(back.assets.unused).toBeUndefined();
  });
});

describe('the peak limiter of the export', () => {
  it('keeps every sample under the ceiling and leaves quiet parts alone', async () => {
    const { limitPeaks } = await import('./audio');
    const rate = 8000;
    const x = new Float32Array(rate * 2);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin(i / 5) * (i > rate ? 1.6 : 0.3);
    const quiet = x.slice(0, rate / 2);
    limitPeaks(x, rate, 0.94);
    expect(Math.max(...Array.from(x).map(Math.abs))).toBeLessThanOrEqual(0.9401);
    expect(Array.from(x.slice(0, rate / 2))).toEqual(Array.from(quiet));
  });
});
