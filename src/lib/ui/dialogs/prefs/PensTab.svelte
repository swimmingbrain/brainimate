<script lang="ts">
  import Section from './Section.svelte';
  import PresetList from './PresetList.svelte';
  import Field from '../../Field.svelte';
  import NumberField from '../../NumberField.svelte';
  import Slider from '../../Slider.svelte';
  import ToggleField from '../../ToggleField.svelte';
  import { preferences, setGroup } from '$lib/stores/preferences';

  const d = $derived($preferences.drawing);
  const pen = $derived($preferences.pen);
</script>

<Section
  title="Brush presets"
  help="A click on a name sets the brush to it, the stage bar picks them too. The default is what the brush starts with.">
  <PresetList tool="brush" />
</Section>

<Section title="Pencil presets" help="The width of a pencil preset becomes the stroke width.">
  <PresetList tool="pencil" />
</Section>

<Section title="Brush and eraser">
  <Field label="Pressure" hint="A pen or a finger makes the brush stroke thinner where it presses less">
    <ToggleField
      value={d.brushPressure}
      label="Pressure thins the brush"
      onchange={(v) => setGroup('drawing', { brushPressure: v })} />
  </Field>
  <Field label="Eraser size">
    <NumberField
      value={d.eraserSize}
      min={1}
      max={500}
      precision={0}
      unit=" px"
      label="Eraser size"
      onchange={(v) => setGroup('drawing', { eraserSize: v })} />
  </Field>
</Section>

<Section
  title="Pen tool"
  help="Sizes are screen pixels. The reach is how close the pointer has to come to grab an anchor or a handle.">
  <Field label="Rubber band" hint="A preview of the next segment follows the pointer">
    <ToggleField value={pen.rubberBand} label="Rubber band" onchange={(v) => setGroup('pen', { rubberBand: v })} />
  </Field>
  <Field label="Anchors" hint="The anchors of the path show while drawing">
    <ToggleField
      value={pen.showAnchors}
      label="Show anchors while drawing"
      onchange={(v) => setGroup('pen', { showAnchors: v })} />
  </Field>
  <Field label="Anchor size">
    <Slider
      value={pen.anchorSize}
      min={5}
      max={9}
      precision={0}
      unit=" px"
      label="Anchor size"
      onchange={(v) => setGroup('pen', { anchorSize: v })} />
  </Field>
  <Field label="Handle size">
    <Slider
      value={pen.handleSize}
      min={4}
      max={8}
      precision={0}
      unit=" px"
      label="Handle size"
      onchange={(v) => setGroup('pen', { handleSize: v })} />
  </Field>
  <Field label="Reach">
    <Slider
      value={pen.hitTolerance}
      min={4}
      max={10}
      precision={0}
      unit=" px"
      label="Hit tolerance"
      onchange={(v) => setGroup('pen', { hitTolerance: v })} />
  </Field>
</Section>
