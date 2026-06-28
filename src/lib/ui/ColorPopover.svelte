<script lang="ts">
  import { onMount } from 'svelte';
  import ColorPicker from './ColorPicker.svelte';
  import type { Paint } from '$lib/core/types';

  // the color picker floating next to a chip or a field
  let {
    paint,
    x,
    y,
    title = 'Color',
    allowNone = true,
    allowGradient = true,
    onchange,
    onangle,
    onclose
  }: {
    paint: Paint | null;
    x: number;
    y: number;
    title?: string;
    allowNone?: boolean;
    allowGradient?: boolean;
    onchange: (paint: Paint | null) => void;
    onangle?: (angle: number) => void;
    onclose: () => void;
  } = $props();

  let el = $state<HTMLDivElement | null>(null);
  let pos = $state({ left: 0, top: 0 });

  // stays inside the window, moves up when there is no room below
  function place() {
    const w = el?.offsetWidth ?? 260;
    const h = el?.offsetHeight ?? 360;
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - h - 4));
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
  <ColorPicker {paint} {onchange} {onangle} {allowNone} {allowGradient} />
</div>

<style>
  .popover {
    position: fixed;
    z-index: 900;
    width: 260px;
    padding-top: 6px;
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .head {
    padding: 0 8px 2px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }
</style>
