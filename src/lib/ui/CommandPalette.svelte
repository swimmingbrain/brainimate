<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { COMMANDS, keysOf, type Command } from '$lib/editor/actions';
  import { keyLabel } from '$lib/editor/keys';
  import { fuzzyFilter } from '$lib/editor/fuzzy';
  import { preferences, rememberCommand } from '$lib/stores/preferences';

  let { onclose }: { onclose: () => void } = $props();

  let query = $state('');
  let picked = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let results = $state<HTMLDivElement | null>(null);

  // the dev build also lists the commands that only help to measure
  const available = COMMANDS.filter((c) => !c.dev || import.meta.env.DEV);

  // the commands run last come first, then the rest in menu order
  const ordered = $derived.by(() => {
    const recent = $preferences.recentCommands
      .map((id) => available.find((c) => c.id === id))
      .filter((c): c is Command => !!c);
    return [...recent, ...available.filter((c) => !recent.includes(c))];
  });

  const shown = $derived(fuzzyFilter(ordered, query, (c) => `${c.label} ${c.group}`));
  const recentIds = $derived(new Set($preferences.recentCommands));

  $effect(() => {
    void query;
    picked = 0;
  });

  function keyOf(c: Command): string {
    const key = keysOf(c.id, $preferences.shortcuts)[0];
    return key ? keyLabel(key) : '';
  }

  // the palette goes first, the command may open a dialog of its own
  function run(c: Command) {
    onclose();
    rememberCommand(c.id);
    c.run();
  }

  async function move(step: number) {
    if (shown.length === 0) return;
    picked = (picked + step + shown.length) % shown.length;
    await tick();
    results?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  // the input and the backdrop share this handler, the key must reach the app only once
  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      void move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      void move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = shown[picked];
      if (c) run(c);
    }
  }

  onMount(() => {
    input?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose} {onkeydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="search">
      <Icon name="search" size={14} />
      <input
        bind:this={input}
        bind:value={query}
        class="input"
        placeholder="Type a command..."
        spellcheck="false"
        autocomplete="off"
        aria-label="Command"
        aria-controls="palette-results"
        aria-activedescendant={shown[picked] ? `cmd-${shown[picked].id}` : undefined}
        {onkeydown} />
    </div>
    <div class="results" id="palette-results" role="listbox" aria-label="Commands" bind:this={results}>
      {#if shown.length === 0}
        <p class="empty">No command matches</p>
      {:else}
        {#each shown as c, i (c.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="row"
            class:selected={i === picked}
            id="cmd-{c.id}"
            role="option"
            tabindex="-1"
            aria-selected={i === picked}
            onclick={() => run(c)}
            onpointermove={() => (picked = i)}>
            <span class="label">{c.label}</span>
            {#if !query && recentIds.has(c.id)}
              <span class="tag">recent</span>
            {/if}
            <span class="group">{c.group}</span>
            {#if keyOf(c)}
              <span class="keys">
                {#each keyOf(c).split(/\+(?=.)/) as key, k (k)}
                  <kbd>{key}</kbd>
                {/each}
              </span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 15vh 16px 16px;
    background: rgba(0, 0, 0, 0.5);
  }

  .palette {
    width: 520px;
    max-width: 100%;
    max-height: 420px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: fade-in 100ms ease;
    outline: none;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-primary);
    background: none;
    border: none;
    outline: none;
  }

  .input::placeholder {
    color: var(--text-muted);
  }

  .results {
    overflow-y: auto;
    padding: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .row.selected {
    background: var(--bg-hover);
  }

  .label {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag {
    font-family: var(--font-editor);
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .group {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .keys {
    display: flex;
    gap: 2px;
  }

  .empty {
    padding: 14px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
