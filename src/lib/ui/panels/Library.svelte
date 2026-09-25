<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import Panel from '../Panel.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Symbol, Vec } from '$lib/core/types';
  import { applyPoint, invert, scaleFactor } from '$lib/core/mat';
  import { isEmpty, translateBox } from '$lib/core/bbox';
  import { useCounts } from '$lib/core/library';
  import { THUMB_H, THUMB_W, symbolBounds, symbolThumb } from '$lib/render/thumbs';
  import { fontVersion } from '$lib/core/fonts';
  import { docVersion, editor } from '$lib/editor/editor';
  import { stagePoint } from '$lib/editor/view';
  import { stageCenter } from '$lib/editor/importer';
  import { clearSnap, snapPoint } from '$lib/editor/snap';
  import {
    deleteSymbol,
    duplicateSymbol,
    editSymbol,
    newSymbol,
    placeInstance,
    renameSymbol
  } from '$lib/editor/symbols';
  import { contextMenu, view, type MenuItem } from '$lib/stores/app';

  let query = $state('');
  let picked = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);
  let list = $state<HTMLDivElement | null>(null);

  // a row being dragged out, and where its ghost follows the pointer
  let drag = $state<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  let ghost = $state<{ x: number; y: number; over: boolean } | null>(null);

  const symbols = $derived.by(() => {
    void $docVersion;
    return Object.values(editor.doc.symbols);
  });
  const counts = $derived.by(() => {
    void $docVersion;
    return useCounts(editor.doc);
  });
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q ? symbols.filter((s) => s.name.toLowerCase().includes(q)) : symbols;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  });
  const current = $derived(picked && symbols.some((s) => s.id === picked) ? picked : null);

  // the cached thumbnail copied onto the row, again whenever the document moves
  function thumb(node: HTMLCanvasElement, args: { symbol: Symbol; version: number }) {
    const draw = (a: { symbol: Symbol; version: number }) => {
      const ctx = node.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, node.width, node.height);
      ctx.drawImage(symbolThumb(a.symbol, editor.doc.assets) as CanvasImageSource, 0, 0);
    };
    draw(args);
    return { update: draw };
  }

  async function startRename(symbol: Symbol) {
    picked = symbol.id;
    draft = symbol.name;
    renaming = symbol.id;
    await tick();
    input?.focus();
    input?.select();
  }

  function finishRename(keep: boolean) {
    const id = renaming;
    renaming = null;
    if (keep && id) renameSymbol(id, draft);
  }

  function duplicatePicked() {
    if (!current) return;
    const id = duplicateSymbol(current);
    if (id) picked = id;
  }

  // the drop point in the space of the timeline being edited, snapped with the symbol's box
  function dropPoint(clientX: number, clientY: number, id: string, show: boolean): Vec | null {
    const at = stagePoint(clientX, clientY);
    if (!at) return null;
    const base = editor.base();
    const p = applyPoint(invert(base), at);
    const symbol = editor.doc.symbols[id];
    const b = symbol ? symbolBounds(symbol) : null;
    const box = b && !isEmpty(b) ? translateBox(b, p.x, p.y) : null;
    const zoom = get(view).zoom * scaleFactor(base);
    return snapPoint(p, { zoom, box, show });
  }

  function onrowdown(e: PointerEvent, symbol: Symbol) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('input')) return;
    picked = symbol.id;
    drag = { id: symbol.id, x: e.clientX, y: e.clientY, moved: false };
  }

  function onpointermove(e: PointerEvent) {
    if (!drag || e.buttons === 0) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    // captured only once it moves, so a double click still reaches the row
    if (!drag.moved) list?.setPointerCapture(e.pointerId);
    drag.moved = true;
    const over = dropPoint(e.clientX, e.clientY, drag.id, true) !== null;
    if (!over) clearSnap();
    ghost = { x: e.clientX, y: e.clientY, over };
  }

  function onpointerup(e: PointerEvent) {
    if (list?.hasPointerCapture(e.pointerId)) list.releasePointerCapture(e.pointerId);
    const d = drag;
    drag = null;
    ghost = null;
    clearSnap();
    if (!d?.moved) return;
    const p = dropPoint(e.clientX, e.clientY, d.id, false);
    if (p) placeInstance(d.id, p);
  }

  function oncontextmenu(e: MouseEvent, symbol: Symbol) {
    e.preventDefault();
    picked = symbol.id;
    const items: MenuItem[] = [
      { label: 'Place on stage', action: () => placeInstance(symbol.id, stageCenter()) },
      { label: 'Edit in place', action: () => editSymbol(symbol.id) },
      { label: 'Rename', action: () => startRename(symbol) },
      { label: 'Duplicate', action: () => duplicateSymbol(symbol.id) },
      { label: '', separator: true },
      { label: 'Delete', danger: true, action: () => deleteSymbol(symbol.id) },
      { label: '', separator: true },
      { label: 'New symbol', action: newSymbol }
    ];
    contextMenu.set({ x: e.clientX, y: e.clientY, items });
  }
</script>

<div class="library">
  <div class="search">
    <Icon name="search" size={12} />
    <input
      class="query"
      type="search"
      placeholder="Search symbols"
      aria-label="Search symbols"
      spellcheck="false"
      bind:value={query}
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') query = '';
      }} />
  </div>
  <Panel
    icon={symbols.length === 0 ? 'symbol' : undefined}
    empty={symbols.length === 0
      ? 'Symbols you make show up here. Select something and press F8.'
      : shown.length === 0
        ? 'No symbol has that name.'
        : undefined}>
    <div
      class="rows"
      bind:this={list}
      role="listbox"
      aria-label="Symbols"
      tabindex="-1"
      {onpointermove}
      {onpointerup}
      onpointercancel={onpointerup}>
      {#each shown as symbol (symbol.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="row"
          class:picked={current === symbol.id}
          class:dragging={drag?.moved && drag.id === symbol.id}
          role="option"
          aria-selected={current === symbol.id}
          tabindex="-1"
          title="Drag onto the stage to place it, double click to edit it"
          onpointerdown={(e) => onrowdown(e, symbol)}
          ondblclick={() => editSymbol(symbol.id)}
          oncontextmenu={(e) => oncontextmenu(e, symbol)}>
          <canvas
            class="thumb"
            width={THUMB_W * 2}
            height={THUMB_H * 2}
            style="width: {THUMB_W}px; height: {THUMB_H}px"
            use:thumb={{ symbol, version: $docVersion + $fontVersion }}></canvas>
          {#if renaming === symbol.id}
            <input
              class="rename"
              bind:this={input}
              bind:value={draft}
              aria-label="Symbol name"
              onblur={() => finishRename(true)}
              onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') finishRename(true);
                else if (e.key === 'Escape') finishRename(false);
              }} />
          {:else}
            <span
              class="name"
              title="Double click to rename"
              ondblclick={(e) => {
                e.stopPropagation();
                startRename(symbol);
              }}>{symbol.name}</span>
          {/if}
          <span class="uses" title="Instances">{counts.get(symbol.id) ?? 0}</span>
        </div>
      {/each}
    </div>
  </Panel>
  <div class="bar">
    <span class="count">{symbols.length === 1 ? '1 symbol' : `${symbols.length} symbols`}</span>
    <button class="btn" title="New symbol" aria-label="New symbol" onclick={newSymbol}>
      <Icon name="plus" size={13} />
    </button>
    <button
      class="btn"
      title="Duplicate symbol"
      aria-label="Duplicate symbol"
      disabled={!current}
      onclick={duplicatePicked}>
      <Icon name="duplicate" size={13} />
    </button>
    <button
      class="btn"
      title="Delete symbol"
      aria-label="Delete symbol"
      disabled={!current}
      onclick={() => current && deleteSymbol(current)}>
      <Icon name="trash" size={13} />
    </button>
  </div>
</div>

{#if ghost && drag}
  {@const symbol = editor.doc.symbols[drag.id]}
  {#if symbol}
    <canvas
      class="ghost"
      class:over={ghost.over}
      width={THUMB_W * 2}
      height={THUMB_H * 2}
      style="left: {ghost.x + 8}px; top: {ghost.y + 8}px; width: {THUMB_W}px; height: {THUMB_H}px"
      use:thumb={{ symbol, version: $docVersion }}></canvas>
  {/if}
{/if}

<style>
  .library {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 8px 2px;
    padding: 0 6px;
    color: var(--text-muted);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
  }

  .search:focus-within {
    border-color: var(--accent);
  }

  .query {
    flex: 1;
    min-width: 0;
    padding: 3px 0;
    font-family: var(--font-ui);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;
  }

  .rows {
    display: flex;
    flex-direction: column;
    outline: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    cursor: grab;
    user-select: none;
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.picked {
    background: var(--accent-dim);
  }

  .row.dragging {
    opacity: 0.5;
  }

  .thumb,
  .ghost {
    flex-shrink: 0;
    background: var(--bg-deep);
    border: 1px solid var(--border);
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

  .rename {
    flex: 1;
    min-width: 0;
    padding: 1px 4px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    outline: none;
  }

  .uses {
    min-width: 18px;
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
    text-align: right;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    padding: 0 6px 0 10px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .count {
    flex: 1;
    font-size: 11px;
    color: var(--text-muted);
  }

  .btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .ghost {
    position: fixed;
    z-index: 900;
    pointer-events: none;
    opacity: 0.6;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .ghost.over {
    opacity: 0.9;
    border-color: var(--accent);
  }
</style>
