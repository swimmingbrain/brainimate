<script lang="ts">
  import Section from './Section.svelte';
  import PrefColor from './PrefColor.svelte';
  import Field from '../../Field.svelte';
  import NumberField from '../../NumberField.svelte';
  import SelectField from '../../SelectField.svelte';
  import Slider from '../../Slider.svelte';
  import ToggleField from '../../ToggleField.svelte';
  import { preferences, setGroup, type PasteboardShade } from '$lib/stores/preferences';

  const SHADES = [
    { value: 'deep', label: 'Dark' },
    { value: 'surface', label: 'Medium' },
    { value: 'elevated', label: 'Light' }
  ];
  const ZOOMS = [
    { value: 'fit', label: 'Fit in window' },
    { value: 'actual', label: '100%' }
  ];
  const WHEELS = [
    { value: 'scroll', label: 'Scrolls, Ctrl zooms' },
    { value: 'zoom', label: 'Zooms, Ctrl scrolls' }
  ];

  const p = $derived($preferences);
</script>

<Section title="Grid">
  <Field label="Show grid">
    <ToggleField value={p.grid.show} label="Show grid" onchange={(v) => setGroup('grid', { show: v })} />
  </Field>
  <Field label="Size">
    <NumberField
      value={p.grid.size}
      min={2}
      max={500}
      precision={0}
      unit=" px"
      label="Grid size"
      onchange={(v) => setGroup('grid', { size: v })} />
  </Field>
  <Field label="Subdivisions" hint="Fainter lines inside each cell">
    <NumberField
      value={p.grid.subdivisions}
      min={1}
      max={10}
      precision={0}
      label="Grid subdivisions"
      onchange={(v) => setGroup('grid', { subdivisions: v })} />
  </Field>
  <Field label="Color">
    <PrefColor value={p.grid.color} label="Grid color" onchange={(c) => setGroup('grid', { color: c })} />
  </Field>
  <Field label="Opacity">
    <Slider
      value={p.grid.opacity}
      min={5}
      max={100}
      precision={0}
      unit="%"
      label="Grid opacity"
      onchange={(v) => setGroup('grid', { opacity: v })} />
  </Field>
  <Field label="Snap to grid">
    <ToggleField value={p.grid.snap} label="Snap to grid" onchange={(v) => setGroup('grid', { snap: v })} />
  </Field>
</Section>

<Section title="Guides">
  <Field label="Show guides">
    <ToggleField value={p.guides.show} label="Show guides" onchange={(v) => setGroup('guides', { show: v })} />
  </Field>
  <Field label="Guide color">
    <PrefColor value={p.guides.color} label="Guide color" onchange={(c) => setGroup('guides', { color: c })} />
  </Field>
  <Field label="Lock guides">
    <ToggleField value={p.guides.lock} label="Lock guides" onchange={(v) => setGroup('guides', { lock: v })} />
  </Field>
  <Field label="Snap to guides">
    <ToggleField value={p.guides.snap} label="Snap to guides" onchange={(v) => setGroup('guides', { snap: v })} />
  </Field>
  <Field label="Smart guides">
    <ToggleField
      value={p.snapping.smartGuides}
      label="Smart guides"
      onchange={(v) => setGroup('snapping', { smartGuides: v })} />
  </Field>
  <Field label="Smart guide color">
    <PrefColor
      value={p.snapping.smartColor}
      label="Smart guide color"
      onchange={(c) => setGroup('snapping', { smartColor: c })} />
  </Field>
  <Field label="Snap to points">
    <ToggleField value={p.snapping.points} label="Snap to points" onchange={(v) => setGroup('snapping', { points: v })} />
  </Field>
  <Field label="Snap to objects">
    <ToggleField
      value={p.snapping.objects}
      label="Snap to objects"
      onchange={(v) => setGroup('snapping', { objects: v })} />
  </Field>
  <Field label="Snap to pixels">
    <ToggleField value={p.snapping.pixels} label="Snap to pixels" onchange={(v) => setGroup('snapping', { pixels: v })} />
  </Field>
</Section>

<Section title="Stage">
  <Field label="Pasteboard" hint="Show what lies outside the stage">
    <ToggleField value={p.stage.pasteboard} label="Pasteboard" onchange={(v) => setGroup('stage', { pasteboard: v })} />
  </Field>
  <Field label="Pasteboard color">
    <SelectField
      value={p.stage.shade}
      options={SHADES}
      label="Pasteboard color"
      onchange={(v) => setGroup('stage', { shade: v as PasteboardShade })} />
  </Field>
  <Field label="Stage shadow">
    <ToggleField value={p.stage.shadow} label="Stage shadow" onchange={(v) => setGroup('stage', { shadow: v })} />
  </Field>
  <Field label="Rulers">
    <ToggleField value={p.rulers.show} label="Rulers" onchange={(v) => setGroup('rulers', { show: v })} />
  </Field>
</Section>

<Section
  title="Navigation"
  help="Tablet mode gives every pointer the bigger reach a pen or a finger gets, for anchors, handles and strokes.">
  <Field label="Zoom on open">
    <SelectField
      value={p.stage.zoomOnOpen}
      options={ZOOMS}
      label="Zoom a document opens at"
      onchange={(v) => setGroup('stage', { zoomOnOpen: v === 'actual' ? 'actual' : 'fit' })} />
  </Field>
  <Field label="Mouse wheel">
    <SelectField
      value={p.stage.wheel}
      options={WHEELS}
      label="What the mouse wheel does"
      onchange={(v) => setGroup('stage', { wheel: v === 'zoom' ? 'zoom' : 'scroll' })} />
  </Field>
  <Field label="Tablet mode">
    <ToggleField value={p.stage.tablet} label="Tablet mode" onchange={(v) => setGroup('stage', { tablet: v })} />
  </Field>
</Section>
