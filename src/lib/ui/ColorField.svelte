<script lang="ts">
  // a swatch that opens the color picker, null shows the none slash
  let {
    value,
    onclick,
    disabled = false,
    showHex = true,
    label
  }: {
    value: string | null;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    showHex?: boolean;
    label?: string;
  } = $props();
</script>

<div class="color-field" class:disabled>
  <button
    class="swatch"
    class:none={value === null}
    style={value ? `--swatch: ${value}` : ''}
    {disabled}
    title={label ?? 'Color'}
    aria-label={label ?? 'Color'}
    {onclick}></button>
  {#if showHex}
    <span class="hex">{value ? value.toUpperCase() : 'None'}</span>
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
    background: var(--swatch, #fff);
    border: 1px solid var(--border);
    box-shadow: inset 0 0 0 1px var(--bg-deep);
  }

  .swatch:hover:not(:disabled) {
    border-color: var(--text-muted);
  }

  .swatch.none {
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
