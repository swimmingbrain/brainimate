<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import { strokeWidth } from '$lib/stores/app';
</script>

<label class="opt">
  <span>Stroke</span>
  <span class="field">
    <NumberField value={$strokeWidth} min={0} max={500} step={0.5} precision={2} unit=" px" label="Stroke width" onchange={(v) => strokeWidth.set(v)} />
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
