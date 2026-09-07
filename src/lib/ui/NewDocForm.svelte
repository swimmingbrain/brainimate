<script lang="ts">
  import Field from './Field.svelte';
  import NumberField from './NumberField.svelte';
  import ColorField from './ColorField.svelte';
  import ColorPopover from './ColorPopover.svelte';
  import { DOC_PRESETS, MAX_SIDE } from '$lib/editor/document';
  import { paintColor, solid } from '$lib/core/style';

  // the presets of a new document, custom when a field was changed by hand
  let {
    oncreate,
    action = 'Create'
  }: {
    oncreate: (width: number, height: number, fps: number, bg: string) => void;
    action?: string;
  } = $props();

  let picked = $state<number | 'custom'>(0);
  let width = $state(DOC_PRESETS[0].width);
  let height = $state(DOC_PRESETS[0].height);
  let fps = $state(DOC_PRESETS[0].fps);
  let bg = $state('#ffffff');
  let picker = $state<{ x: number; y: number } | null>(null);

  function pick(i: number) {
    picked = i;
    width = DOC_PRESETS[i].width;
    height = DOC_PRESETS[i].height;
    fps = DOC_PRESETS[i].fps;
  }

  function custom(set: () => void) {
    set();
    picked = 'custom';
  }

  // a small box in the shape of the page, the longer side 22 px
  function glyph(w: number, h: number): string {
    const k = 22 / Math.max(w, h);
    return `width: ${Math.max(4, Math.round(w * k))}px; height: ${Math.max(4, Math.round(h * k))}px`;
  }

  function openPicker(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = picker ? null : { x: rect.left, y: rect.bottom + 4 };
  }
</script>

<div class="form">
  <div class="presets" role="radiogroup" aria-label="Document size">
    {#each DOC_PRESETS as preset, i (preset.label)}
      <button class="preset" class:on={picked === i} role="radio" aria-checked={picked === i} onclick={() => pick(i)}>
        <span class="frame"><span class="page" style={glyph(preset.width, preset.height)}></span></span>
        <span class="text">
          <span class="label">{preset.label}</span>
          <span class="size">{preset.width} &times; {preset.height}, {preset.fps} fps</span>
        </span>
      </button>
    {/each}
    <button
      class="preset"
      class:on={picked === 'custom'}
      role="radio"
      aria-checked={picked === 'custom'}
      onclick={() => (picked = 'custom')}>
      <span class="frame"><span class="page custom" style={glyph(width, height)}></span></span>
      <span class="text">
        <span class="label">Custom</span>
        <span class="size">Any size and frame rate</span>
      </span>
    </button>
  </div>
  <div class="fields">
    <Field label="Width">
      <NumberField
        value={width}
        min={1}
        max={MAX_SIDE}
        precision={0}
        unit=" px"
        label="Width"
        onchange={(v) => custom(() => (width = v))} />
    </Field>
    <Field label="Height">
      <NumberField
        value={height}
        min={1}
        max={MAX_SIDE}
        precision={0}
        unit=" px"
        label="Height"
        onchange={(v) => custom(() => (height = v))} />
    </Field>
    <Field label="Frame rate">
      <NumberField
        value={fps}
        min={1}
        max={120}
        precision={0}
        unit=" fps"
        label="Frame rate"
        onchange={(v) => custom(() => (fps = v))} />
    </Field>
    <Field label="Background">
      <ColorField value={bg} label="Background color" onclick={openPicker} />
    </Field>
  </div>
  <button class="create" onclick={() => oncreate(width, height, fps, bg)}>{action}</button>
  {#if picker}
    <ColorPopover
      paint={solid(bg)}
      x={picker.x}
      y={picker.y}
      title="Background"
      allowNone={false}
      allowGradient={false}
      onchange={(p) => (bg = paintColor(p) ?? bg)}
      onclose={() => (picker = null)} />
  {/if}
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .presets {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preset {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    text-align: left;
    border: 1px solid transparent;
    color: var(--text-secondary);
  }

  .preset:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .preset.on {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--text-primary);
  }

  .frame {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .page {
    border: 1.5px solid currentColor;
    opacity: 0.8;
  }

  .page.custom {
    border-style: dashed;
  }

  .preset.on .page {
    border-color: var(--accent);
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .label {
    font-size: 12.5px;
  }

  .size {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .fields {
    margin: 0 -8px;
  }

  .create {
    align-self: flex-start;
    padding: 6px 16px;
    font-size: 12.5px;
    font-weight: 500;
    background: var(--accent);
    border: 1px solid var(--accent);
    color: #111;
  }

  .create:hover {
    background: var(--accent-hover);
  }
</style>
