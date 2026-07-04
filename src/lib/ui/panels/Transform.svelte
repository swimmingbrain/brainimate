<script lang="ts">
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import RefPoint from '../RefPoint.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Mat } from '$lib/core/types';
  import { around, rotate, scale, translate } from '$lib/core/mat';
  import { boxHeight, boxWidth, isEmpty } from '$lib/core/bbox';
  import { docVersion, editor } from '$lib/editor/editor';
  import { transformSelection } from '$lib/editor/selection';
  import { frame, selection, transformOrigin } from '$lib/stores/app';

  const DEG = Math.PI / 180;

  const bounds = $derived.by(() => {
    void $docVersion;
    void $selection;
    void $frame;
    return editor.selectionBounds();
  });
  const has = $derived(!isEmpty(bounds));
  const w = $derived(boxWidth(bounds));
  const h = $derived(boxHeight(bounds));
  const ref = $derived($transformOrigin);
  // the reference point on the box around the selection, in world units
  const pivot = $derived({ x: bounds.minX + ref.x * w, y: bounds.minY + ref.y * h });

  // these fields apply an amount, they count what was applied since the selection changed
  let rotation = $state(0);
  let skewX = $state(0);
  let skewY = $state(0);
  let percent = $state(100);
  let keepRatio = $state(false);

  $effect(() => {
    void $selection;
    rotation = 0;
    skewX = 0;
    skewY = 0;
    percent = 100;
  });

  function apply(m: Mat, label: string, key?: string) {
    transformSelection(around(m, pivot), label, key);
  }

  function setX(v: number) {
    transformSelection(translate(v - pivot.x, 0), 'Move', 'tf-x');
  }

  function setY(v: number) {
    transformSelection(translate(0, v - pivot.y), 'Move', 'tf-y');
  }

  function setW(v: number) {
    if (w <= 1e-9 || v <= 0) return;
    const k = v / w;
    apply(scale(k, keepRatio ? k : 1), 'Scale', 'tf-w');
  }

  function setH(v: number) {
    if (h <= 1e-9 || v <= 0) return;
    const k = v / h;
    apply(scale(keepRatio ? k : 1, k), 'Scale', 'tf-h');
  }

  function setRotation(v: number) {
    const d = v - rotation;
    rotation = v;
    apply(rotate(d * DEG), 'Rotate', 'tf-rotate');
  }

  // skews add up in their tangents, so the difference of the tangents is applied
  function setSkewX(v: number) {
    const t = Math.tan(v * DEG) - Math.tan(skewX * DEG);
    skewX = v;
    apply([1, 0, t, 1, 0, 0], 'Skew', 'tf-skew-x');
  }

  function setSkewY(v: number) {
    const t = Math.tan(v * DEG) - Math.tan(skewY * DEG);
    skewY = v;
    apply([1, t, 0, 1, 0, 0], 'Skew', 'tf-skew-y');
  }

  function setPercent(v: number) {
    if (v <= 0 || percent <= 0) return;
    const k = v / percent;
    percent = v;
    apply(scale(k), 'Scale', 'tf-scale');
  }

  function flip(horizontal: boolean) {
    apply(scale(horizontal ? -1 : 1, horizontal ? 1 : -1), horizontal ? 'Flip horizontal' : 'Flip vertical');
  }
</script>

<Panel icon="transform" empty={has ? undefined : 'Select items to move, scale, turn or skew them by numbers.'}>
  {#if has}
    <div class="top">
      <RefPoint value={ref} onchange={(v) => transformOrigin.set(v)} />
      <div class="xy">
        <span class="label">X</span>
        <NumberField value={pivot.x} precision={1} unit=" px" label="X" onchange={setX} />
        <span class="label">W</span>
        <NumberField value={w} min={0.1} precision={1} unit=" px" label="Width" onchange={setW} />
        <span class="label">Y</span>
        <NumberField value={pivot.y} precision={1} unit=" px" label="Y" onchange={setY} />
        <span class="label">H</span>
        <NumberField value={h} min={0.1} precision={1} unit=" px" label="Height" onchange={setH} />
      </div>
    </div>
    <Field label="Keep proportions">
      <button
        class="lock"
        class:on={keepRatio}
        title="Width and height scale together"
        aria-label="Keep proportions"
        aria-pressed={keepRatio}
        onclick={() => (keepRatio = !keepRatio)}>
        <Icon name="bind" size={13} />
      </button>
    </Field>
    <Field label="Rotate">
      <NumberField
        value={rotation}
        min={-360}
        max={360}
        precision={1}
        unit="°"
        label="Rotate"
        onchange={setRotation} />
    </Field>
    <Field label="Skew X">
      <NumberField value={skewX} min={-80} max={80} precision={1} unit="°" label="Skew X" onchange={setSkewX} />
    </Field>
    <Field label="Skew Y">
      <NumberField value={skewY} min={-80} max={80} precision={1} unit="°" label="Skew Y" onchange={setSkewY} />
    </Field>
    <Field label="Scale">
      <NumberField value={percent} min={1} max={10000} precision={0} unit="%" label="Scale" onchange={setPercent} />
    </Field>
    <div class="flips">
      <button class="flip" title="Flip horizontal" aria-label="Flip horizontal" onclick={() => flip(true)}>
        <Icon name="flip-h" size={15} />
        <span>Flip horizontal</span>
      </button>
      <button class="flip" title="Flip vertical" aria-label="Flip vertical" onclick={() => flip(false)}>
        <Icon name="flip-v" size={15} />
        <span>Flip vertical</span>
      </button>
    </div>
  {/if}
</Panel>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px 6px;
  }

  .xy {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    align-items: center;
    gap: 4px 6px;
  }

  .label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .lock {
    width: 24px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .lock:hover {
    color: var(--text-primary);
  }

  .lock.on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  .flips {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
  }

  .flip {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 26px;
    font-size: 11px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .flip:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
</style>
