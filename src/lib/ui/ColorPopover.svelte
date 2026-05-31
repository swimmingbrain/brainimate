<script lang="ts">
  import { onMount } from 'svelte';
  import Slider from './Slider.svelte';
  import type { Paint } from '$lib/core/types';
  import { paintAlpha, paintColor, solid } from '$lib/core/style';

  // a small picker until the color panel arrives: the system color dialog, alpha and none
  let {
    paint,
    x,
    y,
    title = 'Color',
    allowNone = true,
    onchange,
    onclose
  }: {
    paint: Paint | null;
    x: number;
    y: number;
    title?: string;
    allowNone?: boolean;
    onchange: (paint: Paint | null) => void;
    onclose: () => void;
  } = $props();

  let el = $state<HTMLDivElement | null>(null);
  let pos = $state({ left: 0, top: 0 });

  const color = $derived(paintColor(paint) ?? '#000000');
  const alpha = $derived(Math.round(paintAlpha(paint) * 100));

  // stays inside the window, flips above the point when there is no room below
  function place() {
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 120;
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = y + h + 4 > window.innerHeight ? Math.max(4, y - h - 8) : y;
    pos = { left, top };
  }

  function onpointerdown(e: PointerEvent) {
    if (el && !el.contains(e.target as Node)) onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }

  onMount(() => {
    place();
    // the click that opened it must not close it again
    const id = setTimeout(() => window.addEventListener('pointerdown', onpointerdown, true));
    // captured, so escape closes this and does not reach the shortcuts as well
    window.addEventListener('keydown', onkeydown, true);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onpointerdown, true);
      window.removeEventListener('keydown', onkeydown, true);
    };
  });
</script>

<svelte:window onresize={place} />

<div class="popover" bind:this={el} style="left: {pos.left}px; top: {pos.top}px" role="dialog" aria-label={title}>
  <div class="head">{title}</div>
  <div class="row">
    <input
      class="native"
      type="color"
      value={color}
      aria-label="Color"
      oninput={(e) => onchange(solid(e.currentTarget.value, alpha / 100))} />
    <span class="hex">{paint ? color.toUpperCase() : 'None'}</span>
    {#if allowNone}
      <button class="none-btn" class:on={paint === null} onclick={() => onchange(null)} title="No color">None</button>
    {/if}
  </div>
  <div class="row">
    <span class="label">Alpha</span>
    <Slider
      value={alpha}
      min={0}
      max={100}
      precision={0}
      unit="%"
      label="Alpha"
      disabled={paint === null}
      onchange={(v) => onchange(solid(color, v / 100))} />
  </div>
</div>

<style>
  .popover {
    position: fixed;
    z-index: 900;
    width: 230px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .head {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .native {
    width: 34px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--border);
    background: none;
    cursor: pointer;
  }

  .native::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .native::-webkit-color-swatch {
    border: none;
  }

  .hex {
    flex: 1;
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-primary);
  }

  .none-btn {
    padding: 3px 8px;
    font-size: 11px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .none-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .none-btn.on {
    color: var(--accent);
    border-color: var(--accent);
  }

  .label {
    width: 38px;
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
