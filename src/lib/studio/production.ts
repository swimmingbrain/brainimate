import { newId } from '$lib/core/ids';
import type { Beat, Cue, Production, Scene, ScriptLine, Source, Status, TrackKind } from './types';
import { beatsOf, type Format, type FormatTemplate } from './formats';

// what a production is made of and how its parts fit in time: scenes last seconds, lines are spoken at
// a pace, subtitles follow the lines. pure functions on a production, the editor wraps them in undo steps

// words a narrator says in a second, a calm german pace
export const WORDS_PER_SECOND = 2.5;

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'script', label: 'Script' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'animation', label: 'Animation' },
  { id: 'sound', label: 'Sound' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' }
];

export const NO_TRACKS: Record<TrackKind, { volume: number; muted: boolean }> = {
  narration: { volume: 1, muted: false },
  dialogue: { volume: 1, muted: false },
  music: { volume: 0.35, muted: false },
  sfx: { volume: 0.8, muted: false }
};

export function words(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w && !/^\[.*\]$/.test(w)).length;
}

// seconds a line takes to say, a short breath after it
export function lineSeconds(text: string): number {
  return words(text) / WORDS_PER_SECOND + 0.3;
}

// a new production from a format and maybe a template, the lengths of the scenes from the target
export function newProduction(format: Format, template: FormatTemplate | null, target: number, speakers: Record<string, string> = {}): Production {
  const beats = beatsOf(format, newId);
  const scenes: Scene[] = (template?.scenes ?? beats.map((b, i) => ({ beat: i, name: b.name, place: '', camera: 'still' as const, action: '' }))).map((s) => ({
    id: newId(),
    name: s.name,
    beat: beats[Math.min(s.beat, beats.length - 1)].id,
    duration: 4,
    place: s.place,
    cast: [],
    action: s.action,
    camera: s.camera,
    transition: 'cut',
    note: ''
  }));
  const lines: ScriptLine[] = (template?.lines ?? []).map((l) => ({
    id: newId(),
    beat: beats[Math.min(l.beat, beats.length - 1)].id,
    speaker: speakers[l.speaker] ?? l.speaker,
    text: l.text,
    scene: null,
    certainty: l.certainty ?? format.certainty
  }));
  const p: Production = {
    version: 1,
    title: template?.title ?? format.label,
    format: format.id,
    description: template?.description ?? '',
    status: 'idea',
    target,
    beats,
    lines,
    scenes,
    sources: [],
    voices: [
      { speaker: 'narrator', label: 'Narrator', pitch: 1, rate: 1, provider: '', voiceId: '' }
    ],
    subtitles: { size: 'medium', position: 0.15, highlight: '#f2c14e', box: true, animation: 'words', shown: true },
    cues: [],
    tracks: structuredCloneSafe(NO_TRACKS),
    original: { work: '', reference: '', checked: false }
  };
  return fitToLength(p, target || 60);
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function totalSeconds(p: Production): number {
  return p.scenes.reduce((n, s) => n + s.duration, 0);
}

// the scenes stretched to a length: every beat gets its share, inside a beat the scenes share it equally
// unless the person made one longer. what the lines need is never cut below
export function fitToLength(p: Production, target: number): Production {
  const out = { ...p, target, scenes: p.scenes.map((s) => ({ ...s })) };
  for (const b of out.beats) {
    const own = out.scenes.filter((s) => s.beat === b.id);
    if (own.length === 0) continue;
    const span = target * b.share;
    const was = own.reduce((n, s) => n + s.duration, 0) || own.length;
    for (const s of own) s.duration = Math.max(0.5, Math.round(((s.duration || 1) / was) * span * 4) / 4);
  }
  // scenes of beats without a share keep their length, a beat without scenes gives its time to the others
  const now = totalSeconds(out);
  if (now > 0 && Math.abs(now - target) > 0.25) {
    const k = target / now;
    for (const s of out.scenes) s.duration = Math.max(0.5, Math.round(s.duration * k * 4) / 4);
  }
  return out;
}

// the words a beat may have to fit its share of the length
export function wordBudget(p: Production, beat: Beat): number {
  return Math.round((p.target || totalSeconds(p)) * beat.share * WORDS_PER_SECOND);
}

export function beatWords(p: Production, beat: Beat): number {
  return p.lines.filter((l) => l.beat === beat.id).reduce((n, l) => n + words(l.text), 0);
}

// the scene a line is heard in: its own, else the first scene of its beat, else the first scene
export function sceneOf(p: Production, line: ScriptLine): Scene | null {
  if (line.scene) {
    const own = p.scenes.find((s) => s.id === line.scene);
    if (own) return own;
  }
  return p.scenes.find((s) => s.beat === line.beat) ?? p.scenes[0] ?? null;
}

// where every scene starts on the timeline, in frames
export function sceneStarts(p: Production, fps: number): { scene: Scene; start: number; end: number }[] {
  let t = 0;
  return p.scenes.map((scene) => {
    const start = Math.round(t * fps);
    t += scene.duration;
    return { scene, start, end: Math.max(start + 1, Math.round(t * fps)) };
  });
}

// subtitles from the script: the lines of a scene one after the other across it, each line split into
// short pieces that read well on a phone, a piece as long as its words take
export function cuesFrom(p: Production, fps: number, maxWords = 6): Cue[] {
  const out: Cue[] = [];
  for (const { scene, start, end } of sceneStarts(p, fps)) {
    const lines = p.lines.filter((l) => sceneOf(p, l)?.id === scene.id && words(l.text) > 0);
    if (lines.length === 0) continue;
    const pieces: { text: string; speaker: string; certainty?: ScriptLine['certainty']; weight: number }[] = [];
    for (const l of lines) {
      const ws = l.text.trim().split(/\s+/);
      for (let i = 0; i < ws.length; i += maxWords) {
        const text = ws.slice(i, i + maxWords).join(' ');
        pieces.push({ text, speaker: l.speaker, certainty: l.certainty, weight: words(text) + 0.6 });
      }
    }
    const need = pieces.reduce((n, x) => n + x.weight / WORDS_PER_SECOND, 0) * fps;
    const room = end - start;
    // as fast as speech, slower only when the scene has room to spare
    const k = need > room ? room / need : 1;
    let t = start;
    for (const x of pieces) {
      const len = Math.max(Math.round(fps * 0.5), Math.round((x.weight / WORDS_PER_SECOND) * fps * k));
      const e = Math.min(end, t + len);
      if (e > t) out.push({ id: newId(), start: t, end: e, text: x.text, speaker: x.speaker, ...(x.certainty ? { certainty: x.certainty } : {}) });
      t = e;
    }
  }
  return out;
}

export interface Check {
  level: 'warning' | 'info';
  text: string;
}

// what to look at before publishing: facts without a source, plot without the original noted, beats
// that will not fit, a length far off the target
export function checks(p: Production, sources: Source[] = p.sources): Check[] {
  const out: Check[] = [];
  const known = new Set(sources.filter((s) => s.citation.trim() || s.url.trim()).map((s) => s.id));
  const facts = p.lines.filter((l) => l.certainty === 'fact' && words(l.text) > 0 && !(l.source && known.has(l.source)));
  if (facts.length) out.push({ level: 'warning', text: `${facts.length} line${facts.length > 1 ? 's' : ''} marked as fact without a source` });
  const unsourced = sources.filter((s) => s.certainty === 'fact' && !s.citation.trim() && !s.url.trim());
  if (unsourced.length) out.push({ level: 'warning', text: `${unsourced.length} fact${unsourced.length > 1 ? 's' : ''} in the sources without a citation` });
  if (p.format === 'recap') {
    if (!p.original.work.trim()) out.push({ level: 'warning', text: 'Which work is this about? Note it under Original' });
    else if (!p.original.checked) out.push({ level: 'warning', text: 'The events are not checked against the original yet' });
    const inter = p.lines.filter((l) => l.certainty === 'interpretation').length;
    if (inter) out.push({ level: 'info', text: `${inter} line${inter > 1 ? 's are' : ' is'} shown as interpretation, not as plot` });
  }
  const placeholders = p.lines.filter((l) => /\[.*\]/.test(l.text)).length;
  if (placeholders) out.push({ level: 'info', text: `${placeholders} line${placeholders > 1 ? 's' : ''} still a placeholder` });
  for (const b of p.beats) {
    const have = beatWords(p, b);
    const may = wordBudget(p, b);
    if (have > may * 1.15 && have > 3) out.push({ level: 'warning', text: `${b.name}: ${have} words, about ${may} fit` });
  }
  const total = totalSeconds(p);
  if (p.target && Math.abs(total - p.target) > 1) out.push({ level: 'info', text: `The scenes last ${total.toFixed(1)} s, the target is ${p.target} s` });
  return out;
}

// ---------------------------------------------------------------- edits, each gives a new production

export function moveIn<T>(list: T[], index: number, by: number): T[] {
  const to = index + by;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const out = [...list];
  const [x] = out.splice(index, 1);
  out.splice(to, 0, x);
  return out;
}

// shares of the beats always add up to one
export function normalizeShares(beats: Beat[]): Beat[] {
  const sum = beats.reduce((n, b) => n + Math.max(0, b.share), 0) || 1;
  return beats.map((b) => ({ ...b, share: Math.max(0, b.share) / sum }));
}

export function duplicateScene(p: Production, id: string): Production {
  const i = p.scenes.findIndex((s) => s.id === id);
  if (i < 0) return p;
  const copy = { ...p.scenes[i], id: newId(), name: `${p.scenes[i].name} copy`, cast: [...p.scenes[i].cast] };
  const scenes = [...p.scenes];
  scenes.splice(i + 1, 0, copy);
  return { ...p, scenes };
}

export function removeScene(p: Production, id: string): Production {
  return { ...p, scenes: p.scenes.filter((s) => s.id !== id), lines: p.lines.map((l) => (l.scene === id ? { ...l, scene: null } : l)) };
}

export function newScene(p: Production, beat: string): Scene {
  return { id: newId(), name: `Scene ${p.scenes.length + 1}`, beat, duration: 3, place: '', cast: [], action: '', camera: 'still', transition: 'cut', note: '' };
}

export function newLine(beat: string, speaker = 'narrator', certainty?: ScriptLine['certainty']): ScriptLine {
  return { id: newId(), beat, speaker, text: '', scene: null, ...(certainty ? { certainty } : {}) };
}

export function newSource(certainty: Source['certainty'] = 'fact'): Source {
  return { id: newId(), claim: '', certainty, citation: '', url: '', note: '' };
}

// a production copied with fresh ids, for an episode built on another one
export function cloneProduction(p: Production, title = `${p.title} copy`): Production {
  const map = new Map<string, string>();
  const fresh = (id: string) => {
    if (!map.has(id)) map.set(id, newId());
    return map.get(id)!;
  };
  return {
    ...JSON.parse(JSON.stringify(p)),
    title,
    status: 'idea',
    beats: p.beats.map((b) => ({ ...b, id: fresh(b.id) })),
    scenes: p.scenes.map((s) => ({ ...s, id: fresh(s.id), beat: fresh(s.beat), cast: [...s.cast] })),
    lines: p.lines.map((l) => ({ ...l, id: fresh(l.id), beat: fresh(l.beat), scene: l.scene ? fresh(l.scene) : null, source: l.source ? fresh(l.source) : l.source })),
    sources: p.sources.map((s) => ({ ...s, id: fresh(s.id) })),
    cues: []
  };
}
