<script lang="ts">
  import Section from './Section.svelte';
  import PrefColor from './PrefColor.svelte';
  import Field from '../../Field.svelte';
  import NumberField from '../../NumberField.svelte';
  import Slider from '../../Slider.svelte';
  import ToggleField from '../../ToggleField.svelte';
  import { LAYER_COLORS } from '$lib/editor/editor';
  import { preferences, setGroup } from '$lib/stores/preferences';

  const t = $derived($preferences.timeline);
  const rig = $derived($preferences.rig);
</script>

<Section title="New documents">
  <Field label="Frame rate">
    <NumberField
      value={t.fps}
      min={1}
      max={120}
      precision={0}
      unit=" fps"
      label="Frame rate of new documents"
      onchange={(v) => setGroup('timeline', { fps: v })} />
  </Field>
</Section>

<Section title="Timeline" help="Auto key adds a keyframe when you change something on a frame that holds.">
  <Field label="Frame width">
    <Slider
      value={t.frameWidth}
      min={4}
      max={24}
      precision={0}
      unit=" px"
      label="Frame width"
      onchange={(v) => setGroup('timeline', { frameWidth: v })} />
  </Field>
  <Field label="Auto key">
    <ToggleField value={t.autoKey} label="Auto key" onchange={(v) => setGroup('timeline', { autoKey: v })} />
  </Field>
  <Field label="Loop playback">
    <ToggleField value={t.loop} label="Loop playback" onchange={(v) => setGroup('timeline', { loop: v })} />
  </Field>
  <Field label="Rig layers tween" hint="A new pose keyframe on a rig layer gets a tween from the one before">
    <ToggleField
      value={rig.tweenPoses}
      label="Rig layers tween by default"
      onchange={(v) => setGroup('rig', { tweenPoses: v })} />
  </Field>
</Section>

<Section title="Onion skin" help="The ghosts next to the playhead start at the first alpha and fade by the step for each frame further away.">
  <Field label="Frames before">
    <NumberField
      value={t.onionBefore}
      min={0}
      max={10}
      precision={0}
      label="Onion skin frames before"
      onchange={(v) => setGroup('timeline', { onionBefore: v })} />
  </Field>
  <Field label="Frames after">
    <NumberField
      value={t.onionAfter}
      min={0}
      max={10}
      precision={0}
      label="Onion skin frames after"
      onchange={(v) => setGroup('timeline', { onionAfter: v })} />
  </Field>
  <Field label="Past color">
    <PrefColor
      value={t.onionBeforeColor}
      label="Onion skin color before"
      onchange={(c) => setGroup('timeline', { onionBeforeColor: c })} />
  </Field>
  <Field label="Future color">
    <PrefColor
      value={t.onionAfterColor}
      label="Onion skin color after"
      onchange={(c) => setGroup('timeline', { onionAfterColor: c })} />
  </Field>
  <Field label="First alpha">
    <Slider
      value={Math.round(t.onionStart * 100)}
      min={5}
      max={100}
      precision={0}
      unit="%"
      label="Alpha of the nearest ghost"
      onchange={(v) => setGroup('timeline', { onionStart: v / 100 })} />
  </Field>
  <Field label="Step">
    <Slider
      value={Math.round(t.onionStep * 100)}
      min={0}
      max={50}
      precision={0}
      unit="%"
      label="Alpha taken off per frame"
      onchange={(v) => setGroup('timeline', { onionStep: v / 100 })} />
  </Field>
  <Field label="Outlines only">
    <ToggleField
      value={t.onionOutline}
      label="Onion skin as outlines"
      onchange={(v) => setGroup('timeline', { onionOutline: v })} />
  </Field>
  <Field label="Keyframes only" hint="Ghost the keyframes around the playhead instead of the frames">
    <ToggleField
      value={t.onionKeyframes}
      label="Onion skin on keyframes only"
      onchange={(v) => setGroup('timeline', { onionKeyframes: v })} />
  </Field>
</Section>

<Section title="Layer colors" help="New layers take these in turn, the right click menu of a layer picks another.">
  <div class="palette">
    {#each LAYER_COLORS as color, i (i)}
      <span class="swatch" style="background: {color}" title={color.toUpperCase()}></span>
    {/each}
  </div>
</Section>

<style>
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 8px 0 124px;
  }

  .swatch {
    width: 22px;
    height: 22px;
    border: 1px solid var(--border);
  }

  @media (max-width: 560px) {
    .palette {
      padding-left: 8px;
    }
  }
</style>
