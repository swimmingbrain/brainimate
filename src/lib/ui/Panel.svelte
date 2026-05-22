<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';

  // the scrolling body of a dock panel, with a quiet line when there is nothing to show
  let { icon, empty, children }: { icon?: string; empty?: string; children?: Snippet } = $props();
</script>

<div class="panel">
  {#if children}
    {@render children()}
  {/if}
  {#if empty}
    <div class="empty">
      {#if icon}<Icon name={icon} size={18} />{/if}
      <p>{empty}</p>
    </div>
  {/if}
</div>

<style>
  .panel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 0;
    background: var(--bg-surface);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty p {
    font-size: 11.5px;
    line-height: 1.5;
    max-width: 220px;
  }
</style>
