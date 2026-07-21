<script lang="ts">
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import EaseCurve from '../EaseCurve.svelte';
  import type { Keyframe } from '$lib/core/types';
  import type { FrameRange } from '$lib/anim/timeline';
  import { EASE_PRESETS, cubicEase, easeHandles, easeKind, type Handles } from '$lib/anim/easing';
  import { docVersion, editor } from '$lib/editor/editor';
  import {
    createTween,
    moveSelectedKeyframes,
    rangeKeys,
    removeTween,
    setFramesEase,
    setFramesLabel
  } from '$lib/editor/commands';

  // the tween, ease and label of the keyframes in the picked frames, a change goes to all of them
  let { range }: { range: FrameRange } = $props();

  const EASES = [
    { value: 'linear', label: 'Linear' },
    { value: 'in', label: 'Ease in' },
    { value: 'out', label: 'Ease out' },
    { value: 'inout', label: 'Ease in and out' },
    { value: 'custom', label: 'Custom' }
  ];
  const PRESETS = [{ value: '', label: 'Pick a curve' }, ...EASE_PRESETS.map((p) => ({ value: p.id, label: p.label }))];

  const keys = $derived.by((): Keyframe[] => {
    void $docVersion;
    const layers = editor.currentLayers();
    return rangeKeys(layers, range)
      .map((ref) => layers.find((l) => l.id === ref.layer)?.keyframes.find((k) => k.frame === ref.frame))
      .filter((k): k is Keyframe => !!k);
  });
  const first = $derived(keys[0] ?? null);
  const tweened = $derived(keys.length > 0 && keys.some((k) => k.tween !== null));
  const ease = $derived(keys.find((k) => k.tween)?.tween?.ease ?? 'linear');
  const kind = $derived(easeKind(ease));
  const mixed = $derived(new Set(keys.filter((k) => k.tween).map((k) => k.tween!.ease)).size > 1);

  function pickEase(value: string) {
    // custom starts from the curve the current ease already draws
    setFramesEase(value === 'custom' ? cubicEase(...easeHandles(ease)) : value);
  }

  function dragCurve(h: Handles) {
    setFramesEase(cubicEase(...h), 'ease-curve');
  }

  function pickPreset(id: string) {
    const preset = EASE_PRESETS.find((p) => p.id === id);
    if (preset) setFramesEase(cubicEase(...preset.handles));
  }
</script>

<h3 class="section">{keys.length > 1 ? `${keys.length} keyframes` : 'Frame'}</h3>
{#if first}
  <Field label="Keyframe">
    <NumberField
      value={first.frame + 1}
      min={1}
      max={99999}
      precision={0}
      label="Keyframe position"
      onchange={(v) => moveSelectedKeyframes(v - 1 - first.frame, false)} />
  </Field>
  <Field label="Tween">
    <ToggleField value={tweened} label="Tween" onchange={(on) => (on ? createTween() : removeTween())} />
  </Field>
  {#if tweened}
    <Field label="Ease">
      <SelectField value={mixed ? 'custom' : kind} options={EASES} label="Ease" onchange={pickEase} />
    </Field>
    {#if kind === 'custom'}
      <div class="curve">
        <EaseCurve handles={easeHandles(ease)} oninput={dragCurve} />
      </div>
      <Field label="Preset">
        <SelectField value="" options={PRESETS} label="Ease preset" onchange={pickPreset} />
      </Field>
    {/if}
  {/if}
  <Field label="Label">
    <input
      class="text"
      value={first.label}
      placeholder="None"
      aria-label="Frame label"
      onchange={(e) => setFramesLabel(e.currentTarget.value)} />
  </Field>
{:else}
  <p class="empty">No keyframe in the picked frames</p>
{/if}

<style>
  .section {
    margin: 2px 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .curve {
    padding: 4px 8px;
  }

  .text {
    width: 100%;
    padding: 3px 6px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    outline: none;
  }

  .text:focus {
    border-color: var(--accent);
  }

  .empty {
    margin: 4px 8px;
    font-size: 11.5px;
    color: var(--text-muted);
  }
</style>
