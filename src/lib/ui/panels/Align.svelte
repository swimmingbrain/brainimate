<script lang="ts">
  import Panel from '../Panel.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import {
    alignSelection,
    alignToStage,
    distributeSelection,
    type AlignHow,
    type DistributeHow
  } from '$lib/editor/align';
  import { selection } from '$lib/stores/app';

  const ALIGN: { how: AlignHow; icon: string; label: string }[] = [
    { how: 'left', icon: 'align-left', label: 'Align left edges' },
    { how: 'hcenter', icon: 'align-center', label: 'Align horizontal centers' },
    { how: 'right', icon: 'align-right', label: 'Align right edges' },
    { how: 'top', icon: 'align-top', label: 'Align top edges' },
    { how: 'vcenter', icon: 'align-middle', label: 'Align vertical centers' },
    { how: 'bottom', icon: 'align-bottom', label: 'Align bottom edges' }
  ];

  const DISTRIBUTE: { how: DistributeHow; icon: string; label: string }[] = [
    { how: 'hcenters', icon: 'dist-hcenter', label: 'Distribute horizontal centers' },
    { how: 'vcenters', icon: 'dist-vcenter', label: 'Distribute vertical centers' },
    { how: 'hspace', icon: 'dist-hspace', label: 'Same horizontal spacing' },
    { how: 'vspace', icon: 'dist-vspace', label: 'Same vertical spacing' }
  ];

  const count = $derived($selection.size);
</script>

<Panel>
  <h3 class="section">Align</h3>
  <div class="buttons">
    {#each ALIGN as a (a.how)}
      <button
        class="btn"
        title={a.label}
        aria-label={a.label}
        disabled={count === 0}
        onclick={() => alignSelection(a.how)}>
        <Icon name={a.icon} size={15} />
      </button>
    {/each}
  </div>
  <h3 class="section">Distribute</h3>
  <div class="buttons">
    {#each DISTRIBUTE as d (d.how)}
      <button
        class="btn"
        title={d.label}
        aria-label={d.label}
        disabled={count < ($alignToStage ? 2 : 3)}
        onclick={() => distributeSelection(d.how)}>
        <Icon name={d.icon} size={15} />
      </button>
    {/each}
  </div>
  <h3 class="section">Align to</h3>
  <div class="seg" role="radiogroup" aria-label="Align to">
    <button
      class:on={!$alignToStage}
      role="radio"
      aria-checked={!$alignToStage}
      onclick={() => alignToStage.set(false)}>
      Selection
    </button>
    <button class:on={$alignToStage} role="radio" aria-checked={$alignToStage} onclick={() => alignToStage.set(true)}>
      Stage
    </button>
  </div>
  <p class="hint">
    {#if count === 0}
      Select items to line them up.
    {:else if count === 1}
      One item lines up with the stage.
    {:else}
      {count} items selected.
    {/if}
  </p>
</Panel>

<style>
  .section {
    margin: 8px 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .section:first-child {
    margin-top: 2px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px 8px;
  }

  .btn {
    width: 28px;
    height: 26px;
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

  .seg {
    display: flex;
    margin: 2px 8px;
    border: 1px solid var(--border);
  }

  .seg button {
    flex: 1;
    padding: 3px 0;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .seg button + button {
    border-left: 1px solid var(--border);
  }

  .seg button:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .seg button.on {
    color: var(--accent);
    background: var(--accent-dim);
  }

  .hint {
    padding: 6px 8px;
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
