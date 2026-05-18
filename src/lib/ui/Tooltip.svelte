<script lang="ts">
  import type { Snippet } from 'svelte';

  // the browser's own title is the tooltip, the shortcut goes in brackets after the text
  let { text, shortcut, children }: { text: string; shortcut?: string; children: Snippet } = $props();

  const title = $derived(shortcut ? `${text} (${shortcut})` : text);
</script>

<span class="tooltip" {title}>{@render children()}</span>

<style>
  .tooltip {
    display: inline-flex;
    align-items: center;
  }
</style>
