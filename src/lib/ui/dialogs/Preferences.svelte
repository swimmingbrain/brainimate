<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import Dialog from '../Dialog.svelte';
  import GeneralTab from './prefs/GeneralTab.svelte';
  import ToolsTab from './prefs/ToolsTab.svelte';
  import PensTab from './prefs/PensTab.svelte';
  import CanvasTab from './prefs/CanvasTab.svelte';
  import { type PreferencesCategory } from '$lib/stores/app';
  import { defaultPreferences, resetParts, resetPreferences, setGroup } from '$lib/stores/preferences';
  import { setWorkspace } from '$lib/stores/workspace';

  let { category = 'general', onclose }: { category?: PreferencesCategory; onclose: () => void } = $props();

  interface Tab {
    id: PreferencesCategory;
    label: string;
    page: Component;
    reset: () => void;
  }

  // every page of the preferences and what its reset puts back
  const TABS: Tab[] = [
    { id: 'general', label: 'General', page: GeneralTab, reset: () => resetParts(['general']) },
    { id: 'tools', label: 'Tools', page: ToolsTab, reset: () => resetParts(['toolbar']) },
    { id: 'pens', label: 'Pens', page: PensTab, reset: resetPens },
    {
      id: 'canvas',
      label: 'Canvas',
      page: CanvasTab,
      reset: () => resetParts(['grid', 'guides', 'rulers', 'snapping', 'stage'])
    }
  ];

  let tab = $state<PreferencesCategory>(untrack(() => (TABS.some((t) => t.id === category) ? category : 'general')));
  const current = $derived(TABS.find((t) => t.id === tab) ?? TABS[0]);
  let nav = $state<HTMLDivElement | null>(null);

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowDown' ? 1 : -1) + TABS.length) % TABS.length];
    tab = next.id;
    nav?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  // the pen presets and settings, with the brush pressure and the eraser size that sit in the drawing group
  function resetPens() {
    const d = defaultPreferences().drawing;
    resetParts(['pens', 'pen']);
    setGroup('drawing', { brushPressure: d.brushPressure, eraserSize: d.eraserSize });
  }

  function resetAll() {
    resetPreferences();
    setWorkspace('essentials');
  }
</script>

<Dialog title="Preferences" width={760} {onclose}>
  <div class="prefs">
    <div class="nav" role="tablist" aria-orientation="vertical" tabindex="-1" bind:this={nav} {onkeydown}>
      {#each TABS as t (t.id)}
        <button
          class="nav-item"
          class:active={t.id === tab}
          role="tab"
          data-tab={t.id}
          aria-selected={t.id === tab}
          tabindex={t.id === tab ? 0 : -1}
          onclick={() => (tab = t.id)}>
          {t.label}
        </button>
      {/each}
    </div>
    <div class="page" role="tabpanel" aria-label={current.label}>
      {#key current.id}
        <current.page />
      {/key}
    </div>
  </div>
  {#snippet footer()}
    <div class="foot">
      <button class="dialog-btn" onclick={current.reset}>Reset this tab</button>
      <button class="dialog-btn" onclick={resetAll}>Reset all</button>
      <span class="grow"></span>
      <button class="dialog-btn primary" onclick={onclose}>Done</button>
    </div>
  {/snippet}
</Dialog>

<style>
  .prefs {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 16px;
    height: min(520px, calc(100vh - 170px));
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-right: 12px;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }

  .nav-item {
    padding: 6px 10px;
    text-align: left;
    font-size: 12.5px;
    color: var(--text-secondary);
    border-left: 2px solid transparent;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-left-color: var(--accent);
  }

  .page {
    min-width: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  .foot {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .grow {
    flex: 1;
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover {
    background: var(--accent-hover);
  }

  @media (max-width: 640px) {
    .prefs {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .nav {
      flex-direction: row;
      overflow-x: auto;
      padding: 0 0 6px;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }

    .nav-item {
      white-space: nowrap;
      border-left: none;
      border-bottom: 2px solid transparent;
    }

    .nav-item.active {
      border-bottom-color: var(--accent);
    }
  }
</style>
