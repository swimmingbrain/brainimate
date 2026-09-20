<script lang="ts">
  import ColorField from '../../ColorField.svelte';
  import ColorPopover from '../../ColorPopover.svelte';
  import { paintColor, solid } from '$lib/core/style';

  // a color of the preferences: the swatch opens the picker, a plain color without alpha comes back
  let { value, label, onchange }: { value: string; label: string; onchange: (hex: string) => void } = $props();

  let picker = $state<{ x: number; y: number } | null>(null);

  function open(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = picker ? null : { x: rect.left, y: rect.bottom + 4 };
  }
</script>

<ColorField {value} {label} onclick={open} />
{#if picker}
  <ColorPopover
    paint={solid(value)}
    x={picker.x}
    y={picker.y}
    title={label}
    allowNone={false}
    allowGradient={false}
    onchange={(p) => {
      const hex = paintColor(p);
      if (hex) onchange(hex);
    }}
    onclose={() => (picker = null)} />
{/if}
