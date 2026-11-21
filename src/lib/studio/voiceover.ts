import type { Production, ScriptLine } from './types';
import { words } from './production';

// the voice-over of a script made outside, by hand, in a generator like ElevenLabs: every line gets a
// number that stays when lines move, the text goes out with its emotion as a tag, the files come back
// with that number in their names and find their lines again. nothing here talks to a server

// emotions as ElevenLabs audio tags. `docs` says whether the tag is in the examples of the ElevenLabs
// prompting guide, the others are free words the models may or may not follow
export const EMOTIONS: { id: string; label: string; docs: boolean }[] = [
  { id: '', label: 'Neutral', docs: true },
  { id: 'excited', label: 'Excited', docs: true },
  { id: 'whispers', label: 'Whispering', docs: true },
  { id: 'laughs', label: 'Laughing', docs: true },
  { id: 'curious', label: 'Curious', docs: true },
  { id: 'sarcastic', label: 'Sarcastic', docs: true },
  { id: 'sighs', label: 'Sighing', docs: true },
  { id: 'crying', label: 'Crying', docs: true },
  { id: 'mischievously', label: 'Mischievous', docs: true },
  { id: 'shouting', label: 'Shouting', docs: true },
  { id: 'angry', label: 'Angry (test it)', docs: false },
  { id: 'calm', label: 'Calm (test it)', docs: false },
  { id: 'nervous', label: 'Nervous (test it)', docs: false }
];

// what the three voices of the channel should sound like, a description to design them from
export const VOICE_BRIEFS: Record<string, string> = {
  narrator: 'Male German narrator, mid 40s, warm, slightly deep and a little raspy, calm and professional, pleasant to listen to',
  tom: 'Young German man, mid 20s, natural and relaxed, casual, slightly deep voice',
  lina: 'Young German woman, mid 20s, friendly, lively and very expressive, bright smile in the voice'
};

export function briefFor(speaker: string, name: string): string {
  if (speaker === 'narrator') return VOICE_BRIEFS.narrator;
  const n = name.trim().toLowerCase();
  return VOICE_BRIEFS[n] ?? '';
}

// the lines in the order they are heard: by part, then as they stand in the script
export function scriptOrder(p: Production): ScriptLine[] {
  const rank = new Map(p.beats.map((b, i) => [b.id, i]));
  return p.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => words(l.text) > 0)
    .sort((a, b) => (rank.get(a.l.beat) ?? 99) - (rank.get(b.l.beat) ?? 99) || a.i - b.i)
    .map(({ l }) => l);
}

// every line a number of its own, new lines get the next free one; numbers never change once given
export function numberLines(p: Production): Production {
  if (p.lines.every((l) => l.no)) return p;
  let next = p.lines.reduce((n, l) => Math.max(n, l.no ?? 0), 0);
  const given = new Map<string, number>();
  for (const l of scriptOrder(p)) if (!l.no) given.set(l.id, ++next);
  for (const l of p.lines) if (!l.no && !given.has(l.id)) given.set(l.id, ++next);
  return { ...p, lines: p.lines.map((l) => (l.no ? l : { ...l, no: given.get(l.id) })) };
}

export function lineCode(no: number | undefined): string {
  return `Z${String(no ?? 0).padStart(2, '0')}`;
}

function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

// the file name to save a recording under, so it finds its line again: Z03_Tom.mp3
export function fileNameFor(line: ScriptLine, speakerName: string): string {
  return `${lineCode(line.no)}_${slug(speakerName) || 'Speaker'}.mp3`;
}

// the text to paste into the generator: the emotion as a tag in front, placeholders in brackets out
export function generatorText(line: ScriptLine): string {
  const text = line.text.replace(/\[[^\]]*\]/g, (m) => (EMOTIONS.some((e) => e.id && `[${e.id}]` === m.toLowerCase()) ? m : '')).replace(/\s+/g, ' ').trim();
  return line.emotion ? `[${line.emotion}] ${text}` : text;
}

// all lines of one speaker as a list to read through or keep: number, emotion and text
export function speakerSheet(lines: ScriptLine[], speakerName: string): string {
  return [`${speakerName}`, ...lines.map((l) => `${lineCode(l.no)}  ${generatorText(l)}`)].join('\n');
}

// the number in a file name: Z03_Tom.mp3, z3 tom.wav, 03-Tom.m4a, ElevenLabs_Z03_Tom (1).mp3
export function numberInName(name: string): number | null {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  const z = base.match(/(?:^|[^a-z0-9])z0*(\d{1,3})(?![0-9])/i);
  if (z) return Number(z[1]);
  const lead = base.match(/^0*(\d{1,3})(?![0-9])/);
  return lead ? Number(lead[1]) : null;
}

export interface Match {
  name: string;
  line: ScriptLine | null;
}

// which line every file belongs to by the number in its name; a file whose number is unknown, or a
// second file for the same line, stays without a line for the person to choose
export function matchFiles(names: string[], p: Production): Match[] {
  const byNo = new Map(p.lines.filter((l) => l.no).map((l) => [l.no!, l]));
  const taken = new Set<string>();
  return names.map((name) => {
    const no = numberInName(name);
    const line = no !== null ? (byNo.get(no) ?? null) : null;
    if (!line || taken.has(line.id)) return { name, line: null };
    taken.add(line.id);
    return { name, line };
  });
}
