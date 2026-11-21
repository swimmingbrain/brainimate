import { beforeEach, describe, expect, it } from 'vitest';
import type { Item } from '$lib/core/types';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { createCharacter } from '$lib/editor/character';
import { characterLayers, defaultCharacter } from '$lib/character/model';
import { FORMATS } from './formats';
import { checks, cuesFrom, fitToLength, newProduction, sceneStarts, totalSeconds, words, cloneProduction, wordBudget, beatWords } from './production';
import { buildTimeline, MARK } from './build';
import { SFX, MOODS, musicSamples, sfxSamples, wavDataUrl } from './sounds';
import { VISUALS, makeVisual, makeChart } from './visuals';
import { addProduction, buildFromStoryboard, production, updateProduction, setLength, asNewEpisode } from '$lib/editor/studio';
import { animateSelection, insertVisual, MOVES } from '$lib/editor/visuals';
import { clipGain } from '$lib/io/audio';
import { resolveItems } from '$lib/render/frame';

const W = 1080;
const H = 1920;

describe('formats and productions', () => {
  it('has the six formats with their structures, every template starts a production that fits its length', () => {
    expect(FORMATS.map((f) => f.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(FORMATS.find((f) => f.id === 'recap')!.beats.map((b) => b.name)).toEqual(['Hook', 'Setup', 'Key events', 'Climax', 'Resolution']);
    for (const f of FORMATS) {
      expect(f.beats.reduce((n, b) => n + b.share, 0)).toBeCloseTo(1, 5);
      for (const t of [null, ...f.templates])
        for (const target of [60, 90, 120]) {
          const p = newProduction(f, t, target);
          expect(Math.abs(totalSeconds(p) - target), `${f.id} ${t?.id} ${target}`).toBeLessThan(1);
          expect(p.scenes.every((s) => p.beats.some((b) => b.id === s.beat))).toBe(true);
        }
    }
  });

  it('scales the scenes to 60, 90 and 120 seconds and tells how many words fit each beat', () => {
    const f = FORMATS.find((x) => x.id === 'recap')!;
    const p = newProduction(f, f.templates[0], 60);
    const q = fitToLength(p, 120);
    expect(totalSeconds(q)).toBeCloseTo(120, 0);
    const key = q.beats.find((b) => b.name === 'Key events')!;
    expect(wordBudget(q, key)).toBeGreaterThan(wordBudget(p, p.beats.find((b) => b.name === 'Key events')!) * 1.8);
    expect(beatWords(q, key)).toBeGreaterThanOrEqual(0);
  });

  it('makes subtitles from the script inside the scenes, short pieces in order', () => {
    const f = FORMATS.find((x) => x.id === 'comedy')!;
    const p = newProduction(f, f.templates[0], 30);
    const cues = cuesFrom(p, 24);
    const spans = sceneStarts(p, 24);
    expect(cues.length).toBeGreaterThan(p.lines.length - 1);
    for (const c of cues) {
      expect(words(c.text)).toBeLessThanOrEqual(6);
      expect(c.end).toBeGreaterThan(c.start);
      expect(spans.some((s) => c.start >= s.start && c.end <= s.end)).toBe(true);
    }
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].start);
  });

  it('warns about facts without sources, unchecked plot and hypotheses never pass as facts', () => {
    const recap = FORMATS.find((x) => x.id === 'recap')!;
    const p = newProduction(recap, recap.templates[0], 60);
    const texts = checks(p).map((c) => c.text);
    expect(texts.some((t) => t.includes('Which work'))).toBe(true);
    const k = newProduction(FORMATS.find((x) => x.id === 'knowledge')!, null, 60);
    k.lines.push({ id: 'l', beat: k.beats[1].id, speaker: 'narrator', text: 'Licht wird gestreut', scene: null, certainty: 'fact' });
    expect(checks(k).some((c) => c.text.includes('without a source'))).toBe(true);
    k.sources.push({ id: 's', claim: 'Streuung', certainty: 'fact', citation: 'Lehrbuch Physik, S. 12', url: '', note: '' });
    k.lines[k.lines.length - 1].source = 's';
    expect(checks(k).some((c) => c.text.includes('without a source'))).toBe(false);
    const w = newProduction(FORMATS.find((x) => x.id === 'whatif')!, FORMATS.find((x) => x.id === 'whatif')!.templates[0], 60);
    expect(w.lines[0].certainty).toBe('hypothesis');
    expect(cuesFrom(w, 24)[0].certainty).toBe('hypothesis');
  });

  it('copies a production for a new episode with fresh ids', () => {
    const p = newProduction(FORMATS[0], FORMATS[0].templates[0], 60);
    const q = cloneProduction(p, 'Episode 2');
    expect(q.title).toBe('Episode 2');
    expect(q.scenes.map((s) => s.id)).not.toEqual(p.scenes.map((s) => s.id));
    expect(q.scenes.every((s) => q.beats.some((b) => b.id === s.beat))).toBe(true);
  });
});

describe('building the timeline', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('lays every scene onto the timeline: places, camera shots, subtitles, characters out of their scenes; again replaces it', () => {
    const tom = createCharacter({ ...defaultCharacter(W, H), name: 'Tom', x: 300 })!;
    const lina = createCharacter({ ...defaultCharacter(W, H), name: 'Lina', x: 780 })!;
    addProduction('recap', 60);
    updateProduction('cast', (p) => {
      p.scenes[0].place = 'street';
      p.scenes[1].place = 'office';
      p.scenes[1].cast = [tom];
      p.scenes[2].camera = 'closeup';
      p.scenes[3].transition = 'fade';
      p.lines.push({ id: 'l1', beat: p.beats[0].id, speaker: 'narrator', text: 'Eine Geschichte in sechzig Sekunden', scene: null, certainty: 'plot' });
      return p;
    });
    const built = buildFromStoryboard()!;
    expect(built.scenes).toBe(production()!.scenes.length);
    const spans = sceneStarts(production()!, 24);
    const bg = editor.doc.layers.find((l) => l.name === 'Background')!;
    expect(bg.keyframes.find((k) => k.frame === spans[1].start)!.items.length).toBeGreaterThan(2);
    const cam = editor.doc.layers.find((l) => l.type === 'camera')!;
    expect(cam.keyframes.find((k) => k.frame === spans[3].start)!.camera!.transition!.kind).toBe('fade');
    expect(cam.keyframes.find((k) => k.frame === spans[2].start)!.camera!.zoom).toBeGreaterThan(1.5);
    // lina is not in scene 2, tom is
    const shown = (id: string, f: number) => resolveItems(characterLayers(editor.doc.layers, id)!.body!, f).find((i) => i.role === 'torso')!.visible;
    expect(shown(lina, spans[1].start + 2)).toBe(false);
    expect(shown(tom, spans[1].start + 2)).toBe(true);
    expect(shown(lina, spans[2].start + 2)).toBe(true);
    expect(production()!.cues.length).toBeGreaterThan(0);
    expect(Math.max(...editor.doc.layers.map((l) => l.length))).toBeGreaterThanOrEqual(spans[spans.length - 1].end);
    // building again keeps one set of marked keys
    const count = cam.keyframes.length;
    buildFromStoryboard();
    expect(editor.doc.layers.find((l) => l.type === 'camera')!.keyframes.length).toBe(count);
    expect(bg.keyframes.filter((k) => k.label.startsWith(MARK)).length).toBe(editor.doc.layers.find((l) => l.name === 'Background')!.keyframes.filter((k) => k.label.startsWith(MARK)).length);
    // one undo step
    editor.undo();
    editor.undo();
    expect(editor.doc.layers.find((l) => l.type === 'camera')).toBeUndefined();
  });

  it('keeps the production in the project file and as a new episode', async () => {
    addProduction('knowledge', 90);
    setLength(60);
    const { packDoc, parseBytes } = await import('$lib/io/project');
    const back = parseBytes(packDoc(editor.doc)).doc;
    expect(back.production!.format).toBe('knowledge');
    expect(back.production!.target).toBe(60);
    const ep = asNewEpisode(editor.doc, 'Folge 2');
    expect(ep.production!.title).toBe('Folge 2');
  });
});

describe('sound, visuals and moves', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('generates every sound effect and music bed as a wav', () => {
    for (const s of SFX) expect(sfxSamples(s.id).length, s.id).toBeGreaterThan(100);
    for (const m of MOODS) expect(musicSamples(m.id, 3).length).toBe(72000);
    const url = wavDataUrl(sfxSamples('pop'));
    expect(url.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
  });

  it('mixes by track: a muted track is silent, a track volume scales its clips', () => {
    addProduction('comedy');
    const doc = editor.doc;
    const clip = { id: 'c', asset: 'a', name: 'x', start: 0, volume: 0.8, track: 'music' as const };
    expect(clipGain(doc, clip)).toBeCloseTo(0.8 * doc.production!.tracks.music.volume);
    updateProduction('mute', (p) => ({ ...p, tracks: { ...p.tracks, music: { volume: 1, muted: true } } }));
    expect(clipGain(editor.doc, clip)).toBe(0);
    expect(clipGain(editor.doc, { ...clip, track: undefined })).toBe(0.8);
  });

  it('draws every visual, charts from values, and animates them with keyframes', () => {
    for (const v of VISUALS) {
      const it = makeVisual(v.id, { x: 0, y: 0 });
      expect(it, v.id).toBeTruthy();
      expect((it as Extract<Item, { type: 'group' }>).children.length, v.id).toBeGreaterThan(0);
    }
    expect(new Set(VISUALS.map((v) => v.category)).size).toBe(12);
    const chart = makeChart('bars', [1, 4, 2], ['a', 'b', 'c'], { x: 0, y: 0 }) as Extract<Item, { type: 'group' }>;
    expect(chart.children.filter((c) => c.role === 'bar')).toHaveLength(3);
    const id = insertVisual('car')!;
    expect(animateSelection('drive')).toBe(true);
    const layer = editor.doc.layers.find((l) => l.keyframes.some((k) => k.items.some((i) => i.id === id)))!;
    const x = (f: number) => resolveItems(layer, f).find((i) => i.id === id)!.transform[4];
    expect(x(0)).toBeLessThan(0);
    expect(x(59)).toBeGreaterThan(W);
    frame.set(30);
    for (const m of MOVES.filter((m) => m.id !== 'grow')) expect(animateSelection(m.id), m.id).toBe(true);
  });
});
