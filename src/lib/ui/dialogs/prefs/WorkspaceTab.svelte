<script lang="ts">
  import { tick } from 'svelte';
  import Section from './Section.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { preferences, DOCK_TABS, type WorkspacePreset } from '$lib/stores/preferences';
  import {
    PANEL_LABELS,
    allWorkspaces,
    deleteWorkspace,
    isBuiltin,
    renameWorkspace,
    resetWorkspace,
    saveWorkspace,
    setWorkspace,
    togglePanel,
    toggleTimeline
  } from '$lib/stores/workspace';

  let name = $state('');
  let renaming = $state<string | null>(null);
  let draft = $state('');
  let field = $state<HTMLInputElement | null>(null);

  const list = $derived(allWorkspaces($preferences));
  const panels = $derived($preferences.panels);

  // what a workspace shows, in a few words
  function summary(w: WorkspacePreset): string {
    const shown = DOCK_TABS.length - w.hidden.length;
    const parts = [`${shown} ${shown === 1 ? 'panel' : 'panels'}`, w.timeline ? 'timeline' : 'no timeline'];
    parts.push(`tools ${w.toolbarSide}`);
    if (w.rulers) parts.push('rulers');
    if (w.showBones) parts.push('bones');
    return parts.join(', ');
  }

  function save() {
    saveWorkspace(name);
    name = '';
  }

  async function startRename(w: WorkspacePreset) {
    renaming = w.id;
    draft = w.name;
    await tick();
    field?.focus();
    field?.select();
  }

  function finishRename() {
    if (renaming) renameWorkspace(renaming, draft);
    renaming = null;
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') finishRename();
    else if (e.key === 'Escape') {
      e.preventDefault();
      renaming = null;
    }
  }

  function onsavekey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') save();
  }
</script>

<Section
  title="Workspaces"
  help="A workspace sets which panels show, the tab in front of each group, the sizes, the side of the toolbar, the rulers and the bones. The top bar and the window menu switch them.">
  <ul class="list">
    {#each list as w (w.id)}
      <li class="row" class:active={$preferences.workspace === w.id}>
        {#if renaming === w.id}
          <input class="rename" bind:this={field} bind:value={draft} aria-label="Name of the workspace" onblur={finishRename} {onkeydown} />
        {:else}
          <span class="text">
            <span class="name">{w.name}{isBuiltin(w.id) ? '' : ' (yours)'}</span>
            <span class="what">{summary(w)}</span>
          </span>
        {/if}
        <button class="small-btn" onclick={() => setWorkspace(w.id)}>
          {$preferences.workspace === w.id ? 'In use' : 'Apply'}
        </button>
        {#if !isBuiltin(w.id)}
          <button class="icon-btn" title="Rename" aria-label="Rename {w.name}" onclick={() => startRename(w)}>
            <Icon name="pencil" size={12} />
          </button>
          <button class="icon-btn" title="Delete" aria-label="Delete {w.name}" onclick={() => deleteWorkspace(w.id)}>
            <Icon name="trash" size={12} />
          </button>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="save">
    <input bind:value={name} placeholder="Name of the new workspace" aria-label="Name of the new workspace" onkeydown={onsavekey} />
    <button class="small-btn" onclick={save}>Save current as preset</button>
    <button class="small-btn" onclick={resetWorkspace} title="Put the layout of the workspace in use back">Reset layout</button>
  </div>
</Section>

<Section title="Panels" help="The window menu has these too.">
  <div class="panels">
    {#each DOCK_TABS as tab (tab)}
      <label class="check">
        <input type="checkbox" checked={!panels.hidden.includes(tab)} onchange={() => togglePanel(tab)} />
        {PANEL_LABELS[tab]}
      </label>
    {/each}
    <label class="check">
      <input type="checkbox" checked={panels.timeline} onchange={toggleTimeline} />
      Timeline
    </label>
  </div>
</Section>

<style>
  .list {
    list-style: none;
    margin: 0 8px;
    border: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row.active {
    background: var(--accent-dim);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: 12.5px;
    color: var(--text-primary);
  }

  .what {
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .rename,
  .save input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    outline: none;
  }

  .rename,
  .save input:focus {
    border-color: var(--accent);
  }

  .save {
    display: flex;
    gap: 6px;
    padding: 8px 8px 0;
  }

  .small-btn {
    padding: 4px 10px;
    font-size: 11.5px;
    white-space: nowrap;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .small-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .icon-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .icon-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 4px;
    padding: 0 8px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .check input {
    accent-color: var(--accent);
  }
</style>
