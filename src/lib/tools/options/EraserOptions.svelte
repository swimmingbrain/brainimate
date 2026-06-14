<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import SelectField from '$lib/ui/SelectField.svelte';
  import { preferences, setGroup, type EraserMode } from '$lib/stores/preferences';

  const MODES = [
    { value: 'normal', label: 'Normal' },
    { value: 'fills', label: 'Fills only' },
    { value: 'strokes', label: 'Strokes only' }
  ];

  const d = $derived($preferences.drawing);
</script>

<div class="opt">
  <span>Size</span>
  <span class="field">
    <NumberField
      value={d.eraserSize}
      min={1}
      max={500}
      precision={0}
      unit=" px"
      label="Eraser size"
      onchange={(v) => setGroup('drawing', { eraserSize: v })} />
  </span>
</div>
<div class="opt">
  <span>Mode</span>
  <span class="select">
    <SelectField
      value={d.eraserMode}
      options={MODES}
      label="Eraser mode"
      onchange={(v) => setGroup('drawing', { eraserMode: v as EraserMode })} />
  </span>
</div>

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
    width: 56px;
  }

  .select {
    width: 104px;
  }
</style>
