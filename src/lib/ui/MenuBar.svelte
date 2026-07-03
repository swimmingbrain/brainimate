<script lang="ts">
  import Menu from './Menu.svelte';
  import { buildMenus } from '$lib/editor/menus';
  import { outlineMode, selection, workspace } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';
  import { historyState } from '$lib/editor/editor';
  import { hasClipboard } from '$lib/editor/clipboard';
  import { alignToStage } from '$lib/editor/align';

  const menus = $derived(
    buildMenus($preferences, $outlineMode, $workspace, {
      history: $historyState,
      hasSelection: $selection.size > 0,
      hasClipboard: $hasClipboard,
      alignToStage: $alignToStage
    })
  );

  let open = $state(-1);
  let at = $state({ x: 0, y: 0 });
  let buttons: HTMLButtonElement[] = $state([]);

  function show(index: number) {
    const rect = buttons[index]?.getBoundingClientRect();
    if (!rect) return;
    at = { x: rect.left, y: rect.bottom };
    open = index;
  }

  // the menu closes itself on a click outside, a click on its own title must not open it again
  function onpointerdown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (open === index) open = -1;
    else show(index);
  }

  // like a desktop menu bar: once one is open, hovering the others opens them
  function onpointerenter(index: number) {
    if (open >= 0 && open !== index) show(index);
  }

  function onkeydown(e: KeyboardEvent) {
    if (open < 0 || e.defaultPrevented) return;
    if (e.key === 'ArrowRight') show((open + 1) % menus.length);
    else if (e.key === 'ArrowLeft') show((open - 1 + menus.length) % menus.length);
  }
</script>

<svelte:window {onkeydown} />

<nav class="menubar" aria-label="Menu">
  {#each menus as menu, i (menu.label)}
    <button
      class="menu-title"
      class:open={open === i}
      bind:this={buttons[i]}
      aria-haspopup="menu"
      aria-expanded={open === i}
      onpointerdown={(e) => onpointerdown(e, i)}
      onpointerenter={() => onpointerenter(i)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          show(i);
        }
      }}>
      {menu.label}
    </button>
  {/each}
</nav>

{#if open >= 0}
  {#key open}
    <Menu items={menus[open].items} {at} onclose={() => (open = -1)} />
  {/key}
{/if}

<style>
  .menubar {
    height: var(--menubar-h);
    display: flex;
    align-items: stretch;
    padding: 0 4px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow-x: auto;
    user-select: none;
  }

  .menubar::-webkit-scrollbar {
    height: 0;
  }

  .menu-title {
    padding: 0 9px;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .menu-title:hover,
  .menu-title.open {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .menu-title:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
</style>
