<script lang="ts">
  let {
    tabs,
    active,
    onchange
  }: {
    tabs: { id: string; label: string }[];
    active: string;
    onchange: (id: string) => void;
  } = $props();

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    onchange(tabs[(i + step + tabs.length) % tabs.length].id);
  }
</script>

<div class="tabs" role="tablist" tabindex="-1" {onkeydown}>
  {#each tabs as tab (tab.id)}
    <button
      class="tab"
      class:active={tab.id === active}
      role="tab"
      aria-selected={tab.id === active}
      tabindex={tab.id === active ? 0 : -1}
      onclick={() => onchange(tab.id)}>
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    outline: none;
  }

  .tab {
    padding: 6px 10px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: var(--text-secondary);
  }

  .tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
  }

  .tab:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
</style>
