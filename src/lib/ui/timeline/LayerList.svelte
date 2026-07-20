<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Layer } from '$lib/core/types';
  import type { LayerRow } from '$lib/anim/timeline';
  import { LAYER_COLORS } from '$lib/editor/editor';
  import {
    deleteLayer,
    duplicateLayer,
    hideOtherLayers,
    lockOtherLayers,
    moveLayerTo,
    renameLayer,
    setActiveLayer,
    setLayerColor,
    setLayerFlag,
    showAllLayers,
    toggleFolder
  } from '$lib/editor/layers';
  import { activeLayer, collapsedFolders, contextMenu, type MenuItem } from '$lib/stores/app';
  import { ROW_H } from './metrics';

  // the layer headers, one row per grid row and scrolled with it
  let { rows, scrollY }: { rows: LayerRow[]; scrollY: number } = $props();

  const INDENT = 12;
  const COLOR_NAMES = ['Blue', 'Teal', 'Rose', 'Yellow', 'Purple', 'Green', 'Orange', 'Magenta'];

  let list = $state<HTMLDivElement | null>(null);
  let renaming = $state<string | null>(null);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);

  // a row being dragged and where it would land
  let drag = $state<{ id: string; y: number; moved: boolean } | null>(null);
  let drop = $state<{ row: number; where: 'above' | 'below' | 'into' } | null>(null);

  async function startRename(layer: Layer) {
    draft = layer.name;
    renaming = layer.id;
    await tick();
    input?.focus();
    input?.select();
  }

  function finishRename(keep: boolean) {
    const id = renaming;
    renaming = null;
    if (keep && id && draft.trim()) renameLayer(id, draft);
  }

  function icon(layer: Layer): string {
    if (layer.type === 'folder') return 'folder';
    if (layer.type === 'rig') return 'rig';
    return 'layer';
  }

  // the row under the pointer and which part of it: a folder takes a layer in its middle
  function dropAt(clientY: number): { row: number; where: 'above' | 'below' | 'into' } | null {
    if (!list || rows.length === 0) return null;
    const y = clientY - list.getBoundingClientRect().top + scrollY;
    const row = Math.max(0, Math.min(rows.length - 1, Math.floor(y / ROW_H)));
    const part = Math.max(0, Math.min(1, y / ROW_H - row));
    const target = rows[row].layer;
    if (target.type === 'folder') {
      if (part > 0.25 && part < 0.75) return { row, where: 'into' };
      // the bottom edge of an open folder is the top of its content
      if (part >= 0.75 && !$collapsedFolders.has(target.id)) return { row, where: 'into' };
    }
    return { row, where: part < 0.5 ? 'above' : 'below' };
  }

  function onrowdown(e: PointerEvent, layer: Layer) {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest('button, input')) return;
    setActiveLayer(layer.id);
    drag = { id: layer.id, y: e.clientY, moved: false };
  }

  function onpointermove(e: PointerEvent) {
    if (!drag || e.buttons === 0) return;
    if (!drag.moved && Math.abs(e.clientY - drag.y) < 4) return;
    // captured only once it moves, a capture on the press would take the double click from the name
    if (!drag.moved) list?.setPointerCapture(e.pointerId);
    drag.moved = true;
    const at = dropAt(e.clientY);
    drop = at && rows[at.row].layer.id !== drag.id ? at : null;
  }

  function onpointerup(e: PointerEvent) {
    if (list?.hasPointerCapture(e.pointerId)) list.releasePointerCapture(e.pointerId);
    const d = drag;
    const at = drop;
    drag = null;
    drop = null;
    if (d?.moved && at) moveLayerTo(d.id, rows[at.row].layer.id, at.where);
  }

  function oncontextmenu(e: MouseEvent, layer: Layer) {
    e.preventDefault();
    setActiveLayer(layer.id);
    const items: MenuItem[] = [
      { label: 'Rename', action: () => startRename(layer) },
      { label: 'Duplicate layer', action: () => duplicateLayer(layer.id) },
      { label: 'Delete', danger: true, action: () => deleteLayer(layer.id) },
      { label: '', separator: true },
      { label: 'Show all', action: showAllLayers },
      { label: 'Hide others', action: () => hideOtherLayers(layer.id) },
      { label: 'Lock others', action: () => lockOtherLayers(layer.id) },
      { label: '', separator: true },
      {
        label: 'Layer color',
        children: LAYER_COLORS.map((color, i) => ({
          label: COLOR_NAMES[i] ?? color,
          color,
          checked: layer.color === color,
          action: () => setLayerColor(layer.id, color)
        }))
      }
    ];
    contextMenu.set({ x: e.clientX, y: e.clientY, items });
  }

  // the insertion line or the folder outline while a row is dragged
  const marker = $derived.by(() => {
    if (!drop) return null;
    const depth = rows[drop.row].depth;
    const top = drop.row * ROW_H - scrollY;
    if (drop.where === 'into') return { kind: 'into', top, left: 0 };
    return { kind: 'line', top: drop.where === 'above' ? top : top + ROW_H, left: 6 + depth * INDENT };
  });
</script>

<div
  class="list"
  bind:this={list}
  role="tree"
  aria-label="Layers"
  tabindex="-1"
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}>
  <div class="rows" style="transform: translateY({-scrollY}px)">
    {#each rows as row (row.layer.id)}
      {@const layer = row.layer}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="row"
        class:active={$activeLayer === layer.id}
        class:hidden={!layer.visible}
        class:dragging={drag?.moved && drag.id === layer.id}
        role="treeitem"
        aria-selected={$activeLayer === layer.id}
        tabindex="-1"
        style="height: {ROW_H}px"
        onpointerdown={(e) => onrowdown(e, layer)}
        oncontextmenu={(e) => oncontextmenu(e, layer)}>
        <span class="indent" style="width: {row.depth * INDENT}px"></span>
        {#if layer.type === 'folder'}
          <button
            class="arrow"
            title={$collapsedFolders.has(layer.id) ? 'Open folder' : 'Close folder'}
            aria-label={$collapsedFolders.has(layer.id) ? 'Open folder' : 'Close folder'}
            onclick={() => toggleFolder(layer.id)}>
            <Icon name={$collapsedFolders.has(layer.id) ? 'chevron-right' : 'chevron-down'} size={11} />
          </button>
        {/if}
        <button
          class="swatch"
          class:hollow={layer.outline}
          style="--c: {layer.color}"
          title={layer.outline ? 'Show filled' : 'Show as outlines'}
          aria-label={layer.outline ? 'Show filled' : 'Show as outlines'}
          onclick={() => setLayerFlag(layer.id, 'outline', !layer.outline)}></button>
        <span class="kind"><Icon name={icon(layer)} size={12} /></span>
        {#if renaming === layer.id}
          <input
            class="rename"
            bind:this={input}
            bind:value={draft}
            aria-label="Layer name"
            onblur={() => finishRename(true)}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') finishRename(true);
              else if (e.key === 'Escape') finishRename(false);
            }} />
        {:else}
          <span class="name" title="Double click to rename" ondblclick={() => startRename(layer)}>{layer.name}</span>
        {/if}
        <button
          class="toggle"
          class:off={!layer.visible}
          title={layer.visible ? 'Hide layer' : 'Show layer'}
          aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
          onclick={() => setLayerFlag(layer.id, 'visible', !layer.visible)}>
          <Icon name={layer.visible ? 'eye' : 'eye-off'} size={12} />
        </button>
        <button
          class="toggle"
          class:on={layer.locked}
          title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
          onclick={() => setLayerFlag(layer.id, 'locked', !layer.locked)}>
          <Icon name={layer.locked ? 'lock' : 'unlock'} size={12} />
        </button>
      </div>
    {/each}
  </div>
  {#if marker?.kind === 'line'}
    <div class="drop-line" style="top: {marker.top - 1}px; left: {marker.left}px"></div>
  {:else if marker}
    <div class="drop-into" style="top: {marker.top}px; height: {ROW_H}px"></div>
  {/if}
</div>

<style>
  .list {
    position: relative;
    height: 100%;
    overflow: hidden;
    outline: none;
    user-select: none;
  }

  .rows {
    will-change: transform;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px 0 4px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    cursor: default;
    outline: none;
  }

  .row.active {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .row.dragging {
    opacity: 0.5;
  }

  .indent {
    flex-shrink: 0;
  }

  .arrow {
    width: 12px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .arrow:hover {
    color: var(--text-primary);
  }

  /* filled in the layer color, hollow while the layer shows as outlines */
  .swatch {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    border: 1.5px solid var(--c);
    background: var(--c);
  }

  .swatch.hollow {
    background: none;
  }

  .kind {
    display: flex;
    flex-shrink: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row.hidden .name {
    color: var(--text-muted);
  }

  .rename {
    flex: 1;
    min-width: 0;
    height: 18px;
    padding: 0 4px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    outline: none;
  }

  .toggle {
    width: 16px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .toggle:hover {
    color: var(--text-primary);
  }

  .toggle.off {
    opacity: 0.6;
  }

  .toggle.on {
    color: var(--accent);
  }

  .drop-line {
    position: absolute;
    right: 0;
    height: 2px;
    background: var(--accent);
    pointer-events: none;
  }

  .drop-into {
    position: absolute;
    left: 0;
    right: 0;
    border: 1px solid var(--accent);
    background: var(--accent-dim);
    pointer-events: none;
  }
</style>
