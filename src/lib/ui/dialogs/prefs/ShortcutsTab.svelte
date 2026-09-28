<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { COMMANDS, conflictsWith, keysOf, rebind, takeCombo, type Command } from '$lib/editor/actions';
  import { comboFromEvent, keyLabel } from '$lib/editor/keys';
  import { preferences } from '$lib/stores/preferences';

  const commands = COMMANDS.filter((c) => !c.dev || import.meta.env.DEV);

  let query = $state('');
  // the command waiting for a key, and a combo another command already has
  let recording = $state<string | null>(null);
  let pending = $state<{ id: string; combo: string; others: Command[] } | null>(null);

  const overrides = $derived($preferences.shortcuts);

  function labels(keys: string[]): string {
    return keys.length === 0 ? 'none' : keys.map(keyLabel).join(' or ');
  }

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const text = `${c.label} ${c.group} ${labels(c.keys)} ${labels(keysOf(c.id, overrides))}`.toLowerCase();
      return q.split(/\s+/).every((word) => text.includes(word));
    });
  });

  function setShortcuts(next: Record<string, string>) {
    preferences.update((p) => ({ ...p, shortcuts: next }));
  }

  function stopRecording() {
    recording = null;
    window.removeEventListener('keydown', onrecord, true);
  }

  // the next key press becomes the combo, escape leaves things as they were
  function onrecord(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      stopRecording();
      return;
    }
    const combo = comboFromEvent(e);
    if (!combo) return;
    const id = recording;
    stopRecording();
    const others = conflictsWith(combo, id, overrides);
    if (others.length > 0) pending = { id, combo, others };
    else setShortcuts(rebind(overrides, id, combo));
  }

  async function record(id: string) {
    pending = null;
    if (recording === id) {
      stopRecording();
      return;
    }
    stopRecording();
    recording = id;
    await tick();
    window.addEventListener('keydown', onrecord, true);
  }

  // the combo goes to this command, the others let go of it
  function keep() {
    if (!pending) return;
    setShortcuts(takeCombo(overrides, pending.id, pending.combo));
    pending = null;
  }

  function revert() {
    pending = null;
  }

  function clear(id: string) {
    pending = null;
    setShortcuts(rebind(overrides, id, ''));
  }

  function reset(id: string) {
    pending = null;
    setShortcuts(rebind(overrides, id, null));
  }

  function resetAll() {
    pending = null;
    stopRecording();
    setShortcuts({});
  }

  onDestroy(stopRecording);
</script>

<div class="head">
  <div class="search">
    <Icon name="search" size={13} />
    <input bind:value={query} placeholder="Search commands or keys" spellcheck="false" aria-label="Search the shortcuts" />
  </div>
  <button class="small-btn" onclick={resetAll} disabled={Object.keys(overrides).length === 0}>Reset all keys</button>
</div>
<p class="help">Click a key to record a new one, Escape stops. A key another command has is shown in red until you keep it or go back.</p>

<table class="table">
  <thead>
    <tr>
      <th>Command</th>
      <th class="col-default">Default</th>
      <th class="col-key">Key</th>
      <th class="col-acts"></th>
    </tr>
  </thead>
  <tbody>
    {#each shown as c (c.id)}
      {@const current = keysOf(c.id, overrides)}
      {@const changed = c.id in overrides}
      <tr class:changed>
        <td>
          <span class="name">
            <span class="label">{c.label}</span>
            <span class="group">{c.group}</span>
          </span>
        </td>
        <td class="keys muted" title={labels(c.keys)}>{labels(c.keys)}</td>
        <td class="keys">
          <button
            class="record"
            class:live={recording === c.id}
            class:clash={pending?.id === c.id}
            title="Record a new key"
            onclick={() => record(c.id)}>
            {#if recording === c.id}
              Press a key...
            {:else if pending?.id === c.id}
              {keyLabel(pending.combo)}
            {:else}
              {labels(current)}
            {/if}
          </button>
        </td>
        <td class="acts">
          {#if current.length > 0}
            <button class="icon-btn" title="No key" aria-label="Take the key of {c.label} away" onclick={() => clear(c.id)}>
              <Icon name="none" size={12} />
            </button>
          {/if}
          {#if changed}
            <button class="icon-btn" title="Back to the default" aria-label="Reset {c.label}" onclick={() => reset(c.id)}>
              <Icon name="undo" size={12} />
            </button>
          {/if}
        </td>
      </tr>
      {#if pending?.id === c.id}
        <tr class="conflict">
          <td colspan="4">
            <span class="warn">
              {keyLabel(pending.combo)} is on {pending.others.map((o) => o.label).join(', ')}.
            </span>
            <button class="small-btn danger" onclick={keep}>Keep, take it away from there</button>
            <button class="small-btn" onclick={revert}>Go back</button>
          </td>
        </tr>
      {/if}
    {:else}
      <tr><td class="empty" colspan="4">No command matches</td></tr>
    {/each}
  </tbody>
</table>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 6px;
  }

  .search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    color: var(--text-muted);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .search:focus-within {
    border-color: var(--accent);
  }

  .search input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text-primary);
    background: none;
    border: none;
    outline: none;
  }

  .help {
    padding: 0 8px 8px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  /* fixed columns, a long combo is cut short instead of pushing the table wider */
  .table {
    width: calc(100% - 16px);
    margin: 0 8px;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 11.5px;
  }

  .col-default,
  .col-key {
    width: 26%;
  }

  .col-acts {
    width: 56px;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 3px 6px;
    text-align: left;
    font-weight: 400;
    font-size: 10.5px;
    color: var(--text-muted);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }

  td {
    padding: 2px 6px;
    height: 28px;
    border-bottom: 1px solid var(--border);
  }

  .name {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .label {
    color: var(--text-primary);
  }

  .group {
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .keys {
    font-family: var(--font-editor);
    font-size: 10.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .muted {
    color: var(--text-muted);
  }

  tr.changed .record {
    color: var(--accent);
  }

  .record {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 3px 8px;
    text-align: left;
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .record:hover {
    border-color: var(--text-muted);
  }

  .record.live {
    color: var(--accent);
    border-color: var(--accent);
  }

  .record.clash,
  tr.changed .record.clash {
    color: var(--error);
    border-color: var(--error);
  }

  .acts {
    width: 56px;
    text-align: right;
    white-space: nowrap;
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

  tr.conflict td {
    height: auto;
    padding: 6px;
    background: rgba(224, 108, 117, 0.08);
  }

  .warn {
    margin-right: 8px;
    font-size: 11.5px;
    color: var(--error);
  }

  .small-btn {
    padding: 4px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .small-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .small-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .small-btn.danger {
    color: var(--error);
    border-color: rgba(224, 108, 117, 0.5);
    margin-right: 4px;
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
  }
</style>
