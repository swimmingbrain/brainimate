import { get } from 'svelte/store';
import type { Doc } from '$lib/core/types';
import { addToast, dialog, dirty, frame } from '$lib/stores/app';
import { editor, makeDoc, makeLayer, LAYER_COLORS } from './editor';
import { COMIC_SCENE_LAYERS } from '$lib/core/comic';
import { characterFolders } from '$lib/character/model';
import { libraryEntry, loadLibrary, placeOffset } from '$lib/character/library';
import { insertPackage } from './character';
import { FORMATS, type Format } from '$lib/studio/formats';
import { cloneProduction, cuesFrom, fitScenesToSpeech, fitToLength, newProduction, sceneOf, sceneStarts } from '$lib/studio/production';
import { buildTimeline, clipSeconds, type Built } from '$lib/studio/build';
import { customFormats } from '$lib/studio/library';
import type { Production, ScriptLine, Voice } from '$lib/studio/types';
import { addGeneratedClip, clipFrames, decodeAsset, importAudio, setClipTrack } from '$lib/io/audio';
import { musicSamples, sfxSamples, wavDataUrl, type Mood, type Sfx } from '$lib/studio/sounds';
import { pickFiles } from './importer';

// the studio in the editor: the production of the open document, changed in undo steps like everything
// else, a new video from a format, the storyboard laid onto the timeline, sounds, voices and subtitles

export function production(): Production | null {
  return editor.doc.production ?? null;
}

export function allFormats(): Format[] {
  return [...FORMATS, ...get(customFormats)];
}

export function formatOf(id: string): Format | null {
  return allFormats().find((f) => f.id === id) ?? null;
}

// a change of the production, one undo step, a slider dragged is one too with a key
export function updateProduction(label: string, change: (p: Production) => Production, key?: string) {
  const p = production();
  if (!p) return;
  editor.commit(
    label,
    (draft) => {
      draft.production = change(JSON.parse(JSON.stringify(draft.production)) as Production);
    },
    key
  );
}

// a new video: a vertical project with the comic layers, the production of a format and maybe a template,
// the main characters put in when asked and the lines of the template given to them
export async function startVideo(formatId: string, templateId: string | null, target: number, fps: 24 | 30, mains: boolean, confirmed = false): Promise<boolean> {
  const format = formatOf(formatId);
  if (!format) return false;
  if (!confirmed && get(dirty)) {
    dialog.set({
      kind: 'confirm',
      title: 'New video',
      message: 'The open project has changes that are not saved. Start a new video anyway?',
      confirm: 'Start',
      danger: true,
      onconfirm: () => void startVideo(formatId, templateId, target, fps, mains, true)
    });
    return false;
  }
  const template = format.templates.find((t) => t.id === templateId) ?? null;
  const doc = makeDoc(1080, 1920, fps);
  doc.layers = COMIC_SCENE_LAYERS.map((name, i) => makeLayer(name, LAYER_COLORS[i % LAYER_COLORS.length]));
  editor.loadDoc(doc);
  const speakers: Record<string, string> = { main1: 'Main character 1', main2: 'Main character 2' };
  if (mains) {
    const list = await loadLibrary();
    for (const slot of [1, 2] as const) {
      const m = list.find((x) => x.main === slot);
      const e = m ? await libraryEntry(m.id) : null;
      if (!e) continue;
      const off = placeOffset(e.pkg, editor.doc);
      // the two stand apart, one left and one right
      const id = insertPackage(e.pkg, off.dx + (slot === 1 ? -0.2 : 0.2) * editor.doc.width, off.dy);
      if (id) speakers[`main${slot}`] = id;
    }
  }
  const p = newProduction(format, template, target, speakers);
  editor.commit('New video', (draft) => {
    draft.production = p;
    draft.name = p.title;
  });
  editor.setName(p.title);
  frame.set(0);
  return true;
}

// a production for a project that has none yet
export function addProduction(formatId: string, target = 60) {
  const format = formatOf(formatId);
  if (!format) return;
  const p = newProduction(format, null, target);
  editor.commit('Add production', (draft) => {
    draft.production = p;
  });
}

// the storyboard laid onto the timeline in one undo step
export function buildFromStoryboard(): Built | null {
  const p = production();
  if (!p) return null;
  if (p.scenes.length === 0) {
    addToast('Add a scene to the storyboard first', 'info');
    return null;
  }
  let built: Built | null = null;
  editor.commit('Build from storyboard', (draft) => {
    built = buildTimeline(draft, JSON.parse(JSON.stringify(draft.production)) as Production);
  });
  if (built) {
    const b = built as Built;
    addToast(`${b.scenes} scenes, ${(b.frames / editor.doc.fps).toFixed(1)} s, ${b.cues} subtitles on the timeline`, 'success', 3000);
  }
  return built;
}

export function setLength(seconds: number) {
  updateProduction('Video length', (p) => fitToLength(p, seconds));
}

// the subtitles worked out again from the script
export function refreshSubtitles() {
  updateProduction('Subtitles from the script', (p) => ({ ...p, cues: cuesFrom(p, editor.doc.fps, 6, clipSeconds(editor.doc)) }));
}

// who can speak: the narrator, the characters of the project, names used in the script
export function speakers(): { id: string; label: string }[] {
  const out = [{ id: 'narrator', label: 'Narrator' }];
  for (const f of characterFolders(editor.doc.layers)) out.push({ id: f.id, label: f.character?.name ?? f.name });
  for (const l of production()?.lines ?? []) if (!out.some((s) => s.id === l.speaker) && l.speaker) out.push({ id: l.speaker, label: l.speaker });
  return out;
}

export function speakerName(id: string): string {
  return speakers().find((s) => s.id === id)?.label ?? id;
}

// the voice of a speaker: what this video set, else what the character keeps in every project
export function voiceOf(speaker: string): Voice {
  const v = production()?.voices.find((x) => x.speaker === speaker);
  if (v) return v;
  const own = characterFolders(editor.doc.layers).find((f) => f.id === speaker)?.character?.voice;
  return { speaker, label: speakerName(speaker), pitch: 1, rate: 1, provider: '', voiceId: '', ...(own ?? {}) };
}

// a voice set for this video and, for a character, kept with it: saved to the library it comes along
// into the next project. a locked look does not lock the voice
export function setVoice(speaker: string, change: Partial<Voice>, key?: string) {
  const p = production();
  if (!p) return;
  const next = { ...voiceOf(speaker), ...change, speaker };
  editor.commit(
    'Voice',
    (draft) => {
      const prod = JSON.parse(JSON.stringify(draft.production)) as Production;
      prod.voices = [...prod.voices.filter((v) => v.speaker !== speaker), next];
      draft.production = prod;
      const folder = draft.layers.find((l) => l.id === speaker && l.character);
      if (folder?.character) folder.character.voice = { pitch: next.pitch, rate: next.rate, volume: next.volume ?? 1, provider: next.provider, voiceId: next.voiceId, ...(next.style ? { style: next.style } : {}) };
    },
    key
  );
}

// a recording linked to a line: the line takes as long as the recording, and building puts it where the
// line starts. null takes the link away, the sound stays on the timeline
export async function linkClip(lineId: string, clipId: string | null) {
  const clip = clipId ? editor.doc.audio?.find((c) => c.id === clipId) : null;
  let frames = clip?.frames ?? 0;
  if (clip && !frames) {
    try {
      frames = clipFrames((await decodeAsset(editor.doc, clip.asset)).duration, editor.doc.fps);
    } catch {
      frames = 0;
    }
  }
  const line = production()?.lines.find((l) => l.id === lineId);
  if (!line) return;
  editor.commit('Link recording', (draft) => {
    const prod = JSON.parse(JSON.stringify(draft.production)) as Production;
    const l = prod.lines.find((x) => x.id === lineId);
    if (l) l.clip = clipId;
    draft.production = prod;
    const c = clipId ? draft.audio?.find((x) => x.id === clipId) : null;
    if (c) {
      if (frames) c.frames = frames;
      c.track = line.speaker === 'narrator' ? 'narration' : 'dialogue';
      c.speaker = line.speaker;
    }
  });
}

// the scenes as long as their speech needs; only the lengths change, the words stay as written
export function fitScenes(shrink = false) {
  updateProduction(shrink ? 'Scenes to the speech' : 'Scenes long enough for the speech', (p) => fitScenesToSpeech(p, clipSeconds(editor.doc), shrink));
}

export function setPace(change: { pace?: number; pause?: number; breathing?: number; gestures?: boolean }, key?: string) {
  updateProduction('Pace', (p) => ({ ...p, ...change }), key);
}

// a sound moved by frames, or to the start of a scene
export function nudgeClip(id: string, by: number) {
  const c = editor.doc.audio?.find((x) => x.id === id);
  if (!c) return;
  editor.commit('Move sound', (draft) => {
    const clip = draft.audio?.find((x) => x.id === id);
    if (clip) clip.start = Math.max(0, clip.start + Math.round(by));
  });
}

export function clipToScene(id: string, sceneId: string) {
  const p = production();
  const span = p ? sceneStarts(p, editor.doc.fps).find((s) => s.scene.id === sceneId) : null;
  if (!span) return;
  editor.commit('Sound to scene', (draft) => {
    const clip = draft.audio?.find((x) => x.id === id);
    if (clip) clip.start = span.start;
  });
}

// a line read out by the voice of the device, to hear the timing. it is not recorded into the video: a
// recorded or generated voice goes in as a sound
export function previewLine(line: ScriptLine): boolean {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!synth || !line.text.trim()) {
    addToast('This browser has no voice to read with', 'info');
    return false;
  }
  const v = voiceOf(line.speaker);
  const u = new SpeechSynthesisUtterance(line.text.replace(/\[.*?\]/g, ''));
  u.lang = 'de-DE';
  u.pitch = Math.max(0, Math.min(2, v.pitch));
  u.rate = Math.max(0.5, Math.min(2, v.rate));
  u.volume = Math.max(0, Math.min(1, v.volume ?? 1));
  synth.cancel();
  synth.speak(u);
  return true;
}

// the frame a line starts at in its scene, for putting its recording there
export function lineStart(line: ScriptLine): number {
  const p = production();
  if (!p) return 0;
  const cue = p.cues.find((c) => c.line === line.id) ?? p.cues.find((c) => c.text && line.text.startsWith(c.text.split(' ')[0]) && c.speaker === line.speaker);
  if (cue) return cue.start;
  const scene = sceneOf(p, line);
  return sceneStarts(p, editor.doc.fps).find((s) => s.scene.id === scene?.id)?.start ?? 0;
}

// a recording of a line: picked from the files, put where the line is said, on the narration or the
// dialogue track with its speaker
export async function recordLine(line: ScriptLine): Promise<boolean> {
  const files = await pickFiles('audio/*,.mp3,.m4a,.wav,.aac,.ogg', false);
  if (!files[0]) return false;
  frame.set(lineStart(line));
  const clip = await importAudio(files[0]);
  if (!clip) return false;
  setClipTrack(clip.id, line.speaker === 'narrator' ? 'narration' : 'dialogue', line.speaker);
  await linkClip(line.id, clip.id);
  return true;
}

export async function addSoundEffect(kind: Sfx) {
  await addGeneratedClip(wavDataUrl(sfxSamples(kind)), kind, editor.frame, 'sfx');
  addToast(`${kind} at frame ${editor.frame + 1}`, 'success', 1500);
}

// a music bed under the whole video
export async function addMusic(mood: Mood) {
  const p = production();
  const seconds = p ? p.scenes.reduce((n, s) => n + s.duration, 0) : Math.max(1, editor.doc.layers.reduce((n, l) => Math.max(n, l.length), 1) / editor.doc.fps);
  await addGeneratedClip(wavDataUrl(musicSamples(mood, seconds)), `${mood} music`, 0, 'music');
  addToast(`${mood} music, ${seconds.toFixed(0)} s`, 'success', 1500);
}

// the open project as a new episode: everything copied, a fresh production with new ids
export function asNewEpisode(doc: Doc, title: string): Doc {
  const copy = JSON.parse(JSON.stringify(doc)) as Doc;
  if (copy.production) copy.production = cloneProduction(copy.production, title);
  copy.name = title;
  return copy;
}
