<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import Ruler from './Ruler.svelte';
  import LayerList from './LayerList.svelte';
  import FrameGrid from './FrameGrid.svelte';
  import TimelineBar from './TimelineBar.svelte';
  import { docVersion, editor } from '$lib/editor/editor';
  import { addFolder, addLayer, addRigLayer, deleteActiveLayer, goToFrame } from '$lib/editor/commands';
  import { layerRows } from '$lib/anim/timeline';
  import { collapsedFolders, frame, timelineView } from '$lib/stores/app';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { EXTRA_FRAMES, MAX_FRAME_W, MIN_FRAME_W, ROW_H, prepareCanvas, timelineColors } from './metrics';

  let body = $state<HTMLDivElement | null>(null);
  let gridEl = $state<HTMLDivElement | null>(null);
  let headCanvas = $state<HTMLCanvasElement | null>(null);
  let gridW = $state(0);
  let gridH = $state(0);

  const fw = $derived($preferences.timeline.frameWidth);
  const rows = $derived.by(() => {
    void $docVersion;
    return layerRows(editor.currentLayers(), $collapsedFolders);
  });
  const length = $derived.by(() => {
    void $docVersion;
    return editor.length();
  });
  const scrollX = $derived($timelineView.scrollX);
  const scrollY = $derived($timelineView.scrollY);
  const playheadX = $derived($frame * fw + fw / 2 - scrollX);
  const onion = $derived(
    $preferences.timeline.onion
      ? {
          before: $preferences.timeline.onionBefore,
          after: $preferences.timeline.onionAfter,
          beforeColor: $preferences.timeline.onionBeforeColor,
          afterColor: $preferences.timeline.onionAfterColor
        }
      : null
  );

  function maxX(width = fw): number {
    return Math.max(0, (Math.max(length, $frame + 1) + EXTRA_FRAMES) * width - gridW);
  }

  function maxY(): number {
    return Math.max(0, rows.length * ROW_H - gridH);
  }

  function scrollTo(x: number, y: number, width = fw) {
    const sx = Math.max(0, Math.min(maxX(width), x));
    const sy = Math.max(0, Math.min(maxY(), y));
    timelineView.update((v) => (v.scrollX === sx && v.scrollY === sy ? v : { ...v, scrollX: sx, scrollY: sy }));
  }

  // the playhead line is a canvas of its own over the frames, a moving element cost more per frame
  $effect(() => {
    const x = playheadX;
    if (!headCanvas || gridW <= 0 || gridH <= 0) return;
    const ctx = prepareCanvas(headCanvas, gridW, gridH);
    if (!ctx) return;
    ctx.clearRect(0, 0, gridW, gridH);
    ctx.fillStyle = timelineColors().accent;
    ctx.fillRect(Math.round(x - 0.5), 0, 1, gridH);
  });

  $effect(() => {
    const w = gridW;
    const h = gridH;
    timelineView.update((v) => (v.width === w && v.height === h ? v : { ...v, width: w, height: h }));
  });

  // fewer rows or a taller panel can leave the list scrolled past its end
  $effect(() => {
    void [rows.length, gridH];
    untrack(() => scrollTo(scrollX, scrollY));
  });

  // the playhead stays in view while playing or stepping, a page at a time
  $effect(() => {
    const f = $frame;
    untrack(() => {
      if (gridW <= 0) return;
      const left = f * fw;
      if (left < scrollX) scrollTo(left - gridW * 0.1, scrollY);
      else if (left + fw > scrollX + gridW) scrollTo(left - gridW * 0.1, scrollY);
    });
  });

  // ctrl zooms the frames around the pointer, shift scrolls sideways, the plain wheel goes up and down
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      const rect = gridEl!.getBoundingClientRect();
      const px = Math.max(0, e.clientX - rect.left);
      const at = (px + scrollX) / fw;
      const step = Math.max(1, Math.round(fw * 0.15));
      const next = Math.max(MIN_FRAME_W, Math.min(MAX_FRAME_W, fw + (e.deltaY < 0 ? step : -step)));
      if (next === fw) return;
      setGroup('timeline', { frameWidth: next });
      scrollTo(at * next - px, scrollY, next);
      return;
    }
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    scrollTo(scrollX + dx, scrollY + dy);
  }

  $effect(() => {
    const el = body;
    if (!el) return;
    el.addEventListener('wheel', onwheel, { passive: false });
    return () => el.removeEventListener('wheel', onwheel);
  });
</script>

<section class="timeline">
  <div class="head">
    <div class="layer-head">
      <button class="mini-btn" onclick={addLayer} title="New layer" aria-label="New layer">
        <Icon name="plus" size={13} />
      </button>
      <button class="mini-btn" onclick={addFolder} title="New folder" aria-label="New folder">
        <Icon name="folder" size={13} />
      </button>
      <button class="mini-btn" onclick={addRigLayer} title="New rig layer" aria-label="New rig layer">
        <Icon name="rig" size={13} />
      </button>
      <span class="grow"></span>
      <button class="mini-btn" onclick={deleteActiveLayer} title="Delete layer" aria-label="Delete layer">
        <Icon name="trash" size={13} />
      </button>
    </div>
    <div class="ruler-area">
      <Ruler
        frame={$frame}
        frameWidth={fw}
        {scrollX}
        width={gridW}
        {length}
        {onion}
        onscrub={goToFrame}
        onrange={(before, after) => setGroup('timeline', { onionBefore: before, onionAfter: after })} />
    </div>
  </div>

  <div class="body" bind:this={body}>
    <div class="layers">
      <LayerList {rows} {scrollY} />
    </div>
    <div class="grid" bind:this={gridEl} bind:clientWidth={gridW} bind:clientHeight={gridH}>
      <FrameGrid {rows} frameWidth={fw} {scrollX} {scrollY} width={gridW} height={gridH} />
      <canvas class="playhead" bind:this={headCanvas} style="width: {gridW}px; height: {gridH}px"></canvas>
    </div>
  </div>

  <TimelineBar />
</section>

<style>
  .timeline {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-surface);
    user-select: none;
  }

  .head {
    height: var(--ruler-h);
    display: flex;
    flex-shrink: 0;
  }

  .layer-head {
    width: var(--layer-header-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 0 4px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .grow {
    flex: 1;
  }

  .mini-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .mini-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .ruler-area {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .layers {
    width: var(--layer-header-w);
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    background: var(--bg-surface);
    min-height: 0;
  }

  .grid {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-deep);
  }

  .playhead {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 4;
  }
</style>
