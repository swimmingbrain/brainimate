<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { activeTool, anchorSelection, outlineMode, stageSize, toolCursor, view, type View } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';
  import { fitView, isAutoFit, setAutoFit, setRedraw, setViewport, zoomAround } from '$lib/editor/view';
  import { editor, hover } from '$lib/editor/editor';
  import { renderStage, setImageLoaded } from '$lib/render/renderer';
  import { drawOverlay as drawEditorOverlay } from '$lib/render/overlay';
  import { doubleClick, drawToolOverlay, pointerDown, pointerMove, pointerUp } from '$lib/tools';
  import { coalescedEvents, makeEvent, type ToolEvent } from '$lib/tools/tool';

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
  let panStart: { x: number; y: number; panX: number; panY: number } | null = null;

  // read once from the theme, the canvas cannot use css variables
  const colors = {
    pasteboard: '#111113',
    shadow: 'rgba(0, 0, 0, 0.5)',
    ruler: '#19191c',
    tick: '#5a5a62',
    label: '#85858e',
    border: '#2e2e33',
    accent: '#d19a66'
  };

  const cursor = $derived(panning ? 'grabbing' : spaceHeld || $activeTool === 'hand' ? 'grab' : $toolCursor);

  // the editor holds the dirty flags, the loop below reads them
  function markDirty() {
    editor.markAll();
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
    colors.accent = read('--accent', colors.accent);
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
    if (isAutoFit() && width > 0 && height > 0) {
      const size = get(stageSize);
      view.set(fitView(width, height, size.width, size.height));
    }
    markDirty();
  }

  function drawContent(ctx: CanvasRenderingContext2D) {
    const v = get(view);
    const prefs = get(preferences);
    renderStage(
      ctx,
      editor.doc,
      editor.currentLayers(),
      { zoom: v.zoom, panX: v.panX, panY: v.panY, dpr, width, height },
      {
        frame: editor.frame,
        outline: get(outlineMode),
        preview: editor.preview,
        added: editor.previewAdded,
        assets: editor.doc.assets,
        pasteboard: prefs.stage.pasteboard,
        grid: prefs.grid.show ? { size: prefs.grid.size, color: prefs.grid.color } : null,
        colors
      }
    );
  }

  function drawOverlay(ctx: CanvasRenderingContext2D) {
    const v = get(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawEditorOverlay(ctx, v, dpr, colors);
    ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY);
    drawToolOverlay(ctx);
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
    return makeEvent(e, overlay!.getBoundingClientRect(), get(view));
  }

  function onpointerdown(e: PointerEvent) {
    overlay?.setPointerCapture(e.pointerId);
    const hand = e.button === 1 || (e.button === 0 && (spaceHeld || get(activeTool) === 'hand'));
    if (hand) {
      e.preventDefault();
      const v = get(view);
      panStart = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
      panning = true;
      setAutoFit(false);
      return;
    }
    if (e.button !== 0) return;
    pointerDown(toolEvent(e));
    editor.markOverlay();
  }

  function onpointermove(e: PointerEvent) {
    if (panStart) {
      const start = panStart;
      view.update((v) => ({ ...v, panX: start.panX + e.clientX - start.x, panY: start.panY + e.clientY - start.y }));
      return;
    }
    for (const ev of coalescedEvents(e)) pointerMove(toolEvent(ev));
    editor.markOverlay();
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
    editor.markOverlay();
  }

  function ondblclick(e: MouseEvent) {
    doubleClick(toolEvent(e));
    editor.markOverlay();
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    setAutoFit(false);
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

  // keys typed into a field or pressed in a menu or a dialog are not for the stage
  function busy(target: EventTarget | null): boolean {
    const el = target instanceof HTMLElement ? target : null;
    if (!el) return false;
    if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
    return el.closest('[role="dialog"], [role="menu"]') !== null;
  }

  // only space lives here, every other key goes through the shortcuts
  function onkeydown(e: KeyboardEvent) {
    if (busy(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      spaceHeld = true;
    }
  }

  // space on a focused toolbar button would click it as well, so the stage keeps it
  function onkeyup(e: KeyboardEvent) {
    if (e.key !== ' ' || !spaceHeld) return;
    e.preventDefault();
    spaceHeld = false;
  }

  onMount(() => {
    readColors();
    // desynchronized cuts the pen latency where the browser supports it
    contentCtx = content!.getContext('2d', { desynchronized: true });
    overlayCtx = overlay!.getContext('2d', { desynchronized: true });

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
      activeTool.subscribe(() => editor.markOverlay()),
      anchorSelection.subscribe(() => editor.markOverlay())
    ];
    setRedraw(markDirty);
    setImageLoaded(markDirty);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (editor.contentDirty && contentCtx) {
        editor.contentDirty = false;
        drawContent(contentCtx);
      }
      if (editor.overlayDirty && overlayCtx) {
        editor.overlayDirty = false;
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
      setImageLoaded(null);
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
    onpointerleave={() => {
      if (!panStart) hover.set(null);
    }}
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
