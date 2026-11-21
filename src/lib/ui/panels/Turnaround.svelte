<script lang="ts">
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import Slider from '../Slider.svelte';
  import { docVersion } from '$lib/editor/editor';
  import { frame, addToast } from '$lib/stores/app';
  import { VIEW_ANGLES, NO_TWEAK, SLEEVES, GLASSES, HATS, type ViewId, type ViewTweak, type CharacterModel, type Sleeves, type Glasses, type Hat } from '$lib/character/views';
  import { viewThumbs } from '$lib/character/thumbs';
  import { headForward, isTurnable, lookAtCamera, makeTurnable, modelHere, overShoulder, resetTweak, setModel, setTweak, turnAround, turnAway, turnHere, turnToAngle, turnToCamera, turnToView, viewName } from '$lib/editor/turn';

  // the turnaround editor: the character from every side, a tap shows a view at the playhead, each view
  // can be fine tuned, clothes, accessories and proportions hold for every side

  let { id }: { id: string } = $props();

  const VIEWS: { id: ViewId; label: string }[] = [
    { id: 'front', label: 'Front' },
    { id: 'three', label: '3/4' },
    { id: 'side', label: 'Side' },
    { id: 'backthree', label: 'Back 3/4' },
    { id: 'back', label: 'Back' }
  ];
  const BUILDS = [
    { value: 'slim', label: 'Slim' },
    { value: 'regular', label: 'Regular' },
    { value: 'broad', label: 'Broad' }
  ];

  let frames = $state(8);
  let editing = $state<ViewId>('side');
  let open = $state(false);
  let thumbs = $state<string[]>([]);

  const turnable = $derived.by(() => {
    void $docVersion;
    return isTurnable(id);
  });
  const model = $derived.by(() => {
    void $docVersion;
    return modelHere(id);
  });
  const turn = $derived.by(() => {
    void $docVersion;
    void $frame;
    return turnHere(id);
  });
  const current = $derived(turn ? viewName(turn.body) : null);
  const tweak = $derived<ViewTweak>(model ? { ...NO_TWEAK, ...(model.tweaks[editing] ?? {}) } : NO_TWEAK);
  const headTurn = $derived(turn ? Math.round(turn.head - turn.body) : 0);

  // the pictures follow the model, worked out a moment after the last change
  let timer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const m = model;
    if (!m) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      thumbs = await viewThumbs(m, VIEWS.map((v) => VIEW_ANGLES[v.id]));
    }, 150);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  function show(view: ViewId) {
    editing = view;
    if (turnToView(id, view, frames)) addToast(`${VIEWS.find((v) => v.id === view)?.label} view ${frames > 0 ? `over ${frames} frames` : ''} from frame ${$frame + 1}`, 'success', 1600);
  }

  function tweakIt(change: Partial<ViewTweak>, key: string) {
    setTweak(id, editing, change, `tweak-${id}-${editing}-${key}`);
  }

  function modelIt(change: Partial<CharacterModel>, key?: string) {
    setModel(id, change, key ? `model-${id}-${key}` : undefined);
  }
</script>

<h3 class="section">Views {#if current}<span class="tag">{current}</span>{/if}</h3>
{#if !turnable}
  <p class="note">This character was made before characters could turn. Make it turnable: its moves stay, its body is drawn again from every side.</p>
  <div class="buttons"><button class="btn primary" onclick={() => makeTurnable(id)}>Make turnable</button></div>
{:else if model}
  <div class="strip" role="group" aria-label="Views">
    {#each VIEWS as v, i (v.id)}
      <button class="view" class:on={current === v.id} class:editing={open && editing === v.id} onclick={() => show(v.id)} aria-label="Show the {v.label} view">
        {#if thumbs[i]}<img src={thumbs[i]} alt="" width="48" height="84" />{:else}<span class="ph"></span>{/if}
        <span>{v.label}</span>
      </button>
    {/each}
  </div>
  <Field label="Turn in" hint="Frames a turn takes, 0 cuts">
    <NumberField value={frames} min={0} max={96} step={1} precision={0} unit=" f" label="Turn frames" onchange={(v) => (frames = v)} />
  </Field>
  <div class="grid">
    <button class="pill" onclick={() => turnToCamera(id, frames)}>To the camera</button>
    <button class="pill" onclick={() => turnAway(id, frames)}>Away</button>
    <button class="pill" onclick={() => turnAround(id, frames)}>Turn around</button>
    <button class="pill" onclick={() => lookAtCamera(id, Math.min(frames, 6))}>Look at camera</button>
    <button class="pill" onclick={() => overShoulder(id, frames)}>Over the shoulder</button>
    <button class="pill" onclick={() => headForward(id, Math.min(frames, 4))}>Head forward</button>
  </div>
  <Field label="Head turn" hint="Turns only the head at the playhead">
    <Slider value={headTurn} min={-110} max={110} step={5} precision={0} unit="°" label="Head turn" onchange={(v) => turn && turnToAngle(id, turn.body, turn.body + v, 0)} />
  </Field>

  <button class="link more" onclick={() => (open = !open)} aria-expanded={open}>{open ? 'Close the turnaround editor' : 'Open the turnaround editor'}</button>
  {#if open}
    <p class="note">Tap a view above to edit it. Clothes, accessories and proportions hold for every side, the sliders below change only the {VIEWS.find((v) => v.id === editing)?.label} view.</p>
    <h3 class="section">Every side</h3>
    <Field label="Build">
      <SelectField value={model.build} options={BUILDS} label="Build" onchange={(v) => modelIt({ build: v as CharacterModel['build'] })} />
    </Field>
    <Field label="Head">
      <Slider value={model.headSize} min={0.8} max={1.35} step={0.05} precision={2} label="Head size, every side" onchange={(v) => modelIt({ headSize: v }, 'headSize')} />
    </Field>
    <Field label="Sleeves">
      <SelectField value={model.sleeves} options={SLEEVES.map((s) => ({ value: s.id, label: s.label }))} label="Sleeves" onchange={(v) => modelIt({ sleeves: v as Sleeves })} />
    </Field>
    <Field label="Glasses">
      <SelectField value={model.glasses} options={GLASSES.map((s) => ({ value: s.id, label: s.label }))} label="Glasses" onchange={(v) => modelIt({ glasses: v as Glasses })} />
    </Field>
    <Field label="Hat">
      <SelectField value={model.hat} options={HATS.map((s) => ({ value: s.id, label: s.label }))} label="Hat" onchange={(v) => modelIt({ hat: v as Hat })} />
    </Field>

    <h3 class="section">{VIEWS.find((v) => v.id === editing)?.label} view only</h3>
    <Field label="Head size">
      <Slider value={tweak.headScale} min={0.85} max={1.2} step={0.01} precision={2} unit="×" label="Head size in this view" onchange={(v) => tweakIt({ headScale: v }, 'head')} />
    </Field>
    <Field label="Body width">
      <Slider value={tweak.bodyWidth} min={0.8} max={1.25} step={0.01} precision={2} unit="×" label="Body width in this view" onchange={(v) => tweakIt({ bodyWidth: v }, 'body')} />
    </Field>
    <Field label="Hair across">
      <Slider value={tweak.hairX} min={-0.25} max={0.25} step={0.01} precision={2} label="Hair across in this view" onchange={(v) => tweakIt({ hairX: v }, 'hairX')} />
    </Field>
    <Field label="Hair height">
      <Slider value={-tweak.hairY} min={-0.25} max={0.25} step={0.01} precision={2} label="Hair height in this view" onchange={(v) => tweakIt({ hairY: -v }, 'hairY')} />
    </Field>
    <Field label="Hair size">
      <Slider value={tweak.hairScale} min={0.85} max={1.25} step={0.01} precision={2} unit="×" label="Hair size in this view" onchange={(v) => tweakIt({ hairScale: v }, 'hairS')} />
    </Field>
    <Field label="Eyes across">
      <Slider value={tweak.eyeX} min={-0.4} max={0.4} step={0.02} precision={2} label="Eyes across in this view" onchange={(v) => tweakIt({ eyeX: v }, 'eyeX')} />
    </Field>
    <Field label="Eye height">
      <Slider value={-tweak.eyeY} min={-0.15} max={0.15} step={0.01} precision={2} label="Eye height in this view" onchange={(v) => tweakIt({ eyeY: -v }, 'eyeY')} />
    </Field>
    {#if model.face.nose}
      <Field label="Nose across">
        <Slider value={tweak.noseX} min={-0.4} max={0.4} step={0.02} precision={2} label="Nose across in this view" onchange={(v) => tweakIt({ noseX: v }, 'noseX')} />
      </Field>
      <Field label="Nose height">
        <Slider value={-tweak.noseY} min={-0.15} max={0.15} step={0.01} precision={2} label="Nose height in this view" onchange={(v) => tweakIt({ noseY: -v }, 'noseY')} />
      </Field>
    {:else}
      <p class="note">No nose: switch it on under Look if the character should have one.</p>
    {/if}
    <Field label="Mouth across">
      <Slider value={tweak.mouthX} min={-0.4} max={0.4} step={0.02} precision={2} label="Mouth across in this view" onchange={(v) => tweakIt({ mouthX: v }, 'mouthX')} />
    </Field>
    <Field label="Mouth height">
      <Slider value={-tweak.mouthY} min={-0.15} max={0.15} step={0.01} precision={2} label="Mouth height in this view" onchange={(v) => tweakIt({ mouthY: -v }, 'mouthY')} />
    </Field>
    <div class="buttons">
      <button class="btn" onclick={() => resetTweak(id, editing)}>Reset this view</button>
    </div>
  {/if}
{/if}

<style>
  .strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    padding: 2px 8px 6px;
  }

  .view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    padding: 4px 2px;
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .view img,
  .view .ph {
    width: 100%;
    max-width: 48px;
    height: auto;
    aspect-ratio: 48 / 84;
  }

  .view.on {
    border-color: var(--accent);
    color: var(--text-primary);
  }

  .view.editing {
    box-shadow: inset 0 0 0 2px var(--accent);
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

  .tag {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .note {
    padding: 0 10px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .buttons,
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 8px 6px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .btn,
  .pill {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .btn.primary {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .link {
    color: var(--accent);
    background: none;
    border: none;
    font-size: 12px;
  }

  .more {
    display: block;
    min-height: 36px;
    margin: 4px 8px;
  }
</style>
