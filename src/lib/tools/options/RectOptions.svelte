<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import StrokeOptions from './StrokeOptions.svelte';
  import { toolOptions } from '$lib/stores/app';
</script>

<StrokeOptions />
<label class="opt">
  <span>Corner radius</span>
  <span class="field">
    <NumberField
      value={$toolOptions.rectRadius}
      min={0}
      max={1000}
      precision={1}
      unit=" px"
      label="Corner radius"
      onchange={(v) => toolOptions.update((o) => ({ ...o, rectRadius: v }))} />
  </span>
</label>

<style>
  .opt {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .field {
    width: 64px;
  }
</style>
