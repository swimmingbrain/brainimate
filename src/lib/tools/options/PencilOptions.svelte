<script lang="ts">
  import SelectField from '$lib/ui/SelectField.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import { preferences, setGroup, type PencilMode } from '$lib/stores/preferences';
  import { PENCIL_MODES as MODES } from '../presets';

  const d = $derived($preferences.drawing);
</script>

<PresetPicker tool="pencil" />
<label class="opt">
  <span>Width</span>
  <span class="field">
    <NumberField
      value={d.pencilWidth}
      min={0.1}
      max={500}
      step={0.5}
      precision={2}
      unit=" px"
      label="Pencil width"
      onchange={(v) => setGroup('drawing', { pencilWidth: v })} />
  </span>
</label>
<div class="opt">
  <span>Mode</span>
  <span class="select">
    <SelectField
      value={d.pencilMode}
      options={MODES}
      label="Pencil mode"
      onchange={(v) => setGroup('drawing', { pencilMode: v as PencilMode })} />
  </span>
</div>
<div class="opt">
  <span>Smoothing</span>
  <span class="slider">
    <Slider
      value={d.pencilSmoothing}
      min={0}
      max={100}
      precision={0}
      label="Smoothing"
      disabled={d.pencilMode === 'ink'}
      onchange={(v) => setGroup('drawing', { pencilSmoothing: v })} />
  </span>
</div>
<div class="opt">
  <span>Close</span>
  <ToggleField
    value={d.pencilClose}
    label="Close the path when the ends meet"
    onchange={(on) => setGroup('drawing', { pencilClose: on })} />
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

  .select {
    width: 96px;
  }

  .field {
    width: 64px;
  }

  .slider {
    width: 150px;
  }
</style>
