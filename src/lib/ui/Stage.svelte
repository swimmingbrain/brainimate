<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { activeTool, outlineMode, stageSize, view, type View } from '$lib/stores/app';
  import { preferences, type Preferences } from '$lib/stores/preferences';
  import { fitView, screenToWorld, setRedraw, setViewport, zoomAround } from '$lib/editor/view';
  import { cursorFor, doubleClick, drawToolOverlay, keyDown, pointerDown, pointerMove, pointerUp } from '$lib/tools';
  import type { ToolEvent } from '$lib/tools/tool';

  // ondraw paints the document in world space, onoverlay draws handles and guides on top of it
  let {
    ondraw,
    onoverlay
  }: {
    ondraw?: (ctx: CanvasRenderingContext2D, v: View) => void;
    onoverlay?: (ctx: CanvasRenderingContext2D, v: View) => void;
  } = $props();

  const RULER = 16;

  let host = $state<HTMLDivElement | null>(null);
  let content = $state<HTMLCanvasElement | null>(null);
  let overlay = $state<HTMLCanvasElement | null>(null);
  let spaceHeld = $state(false);
  let panning = $state(false);

  let contentCtx: CanvasRenderingContext2D | null = null;
  let overlayCtx: CanvasRenderingContext2D | null = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let contentDirty = true;
  let overlayDirty = true;
  let fitted = false;
  let panStart: { x: number; y: number; panX: number; panY: number } | null = null;

  // read once from the theme, the canvas cannot use css variables
  const colors = { pasteboard: '#111113', shadow: 'rgba(0, 0, 0, 0.5)', ruler: '#19191c', tick: '#5a5a62', label: '#85858e', border: '#2e2e33' };

  const cursor = $derived(
    panning ? 'grabbing' : spaceHeld || $activeTool === 'hand' ? 'grab' : cursorFor($activeTool)
  );

  function markDirty() {
    contentDirty = true;
    overlayDirty = true;
  }

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    colors.pasteboard = read('--pasteboard', colors.pasteboard);
    colors.shadow = read('--stage-shadow', colors.shadow);
    colors.ruler = read('--stage-ruler', colors.ruler);
    colors.tick = read('--stage-ruler-tick', colors.tick);
    colors.label = read('--text-muted', colors.label);
    colors.border = read('--border', colors.border);
  }

  function resize() {
    if (!host || !content || !overlay) return;
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = window.devicePixelRatio || 1;
    for (const canvas of [content, overlay]) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    setViewport(width, height);
    if (!fitted && width > 0 && height > 0) {
      fitted = true;
      const size = get(stageSize);
      view.set(fitView(width, height, size.width, size.height));
    }
    markDirty();
  }

  function drawContent(ctx: CanvasRenderingContext2D) {
    const v = get(view);
    const size = get(stageSize);
    const prefs = get(preferences);
    const x = v.panX;
    const y = v.panY;
    const w = size.width * v.zoom;
    const h = size.height * v.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.pasteboard;
    ctx.fillRect(0, 0, width, height);

    // shadow sizes are in device pixels, the transform does not scale them
    ctx.save();
    ctx.shadowColor = colors.shadow;
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowOffsetY = 3 * dpr;
    ctx.fillStyle = size.background;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.save();
    if (!prefs.stage.pasteboard) {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    }
    ctx.translate(v.panX, v.panY);
    ctx.scale(v.zoom, v.zoom);
    ondraw?.(ctx, v);
    ctx.restore();

    if (prefs.grid.show) drawGrid(ctx, v, prefs.grid, x, y, w, h);
  }

  // one device pixel lines, only the ones inside both the stage and the window
  function drawGrid(
    ctx: CanvasRenderingContext2D,
    v: View,
    grid: Preferences['grid'],
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    const step = grid.size * v.zoom * dpr;
    if (step < 5) return;
    const x0 = x * dpr;
    const y0 = y * dpr;
    const x1 = Math.min((x + w) * dpr, width * dpr);
    const y1 = Math.min((y + h) * dpr, height * dpr);
    const top = Math.max(y0, 0);
    const left = Math.max(x0, 0);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = grid.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = Math.max(1, Math.ceil(-x0 / step)); x0 + i * step < x1; i++) {
      const px = Math.round(x0 + i * step) + 0.5;
      ctx.moveTo(px, top);
      ctx.lineTo(px, y1);
    }
    for (let i = Math.max(1, Math.ceil(-y0 / step)); y0 + i * step < y1; i++) {
      const py = Math.round(y0 + i * step) + 0.5;
      ctx.moveTo(left, py);
      ctx.lineTo(x1, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(ctx: CanvasRenderingContext2D) {
    const v = get(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY);
    drawToolOverlay(ctx);
    onoverlay?.(ctx, v);
    if (get(preferences).rulers.show) drawRulers(ctx, v);
  }

  // 1, 2 or 5 times a power of ten, the smallest one at least min long
  function niceStep(min: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(min)));
    for (const m of [1, 2, 5]) if (m * p >= min) return m * p;
    return 10 * p;
  }

  function label(n: number): string {
    return String(Math.round(n * 100) / 100);
  }

  function drawRulers(ctx: CanvasRenderingContext2D, v: View) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, width, RULER);
    ctx.fillRect(0, 0, RULER, height);

    const major = niceStep(64 / v.zoom);
    const minor = major / 10;
    const minorPx = minor * v.zoom;
    const every = minorPx < 4 ? 5 : 1;

    ctx.strokeStyle = colors.tick;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.label;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.beginPath();

    for (let i = Math.ceil((RULER - v.panX) / v.zoom / minor); ; i++) {
      const sx = Math.round(i * minor * v.zoom + v.panX) + 0.5;
      if (sx > width) break;
      if (i % every !== 0) continue;
      const len = i % 10 === 0 ? RULER : i % 5 === 0 ? 7 : 4;
      ctx.moveTo(sx, RULER - len);
      ctx.lineTo(sx, RULER);
      if (i % 10 === 0) ctx.fillText(label(i * minor), sx + 3, 2);
    }

    for (let i = Math.ceil((RULER - v.panY) / v.zoom / minor); ; i++) {
      const sy = Math.round(i * minor * v.zoom + v.panY) + 0.5;
      if (sy > height) break;
      if (i % every !== 0) continue;
      const len = i % 10 === 0 ? RULER : i % 5 === 0 ? 7 : 4;
      ctx.moveTo(RULER - len, sy);
      ctx.lineTo(RULER, sy);
      if (i % 10 === 0) {
        ctx.save();
        ctx.translate(2, sy - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label(i * minor), 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();

    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, RULER, RULER);
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(RULER, RULER - 0.5);
    ctx.lineTo(width, RULER - 0.5);
    ctx.moveTo(RULER - 0.5, RULER);
    ctx.lineTo(RULER - 0.5, height);
    ctx.moveTo(0, RULER - 0.5);
    ctx.lineTo(RULER, RULER - 0.5);
    ctx.lineTo(RULER - 0.5, 0);
    ctx.stroke();
  }

  function toolEvent(e: PointerEvent | MouseEvent): ToolEvent {
    const rect = overlay!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(get(view), sx, sy);
    const pointer = e instanceof PointerEvent ? e : null;
    return {
      x: w.x,
      y: w.y,
      sx,
      sy,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
      pressure: pointer && pointer.pointerType === 'pen' ? pointer.pressure : 0.5,
      button: e.button,
      pointerType: pointer?.pointerType ?? 'mouse'
    };
  }

  function onpointerdown(e: PointerEvent) {
    overlay?.setPointerCapture(e.pointerId);
    const hand = e.button === 1 || (e.button === 0 && (spaceHeld || get(activeTool) === 'hand'));
    if (hand) {
      e.preventDefault();
      const v = get(view);
      panStart = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
      panning = true;
      return;
    }
    if (e.button !== 0) return;
    pointerDown(toolEvent(e));
    overlayDirty = true;
  }

  function onpointermove(e: PointerEvent) {
    if (panStart) {
      const start = panStart;
      view.update((v) => ({ ...v, panX: start.panX + e.clientX - start.x, panY: start.panY + e.clientY - start.y }));
      return;
    }
    // a pen sends more points than frames, the tools get all of them
    const events = e.getCoalescedEvents?.() ?? [];
    if (events.length > 0) for (const ev of events) pointerMove(toolEvent(ev));
    else pointerMove(toolEvent(e));
    overlayDirty = true;
  }

  function onpointerup(e: PointerEvent) {
    if (overlay?.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
    if (panStart) {
      panStart = null;
      panning = false;
      return;
    }
    if (e.button !== 0) return;
    pointerUp(toolEvent(e));
    overlayDirty = true;
  }

  function ondblclick(e: MouseEvent) {
    doubleClick(toolEvent(e));
    overlayDirty = true;
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const rect = overlay!.getBoundingClientRect();
    // a line is about 16 pixels when the wheel counts in lines
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * unit * 0.002);
      view.update((v) => zoomAround(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top));
      return;
    }
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    view.update((v) => ({ ...v, panX: v.panX - dx, panY: v.panY - dy }));
  }

  function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  }

  function onkeydown(e: KeyboardEvent) {
    if (typing(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      spaceHeld = true;
      return;
    }
    keyDown(e);
    overlayDirty = true;
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.key === ' ') spaceHeld = false;
  }

  onMount(() => {
    readColors();
    contentCtx = content!.getContext('2d');
    overlayCtx = overlay!.getContext('2d');

    const observer = new ResizeObserver(resize);
    observer.observe(host!);
    resize();

    const canvas = overlay!;
    canvas.addEventListener('wheel', onwheel, { passive: false });

    const unsubscribe = [
      view.subscribe(markDirty),
      preferences.subscribe(markDirty),
      stageSize.subscribe(markDirty),
      outlineMode.subscribe(markDirty),
      activeTool.subscribe(() => (overlayDirty = true))
    ];
    setRedraw(markDirty);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (contentDirty && contentCtx) {
        contentDirty = false;
        drawContent(contentCtx);
      }
      if (overlayDirty && overlayCtx) {
        overlayDirty = false;
        drawOverlay(overlayCtx);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('wheel', onwheel);
      for (const off of unsubscribe) off();
      setRedraw(null);
    };
  });
</script>

<svelte:window {onkeydown} {onkeyup} onblur={() => (spaceHeld = false)} />

<div class="stage" bind:this={host} style="cursor: {cursor}">
  <canvas class="content" bind:this={content}></canvas>
  <canvas
    class="overlay"
    bind:this={overlay}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {ondblclick}
    onmousedown={(e) => {
      // the middle button pans, it must not start the browser's autoscroll
      if (e.button === 1) e.preventDefault();
    }}
    oncontextmenu={(e) => e.preventDefault()}></canvas>
</div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--pasteboard);
  }

  canvas {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
  }

  .overlay {
    touch-action: none;
  }
</style>
