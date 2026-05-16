<script lang="ts">
  import { ICONS } from './icons';

  let { name, size = 16 }: { name: string; size?: number } = $props();

  const markup = $derived(ICONS[name] ?? '');
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false">{@html markup}</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }
</style>
