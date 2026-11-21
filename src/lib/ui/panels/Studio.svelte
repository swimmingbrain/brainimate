<script lang="ts">
  import { onMount } from 'svelte';
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import Slider from '../Slider.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { docVersion, editor } from '$lib/editor/editor';
  import { addToast, dialog, dirty, frame, selection } from '$lib/stores/app';
  import { characterFolders } from '$lib/character/model';
  import { STARTERS } from '$lib/scene/starters';
  import { STATUSES, beatWords, checks, duplicateScene, moveIn, newLine, newScene, newSource, normalizeShares, removeScene, sceneStarts, totalSeconds, wordBudget, lineSeconds } from '$lib/studio/production';
  import { SFX, MOODS } from '$lib/studio/sounds';
  import { CATEGORIES, VISUALS, type VisualCategory } from '$lib/studio/visuals';
  import { addFormat, customFormats, deleteVideo, keepVideo, loadFormats, loadVideos, videoDoc, videos } from '$lib/studio/library';
  import type { CameraMove, Certainty, Production, Status, TrackKind } from '$lib/studio/types';
  import { newId } from '$lib/core/ids';
  import {
    addMusic,
    addProduction,
    addSoundEffect,
    allFormats,
    asNewEpisode,
    buildFromStoryboard,
    formatOf,
    previewLine,
    recordLine,
    refreshSubtitles,
    setLength,
    setVoice,
    speakers,
    startVideo,
    updateProduction,
    voiceOf
  } from '$lib/editor/studio';
  import { animateSelection, insertChart, insertVisual, MOVES } from '$lib/editor/visuals';
  import { setClip, setClipTrack } from '$lib/io/audio';

  // the studio: the video this project is, from the idea to the export. a format gives the structure, the
  // script says who says what, the storyboard lays the scenes onto the timeline

  type Tab = 'videos' | 'script' | 'board' | 'sound' | 'subs' | 'visuals' | 'sources';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'videos', label: 'Videos' },
    { id: 'script', label: 'Script' },
    { id: 'board', label: 'Storyboard' },
    { id: 'sound', label: 'Sound' },
    { id: 'subs', label: 'Subtitles' },
    { id: 'visuals', label: 'Visuals' },
    { id: 'sources', label: 'Sources' }
  ];
  const CERTAINTIES: { value: Certainty; label: string }[] = [
    { value: 'fiction', label: 'Story' },
    { value: 'fact', label: 'Fact' },
    { value: 'estimate', label: 'Estimate' },
    { value: 'hypothesis', label: 'Hypothesis' },
    { value: 'plot', label: 'Original plot' },
    { value: 'interpretation', label: 'Interpretation' }
  ];
  const CAMERAS: { value: CameraMove; label: string }[] = [
    { value: 'still', label: 'Still' },
    { value: 'push', label: 'Push in' },
    { value: 'pull', label: 'Pull out' },
    { value: 'pan', label: 'Pan' },
    { value: 'shake', label: 'Shake' },
    { value: 'closeup', label: 'Close-up' }
  ];
  const TRANSITIONS = ['cut', 'fade', 'crossfade', 'zoom', 'slide'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }));
  const TRACKS: { id: TrackKind; label: string }[] = [
    { id: 'narration', label: 'Narrator' },
    { id: 'dialogue', label: 'Dialogue' },
    { id: 'music', label: 'Music' },
    { id: 'sfx', label: 'Effects' }
  ];

  let tab = $state<Tab>('videos');
  let pickFormat = $state<string | null>(null);
  let pickTemplate = $state<string | null>(null);
  let pickLength = $state(60);
  let pickFps = $state<24 | 30>(30);
  let withMains = $state(true);
  let savedId = $state<string | null>(null);
  let newFormatName = $state('');
  let newFormatBeats = $state('');
  let category = $state<VisualCategory>('objects');
  let chartValues = $state('3, 5, 2, 7');
  let chartLabels = $state('A, B, C, D');
  let busy = $state(false);

  const p = $derived.by(() => {
    void $docVersion;
    return editor.doc.production ?? null;
  });
  const format = $derived(p ? formatOf(p.format) : null);
  const who = $derived.by(() => {
    void $docVersion;
    return speakers();
  });
  const cast = $derived.by(() => {
    void $docVersion;
    return characterFolders(editor.doc.layers);
  });
  const warnings = $derived(p ? checks(p) : []);
  const spans = $derived(p ? sceneStarts(p, editor.doc.fps) : []);
  const clips = $derived.by(() => {
    void $docVersion;
    return editor.doc.audio ?? [];
  });
  const formats = $derived.by(() => {
    void $customFormats;
    return allFormats();
  });

  onMount(() => {
    void loadVideos();
    void loadFormats();
  });

  const up = (label: string, change: (q: Production) => Production, key?: string) => updateProduction(label, change, key);

  async function start() {
    if (!pickFormat) return;
    busy = true;
    try {
      if (await startVideo(pickFormat, pickTemplate, pickLength, pickFps, withMains)) {
        savedId = null;
        pickFormat = null;
        tab = 'script';
        addToast('New video: write the script, then lay out the storyboard', 'success', 3000);
      }
    } finally {
      busy = false;
    }
  }

  async function save(asCopy = false) {
    busy = true;
    try {
      const doc = asCopy ? asNewEpisode(editor.doc, `${p?.title ?? 'Video'} 2`) : editor.doc;
      const m = await keepVideo(doc, asCopy ? null : savedId);
      if (!asCopy) savedId = m.id;
      addToast(`${m.title} kept in My videos`, 'success', 2000);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The video could not be kept', 'error');
    } finally {
      busy = false;
    }
  }

  async function open(id: string, confirmed = false) {
    if (!confirmed && $dirty) {
      dialog.set({ kind: 'confirm', title: 'Open video', message: 'Changes in the open project that are not saved get lost.', confirm: 'Open', danger: true, onconfirm: () => void open(id, true) });
      return;
    }
    const doc = await videoDoc(id);
    if (!doc) return;
    editor.loadDoc(doc);
    savedId = id;
    tab = 'board';
  }

  async function copy(id: string) {
    const doc = await videoDoc(id);
    if (!doc) return;
    await keepVideo(asNewEpisode(doc, `${doc.production?.title ?? doc.name} copy`), null);
  }

  async function makeFormat() {
    const beats = newFormatBeats.split(/[,\n→>]+/).map((b) => b.trim()).filter(Boolean);
    if (!newFormatName.trim() || beats.length < 2) {
      addToast('A name and at least two parts, separated by commas', 'info');
      return;
    }
    const f = await addFormat(newFormatName, beats);
    newFormatName = '';
    newFormatBeats = '';
    pickFormat = f.id;
  }

  function goTo(sceneId: string) {
    const s = spans.find((x) => x.scene.id === sceneId);
    if (s) frame.set(s.start);
  }

  const nums = (s: string) => s.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n));
</script>

<Panel>
  <div class="tabs" role="tablist" aria-label="Studio">
    {#each TABS as t (t.id)}
      <button class="tab" class:on={tab === t.id} role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </div>

  {#if tab === 'videos'}
    {#if p}
      <h3 class="section">This video <span class="tag">{format?.letter ?? ''} {format?.label ?? p.format}</span></h3>
      <Field label="Title">
        <input class="text" value={p.title} aria-label="Video title" onchange={(e) => up('Title', (q) => ({ ...q, title: (e.currentTarget as HTMLInputElement).value }))} />
      </Field>
      <Field label="Status">
        <SelectField value={p.status} options={STATUSES.map((s) => ({ value: s.id, label: s.label }))} label="Production status" onchange={(v) => up('Status', (q) => ({ ...q, status: v as Status }))} />
      </Field>
      <p class="label">Length</p>
      <div class="grid">
        {#each format?.lengths ?? [30, 60, 90, 120] as len (len)}
          <button class="pill" class:on={p.target === len} onclick={() => setLength(len)}>{len} s</button>
        {/each}
      </div>
      <textarea class="area" rows="2" placeholder="What the video is about" aria-label="Description" value={p.description} onchange={(e) => up('Description', (q) => ({ ...q, description: (e.currentTarget as HTMLTextAreaElement).value }))}></textarea>
      <p class="note">{p.scenes.length} scenes, {totalSeconds(p).toFixed(1)} s, {p.lines.length} lines, {p.cues.length} subtitles</p>
      {#each warnings as w, i (i)}
        <p class="check" class:warn={w.level === 'warning'}>{w.level === 'warning' ? '⚠' : 'ℹ'} {w.text}</p>
      {/each}
      <div class="buttons">
        <button class="btn primary" disabled={busy} onclick={() => save()}><Icon name="save" size={14} /> Keep in My videos</button>
        <button class="btn" disabled={busy} onclick={() => save(true)}>Copy as new episode</button>
      </div>
    {:else}
      <p class="note">This project has no video plan yet. Start a new video below, or add a plan to what is here.</p>
    {/if}

    <h3 class="section">New video</h3>
    <div class="formats">
      {#each formats as f (f.id)}
        <button class="format" class:on={pickFormat === f.id} onclick={() => ((pickFormat = f.id), (pickTemplate = null), (pickLength = f.lengths.includes(60) ? 60 : f.lengths[0]))}>
          <span class="letter">{f.letter}</span>
          <span><b>{f.label}</b><br /><small>{f.beats.map((b) => b.name).join(' → ')}</small></span>
        </button>
      {/each}
    </div>
    {#if pickFormat}
      {@const f = formatOf(pickFormat)}
      {#if f}
        <p class="label">Template</p>
        <div class="grid">
          <button class="pill" class:on={pickTemplate === null} onclick={() => (pickTemplate = null)}>Empty</button>
          {#each f.templates as t (t.id)}
            <button class="pill" class:on={pickTemplate === t.id} onclick={() => (pickTemplate = t.id)}>{t.label}</button>
          {/each}
        </div>
        <p class="label">Length</p>
        <div class="grid">
          {#each f.lengths as len (len)}
            <button class="pill" class:on={pickLength === len} onclick={() => (pickLength = len)}>{len} s</button>
          {/each}
        </div>
        <div class="grid">
          <button class="pill" class:on={pickFps === 24} onclick={() => (pickFps = 24)}>24 fps</button>
          <button class="pill" class:on={pickFps === 30} onclick={() => (pickFps = 30)}>30 fps</button>
        </div>
        <Field label="Main characters" hint="Puts in main character 1 and 2 from the library">
          <ToggleField value={withMains} label="Put in the main characters" onchange={(v) => (withMains = v)} />
        </Field>
        <div class="buttons">
          <button class="btn primary" disabled={busy} onclick={start}>Start this video</button>
          {#if !p}<button class="btn" onclick={() => addProduction(f.id, pickLength)}>Plan the open project</button>{/if}
        </div>
      {/if}
    {/if}

    <h3 class="section">My videos</h3>
    {#if $videos.length === 0}<p class="note">Kept videos stay here after the browser closes. Open one, or copy it for the next episode.</p>{/if}
    {#each $videos as v (v.id)}
      <div class="row">
        <span class="row-main"><b>{v.title}</b><br /><small>{formatOf(v.format)?.letter ?? ''} · {STATUSES.find((s) => s.id === v.status)?.label} · {v.seconds.toFixed(0)} s</small></span>
        <button class="btn small" onclick={() => open(v.id)}>Open</button>
        <button class="btn small" onclick={() => copy(v.id)}>Copy</button>
        <button class="btn small danger" aria-label="Delete {v.title}" onclick={() => deleteVideo(v.id)}><Icon name="trash" size={13} /></button>
      </div>
    {/each}

    <h3 class="section">A format of your own</h3>
    <Field label="Name"><input class="text" bind:value={newFormatName} aria-label="Format name" /></Field>
    <textarea class="area" rows="2" placeholder="Parts, e.g. Hook, Problem, Solution, Twist" aria-label="Format parts" bind:value={newFormatBeats}></textarea>
    <div class="buttons"><button class="btn" onclick={makeFormat}>Add format</button></div>
  {:else if !p}
    <p class="note">Start a video under Videos first.</p>
  {:else if tab === 'script'}
    {#each p.beats as b, bi (b.id)}
      {@const have = beatWords(p, b)}
      {@const may = wordBudget(p, b)}
      <div class="beat">
        <div class="beat-head">
          <input class="text beat-name" value={b.name} aria-label="Part name" onchange={(e) => up('Part', (q) => ({ ...q, beats: q.beats.map((x) => (x.id === b.id ? { ...x, name: (e.currentTarget as HTMLInputElement).value } : x)) }))} />
          <span class="count" class:over={have > may * 1.15 && have > 3}>{have}/{may} words</span>
          <button class="icon" aria-label="Move part up" onclick={() => up('Move part', (q) => ({ ...q, beats: moveIn(q.beats, bi, -1) }))}>▲</button>
          <button class="icon" aria-label="Remove part" onclick={() => p.beats.length > 1 && up('Remove part', (q) => ({ ...q, beats: normalizeShares(q.beats.filter((x) => x.id !== b.id)), lines: q.lines.filter((l) => l.beat !== b.id), scenes: q.scenes.map((s) => (s.beat === b.id ? { ...s, beat: q.beats.find((x) => x.id !== b.id)!.id } : s)) }))}>✕</button>
        </div>
        {#if b.hint}<p class="note">{b.hint}</p>{/if}
        {#each p.lines.filter((l) => l.beat === b.id) as line (line.id)}
          {@const li = p.lines.indexOf(line)}
          <div class="line">
            <div class="line-head">
              <SelectField value={line.speaker} options={who.map((s) => ({ value: s.id, label: s.label }))} label="Speaker" onchange={(v) => up('Speaker', (q) => ({ ...q, lines: q.lines.map((x) => (x.id === line.id ? { ...x, speaker: v } : x)) }))} />
              <SelectField value={line.certainty ?? 'fiction'} options={CERTAINTIES} label="What it is" onchange={(v) => up('Certainty', (q) => ({ ...q, lines: q.lines.map((x) => (x.id === line.id ? { ...x, certainty: v as Certainty } : x)) }))} />
            </div>
            <textarea class="area" rows="2" aria-label="Line text" value={line.text} onchange={(e) => up('Line', (q) => ({ ...q, lines: q.lines.map((x) => (x.id === line.id ? { ...x, text: (e.currentTarget as HTMLTextAreaElement).value } : x)) }))}></textarea>
            <div class="line-tools">
              <small>{lineSeconds(line.text).toFixed(1)} s</small>
              <button class="icon" aria-label="Line up" onclick={() => up('Move line', (q) => ({ ...q, lines: moveIn(q.lines, li, -1) }))}>▲</button>
              <button class="icon" aria-label="Line down" onclick={() => up('Move line', (q) => ({ ...q, lines: moveIn(q.lines, li, 1) }))}>▼</button>
              <button class="icon" aria-label="Hear the line" onclick={() => previewLine(line)}>▶</button>
              <button class="icon" aria-label="Add a recording of the line" onclick={() => recordLine(line)}>🎙</button>
              <button class="icon" aria-label="Delete the line" onclick={() => up('Delete line', (q) => ({ ...q, lines: q.lines.filter((x) => x.id !== line.id) }))}>✕</button>
            </div>
          </div>
        {/each}
        <div class="buttons"><button class="btn small" onclick={() => up('Add line', (q) => ({ ...q, lines: [...q.lines, newLine(b.id, 'narrator', format?.certainty)] }))}>+ Line</button></div>
      </div>
    {/each}
    <div class="buttons">
      <button class="btn" onclick={() => up('Add part', (q) => ({ ...q, beats: normalizeShares([...q.beats, { id: newId(), name: 'New part', hint: '', share: 1 / q.beats.length }]) }))}>+ Part</button>
    </div>
    <p class="note">Words per part: what fits its share of the length at a calm pace. ▶ reads a line with the voice of the device to hear the timing, 🎙 adds a recording of it where it is said.</p>
  {:else if tab === 'board'}
    <div class="buttons">
      <button class="btn primary" onclick={() => buildFromStoryboard()}>Build the timeline</button>
      <button class="btn" onclick={() => up('Add scene', (q) => ({ ...q, scenes: [...q.scenes, newScene(q, q.beats[q.beats.length - 1].id)] }))}>+ Scene</button>
    </div>
    <p class="note">{p.scenes.length} scenes, {totalSeconds(p).toFixed(1)} s of {p.target || '–'} s. Building puts the places, camera shots, cast and subtitles on the timeline; build again after changes.</p>
    {#each p.scenes as s, si (s.id)}
      <div class="scene">
        <div class="beat-head">
          <button class="num" onclick={() => goTo(s.id)} aria-label="Go to scene {si + 1}">{si + 1}</button>
          <input class="text beat-name" value={s.name} aria-label="Scene name" onchange={(e) => up('Scene', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, name: (e.currentTarget as HTMLInputElement).value } : x)) }))} />
          <button class="icon" aria-label="Scene up" onclick={() => up('Move scene', (q) => ({ ...q, scenes: moveIn(q.scenes, si, -1) }))}>▲</button>
          <button class="icon" aria-label="Scene down" onclick={() => up('Move scene', (q) => ({ ...q, scenes: moveIn(q.scenes, si, 1) }))}>▼</button>
          <button class="icon" aria-label="Duplicate scene" onclick={() => up('Duplicate scene', (q) => duplicateScene(q, s.id))}>⧉</button>
          <button class="icon" aria-label="Delete scene" onclick={() => up('Delete scene', (q) => removeScene(q, s.id))}>✕</button>
        </div>
        <div class="two">
          <SelectField value={s.beat} options={p.beats.map((b) => ({ value: b.id, label: b.name }))} label="Part" onchange={(v) => up('Scene part', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, beat: v } : x)) }))} />
          <NumberField value={s.duration} min={0.5} max={60} step={0.25} precision={2} unit=" s" label="Scene length" onchange={(v) => up('Scene length', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, duration: v } : x)) }), `dur-${s.id}`)} />
        </div>
        <div class="two">
          <SelectField value={s.place} options={[{ value: '', label: 'Keep place' }, ...STARTERS.map((x) => ({ value: x.id, label: x.label }))]} label="Place" onchange={(v) => up('Place', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, place: v } : x)) }))} />
          <SelectField value={s.camera} options={CAMERAS} label="Camera" onchange={(v) => up('Camera', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, camera: v as CameraMove } : x)) }))} />
        </div>
        <div class="two">
          <SelectField value={s.transition} options={TRANSITIONS} label="Transition in" onchange={(v) => up('Transition', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, transition: v as typeof s.transition } : x)) }))} />
          <span></span>
        </div>
        {#if cast.length}
          <div class="grid">
            {#each cast as c (c.id)}
              <button class="pill" class:on={s.cast.length === 0 || s.cast.includes(c.id)} onclick={() => up('Cast', (q) => ({ ...q, scenes: q.scenes.map((x) => { if (x.id !== s.id) return x; const all = x.cast.length === 0 ? cast.map((y) => y.id) : x.cast; const next = all.includes(c.id) ? all.filter((y) => y !== c.id) : [...all, c.id]; return { ...x, cast: next.length === cast.length ? [] : next }; }) }))}>{c.character?.name}</button>
            {/each}
          </div>
        {/if}
        <textarea class="area" rows="2" placeholder="What happens" aria-label="Scene action" value={s.action} onchange={(e) => up('Action', (q) => ({ ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, action: (e.currentTarget as HTMLTextAreaElement).value } : x)) }))}></textarea>
        <p class="note">{p.lines.filter((l) => (l.scene ?? p.scenes.find((x) => x.beat === l.beat)?.id) === s.id).map((l) => l.text).join(' ') || 'No lines in this scene'}</p>
      </div>
    {/each}
  {:else if tab === 'sound'}
    <h3 class="section">Tracks</h3>
    {#each TRACKS as t (t.id)}
      <div class="mix">
        <span class="mix-name">{t.label}</span>
        <Slider value={Math.round(p.tracks[t.id].volume * 100)} min={0} max={100} step={1} precision={0} unit="%" label="{t.label} volume" onchange={(v) => up('Track volume', (q) => ({ ...q, tracks: { ...q.tracks, [t.id]: { ...q.tracks[t.id], volume: v / 100 } } }), `track-${t.id}`)} />
        <button class="pill small" class:on={p.tracks[t.id].muted} onclick={() => up('Mute', (q) => ({ ...q, tracks: { ...q.tracks, [t.id]: { ...q.tracks[t.id], muted: !q.tracks[t.id].muted } } }))}>{p.tracks[t.id].muted ? 'Muted' : 'Mute'}</button>
      </div>
    {/each}
    <h3 class="section">Sound effects at the playhead</h3>
    <div class="grid">
      {#each SFX as s (s.id)}<button class="pill" onclick={() => addSoundEffect(s.id)}>{s.label}</button>{/each}
    </div>
    <h3 class="section">Music under the video</h3>
    <div class="grid">
      {#each MOODS as m (m.id)}<button class="pill" onclick={() => addMusic(m.id)}>{m.label}</button>{/each}
    </div>
    <p class="note">Effects and music are made in the browser, nothing from elsewhere. Your own music and recordings: Character → Animate → Voice, or 🎙 on a line in the script.</p>
    <h3 class="section">Sounds of this video</h3>
    {#each clips as c (c.id)}
      <div class="clip">
        <b>{c.name}</b>
        <div class="two">
          <SelectField value={c.track ?? 'dialogue'} options={TRACKS.map((t) => ({ value: t.id, label: t.label }))} label="Track" onchange={(v) => setClipTrack(c.id, v as TrackKind)} />
          <SelectField value={c.speaker ?? ''} options={[{ value: '', label: 'No speaker' }, ...who.map((s) => ({ value: s.id, label: s.label }))]} label="Speaker" onchange={(v) => setClipTrack(c.id, (c.track ?? 'dialogue') as TrackKind, v)} />
        </div>
        <div class="two">
          <NumberField value={c.start + 1} min={1} max={100000} step={1} precision={0} label="Starts at frame" onchange={(v) => setClip(c.id, { start: v - 1 })} />
          <Slider value={Math.round(c.volume * 100)} min={0} max={100} step={1} precision={0} unit="%" label="Volume" onchange={(v) => setClip(c.id, { volume: v / 100 }, `vol-${c.id}`)} />
        </div>
      </div>
    {/each}
    <h3 class="section">Voices</h3>
    {#each who as s (s.id)}
      {@const v = voiceOf(s.id)}
      <div class="clip">
        <b>{s.label}</b>
        <div class="two">
          <Slider value={v.pitch} min={0.5} max={1.8} step={0.05} precision={2} label="{s.label} pitch" onchange={(x) => setVoice(s.id, { pitch: x }, `pitch-${s.id}`)} />
          <Slider value={v.rate} min={0.6} max={1.6} step={0.05} precision={2} label="{s.label} speed" onchange={(x) => setVoice(s.id, { rate: x }, `rate-${s.id}`)} />
        </div>
        <input class="text" placeholder="Voice id of a generator, later" value={v.voiceId} aria-label="{s.label} generator voice" onchange={(e) => setVoice(s.id, { voiceId: (e.currentTarget as HTMLInputElement).value, provider: (e.currentTarget as HTMLInputElement).value ? 'external' : '' })} />
      </div>
    {/each}
    <p class="note">The voice of every speaker is kept with the project. A voice generator can be connected later through these ids; until then recordings are added per line.</p>
  {:else if tab === 'subs'}
    <Field label="Show subtitles"><ToggleField value={p.subtitles.shown} label="Show subtitles" onchange={(v) => up('Subtitles', (q) => ({ ...q, subtitles: { ...q.subtitles, shown: v } }))} /></Field>
    <div class="grid">
      {#each ['small', 'medium', 'large'] as sz (sz)}<button class="pill" class:on={p.subtitles.size === sz} onclick={() => up('Subtitle size', (q) => ({ ...q, subtitles: { ...q.subtitles, size: sz as 'small' } }))}>{sz}</button>{/each}
    </div>
    <div class="grid">
      {#each [['none', 'Plain'], ['pop', 'Pop in'], ['words', 'Word by word']] as [a, l] (a)}<button class="pill" class:on={p.subtitles.animation === a} onclick={() => up('Subtitle animation', (q) => ({ ...q, subtitles: { ...q.subtitles, animation: a as 'none' } }))}>{l}</button>{/each}
    </div>
    <Field label="Height"><Slider value={Math.round(p.subtitles.position * 100)} min={0} max={100} step={1} precision={0} unit="%" label="Subtitle height" onchange={(v) => up('Subtitle height', (q) => ({ ...q, subtitles: { ...q.subtitles, position: v / 100 } }), 'subpos')} /></Field>
    <Field label="Box"><ToggleField value={p.subtitles.box} label="Box behind subtitles" onchange={(v) => up('Subtitle box', (q) => ({ ...q, subtitles: { ...q.subtitles, box: v } }))} /></Field>
    <div class="swatches">
      {#each ['#f2c14e', '#ffffff', '#8fd3c7', '#f08a5d', '#c3a6ff'] as c (c)}<button class="swatch" class:on={p.subtitles.highlight === c} style="background:{c}" aria-label="Highlight {c}" onclick={() => up('Highlight', (q) => ({ ...q, subtitles: { ...q.subtitles, highlight: c } }))}></button>{/each}
    </div>
    <div class="buttons"><button class="btn primary" onclick={refreshSubtitles}>From the script</button></div>
    <p class="note">Subtitles show in the camera view and are burnt into the video. A hypothesis, an estimate or an interpretation gets a small label above it.</p>
    {#each p.cues as c (c.id)}
      <div class="cue">
        <input class="text" value={c.text} aria-label="Subtitle text" onchange={(e) => up('Subtitle', (q) => ({ ...q, cues: q.cues.map((x) => (x.id === c.id ? { ...x, text: (e.currentTarget as HTMLInputElement).value } : x)) }))} />
        <div class="two">
          <NumberField value={c.start + 1} min={1} max={100000} step={1} precision={0} label="From frame" onchange={(v) => up('Subtitle time', (q) => ({ ...q, cues: q.cues.map((x) => (x.id === c.id ? { ...x, start: v - 1, end: Math.max(v, x.end) } : x)) }))} />
          <NumberField value={c.end} min={1} max={100000} step={1} precision={0} label="To frame" onchange={(v) => up('Subtitle time', (q) => ({ ...q, cues: q.cues.map((x) => (x.id === c.id ? { ...x, end: Math.max(x.start + 1, v) } : x)) }))} />
        </div>
        <div class="line-tools">
          <button class="icon" aria-label="Go to subtitle" onclick={() => frame.set(c.start)}>⏵</button>
          <button class="icon" aria-label="Delete subtitle" onclick={() => up('Delete subtitle', (q) => ({ ...q, cues: q.cues.filter((x) => x.id !== c.id) }))}>✕</button>
        </div>
      </div>
    {/each}
  {:else if tab === 'visuals'}
    <div class="grid">
      {#each CATEGORIES as c (c.id)}<button class="pill" class:on={category === c.id} onclick={() => (category = c.id)}>{c.label}</button>{/each}
    </div>
    <div class="grid">
      {#each VISUALS.filter((v) => v.category === category) as v (v.id)}<button class="pill big" onclick={() => insertVisual(v.id)}>{v.label}</button>{/each}
    </div>
    <h3 class="section">Move what is picked {#if $selection.size}<span class="tag">{$selection.size} picked</span>{/if}</h3>
    <div class="grid">
      {#each MOVES as m (m.id)}<button class="pill" disabled={$selection.size === 0} onclick={() => animateSelection(m.id)}>{m.label}</button>{/each}
    </div>
    <h3 class="section">Chart from numbers</h3>
    <Field label="Values"><input class="text" bind:value={chartValues} aria-label="Chart values" /></Field>
    <Field label="Labels"><input class="text" bind:value={chartLabels} aria-label="Chart labels" /></Field>
    <div class="buttons">
      <button class="btn" onclick={() => insertChart('bars', nums(chartValues), chartLabels.split(',').map((x) => x.trim()))}>Bar chart</button>
      <button class="btn" onclick={() => insertChart('pie', nums(chartValues), [])}>Pie chart</button>
    </div>
    <p class="note">Every visual is shapes on the active layer: move, scale, recolor or bind it like any drawing. Moves set keyframes from the playhead.</p>
  {:else if tab === 'sources'}
    {#if p.format === 'recap'}
      <h3 class="section">Original</h3>
      <Field label="Work"><input class="text" value={p.original.work} placeholder="Film, series or anime" aria-label="Original work" onchange={(e) => up('Original', (q) => ({ ...q, original: { ...q.original, work: (e.currentTarget as HTMLInputElement).value } }))} /></Field>
      <Field label="Covers"><input class="text" value={p.original.reference} placeholder="Seasons, episodes, chapters" aria-label="What it covers" onchange={(e) => up('Original', (q) => ({ ...q, original: { ...q.original, reference: (e.currentTarget as HTMLInputElement).value } }))} /></Field>
      <Field label="Checked" hint="The events are checked against the original"><ToggleField value={p.original.checked} label="Checked against the original" onchange={(v) => up('Original', (q) => ({ ...q, original: { ...q.original, checked: v } }))} /></Field>
      <p class="note">Own drawings only: no frames, clips, logos or music of the original. Lines are marked as original plot or as interpretation.</p>
    {/if}
    <h3 class="section">Sources and facts</h3>
    {#each warnings as w, i (i)}<p class="check" class:warn={w.level === 'warning'}>{w.level === 'warning' ? '⚠' : 'ℹ'} {w.text}</p>{/each}
    {#each p.sources as s (s.id)}
      <div class="clip">
        <textarea class="area" rows="2" placeholder="The statement" aria-label="Statement" value={s.claim} onchange={(e) => up('Source', (q) => ({ ...q, sources: q.sources.map((x) => (x.id === s.id ? { ...x, claim: (e.currentTarget as HTMLTextAreaElement).value } : x)) }))}></textarea>
        <SelectField value={s.certainty} options={CERTAINTIES} label="What it is" onchange={(v) => up('Source', (q) => ({ ...q, sources: q.sources.map((x) => (x.id === s.id ? { ...x, certainty: v as Certainty } : x)) }))} />
        <input class="text" placeholder="Citation: book, article, episode" value={s.citation} aria-label="Citation" onchange={(e) => up('Source', (q) => ({ ...q, sources: q.sources.map((x) => (x.id === s.id ? { ...x, citation: (e.currentTarget as HTMLInputElement).value } : x)) }))} />
        <input class="text" placeholder="Link" value={s.url} aria-label="Link" onchange={(e) => up('Source', (q) => ({ ...q, sources: q.sources.map((x) => (x.id === s.id ? { ...x, url: (e.currentTarget as HTMLInputElement).value } : x)) }))} />
        <div class="line-tools">
          <SelectField value="" options={[{ value: '', label: 'Use for a line…' }, ...p.lines.map((l) => ({ value: l.id, label: l.text.slice(0, 40) || '(empty line)' }))]} label="Line it supports" onchange={(v) => v && up('Source for line', (q) => ({ ...q, lines: q.lines.map((l) => (l.id === v ? { ...l, source: s.id, certainty: s.certainty } : l)) }))} />
          <button class="icon" aria-label="Delete source" onclick={() => up('Delete source', (q) => ({ ...q, sources: q.sources.filter((x) => x.id !== s.id), lines: q.lines.map((l) => (l.source === s.id ? { ...l, source: null } : l)) }))}>✕</button>
        </div>
      </div>
    {/each}
    <div class="buttons"><button class="btn" onclick={() => up('Add source', (q) => ({ ...q, sources: [...q.sources, newSource(q.format === 'recap' ? 'plot' : 'fact')] }))}>+ Source</button></div>
    <p class="note">Only what you enter is shown as a source, nothing is made up. A fact needs a citation or a link; estimates and hypotheses are labeled in the subtitles.</p>
  {/if}
</Panel>

<style>
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 4px 8px 8px;
  }
  .tab,
  .pill,
  .btn,
  .format,
  .num {
    min-height: 36px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .tab.on,
  .pill.on,
  .format.on,
  .btn.primary {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }
  .pill.big {
    min-height: 44px;
  }
  .pill.small,
  .btn.small {
    min-height: 32px;
    padding: 0 8px;
  }
  .btn.danger {
    color: var(--error);
  }
  .section {
    margin: 10px 8px 6px;
    padding-bottom: 4px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .tag {
    text-transform: none;
    letter-spacing: 0;
  }
  .label {
    margin: 6px 10px 4px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .note {
    padding: 0 10px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .check {
    margin: 2px 8px;
    padding: 4px 8px;
    font-size: 11px;
    border-radius: 6px;
    background: var(--bg-elevated);
    color: var(--text-secondary);
  }
  .check.warn {
    color: var(--accent);
  }
  .grid,
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 8px 6px;
  }
  .formats {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 2px 8px 6px;
  }
  .format {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    text-align: left;
  }
  .format small {
    opacity: 0.8;
  }
  .letter {
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 28px;
    font-weight: 700;
    border-radius: 50%;
    border: 1px solid currentColor;
  }
  .row,
  .mix {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
  }
  .row-main,
  .mix-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary);
  }
  .mix-name {
    flex: 0 0 64px;
  }
  .mix :global(.slider) {
    flex: 1;
  }
  .text,
  .area {
    width: 100%;
    min-height: 32px;
    padding: 4px 8px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-input, var(--bg-elevated));
    border: 1px solid var(--border);
    border-radius: 6px;
    box-sizing: border-box;
  }
  .area {
    margin: 2px 8px 4px;
    width: calc(100% - 16px);
    resize: vertical;
  }
  .beat,
  .scene,
  .clip,
  .cue {
    margin: 6px 8px;
    padding: 6px 0;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .clip b {
    padding: 0 10px;
    font-size: 12px;
  }
  .clip > .text,
  .cue > .text {
    margin: 2px 8px;
    width: calc(100% - 16px);
  }
  .beat-head,
  .line-head,
  .line-tools,
  .two {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
  }
  .two > :global(*) {
    flex: 1;
    min-width: 0;
  }
  .line-head > :global(*) {
    flex: 1;
    min-width: 0;
  }
  .beat-name {
    flex: 1;
    font-weight: 600;
  }
  .count {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .count.over {
    color: var(--accent);
  }
  .line {
    margin: 4px 6px;
    padding: 4px 0;
    border-top: 1px dashed var(--border);
  }
  .line-tools small {
    flex: 1;
    font-size: 11px;
    color: var(--text-muted);
  }
  .icon {
    min-width: 36px;
    min-height: 36px;
    font-size: 13px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .num {
    min-width: 36px;
    padding: 0;
    font-weight: 700;
  }
  .swatches {
    display: flex;
    gap: 8px;
    padding: 4px 8px 6px;
  }
  .swatch {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .swatch.on {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
