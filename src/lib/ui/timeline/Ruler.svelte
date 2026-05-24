<script lang="ts">
  import { onMount } from 'svelte';

  // frame numbers every 5 frames, a tick on every frame, the playhead as a triangle
  let {
    frame,
    frameWidth,
    scroll = 0,
    onscrub
  }: {
    frame: number;
    frameWidth: number;
    scroll?: number;
    onscrub?: (frame: number) => void;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let height = $state(0);
  let scrubbing = false;

  const colors = { bg: '#19191c', tick: '#3a3a41', major: '#5a5a62', label: '#85858e', playhead: '#d19a66', border: '#2e2e33' };

  function draw() {
    if (!canvas || width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const first = Math.floor(scroll / frameWidth);
    const last = Math.ceil((scroll + width) / frameWidth);
    ctx.lineWidth = 1;
    ctx.font = '9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = first; i <= last; i++) {
      const x = Math.round(i * frameWidth - scroll) + 0.5;
      // the label belongs to the frame cell, shown 1 based
      const n = i + 1;
      const major = n % 5 === 0;
      ctx.strokeStyle = major ? colors.major : colors.tick;
      ctx.beginPath();
      ctx.moveTo(x, height - (major ? 8 : 4));
      ctx.lineTo(x, height);
      ctx.stroke();
      if (major || n === 1) {
        ctx.fillStyle = colors.label;
        ctx.fillText(String(n), x + frameWidth / 2, 5);
      }
    }

    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    const px = frame * frameWidth + frameWidth / 2 - scroll;
    if (px >= -6 && px <= width + 6) {
      ctx.fillStyle = colors.playhead;
      ctx.beginPath();
      ctx.moveTo(px - 5, height - 9);
      ctx.lineTo(px + 5, height - 9);
      ctx.lineTo(px, height - 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(Math.round(px) - 0.5, height - 3, 1, 3);
    }
  }

  function frameAt(e: PointerEvent): number {
    const rect = canvas!.getBoundingClientRect();
    return Math.max(0, Math.floor((e.clientX - rect.left + scroll) / frameWidth));
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 || !onscrub) return;
    canvas?.setPointerCapture(e.pointerId);
    scrubbing = true;
    onscrub(frameAt(e));
  }

  function onpointermove(e: PointerEvent) {
    if (scrubbing) onscrub?.(frameAt(e));
  }

  function onpointerup(e: PointerEvent) {
    scrubbing = false;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  onMount(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    colors.bg = read('--bg-surface', colors.bg);
    colors.tick = read('--frame-hold-edge', colors.tick);
    colors.major = read('--stage-ruler-tick', colors.major);
    colors.label = read('--text-muted', colors.label);
    colors.playhead = read('--accent', colors.playhead);
    colors.border = read('--border', colors.border);
  });

  $effect(() => {
    void [frame, frameWidth, scroll, width, height];
    draw();
  });
</script>

<div class="ruler" bind:clientWidth={width} bind:clientHeight={height}>
  <canvas
    bind:this={canvas}
    style="width: {width}px; height: {height}px"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}></canvas>
</div>

<style>
  .ruler {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    cursor: ew-resize;
    touch-action: none;
  }
</style>
