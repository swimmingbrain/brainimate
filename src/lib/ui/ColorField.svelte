<script lang="ts">
  import type { Paint } from '$lib/core/types';
  import { cssPaint } from '$lib/core/gradient';

  // a swatch that opens the color picker, null shows the none slash, a paint shows its gradient too
  let {
    value,
    paint,
    onclick,
    disabled = false,
    showHex = true,
    label
  }: {
    value: string | null;
    paint?: Paint | null;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    showHex?: boolean;
    label?: string;
  } = $props();

  const background = $derived(paint !== undefined ? cssPaint(paint) : value);
  const text = $derived.by(() => {
    if (paint && paint.type !== 'solid') return paint.type === 'linear' ? 'Linear' : 'Radial';
    return value ? value.toUpperCase() : 'None';
  });
</script>

<div class="color-field" class:disabled>
  <button
    class="swatch"
    class:none={background === null}
    style={background ? `--swatch: ${background}` : ''}
    {disabled}
    title={label ?? 'Color'}
    aria-label={label ?? 'Color'}
    {onclick}></button>
  {#if showHex}
    <span class="hex">{text}</span>
  {/if}
</div>

<style>
  .color-field {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .swatch {
    position: relative;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    /* the checkers show through a color with alpha */
    background: repeating-conic-gradient(#9a9aa2 0 25%, #d4d4d8 0 50%) 0 0 / 8px 8px;
    border: 1px solid var(--border);
    box-shadow: inset 0 0 0 1px var(--bg-deep);
  }

  .swatch::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--swatch, #fff);
  }

  .swatch:hover:not(:disabled) {
    border-color: var(--text-muted);
  }

  .swatch.none::before {
    background: #fff;
  }

  .swatch.none::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -3px;
    bottom: -3px;
    width: 1.5px;
    background: var(--error);
    transform: rotate(45deg);
  }

  .hex {
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .color-field.disabled {
    opacity: 0.4;
  }
</style>
