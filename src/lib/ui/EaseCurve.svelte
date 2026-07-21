<script lang="ts">
  import { onMount } from 'svelte';
  import type { Handles } from '$lib/anim/easing';

  // a cubic bezier from the bottom left to the top right with two handles to drag, like css cubic-bezier
  let {
    handles,
    oninput,
    onchange
  }: {
    handles: Handles;
    oninput: (handles: Handles) => void;
    onchange?: (handles: Handles) => void;
  } = $props();

  const HEIGHT = 132;
  // room above and below the unit box, for curves that overshoot
  const PAD_Y = 0.35;
  const PAD_X = 10;
  const DOT = 5;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let dragging: 1 | 2 | null = null;
  let live: Handles | null = null;

  const colors = { bg: '#111113', grid: '#2e2e33', curve: '#d19a66', handle: '#a1a1aa', muted: '#85858e' };

  function toPx(x: number, y: number): [number, number] {
    const w = width - PAD_X * 2;
    const top = 8;
    const h = HEIGHT - 16;
    return [PAD_X + x * w, top + ((1 + PAD_Y - y) / (1 + PAD_Y * 2)) * h];
  }

  function fromPx(px: number, py: number): [number, number] {
    const w = width - PAD_X * 2;
    const h = HEIGHT - 16;
    const x = (px - PAD_X) / w;
    const y = 1 + PAD_Y - ((py - 8) / h) * (1 + PAD_Y * 2);
    return [Math.max(0, Math.min(1, x)), Math.max(-1, Math.min(2, y))];
  }

  function draw() {
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, HEIGHT);
    const [x1, y1, x2, y2] = live ?? handles;
    const p0 = toPx(0, 0);
    const p3 = toPx(1, 1);
    const c1 = toPx(x1, y1);
    const c2 = toPx(x2, y2);

    // the unit box and its diagonal, the straight linear ease
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(p0[0]) + 0.5, Math.round(p3[1]) + 0.5, Math.round(p3[0] - p0[0]), Math.round(p0[1] - p3[1]));
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = colors.handle;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(c1[0], c1[1]);
    ctx.moveTo(p3[0], p3[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();

    ctx.strokeStyle = colors.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]);
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = colors.curve;
    for (const c of [c1, c2]) {
      ctx.beginPath();
      ctx.arc(c[0], c[1], DOT, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function local(e: PointerEvent): [number, number] {
    const rect = canvas!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 || !canvas) return;
    const [px, py] = local(e);
    const [x1, y1, x2, y2] = handles;
    const d1 = Math.hypot(px - toPx(x1, y1)[0], py - toPx(x1, y1)[1]);
    const d2 = Math.hypot(px - toPx(x2, y2)[0], py - toPx(x2, y2)[1]);
    // the nearer handle, whichever it is, so a click anywhere grabs one
    dragging = d1 <= d2 ? 1 : 2;
    canvas.setPointerCapture(e.pointerId);
    onpointermove(e);
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return;
    const [x, y] = fromPx(...local(e));
    const h: Handles = [...(live ?? handles)];
    if (dragging === 1) {
      h[0] = x;
      h[1] = y;
    } else {
      h[2] = x;
      h[3] = y;
    }
    live = h;
    draw();
    oninput(h);
  }

  function onpointerup(e: PointerEvent) {
    if (!dragging) return;
    dragging = null;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const h = live;
    live = null;
    if (h) onchange?.(h);
  }

  onMount(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    colors.bg = read('--bg-deep', colors.bg);
    colors.grid = read('--border', colors.grid);
    colors.curve = read('--accent', colors.curve);
    colors.handle = read('--text-secondary', colors.handle);
    colors.muted = read('--text-muted', colors.muted);
    draw();
  });

  $effect(() => {
    void [handles[0], handles[1], handles[2], handles[3], width];
    if (!dragging) draw();
  });
</script>

<div class="curve" bind:clientWidth={width}>
  <canvas
    bind:this={canvas}
    style="width: {width}px; height: {HEIGHT}px"
    aria-label="Ease curve"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}></canvas>
</div>

<style>
  .curve {
    width: 100%;
    border: 1px solid var(--border);
  }

  canvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }
</style>
