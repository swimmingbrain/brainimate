<script lang="ts">
  import { onMount } from 'svelte';
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import Slider from '../Slider.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { CharacterColors } from '$lib/core/types';
  import { COMIC_PALETTE } from '$lib/core/comic';
  import { docVersion, editor } from '$lib/editor/editor';
  import { frame, selection, addToast } from '$lib/stores/app';
  import {
    DEFAULT_COLORS,
    EMOTIONS,
    MOUTHS,
    PART_LABELS,
    defaultCharacter,
    type Build,
    type HairStyle
  } from '$lib/character/model';
  import { ANIMATIONS, type AnimKind } from '$lib/character/anim';
  import {
    applyAnimation,
    autoBlink,
    blink,
    characterRoles,
    characters,
    createCharacter,
    currentCharacter,
    cutAnimation,
    duplicateCharacter,
    faceHere,
    insertPackage,
    lipSyncLevels,
    partVisible,
    pickUp,
    pickedCharacter,
    putDown,
    recolorCharacter,
    renameCharacter,
    restPose,
    selectPart,
    selectionTarget,
    setEmotion,
    setMouth,
    setPartVisible,
    talk
  } from '$lib/editor/character';
  import {
    CHARACTER_EXT,
    addPackage,
    characterFile,
    deleteEntry,
    duplicateEntry,
    library,
    libraryEntry,
    loadLibrary,
    placeOffset,
    readCharacterFile,
    renameEntry,
    saveCharacter
  } from '$lib/character/library';
  import { AUDIO_ACCEPT, clipLevels, importAudio, removeClip, setClip } from '$lib/io/audio';
  import { pickFiles } from '$lib/editor/importer';
  import { saveBlob } from '$lib/io/save';
  import { deleteLayer } from '$lib/editor/layers';

  // characters: made here, moved with animations, given faces and a voice, kept in the library

  const BUILDS = [
    { value: 'slim', label: 'Slim' },
    { value: 'regular', label: 'Regular' },
    { value: 'broad', label: 'Broad' }
  ];
  const HAIR = [
    { value: 'short', label: 'Short' },
    { value: 'long', label: 'Long' },
    { value: 'bun', label: 'Bun' },
    { value: 'bald', label: 'None' }
  ];
  const FACING = [
    { value: '1', label: 'Looks right' },
    { value: '-1', label: 'Looks left' }
  ];
  const COLOR_KEYS: { key: keyof CharacterColors; label: string }[] = [
    { key: 'skin', label: 'Skin' },
    { key: 'hair', label: 'Hair' },
    { key: 'shirt', label: 'Shirt' },
    { key: 'pants', label: 'Pants' },
    { key: 'shoes', label: 'Shoes' },
    { key: 'outline', label: 'Outline' }
  ];
  // the muted comic colors, the skin tones and the darks first
  const SWATCHES = COMIC_PALETTE.map((c) => c.color);

  const all = $derived.by(() => {
    void $docVersion;
    return characters();
  });
  const picked = $derived.by(() => {
    void $docVersion;
    void $currentCharacter;
    return pickedCharacter();
  });
  const info = $derived(picked?.character ?? null);
  const roles = $derived.by(() => {
    void $docVersion;
    return picked ? characterRoles(picked.id) : [];
  });
  const face = $derived.by(() => {
    void $docVersion;
    void $frame;
    return picked ? faceHere(picked.id) : null;
  });
  const clips = $derived.by(() => {
    void $docVersion;
    return editor.doc.audio ?? [];
  });

  let creating = $state(false);
  let form = $state(defaultCharacter(1080, 1920));
  let heightShare = $state(50);
  let colorOpen = $state<keyof CharacterColors | null>(null);
  let anim = $state<{ kind: AnimKind; repeat: number; speed: number; mirror: boolean; distance: number; direction: number; back: boolean }>({
    kind: 'walk',
    repeat: 2,
    speed: 1,
    mirror: false,
    distance: 260,
    direction: 1,
    back: true
  });
  let blinkSeconds = $state(6);
  let talkSeconds = $state(2);
  let renaming = $state<string | null>(null);
  let draftName = $state('');
  let busy = $state(false);

  const animInfo = $derived(ANIMATIONS.find((a) => a.kind === anim.kind)!);

  onMount(() => {
    void loadLibrary();
  });

  function startCreate() {
    form = { ...defaultCharacter(editor.doc.width, editor.doc.height), name: `Character ${all.length + 1}`, seed: Math.floor(Math.random() * 1000) };
    heightShare = Math.round((form.height / editor.doc.height) * 100);
    creating = true;
  }

  function create() {
    const doc = editor.doc;
    const height = Math.round((doc.height * heightShare) / 100);
    const id = createCharacter({ ...form, height, x: form.x, ground: Math.round(doc.height * 0.86) });
    if (id) {
      creating = false;
      addToast(`${form.name} is on the stage, the skeleton and the body are in the timeline`, 'success', 3000);
    }
  }

  function pickColor(key: keyof CharacterColors, color: string) {
    if (creating) form = { ...form, colors: { ...form.colors, [key]: color } };
    else if (picked) recolorCharacter(picked.id, { [key]: color });
  }

  function animate() {
    if (!picked) return;
    const target = anim.kind === 'reach' ? selectionTarget() : null;
    const distance = anim.kind === 'walk' || anim.kind === 'run' || anim.kind === 'jump' ? anim.distance * anim.direction : 0;
    if (applyAnimation(picked.id, { kind: anim.kind, repeat: anim.repeat, speed: anim.speed, mirror: anim.mirror, distance, back: anim.back }, target)) {
      addToast(`${animInfo.label} from frame ${editor.frame + 1}`, 'success', 1800);
    }
  }

  async function addSound() {
    const files = await pickFiles(AUDIO_ACCEPT, false);
    if (files[0]) await importAudio(files[0]);
  }

  async function syncTo(clipId: string) {
    if (!picked) return;
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    busy = true;
    try {
      lipSyncLevels(picked.id, await clipLevels(editor.doc, clip), clip.start);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The sound could not be read', 'error');
    } finally {
      busy = false;
    }
  }

  async function save() {
    if (!picked) return;
    busy = true;
    try {
      const m = await saveCharacter(editor.doc, picked.id);
      if (m) addToast(`${m.name} is in the library${m.keys > 0 ? ` with ${m.keys} keyframes` : ''}`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The library could not be written', 'error', 5000);
    } finally {
      busy = false;
    }
  }

  async function insert(id: string) {
    const e = await libraryEntry(id);
    if (!e) return;
    const { dx, dy } = placeOffset(e.pkg, editor.doc);
    if (insertPackage(e.pkg, dx, dy)) addToast(`${e.name} is in the scene`, 'success', 1800);
  }

  async function exportEntry(id: string) {
    const e = await libraryEntry(id);
    if (!e) return;
    const name = `${e.name}${CHARACTER_EXT}`;
    await saveBlob(characterFile(e.pkg), name, { ext: CHARACTER_EXT, mime: 'application/json', description: 'brainIMATE character' }).catch(() => false);
  }

  async function importFile() {
    const files = await pickFiles(`${CHARACTER_EXT},.json,application/json`, false);
    if (!files[0]) return;
    try {
      const pkg = readCharacterFile(await files[0].text());
      const m = await addPackage(pkg);
      addToast(`${m.name} is in the library`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The file is not a character', 'error');
    }
  }

  function startRename(id: string, name: string) {
    renaming = id;
    draftName = name;
  }

  async function finishRename(kind: 'scene' | 'library') {
    const id = renaming;
    renaming = null;
    if (!id || !draftName.trim()) return;
    if (kind === 'scene') renameCharacter(id, draftName);
    else await renameEntry(id, draftName);
  }
</script>

<Panel>
  <div class="bar">
    {#if all.length > 0}
      <SelectField
        value={picked?.id ?? ''}
        options={all.map((c) => ({ value: c.id, label: c.name }))}
        label="Character"
        onchange={(v) => currentCharacter.set(v)} />
    {/if}
    <button class="chip" class:on={creating} onclick={() => (creating ? (creating = false) : startCreate())}>
      <Icon name={creating ? 'close' : 'plus'} size={14} />
      {creating ? 'Cancel' : 'New'}
    </button>
  </div>

  {#if creating}
    <h3 class="section">New character</h3>
    <Field label="Name">
      <input class="text" bind:value={form.name} aria-label="Character name" />
    </Field>
    <Field label="Height" hint="Share of the stage height">
      <Slider value={heightShare} min={15} max={95} step={1} precision={0} unit="%" label="Character height" onchange={(v) => (heightShare = v)} />
    </Field>
    <Field label="Build">
      <SelectField value={form.build} options={BUILDS} label="Build" onchange={(v) => (form = { ...form, build: v as Build })} />
    </Field>
    <Field label="Head">
      <Slider value={form.headSize} min={0.8} max={1.35} step={0.05} precision={2} label="Head size" onchange={(v) => (form = { ...form, headSize: v })} />
    </Field>
    <Field label="Hair">
      <SelectField value={form.hair} options={HAIR} label="Hair" onchange={(v) => (form = { ...form, hair: v as HairStyle })} />
    </Field>
    <Field label="Looks">
      <SelectField value={String(form.facing)} options={FACING} label="Where it looks" onchange={(v) => (form = { ...form, facing: v === '-1' ? -1 : 1 })} />
    </Field>
    <Field label="Outline">
      <Slider value={form.outline} min={2} max={12} step={0.5} precision={1} unit=" px" label="Outline width" onchange={(v) => (form = { ...form, outline: v })} />
    </Field>
    <Field label="Hand drawn" hint="How much the lines wobble">
      <Slider value={form.wobble} min={0} max={2} step={0.1} precision={1} label="Line wobble" onchange={(v) => (form = { ...form, wobble: v })} />
    </Field>
  {/if}

  {#if creating || info}
    <h3 class="section">Colors</h3>
    {#each COLOR_KEYS as c (c.key)}
      {@const now = creating ? form.colors[c.key] : (info?.colors[c.key] ?? DEFAULT_COLORS[c.key])}
      <div class="color-row">
        <button class="color-btn" onclick={() => (colorOpen = colorOpen === c.key ? null : c.key)} aria-expanded={colorOpen === c.key}>
          <span class="dot" style="background: {now}"></span>
          {c.label}
        </button>
        {#if colorOpen === c.key}
          <div class="swatches">
            {#each SWATCHES as color (color)}
              <button class="swatch" class:on={color === now} style="background: {color}" aria-label={color} onclick={() => pickColor(c.key, color)}></button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}

  {#if creating}
    <div class="buttons">
      <button class="btn primary" onclick={create}><Icon name="plus" size={14} /> Create {form.name}</button>
    </div>
  {:else if !picked}
    <div class="intro">
      <Icon name="pose" size={22} />
      <p>Make a character with a skeleton: it walks, runs, waves, sits, turns, talks and holds things. Save it in the library and use it in every scene.</p>
      <button class="big" onclick={startCreate}><Icon name="plus" size={14} /> New character</button>
    </div>
  {:else if info}
    <h3 class="section">{info.name}</h3>
    {#if renaming === picked.id}
      <div class="rename">
        <input class="text" bind:value={draftName} aria-label="New name" onkeydown={(e) => e.key === 'Enter' && finishRename('scene')} />
        <button class="btn" onclick={() => finishRename('scene')}>OK</button>
      </div>
    {/if}
    <div class="buttons">
      <button class="btn" onclick={() => startRename(picked!.id, info!.name)}>Rename</button>
      <button class="btn" onclick={() => duplicateCharacter(picked!.id)}><Icon name="duplicate" size={14} /> Duplicate</button>
      <button class="btn" disabled={busy} onclick={save}><Icon name="save" size={14} /> Save to library</button>
      <button class="btn danger" onclick={() => deleteLayer(picked!.id)}><Icon name="trash" size={14} /></button>
    </div>

    <h3 class="section">Move</h3>
    <Field label="Animation">
      <SelectField value={anim.kind} options={ANIMATIONS.map((a) => ({ value: a.kind, label: a.label }))} label="Animation" onchange={(v) => (anim = { ...anim, kind: v as AnimKind })} />
    </Field>
    <Field label={animInfo.cycle ? 'Repeat' : 'Hold'} hint={animInfo.cycle ? 'How many times it plays' : 'Seconds before it goes back'}>
      <NumberField value={anim.repeat} min={animInfo.cycle ? 1 : 0} max={60} step={animInfo.cycle ? 1 : 0.25} precision={animInfo.cycle ? 0 : 2} unit={animInfo.cycle ? '×' : ' s'} label="Repeat or hold" onchange={(v) => (anim = { ...anim, repeat: v })} />
    </Field>
    <Field label="Speed">
      <Slider value={anim.speed} min={0.25} max={3} step={0.05} precision={2} unit="×" label="Speed" onchange={(v) => (anim = { ...anim, speed: v })} />
    </Field>
    {#if anim.kind === 'walk' || anim.kind === 'run' || anim.kind === 'jump'}
      <Field label="Distance" hint="Stage pixels each cycle, 0 stays in place">
        <NumberField value={anim.distance} min={0} max={3000} step={10} precision={0} unit=" px" label="Distance" onchange={(v) => (anim = { ...anim, distance: v })} />
      </Field>
      <Field label="Direction">
        <SelectField value={String(anim.direction)} options={[{ value: '1', label: 'To the right' }, { value: '-1', label: 'To the left' }]} label="Direction" onchange={(v) => (anim = { ...anim, direction: Number(v) })} />
      </Field>
    {/if}
    {#if !animInfo.cycle && anim.kind !== 'turn' && anim.kind !== 'jump'}
      <Field label="Go back" hint="Back to where it started after the hold">
        <ToggleField value={anim.back} label="Go back" onchange={(v) => (anim = { ...anim, back: v })} />
      </Field>
    {/if}
    {#if anim.kind !== 'turn'}
      <Field label="Mirror" hint="The far arm and leg do it">
        <ToggleField value={anim.mirror} label="Mirror" onchange={(v) => (anim = { ...anim, mirror: v })} />
      </Field>
    {/if}
    {#if anim.kind === 'reach'}
      <p class="note">{$selection.size > 0 ? 'The hand reaches for what is picked.' : 'Pick an object and the hand reaches for it, else forward.'}</p>
    {/if}
    <div class="buttons">
      <button class="btn primary" onclick={animate}>Animate from frame {$frame + 1}</button>
      <button class="btn" onclick={() => cutAnimation(picked!.id)} title="The pose here holds, the moves after it go">Stop here</button>
      <button class="btn" onclick={() => restPose(picked!.id)}>Rest pose</button>
    </div>
    <p class="note">Drag a joint with the selection tool to pose by hand, a keyframe is made at the playhead.</p>

    <h3 class="section">Face {#if face}<span class="tag">{face.emotion}, mouth {face.mouth}</span>{/if}</h3>
    <div class="grid">
      {#each EMOTIONS as e (e.id)}
        <button class="pill" class:on={face?.emotion === e.id} onclick={() => setEmotion(picked!.id, e.id)}>{e.label}</button>
      {/each}
    </div>
    <div class="grid">
      {#each MOUTHS as m (m.id)}
        <button class="pill" class:on={face?.mouth === m.id} onclick={() => setMouth(picked!.id, m.id)}>{m.label}</button>
      {/each}
      <button class="pill" onclick={() => blink(picked!.id)}>Blink</button>
    </div>
    <Field label="Blinks" hint="Every few seconds from the playhead on">
      <NumberField value={blinkSeconds} min={1} max={120} step={1} precision={0} unit=" s" label="Blink seconds" onchange={(v) => (blinkSeconds = v)} />
    </Field>
    <Field label="Talk" hint="Mouth moves without a sound">
      <NumberField value={talkSeconds} min={0.25} max={60} step={0.25} precision={2} unit=" s" label="Talk seconds" onchange={(v) => (talkSeconds = v)} />
    </Field>
    <div class="buttons">
      <button class="btn" onclick={() => autoBlink(picked!.id, blinkSeconds)}>Add blinks</button>
      <button class="btn" onclick={() => talk(picked!.id, talkSeconds)}>Talk</button>
    </div>

    <h3 class="section">Voice and lip sync</h3>
    {#each clips as clip (clip.id)}
      <div class="clip">
        <span class="clip-name">{clip.name}</span>
        <Field label="Starts">
          <NumberField value={clip.start + 1} min={1} max={100000} step={1} precision={0} label="Sound start frame" onchange={(v) => setClip(clip.id, { start: v - 1 })} />
        </Field>
        <Field label="Volume">
          <Slider value={clip.volume * 100} min={0} max={100} step={1} precision={0} unit="%" label="Volume" onchange={(v) => setClip(clip.id, { volume: v / 100 })} />
        </Field>
        <div class="buttons">
          <button class="btn primary" disabled={busy} onclick={() => syncTo(clip.id)}>Lip sync {info.name}</button>
          <button class="btn danger" onclick={() => removeClip(clip.id)}><Icon name="trash" size={14} /></button>
        </div>
      </div>
    {/each}
    <div class="buttons">
      <button class="btn" onclick={addSound}><Icon name="import" size={14} /> Add a sound</button>
    </div>
    <p class="note">The mouth follows how loud the voice is. The sound plays with the timeline and goes into the video.</p>

    <h3 class="section">Hands</h3>
    <p class="note">Pick an object on the stage, then it goes into a hand at the playhead and moves with it.</p>
    <div class="buttons">
      <button class="btn" disabled={$selection.size !== 1} onclick={() => pickUp(picked!.id, 'R')}>Near hand takes it</button>
      <button class="btn" disabled={$selection.size !== 1} onclick={() => pickUp(picked!.id, 'L')}>Far hand takes it</button>
      <button class="btn" disabled={$selection.size !== 1} onclick={putDown}>Put down</button>
    </div>

    <h3 class="section">Parts</h3>
    {#each roles as role (role)}
      <div class="part">
        <button class="eye" aria-label="Show or hide {PART_LABELS[role] ?? role}" onclick={() => setPartVisible(picked!.id, role, !partVisible(picked!.id, role))}>
          <Icon name={partVisible(picked!.id, role) ? 'eye' : 'eye-off'} size={15} />
        </button>
        <button class="part-name" onclick={() => selectPart(picked!.id, role)}>{PART_LABELS[role] ?? role}</button>
      </div>
    {/each}
    <p class="note">Tap a part to pick it, then move, scale, turn or recolor it like any shape.</p>
  {/if}

  <h3 class="section with-action">
    <span>Library</span>
    <button class="link" onclick={importFile}>Open file</button>
  </h3>
  {#if $library.length === 0}
    <p class="note">Saved characters stay here after the browser closes and can go into any project.</p>
  {/if}
  {#each $library as entry (entry.id)}
    <div class="entry">
      {#if entry.thumb}<img class="thumb" src={entry.thumb} alt="" width="48" height="72" />{:else}<span class="thumb"></span>{/if}
      <div class="entry-body">
        {#if renaming === entry.id}
          <div class="rename">
            <input class="text" bind:value={draftName} aria-label="New name" onkeydown={(e) => e.key === 'Enter' && finishRename('library')} />
            <button class="btn" onclick={() => finishRename('library')}>OK</button>
          </div>
        {:else}
          <span class="entry-name">{entry.name}</span>
          <span class="muted">{entry.keys > 0 ? `${entry.keys} keyframes` : 'no animation'}</span>
        {/if}
        <div class="entry-actions">
          <button class="btn primary small" onclick={() => insert(entry.id)}>Insert</button>
          <button class="btn small" onclick={() => startRename(entry.id, entry.name)}>Rename</button>
          <button class="btn small" onclick={() => duplicateEntry(entry.id)}>Copy</button>
          <button class="btn small" onclick={() => exportEntry(entry.id)}>File</button>
          <button class="btn small danger" aria-label="Delete {entry.name}" onclick={() => deleteEntry(entry.id)}><Icon name="trash" size={13} /></button>
        </div>
      </div>
    </div>
  {/each}
</Panel>

<style>
  .bar {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 2px 8px 6px;
  }

  .bar :global(select),
  .bar :global(.select) {
    flex: 1;
    min-width: 0;
  }

  .chip,
  .btn,
  .pill,
  .big {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 36px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .chip.on,
  .pill.on {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
  }

  .btn.primary,
  .big {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .btn.danger {
    color: var(--error);
  }

  .btn:disabled {
    opacity: 0.5;
  }

  .btn.small {
    min-height: 32px;
    padding: 0 8px;
    font-size: 11.5px;
  }

  .section {
    margin: 10px 8px 6px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .with-action {
    justify-content: space-between;
  }

  .tag {
    text-transform: none;
    letter-spacing: 0;
    color: var(--accent);
  }

  .link {
    font-family: var(--font-ui);
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
    color: var(--accent);
    min-height: 28px;
  }

  .buttons,
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 8px;
  }

  .grid .pill {
    flex: 1 1 30%;
  }

  .text {
    width: 100%;
    min-height: 30px;
    padding: 0 8px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .rename {
    display: flex;
    gap: 6px;
    padding: 4px 8px;
  }

  .color-row {
    padding: 0 8px 4px;
  }

  .color-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 4px 0 6px;
  }

  .swatch {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid var(--border);
  }

  .swatch.on {
    border-color: var(--accent);
  }

  .intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .note {
    padding: 0 10px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .muted {
    font-size: 11px;
    color: var(--text-muted);
  }

  .clip {
    margin: 0 8px 8px;
    padding: 6px 0;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .clip-name {
    display: block;
    padding: 0 8px 4px;
    font-size: 12px;
    color: var(--text-primary);
  }

  .part {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
  }

  .eye {
    width: 36px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .part-name {
    flex: 1;
    min-height: 34px;
    text-align: left;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .entry {
    display: flex;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }

  .thumb {
    width: 48px;
    height: 72px;
    flex-shrink: 0;
    background: #fff;
    border-radius: 4px;
    object-fit: contain;
  }

  .entry-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .entry-name {
    font-size: 12.5px;
    color: var(--text-primary);
  }

  .entry-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
</style>
