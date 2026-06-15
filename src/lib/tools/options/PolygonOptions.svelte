<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import StrokeOptions from './StrokeOptions.svelte';
  import { preferences, setGroup } from '$lib/stores/preferences';

  const d = $derived($preferences.drawing);
</script>

<StrokeOptions />
<div class="opt">
  <span>{d.polygonStar ? 'Points' : 'Sides'}</span>
  <span class="field">
    <NumberField
      value={d.polygonSides}
      min={3}
      max={12}
      precision={0}
      label="Sides"
      onchange={(v) => setGroup('drawing', { polygonSides: Math.round(v) })} />
  </span>
</div>
<div class="opt">
  <span>Star</span>
  <ToggleField value={d.polygonStar} label="Star" onchange={(on) => setGroup('drawing', { polygonStar: on })} />
</div>
<div class="opt">
  <span>Inner radius</span>
  <span class="field">
    <NumberField
      value={d.polygonInner}
      min={5}
      max={95}
      precision={0}
      unit="%"
      label="Inner radius"
      disabled={!d.polygonStar}
      onchange={(v) => setGroup('drawing', { polygonInner: v })} />
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
    width: 52px;
  }
</style>
