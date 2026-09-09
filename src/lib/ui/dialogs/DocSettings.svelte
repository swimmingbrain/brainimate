<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import ColorField from '../ColorField.svelte';
  import ColorPopover from '../ColorPopover.svelte';
  import { editor } from '$lib/editor/editor';
  import { applyDocSettings, MAX_SIDE } from '$lib/editor/document';
  import { paintColor, solid } from '$lib/core/style';

  let { onclose }: { onclose: () => void } = $props();

  const doc = editor.doc;
  let name = $state(doc.name);
  let width = $state(doc.width);
  let height = $state(doc.height);
  let fps = $state(doc.fps);
  let bg = $state(doc.bg);
  let scaleContent = $state(false);
  let picker = $state<{ x: number; y: number } | null>(null);

  const resized = $derived(Math.round(width) !== doc.width || Math.round(height) !== doc.height);

  function apply() {
    onclose();
    applyDocSettings({ name, width, height, fps, bg, scaleContent: resized && scaleContent });
  }

  function openPicker(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = picker ? null : { x: rect.left, y: rect.bottom + 4 };
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  }
</script>

<Dialog title="Document settings" width={400} {onclose}>
  <div class="fields">
    <Field label="Name">
      <!-- svelte-ignore a11y_autofocus -->
      <input class="text" bind:value={name} aria-label="Document name" spellcheck="false" autofocus {onkeydown} />
    </Field>
    <Field label="Width">
      <NumberField
        value={width}
        min={1}
        max={MAX_SIDE}
        precision={0}
        unit=" px"
        label="Width"
        onchange={(v) => (width = v)} />
    </Field>
    <Field label="Height">
      <NumberField
        value={height}
        min={1}
        max={MAX_SIDE}
        precision={0}
        unit=" px"
        label="Height"
        onchange={(v) => (height = v)} />
    </Field>
    {#if resized}
      <Field label="Scale content" hint="The drawings grow or shrink with the stage and stay in the middle">
        <ToggleField value={scaleContent} label="Scale content" onchange={(v) => (scaleContent = v)} />
      </Field>
    {/if}
    <Field label="Frame rate">
      <NumberField
        value={fps}
        min={1}
        max={120}
        precision={0}
        unit=" fps"
        label="Frame rate"
        onchange={(v) => (fps = v)} />
    </Field>
    <Field label="Background">
      <ColorField value={bg} label="Background color" onclick={openPicker} />
    </Field>
  </div>
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
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
    <button class="dialog-btn primary" onclick={apply}>Apply</button>
  {/snippet}
</Dialog>

<style>
  .fields {
    margin: 0 -8px;
  }

  .text {
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    outline: none;
  }

  .text:focus {
    border-color: var(--accent);
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover {
    background: var(--accent-hover);
  }
</style>
