<script lang="ts">
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import FontField from '../FontField.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Item, TextItem } from '$lib/core/types';
  import { fontFamilies, loadFont, pickFace } from '$lib/core/fonts';
  import { localBounds } from '$lib/core/items';
  import { multiply, translate } from '$lib/core/mat';
  import { editor } from '$lib/editor/editor';
  import { textDefaults } from '$lib/editor/text';
  import { outlineSelectedText } from '$lib/editor/outlines';

  // font, face, size, spacing and alignment of the selected text, a change goes to all of it
  let { items }: { items: TextItem[] } = $props();

  const ALIGNS = [
    { value: 'left', icon: 'align-left', label: 'Align left' },
    { value: 'center', icon: 'align-center', label: 'Align center' },
    { value: 'right', icon: 'align-right', label: 'Align right' }
  ] as const;

  const first = $derived(items[0]);
  const family = $derived($fontFamilies.find((f) => f.name === first.font) ?? null);

  // the faces the family has, a face it lacks shows what it falls back to
  const faces = $derived.by(() => {
    const list = family?.faces ?? [{ weight: first.weight, italic: first.italic }];
    const options = list.map((f) => ({ value: faceValue(f.weight, f.italic), label: faceLabel(f.weight, f.italic) }));
    return options.sort((a, b) => a.value.localeCompare(b.value));
  });
  const face = $derived.by(() => {
    if (!family) return faceValue(first.weight, first.italic);
    const f = pickFace(family, first.weight, first.italic);
    return faceValue(f.weight, f.italic);
  });

  const WEIGHT_NAMES: Record<number, string> = {
    100: 'Thin',
    200: 'Extra light',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semibold',
    700: 'Bold',
    800: 'Extra bold',
    900: 'Black'
  };

  function faceValue(weight: number, italic: boolean): string {
    return `${String(weight).padStart(3, '0')}-${italic ? 'i' : 'n'}`;
  }

  function faceLabel(weight: number, italic: boolean): string {
    const name = WEIGHT_NAMES[Math.round(weight / 100) * 100] ?? String(weight);
    if (!italic) return name;
    return name === 'Regular' ? 'Italic' : `${name} italic`;
  }

  function set(fn: (item: TextItem) => void, label: string, key: string) {
    editor.updateItems(
      items.map((it) => it.id),
      (item: Item) => {
        if (item.type === 'text') fn(item);
      },
      label,
      key
    );
  }

  // new text starts out like the text changed last
  function remember(change: Partial<{ font: string; size: number; weight: number; italic: boolean }>) {
    textDefaults.update((d) => ({ ...d, ...change }));
  }

  function setFont(name: string) {
    const fam = $fontFamilies.find((f) => f.name === name);
    const f = fam ? pickFace(fam, first.weight, first.italic) : null;
    void loadFont(name, f?.weight ?? 400, f?.italic ?? false);
    set(
      (it) => {
        it.font = name;
        if (f) {
          it.weight = f.weight;
          it.italic = f.italic;
        }
      },
      'Font',
      'text-font'
    );
    remember({ font: name, ...(f ? { weight: f.weight, italic: f.italic } : {}) });
  }

  function setFace(value: string) {
    const [w, s] = value.split('-');
    const weight = Number(w);
    const italic = s === 'i';
    set(
      (it) => {
        it.weight = weight;
        it.italic = italic;
      },
      'Font style',
      'text-face'
    );
    remember({ weight, italic });
  }

  // box text wraps at a width, switching it on starts from how wide the text is now. the lines of
  // point text sit around the origin by their alignment, box text starts at it, so the transform
  // moves by the difference and nothing jumps
  function setBox(on: boolean) {
    set(
      (it) => {
        if (on === (it.width !== null)) return;
        const b = localBounds(it);
        if (on) {
          it.transform = multiply(it.transform, translate(b.minX, 0));
          it.width = Math.max(20, Math.ceil(b.maxX - b.minX));
        } else {
          const w = it.width ?? 0;
          const shift = it.align === 'center' ? w / 2 : it.align === 'right' ? w : 0;
          it.transform = multiply(it.transform, translate(shift, 0));
          it.width = null;
        }
      },
      on ? 'Box text' : 'Point text',
      'text-box'
    );
  }
</script>

<h3 class="section">Text</h3>
<Field label="Font">
  <FontField value={first.font} onchange={setFont} />
</Field>
<Field label="Style">
  <SelectField value={face} options={faces} label="Font style" onchange={setFace} />
</Field>
<Field label="Size">
  <NumberField
    value={first.size}
    min={1}
    max={2000}
    precision={1}
    unit=" px"
    label="Font size"
    onchange={(v) => {
      set((it) => (it.size = v), 'Font size', 'text-size');
      remember({ size: v });
    }} />
</Field>
<Field label="Line height">
  <NumberField
    value={first.lineHeight}
    min={0.5}
    max={5}
    step={0.05}
    precision={2}
    label="Line height"
    onchange={(v) => set((it) => (it.lineHeight = v), 'Line height', 'text-line-height')} />
</Field>
<Field label="Letter spacing">
  <NumberField
    value={first.spacing}
    min={-100}
    max={500}
    step={0.5}
    precision={1}
    unit=" px"
    label="Letter spacing"
    onchange={(v) => set((it) => (it.spacing = v), 'Letter spacing', 'text-spacing')} />
</Field>
<Field label="Align">
  <div class="aligns">
    {#each ALIGNS as a (a.value)}
      <button
        class="align"
        class:on={first.align === a.value}
        title={a.label}
        aria-label={a.label}
        aria-pressed={first.align === a.value}
        onclick={() => set((it) => (it.align = a.value), 'Align text', 'text-align')}>
        <Icon name={a.icon} size={14} />
      </button>
    {/each}
  </div>
</Field>
<Field label="Box text">
  <ToggleField value={first.width !== null} label="Box text" onchange={setBox} />
</Field>
{#if first.width !== null}
  <Field label="Box width">
    <NumberField
      value={first.width}
      min={1}
      max={20000}
      precision={1}
      unit=" px"
      label="Box width"
      onchange={(v) => set((it) => (it.width = v), 'Box width', 'text-width')} />
  </Field>
{/if}
<div class="actions">
  <button class="action" onclick={outlineSelectedText}>Create outlines</button>
</div>

<style>
  .section {
    margin: 8px 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .aligns {
    display: flex;
    gap: 1px;
  }

  .align {
    width: 26px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    background: var(--bg-elevated);
  }

  .align:hover {
    color: var(--text-primary);
  }

  .align.on {
    color: var(--accent);
    background: var(--accent-dim);
  }

  .actions {
    display: flex;
    padding: 4px 8px;
  }

  .action {
    padding: 3px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .action:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
</style>
