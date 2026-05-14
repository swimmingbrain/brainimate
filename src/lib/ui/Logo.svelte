<script lang="ts">
  let { size = 24 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="10" cy="27" r="8" opacity="0.3" />
  <circle cx="28" cy="14" r="11" opacity="0.55" />
  <circle cx="46.5" cy="46.5" r="16" />
</svg>
