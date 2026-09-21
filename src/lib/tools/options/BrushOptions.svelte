<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import SelectField from '$lib/ui/SelectField.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { BRUSH_MODES as MODES } from '../presets';

  const d = $derived($preferences.drawing);
</script>

<PresetPicker tool="brush" />
<div class="opt">
  <span>Size</span>
  <span class="field">
    <NumberField
      value={d.brushSize}
      min={1}
      max={500}
      precision={0}
      unit=" px"
      label="Brush size"
      onchange={(v) => setGroup('drawing', { brushSize: v })} />
  </span>
</div>
<div class="opt">
  <span>Pressure</span>
  <ToggleField
    value={d.brushPressure}
    label="Pressure thins the stroke"
    onchange={(on) => setGroup('drawing', { brushPressure: on })} />
</div>
<div class="opt">
  <span>Smoothing</span>
  <span class="slider">
    <Slider
      value={d.brushSmoothing}
      min={0}
      max={100}
      precision={0}
      label="Smoothing"
      onchange={(v) => setGroup('drawing', { brushSmoothing: v })} />
  </span>
</div>
<div class="opt">
  <span>Mode</span>
  <span class="select">
    <SelectField
      value={d.brushMode}
      options={MODES}
      label="Brush mode"
      onchange={(v) => setGroup('drawing', { brushMode: v === 'behind' ? 'behind' : 'normal' })} />
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

  .slider {
    width: 150px;
  }
</style>
