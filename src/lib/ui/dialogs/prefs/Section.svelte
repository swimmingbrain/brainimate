<script lang="ts">
  import type { Snippet } from 'svelte';

  // a titled group of fields in the preferences, the help line sits under its fields
  let { title, help, children }: { title: string; help?: string; children: Snippet } = $props();
</script>

<section class="section">
  <h3 class="title">{title}</h3>
  {@render children()}
  {#if help}
    <p class="help">{help}</p>
  {/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 14px;
  }

  .title {
    margin: 0 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .help {
    padding: 2px 8px 0 124px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  @media (max-width: 560px) {
    .help {
      padding-left: 8px;
    }
  }
</style>
