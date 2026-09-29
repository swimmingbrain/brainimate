<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { preferences } from '$lib/stores/preferences';
  import {
    BRUSH_MODES,
    PENCIL_MODES,
    addPresetFromCurrent,
    applyPreset,
    deletePreset,
    matchingPreset,
    renamePreset,
    setDefaultPreset,
    type PenTool
  } from '$lib/tools/presets';

  // the presets of one tool as a table: the default, the values and what can be done with each
  let { tool }: { tool: PenTool } = $props();

  const list = $derived($preferences.pens[tool]);
  const def = $derived(tool === 'brush' ? $preferences.pens.brushDefault : $preferences.pens.pencilDefault);
  const active = $derived(matchingPreset($preferences, tool)?.id ?? null);
  const modes = $derived(tool === 'brush' ? BRUSH_MODES : PENCIL_MODES);

  let renaming = $state<string | null>(null);
  let draft = $state('');
  let field = $state<HTMLInputElement | null>(null);

  function modeLabel(mode: string): string {
    return modes.find((m) => m.value === mode)?.label ?? mode;
  }

  async function startRename(id: string, name: string) {
    renaming = id;
    draft = name;
    await tick();
    field?.focus();
    field?.select();
  }

  function finishRename() {
    if (renaming) renamePreset(tool, renaming, draft);
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

  function add() {
    const id = addPresetFromCurrent(tool);
    const added = $preferences.pens[tool].find((q) => q.id === id);
    if (added) void startRename(id, added.name);
  }
</script>

<table class="table">
  <thead>
    <tr>
      <th class="def" title="The preset the tool starts with">Default</th>
      <th>Name</th>
      <th class="num">{tool === 'brush' ? 'Size' : 'Width'}</th>
      <th class="num">Smoothing</th>
      {#if tool === 'brush'}<th>Pressure</th>{/if}
      <th>Mode</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each list as q (q.id)}
      <tr class:active={q.id === active}>
        <td class="def">
          <input
            type="radio"
            name="default-{tool}"
            checked={q.id === def}
            aria-label="{q.name} is the default"
            onchange={() => setDefaultPreset(tool, q.id)} />
        </td>
        <td class="name">
          {#if renaming === q.id}
            <input
              class="rename"
              bind:this={field}
              bind:value={draft}
              aria-label="Name of the preset"
              onblur={finishRename}
              {onkeydown} />
          {:else}
            <button class="name-btn" title="Use it" onclick={() => applyPreset(tool, q.id)}>{q.name}</button>
          {/if}
        </td>
        <td class="num">{q.size} px</td>
        <td class="num">{q.smoothing}</td>
        {#if tool === 'brush'}<td>{q.pressure ? 'on' : 'off'}</td>{/if}
        <td>{modeLabel(q.mode)}</td>
        <td class="acts">
          <button class="icon-btn" title="Rename" aria-label="Rename {q.name}" onclick={() => startRename(q.id, q.name)}>
            <Icon name="pencil" size={12} />
          </button>
          <button class="icon-btn" title="Delete" aria-label="Delete {q.name}" onclick={() => deletePreset(tool, q.id)}>
            <Icon name="trash" size={12} />
          </button>
        </td>
      </tr>
    {:else}
      <tr><td class="empty" colspan="7">No presets, add one from the settings the {tool} has now.</td></tr>
    {/each}
  </tbody>
</table>
<div class="actions">
  <button class="small-btn" onclick={add}>
    <Icon name="plus" size={12} /> Add from current
  </button>
</div>

<style>
  .table {
    width: calc(100% - 16px);
    margin: 0 8px;
    border-collapse: collapse;
    font-size: 11.5px;
  }

  th {
    padding: 3px 6px;
    text-align: left;
    font-weight: 400;
    font-size: 10.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  td {
    padding: 2px 6px;
    height: 28px;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  tr.active td {
    background: var(--accent-dim);
  }

  .def {
    width: 52px;
    text-align: center;
  }

  .def input {
    accent-color: var(--accent);
  }

  .num {
    font-family: var(--font-editor);
    font-size: 10.5px;
  }

  .name-btn {
    font-size: 12px;
    color: var(--text-primary);
    text-align: left;
  }

  .name-btn:hover {
    color: var(--accent);
  }

  .rename {
    width: 100%;
    padding: 2px 6px;
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    outline: none;
  }

  .acts {
    width: 56px;
    text-align: right;
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

  .empty {
    color: var(--text-muted);
    text-align: center;
  }

  .actions {
    padding: 8px 8px 0;
  }

  .small-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .small-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
