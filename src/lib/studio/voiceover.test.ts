import { beforeEach, describe, expect, it } from 'vitest';
import { editor } from '$lib/editor/editor';
import { frame, selection } from '$lib/stores/app';
import { addProduction, buildFromStoryboard, linkClip, production, removeRecording, startVideo, updateProduction } from '$lib/editor/studio';
import { newLine, sceneStarts } from './production';
import { EMOTIONS, fileNameFor, generatorText, lineCode, matchFiles, numberInName, numberLines, scriptOrder, speakerSheet } from './voiceover';

const W = 1080;
const H = 1920;

describe('voice-over made outside', () => {
  beforeEach(() => {
    editor.newDoc(W, H, 24);
    frame.set(0);
    selection.set(new Set());
  });

  it('numbers every line once, in the order of the script; numbers stay when lines move or new ones come', () => {
    addProduction('comedy', 60);
    updateProduction('lines', (p) => ({
      ...p,
      lines: [
        { ...newLine(p.beats[1].id, 'narrator'), id: 'b', text: 'Zweiter Teil' },
        { ...newLine(p.beats[0].id, 'narrator'), id: 'a', text: 'Erster Teil' }
      ]
    }));
    let p = production()!;
    expect(scriptOrder(p).map((l) => l.id)).toEqual(['a', 'b']);
    expect(p.lines.find((l) => l.id === 'a')!.no).toBe(1);
    expect(p.lines.find((l) => l.id === 'b')!.no).toBe(2);
    updateProduction('more', (q) => ({ ...q, lines: [{ ...newLine(q.beats[0].id, 'narrator'), id: 'c', text: 'Neu davor' }, ...q.lines.reverse()] }));
    p = production()!;
    expect(p.lines.find((l) => l.id === 'a')!.no).toBe(1);
    expect(p.lines.find((l) => l.id === 'b')!.no).toBe(2);
    expect(p.lines.find((l) => l.id === 'c')!.no).toBe(3);
    expect(numberLines(p)).toBe(p);
  });

  it('gives the text with its emotion tag, file names, speaker sheets, and finds lines by the numbers in file names', () => {
    const line = { id: 'x', beat: 'b', speaker: 'tom', text: 'Hallo [Platzhalter] Lina!', scene: null, no: 3, emotion: 'excited' };
    expect(generatorText(line)).toBe('[excited] Hallo Lina!');
    expect(generatorText({ ...line, emotion: undefined, text: 'Ha [laughs] ha' })).toBe('Ha [laughs] ha');
    expect(lineCode(3)).toBe('Z03');
    expect(fileNameFor(line, 'Tom Müller')).toBe('Z03_Tom-Muller.mp3');
    expect(speakerSheet([line], 'Tom')).toBe('Tom\nZ03  [excited] Hallo Lina!');
    for (const [name, no] of [['Z03_Tom.mp3', 3], ['z3 tom.wav', 3], ['03-Tom.m4a', 3], ['ElevenLabs_2026-11-21_Z12_Lina (1).mp3', 12], ['Z120_x.mp3', 120], ['recording.mp3', null], ['2026-11-21.mp3', null]] as const)
      expect(numberInName(name), name).toBe(no);
    expect(EMOTIONS.filter((e) => e.docs).map((e) => e.id)).toContain('whispers');
  });

  it('matches several files to their lines, a second file for a line or an unknown number stays open', () => {
    addProduction('comedy', 60);
    updateProduction('lines', (p) => ({ ...p, lines: [1, 2, 3].map((i) => ({ ...newLine(p.beats[0].id, 'narrator'), id: `l${i}`, text: `Zeile ${i}` })) }));
    const m = matchFiles(['Z02_Erzaehler.mp3', 'Z01_Erzaehler.mp3', 'Z01_again.mp3', 'Z09.mp3', 'take.mp3'], production()!);
    expect(m.map((x) => x.line?.id ?? null)).toEqual(['l2', 'l1', null, null, null]);
  });

  it('replaces a recording without leaving the old clip or its file, removes one, places them at the line starts', async () => {
    addProduction('comedy', 60);
    updateProduction('lines', (p) => ({ ...p, lines: [{ ...newLine(p.beats[1].id, 'narrator'), id: 'l1', text: 'Eine Zeile zum Testen' }] }));
    const clip = (id: string, asset: string) => ({ id, asset, name: id, start: 0, volume: 1, frames: 48 });
    editor.commit('clips', (d) => {
      d.assets.a1 = { id: 'a1', type: 'audio', name: 'a1', data: 'data:audio/wav;base64,' };
      d.assets.a2 = { id: 'a2', type: 'audio', name: 'a2', data: 'data:audio/wav;base64,' };
      d.audio = [clip('c1', 'a1'), clip('c2', 'a2')];
    });
    await linkClip('l1', 'c1');
    await linkClip('l1', 'c2');
    expect(editor.doc.audio!.map((c) => c.id)).toEqual(['c2']);
    expect(editor.doc.assets.a1).toBeUndefined();
    expect(editor.doc.audio![0].track).toBe('narration');
    buildFromStoryboard();
    const p = production()!;
    const span = sceneStarts(p, 24).find((s) => s.scene.beat === p.beats[1].id)!;
    expect(editor.doc.audio![0].start).toBe(span.start);
    expect(p.cues.find((c) => c.line === 'l1')!.end - p.cues.find((c) => c.line === 'l1')!.start).toBeGreaterThanOrEqual(40);
    removeRecording('l1');
    expect(editor.doc.audio).toEqual([]);
    expect(editor.doc.assets.a2).toBeUndefined();
    expect(production()!.lines[0].clip).toBeNull();
  });

  it('the three test videos start with Tom and Lina, numbered lines with emotions, and build', async () => {
    for (const [format, id] of [['knowledge', 'el-octopus'], ['comedy', 'el-fridge'], ['story', 'el-message']] as const) {
      expect(await startVideo(format, id, 60, 24, false, true), id).toBe(true);
      const p = production()!;
      expect(editor.doc.layers.filter((l) => l.character).map((l) => l.character!.name), id).toEqual(['Tom', 'Lina']);
      expect(p.lines.every((l) => l.no && l.scene), id).toBe(true);
      expect(new Set(p.lines.map((l) => l.no)).size).toBe(p.lines.length);
      expect(p.lines.some((l) => l.emotion), id).toBe(true);
      expect(new Set(p.lines.map((l) => l.speaker)).size, id).toBe(3);
      const built = buildFromStoryboard()!;
      expect(built.frames / 24, id).toBeGreaterThanOrEqual(45);
      expect(built.frames / 24, id).toBeLessThanOrEqual(90);
    }
  });
});
