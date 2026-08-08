<script lang="ts">
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import Slider from '../Slider.svelte';
  import ColorField from '../ColorField.svelte';
  import ColorPopover from '../ColorPopover.svelte';
  import type { InstanceItem, Item } from '$lib/core/types';
  import { paintColor, solid } from '$lib/core/style';
  import { layersLength } from '$lib/render/frame';
  import { docVersion, editor } from '$lib/editor/editor';
  import { editInstance, swapSymbol } from '$lib/editor/symbols';

  // the symbol, how it plays, alpha and tint of the selected instances, a change goes to all of them
  let { items }: { items: InstanceItem[] } = $props();

  const MODES = [
    { value: 'loop', label: 'Loop' },
    { value: 'once', label: 'Play once' },
    { value: 'single', label: 'Single frame' }
  ];

  const first = $derived(items[0]);
  const symbols = $derived.by(() => {
    void $docVersion;
    return Object.values(editor.doc.symbols).map((s) => ({ value: s.id, label: s.name }));
  });
  const length = $derived.by(() => {
    void $docVersion;
    const symbol = editor.doc.symbols[first.symbol];
    return symbol ? layersLength(symbol.layers) : 1;
  });

  let picker = $state<{ x: number; y: number } | null>(null);

  function set(fn: (item: InstanceItem) => void, label: string, key: string) {
    editor.updateItems(
      items.map((it) => it.id),
      (item: Item) => {
        if (item.type === 'instance') fn(item);
      },
      label,
      key
    );
  }

  function openPicker(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = picker ? null : { x: rect.left - 270, y: rect.top - 40 };
  }
</script>

<h3 class="section">Instance</h3>
<Field label="Symbol">
  <SelectField
    value={first.symbol}
    options={symbols}
    label="Symbol"
    onchange={(id) =>
      swapSymbol(
        items.map((it) => it.id),
        id
      )} />
</Field>
<Field label="Play">
  <SelectField
    value={first.mode}
    options={MODES}
    label="Play"
    onchange={(v) => set((it) => (it.mode = v as InstanceItem['mode']), 'Play mode', 'instance-mode')} />
</Field>
<Field label="First frame">
  <NumberField
    value={first.first + 1}
    min={1}
    max={length}
    precision={0}
    label="First frame"
    onchange={(v) => set((it) => (it.first = Math.round(v) - 1), 'First frame', 'instance-first')} />
</Field>
<Field label="Alpha">
  <Slider
    value={Math.round(first.alpha * 100)}
    min={0}
    max={100}
    precision={0}
    unit="%"
    label="Alpha"
    onchange={(v) => set((it) => (it.alpha = v / 100), 'Alpha', 'instance-alpha')} />
</Field>
<Field label="Tint">
  <ColorField value={first.tint} label="Tint color" onclick={openPicker} />
</Field>
<Field label="Tint amount">
  <Slider
    value={Math.round(first.tintAmount * 100)}
    min={0}
    max={100}
    precision={0}
    unit="%"
    label="Tint amount"
    disabled={!first.tint}
    onchange={(v) => set((it) => (it.tintAmount = v / 100), 'Tint', 'instance-tint-amount')} />
</Field>
{#if items.length === 1}
  <div class="actions">
    <button class="action" onclick={() => editInstance(first.id)}>Edit in place</button>
  </div>
{/if}

{#if picker}
  <ColorPopover
    title="Tint"
    paint={first.tint ? solid(first.tint) : null}
    allowGradient={false}
    x={picker.x}
    y={picker.y}
    onchange={(p) => {
      const color = paintColor(p);
      set(
        (it) => {
          it.tint = color;
          // a first tint color shows at half strength, not invisible at zero
          if (color && it.tintAmount === 0) it.tintAmount = 0.5;
        },
        'Tint',
        'instance-tint'
      );
    }}
    onclose={() => (picker = null)} />
{/if}

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
