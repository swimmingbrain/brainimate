<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import Menu from './Menu.svelte';
  import ColorPopover from './ColorPopover.svelte';
  import Slider from './Slider.svelte';
  import { TOOL_INFO, selectTool } from '$lib/tools';
  import type { ToolId } from '$lib/tools/tool';
  import { cssPaint } from '$lib/core/gradient';
  import { docVersion, editor } from '$lib/editor/editor';
  import { commandById } from '$lib/editor/actions';
  import { commandItem } from '$lib/editor/menus';
  import { setPaint, shownPaint } from '$lib/editor/commands';
  import { zoomFit, zoomIn, zoomOut } from '$lib/editor/view';
  import { activeTool, fillPaint, frame, selection, strokeWidth, type MenuItem } from '$lib/stores/app';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { toggleTimeline } from '$lib/stores/workspace';
  import { COMIC_PALETTE } from '$lib/core/comic';

  // the buttons a finger needs most, along the bottom of the stage: history, the main tools, color and
  // size, zoom, the panels and the rest behind more
  let { dockOpen, ontoggledock }: { dockOpen: boolean; ontoggledock: () => void } = $props();

  const SHAPES: ToolId[] = ['rect', 'ellipse', 'polygon', 'line', 'pen', 'curvature', 'pencil'];
  const TOOLS: ToolId[] = ['select', 'brush', 'eraser', 'text'];

  const run = (id: string) => commandById(id)?.run();
  const shapeTool = $derived(SHAPES.includes($activeTool) ? $activeTool : 'rect');
  const shapeItems = $derived<MenuItem[]>(
    SHAPES.map((id) => ({ label: TOOL_INFO[id].name, checked: $activeTool === id, action: () => selectTool(id) }))
  );

  const more = $derived.by<MenuItem[]>(() => {
    const k = $preferences.shortcuts;
    const none = $selection.size === 0;
    return [
      commandItem('edit.copy', k, { disabled: none }),
      commandItem('edit.cut', k, { disabled: none }),
      commandItem('edit.paste', k),
      commandItem('edit.duplicate', k, { disabled: none }),
      commandItem('edit.delete', k, { disabled: none }),
      { label: '', separator: true },
      commandItem('edit.select-all', k),
      commandItem('edit.deselect', k, { disabled: none }),
      commandItem('modify.group', k, { disabled: none }),
      commandItem('modify.symbol', k, { disabled: none, label: 'Convert to symbol...' }),
      { label: '', separator: true },
      commandItem('timeline.keyframe', k),
      commandItem('timeline.insert-frame', k),
      commandItem('timeline.play', k, { label: 'Play or pause' }),
      { label: '', separator: true },
      commandItem('file.open', k),
      commandItem('file.import', k),
      commandItem('file.export', k),
      commandItem('edit.palette', k),
      commandItem('edit.preferences', k)
    ];
  });

  // the fill new shapes get and the brush paints with, or the one of the selection
  const fill = $derived.by(() => {
    void $docVersion;
    void $selection;
    void $frame;
    void $fillPaint;
    return shownPaint('fill');
  });

  let picker = $state<{ x: number; y: number } | null>(null);
  let sizer = $state<{ x: number; y: number } | null>(null);

  // the size the active tool draws with: the brush and the eraser have their own, the rest the stroke
  const size = $derived.by(() => {
    const d = $preferences.drawing;
    switch ($activeTool) {
      case 'brush':
        return { label: 'Brush size', value: d.brushSize, min: 1, max: 120, set: (v: number) => setGroup('drawing', { brushSize: v }) };
      case 'eraser':
        return { label: 'Eraser size', value: d.eraserSize, min: 1, max: 200, set: (v: number) => setGroup('drawing', { eraserSize: v }) };
      case 'pencil':
        return { label: 'Pencil width', value: d.pencilWidth, min: 0.5, max: 40, set: (v: number) => setGroup('drawing', { pencilWidth: v }) };
      default:
        return { label: 'Stroke width', value: $strokeWidth, min: 0, max: 40, set: (v: number) => strokeWidth.set(v) };
    }
  });

  function above(e: MouseEvent, w: number, h: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(4, r.left + r.width / 2 - w / 2), y: r.top - h - 8 };
  }
</script>

<div class="touch-bar" role="toolbar" aria-label="Touch tools">
  <div class="group">
    <button class="btn" title="Undo" aria-label="Undo" onclick={() => run('edit.undo')}><Icon name="undo" size={20} /></button>
    <button class="btn" title="Redo" aria-label="Redo" onclick={() => run('edit.redo')}><Icon name="redo" size={20} /></button>
  </div>
  <!-- on the left, the drawer of the panels opens from the right and never covers them -->
  <div class="group">
    <button
      class="btn"
      class:on={$preferences.panels.timeline}
      title="Layers and timeline"
      aria-label="Layers and timeline"
      aria-pressed={$preferences.panels.timeline}
      onclick={toggleTimeline}>
      <Icon name="layer" size={20} />
    </button>
    <button
      class="btn"
      class:on={dockOpen}
      title="Panels: properties, colors, library"
      aria-label="Panels"
      aria-pressed={dockOpen}
      onclick={ontoggledock}>
      <Icon name="settings" size={20} />
    </button>
  </div>
  <div class="group">
    {#each TOOLS as id (id)}
      <button
        class="btn"
        class:on={$activeTool === id}
        title={TOOL_INFO[id].name}
        aria-label={TOOL_INFO[id].name}
        aria-pressed={$activeTool === id}
        onclick={() => selectTool(id)}>
        <Icon name={TOOL_INFO[id].icon} size={20} />
      </button>
    {/each}
    <Menu items={shapeItems}>
      {#snippet trigger({ toggle })}
        <button
          class="btn"
          class:on={SHAPES.includes($activeTool)}
          title="Shapes and paths"
          aria-label="Shapes and paths"
          onclick={toggle}>
          <Icon name={TOOL_INFO[shapeTool].icon} size={20} />
          <span class="caret"><Icon name="chevron-up" size={9} /></span>
        </button>
      {/snippet}
    </Menu>
  </div>
  <div class="group">
    <button
      class="btn"
      title="Fill color, the brush paints with it"
      aria-label="Fill color"
      onclick={(e) => (picker = picker ? null : above(e, 260, 420))}>
      <span class="chip" style="background: {cssPaint(fill) ?? 'transparent'}" class:none={!fill}></span>
    </button>
    <button
      class="btn size"
      title={size.label}
      aria-label={size.label}
      onclick={(e) => (sizer = sizer ? null : above(e, 240, 72))}>
      <span class="dot" style="width: {Math.max(3, Math.min(22, size.value / 2 + 2))}px; height: {Math.max(3, Math.min(22, size.value / 2 + 2))}px"></span>
    </button>
  </div>
  <div class="group">
    <button class="btn" title="Zoom out" aria-label="Zoom out" onclick={zoomOut}><Icon name="minus" size={20} /></button>
    <button class="btn" title="Zoom in" aria-label="Zoom in" onclick={zoomIn}><Icon name="plus" size={20} /></button>
    <button class="btn" title="Fit the stage" aria-label="Fit the stage" onclick={zoomFit}><Icon name="fit" size={20} /></button>
  </div>
  <div class="group">
    <button class="btn" title="Save" aria-label="Save" onclick={() => run('file.save')}><Icon name="save" size={20} /></button>
    <Menu items={more}>
      {#snippet trigger({ toggle })}
        <button class="btn" title="More" aria-label="More" onclick={toggle}><Icon name="more" size={20} /></button>
      {/snippet}
    </Menu>
  </div>
</div>

{#if picker}
  <ColorPopover
    title="Fill"
    paint={fill}
    x={picker.x}
    y={picker.y}
    swatches={$preferences.swatches.comic ? COMIC_PALETTE : []}
    onchange={(p) => setPaint('fill', p)}
    onclose={() => (picker = null)} />
{/if}

{#if sizer}
  <!-- a tap outside closes it, the stage stays usable around it -->
  <button class="backdrop" aria-label="Close" onclick={() => (sizer = null)}></button>
  <div class="sizer" style="left: {sizer.x}px; top: {sizer.y}px" role="dialog" aria-label={size.label}>
    <span class="sizer-label">{size.label}</span>
    <Slider value={size.value} min={size.min} max={size.max} step={0.5} precision={1} unit=" px" label={size.label} onchange={size.set} oninput={size.set} />
  </div>
{/if}

<style>
  .touch-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 52px;
    padding: 0 6px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .touch-bar::-webkit-scrollbar {
    display: none;
  }

  .group {
    display: flex;
    gap: 2px;
    padding-right: 6px;
    border-right: 1px solid var(--border);
  }

  .group:last-child {
    border-right: none;
    margin-left: auto;
  }

  .btn {
    position: relative;
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    border-radius: var(--radius-lg);
  }

  .btn:active {
    background: var(--bg-hover);
  }

  .btn.on {
    color: var(--accent);
    background: var(--accent-dim);
  }

  .caret {
    position: absolute;
    right: 3px;
    top: 3px;
    opacity: 0.6;
  }

  .chip {
    width: 24px;
    height: 24px;
    border: 2px solid var(--text-secondary);
    border-radius: 50%;
  }

  .chip.none {
    background: linear-gradient(135deg, transparent 45%, var(--error) 45%, var(--error) 55%, transparent 55%) !important;
  }

  .dot {
    display: block;
    border-radius: 50%;
    background: var(--text-primary);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: transparent;
  }

  .sizer {
    position: fixed;
    z-index: 91;
    width: 240px;
    padding: 10px 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sizer-label {
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
