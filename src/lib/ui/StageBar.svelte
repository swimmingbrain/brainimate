<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import Menu from './Menu.svelte';
  import NumberField from './NumberField.svelte';
  import { TOOL_INFO } from '$lib/tools';
  import { getTool } from '$lib/tools/tool';
  import {
    toggleGrid,
    toggleGuides,
    toggleOnion,
    toggleOutline,
    toggleRulers,
    toggleSmartGuides,
    toggleSnapToGrid,
    toggleSnapToGuides,
    toggleSnapping
  } from '$lib/editor/commands';
  import { zoomFit, zoomTo } from '$lib/editor/view';
  import { tip } from '$lib/editor/actions';
  import { commandItem } from '$lib/editor/menus';
  import { activeTool, outlineMode, view, type MenuItem } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';
  import { docVersion, editStack, editor } from '$lib/editor/editor';

  const ZOOMS = [25, 50, 100, 200, 400, 800];

  // read again after renames
  function symbolName(id: string): string {
    void $docVersion;
    return editor.doc.symbols[id]?.name ?? 'Symbol';
  }

  // the active tool's settings, or just its name when it has none
  const Options = $derived(getTool($activeTool)?.options);

  const zoomItems: MenuItem[] = $derived([
    ...ZOOMS.map((z) => ({ label: `${z}%`, action: () => zoomTo(z / 100) })),
    { label: '', separator: true },
    commandItem('view.fit', $preferences.shortcuts)
  ]);

  // view toggles, then the snapping ones, then onion skin and outlines, a gap between the groups
  const keys = $derived($preferences.shortcuts);
  const toggles = $derived([
    [
      { icon: 'grid', label: tip('Grid', 'view.grid', keys), on: $preferences.grid.show, run: toggleGrid },
      { icon: 'rulers', label: tip('Rulers', 'view.rulers', keys), on: $preferences.rulers.show, run: toggleRulers },
      { icon: 'guides', label: tip('Guides', 'view.guides', keys), on: $preferences.guides.show, run: toggleGuides }
    ],
    [
      { icon: 'snap', label: tip('Snapping', 'view.snapping', keys), on: $preferences.snapping.enabled, run: toggleSnapping },
      {
        icon: 'snap-grid',
        label: tip('Snap to grid', 'view.snap-grid', keys),
        on: $preferences.grid.snap,
        run: toggleSnapToGrid
      },
      {
        icon: 'snap-guides',
        label: tip('Snap to guides', 'view.snap-guides', keys),
        on: $preferences.guides.snap,
        run: toggleSnapToGuides
      },
      {
        icon: 'smart',
        label: tip('Smart guides', 'view.smart-guides', keys),
        on: $preferences.snapping.smartGuides,
        run: toggleSmartGuides
      }
    ],
    [
      { icon: 'onion', label: tip('Onion skin', 'view.onion', keys), on: $preferences.timeline.onion, run: toggleOnion },
      { icon: 'outline', label: tip('Outline mode', 'view.outline', keys), on: $outlineMode, run: toggleOutline }
    ]
  ]);
</script>

<div class="stagebar">
  <nav class="crumbs" aria-label="Editing">
    {#if $editStack.length === 0}
      <span class="crumb">
        <Icon name="layer" size={13} />
        Scene 1
      </span>
    {:else}
      <button class="crumb link" title="Back to the scene" onclick={() => editor.exitTo(0)}>
        <Icon name="layer" size={13} />
        Scene 1
      </button>
      {#each $editStack as level, i (i)}
        <Icon name="chevron-right" size={11} />
        {#if i === $editStack.length - 1}
          <span class="crumb current">
            <Icon name="symbol" size={13} />
            {symbolName(level.symbolId)}
          </span>
        {:else}
          <button class="crumb link" title="Back to this symbol" onclick={() => editor.exitTo(i + 1)}>
            <Icon name="symbol" size={13} />
            {symbolName(level.symbolId)}
          </button>
        {/if}
      {/each}
    {/if}
  </nav>

  <div class="options">
    <span class="tool-name">{TOOL_INFO[$activeTool].name}</span>
    {#if Options}
      <span class="opt-sep"></span>
      <Options />
    {/if}
  </div>

  <div class="controls">
    <div class="zoom">
      <NumberField
        value={Math.round($view.zoom * 100)}
        min={2}
        max={6400}
        precision={0}
        unit="%"
        label="Zoom"
        onchange={(v) => zoomTo(v / 100)} />
      <Menu items={zoomItems}>
        {#snippet trigger({ toggle })}
          <button class="icon-btn small" onclick={toggle} title="Zoom presets" aria-label="Zoom presets">
            <Icon name="chevron-down" size={12} />
          </button>
        {/snippet}
      </Menu>
    </div>
    <button class="icon-btn" onclick={zoomFit} title={tip('Fit in window', 'view.fit', keys)} aria-label="Fit in window">
      <Icon name="fit" size={14} />
    </button>
    {#each toggles as group, g (g)}
      <span class="sep"></span>
      {#each group as t (t.icon)}
        <button
          class="icon-btn"
          class:on={t.on}
          class:off={g === 1 && t.icon !== 'snap' && !$preferences.snapping.enabled}
          onclick={t.run}
          title={t.label}
          aria-label={t.label}
          aria-pressed={t.on}>
          <Icon name={t.icon} size={14} />
        </button>
      {/each}
    {/each}
  </div>
</div>

<style>
  .stagebar {
    height: var(--stagebar-h);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px 0 10px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    min-width: 0;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .crumb {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--text-primary);
  }

  .crumb :global(svg) {
    color: var(--text-muted);
  }

  .crumbs > :global(svg) {
    color: var(--text-muted);
  }

  .crumb.link {
    padding: 2px 4px;
    margin: 0 -4px;
    color: var(--text-secondary);
  }

  .crumb.link:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .crumb.current {
    color: var(--accent);
  }

  .crumb.current :global(svg) {
    color: var(--accent);
  }

  /* many tool settings on a narrow window scroll sideways instead of running under the buttons */
  .options {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 10px;
    border-left: 1px solid var(--border);
    height: 26px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .options::-webkit-scrollbar {
    display: none;
  }

  .options > :global(*) {
    flex-shrink: 0;
  }

  .tool-name {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .opt-sep {
    width: 1px;
    height: 14px;
    background: var(--border);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .zoom {
    display: flex;
    align-items: center;
    width: 82px;
    margin-right: 2px;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .icon-btn.small {
    width: 16px;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .icon-btn.on {
    background: var(--accent-dim);
    color: var(--accent);
  }

  /* the snap kinds while snapping as a whole is off */
  .icon-btn.off {
    opacity: 0.45;
  }

  .sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--border);
  }

  @media (max-width: 600px) {
    .options {
      display: none;
    }
  }
</style>
