<script lang="ts">
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import ColorField from '../ColorField.svelte';
  import Slider from '../Slider.svelte';
  import ColorPopover from '../ColorPopover.svelte';
  import type { Doc, Item, Paint, PathItem, Style } from '$lib/core/types';
  import { BLEND_MODES, paintColor, solid } from '$lib/core/style';
  import { around, decompose, invert, multiply, rotate, scale, translate } from '$lib/core/mat';
  import { boxCenter, isEmpty } from '$lib/core/bbox';
  import { docVersion, editor } from '$lib/editor/editor';
  import { selectionFrame, transformSelection } from '$lib/editor/selection';
  import {
    booleanSelection,
    joinSelectedPaths,
    outlineSelectedStrokes,
    reverseSelectedPaths,
    setPaint,
    setSelectedPathsClosed,
    simplifySelectedPaths,
    smoothSelectedPaths
  } from '$lib/editor/commands';
  import Icon from '$lib/icons/Icon.svelte';
  import { frame, selection } from '$lib/stores/app';

  type Target = 'fill' | 'stroke' | 'bg';

  const CAPS = [
    { value: 'butt', label: 'Butt' },
    { value: 'round', label: 'Round' },
    { value: 'square', label: 'Square' }
  ];
  const JOINS = [
    { value: 'miter', label: 'Miter' },
    { value: 'round', label: 'Round' },
    { value: 'bevel', label: 'Bevel' }
  ];
  const BLENDS = BLEND_MODES.map((b) => ({ value: b, label: b[0].toUpperCase() + b.slice(1).replace('-', ' ') }));

  // read again whenever the document, the selection or the frame moves
  const items = $derived.by((): Item[] => {
    void $docVersion;
    void $frame;
    return $selection.size > 0 ? editor.selectedItems(false) : [];
  });
  const paths = $derived(items.filter((it): it is PathItem => it.type === 'path'));
  const style = $derived(paths[0]?.style ?? null);
  const first = $derived(items[0] ?? null);

  const bounds = $derived.by(() => {
    void items;
    return editor.selectionBounds();
  });
  const box = $derived.by(() => {
    void items;
    return selectionFrame();
  });
  const rotation = $derived.by(() => {
    if (items.length !== 1) return multiRotation;
    return (decompose(editor.worldMatrixOf(items[0].id)).rotation * 180) / Math.PI;
  });

  const anchorCount = $derived(paths.reduce((sum, p) => sum + p.path.anchors.length, 0));
  const allClosed = $derived(paths.length > 0 && paths.every((p) => p.path.closed));

  // the path operations, the ones that combine shapes need two paths or more
  const pathOps = [
    { icon: 'join', label: 'Join', run: joinSelectedPaths },
    { icon: 'reverse', label: 'Reverse direction', run: reverseSelectedPaths },
    { icon: 'simplify', label: 'Simplify', run: simplifySelectedPaths },
    { icon: 'smooth', label: 'Smooth', run: smoothSelectedPaths },
    { icon: 'outline-stroke', label: 'Outline stroke', run: outlineSelectedStrokes }
  ];
  const combineOps = [
    { icon: 'unite', label: 'Unite', op: 'unite' },
    { icon: 'subtract', label: 'Subtract', op: 'subtract' },
    { icon: 'intersect', label: 'Intersect', op: 'intersect' },
    { icon: 'exclude', label: 'Exclude', op: 'exclude' },
    { icon: 'divide', label: 'Divide', op: 'divide' }
  ] as const;

  const doc = $derived.by(() => {
    void $docVersion;
    return editor.doc;
  });

  // several items have no rotation of their own, the field counts what was applied since they were picked
  let multiRotation = $state(0);
  let picker = $state<{ target: Target; x: number; y: number } | null>(null);

  $effect(() => {
    void $selection;
    multiRotation = 0;
  });

  function openPicker(target: Target, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = picker?.target === target ? null : { target, x: rect.left - 240, y: rect.top };
  }

  function pickerPaint(target: Target): Paint | null {
    if (target === 'bg') return solid(doc.bg);
    return style ? style[target] : null;
  }

  function onpick(target: Target, paint: Paint | null) {
    if (target === 'bg') {
      const color = paintColor(paint);
      if (color) editor.commit('Background', (d) => setField(d, 'bg', color), 'doc-bg');
      return;
    }
    setPaint(target, paint);
  }

  function setStyle<K extends keyof Style>(key: K, value: Style[K], label: string) {
    editor.updateItems(
      paths.map((p) => p.id),
      (item) => {
        if (item.type === 'path') item.style[key] = value;
      },
      label,
      `style-${key}`
    );
  }

  function setItems(fn: (item: Item) => void, label: string, key: string) {
    editor.updateItems(
      items.map((it) => it.id),
      fn,
      label,
      key
    );
  }

  function setX(v: number) {
    if (!isEmpty(bounds)) transformSelection(translate(v - bounds.minX, 0), 'Move', 'prop-x');
  }

  function setY(v: number) {
    if (!isEmpty(bounds)) transformSelection(translate(0, v - bounds.minY), 'Move', 'prop-y');
  }

  // scales along the box of the selection, its top left corner stays put
  function setSize(w: number, h: number) {
    if (!box || box.w <= 0 || box.h <= 0 || w <= 0 || h <= 0) return;
    const m = multiply(box.m, multiply(scale(w / box.w, h / box.h), invert(box.m)));
    transformSelection(m, 'Scale', 'prop-size');
  }

  function setRotation(v: number) {
    if (isEmpty(bounds)) return;
    const delta = v - rotation;
    if (items.length !== 1) multiRotation = v;
    transformSelection(around(rotate((delta * Math.PI) / 180), boxCenter(bounds)), 'Rotate', 'prop-rotation');
  }

  function setField<K extends 'name' | 'bg' | 'fps'>(d: Doc, key: K, value: Doc[K]) {
    d[key] = value;
  }

  function setDocSize(width: number, height: number) {
    editor.commit(
      'Document size',
      (d) => {
        d.width = Math.round(width);
        d.height = Math.round(height);
      },
      'doc-size'
    );
  }
</script>

<Panel>
  {#if items.length === 0}
    <h3 class="section">Document</h3>
    <Field label="Name">
      <input
        class="text"
        value={doc.name}
        aria-label="Document name"
        onchange={(e) => {
          const name = e.currentTarget.value.trim();
          if (name) editor.commit('Rename document', (d) => setField(d, 'name', name));
        }} />
    </Field>
    <Field label="Width">
      <NumberField
        value={doc.width}
        min={1}
        max={16000}
        precision={0}
        unit=" px"
        label="Width"
        onchange={(v) => setDocSize(v, doc.height)} />
    </Field>
    <Field label="Height">
      <NumberField
        value={doc.height}
        min={1}
        max={16000}
        precision={0}
        unit=" px"
        label="Height"
        onchange={(v) => setDocSize(doc.width, v)} />
    </Field>
    <Field label="Frame rate">
      <NumberField
        value={doc.fps}
        min={1}
        max={120}
        precision={0}
        unit=" fps"
        label="Frame rate"
        onchange={(v) => editor.commit('Frame rate', (d) => setField(d, 'fps', Math.round(v)), 'doc-fps')} />
    </Field>
    <Field label="Background">
      <ColorField value={doc.bg} label="Background color" onclick={(e) => openPicker('bg', e)} />
    </Field>
  {:else}
    <h3 class="section">{items.length === 1 ? first?.name : `${items.length} items`}</h3>
    {#if style}
      <Field label="Fill">
        <ColorField value={paintColor(style.fill)} label="Fill color" onclick={(e) => openPicker('fill', e)} />
      </Field>
      <Field label="Stroke">
        <ColorField value={paintColor(style.stroke)} label="Stroke color" onclick={(e) => openPicker('stroke', e)} />
      </Field>
      <Field label="Stroke width">
        <NumberField
          value={style.width}
          min={0}
          max={500}
          step={0.5}
          unit=" px"
          label="Stroke width"
          onchange={(v) => setStyle('width', v, 'Stroke width')} />
      </Field>
      <Field label="Cap">
        <SelectField
          value={style.cap}
          options={CAPS}
          label="Cap"
          onchange={(v) => setStyle('cap', v as Style['cap'], 'Stroke cap')} />
      </Field>
      <Field label="Join">
        <SelectField
          value={style.join}
          options={JOINS}
          label="Join"
          onchange={(v) => setStyle('join', v as Style['join'], 'Stroke join')} />
      </Field>
      <Field label="Dashed">
        <ToggleField
          value={style.dash.length > 0}
          label="Dashed"
          onchange={(on) => setStyle('dash', on ? [6, 4] : [], 'Dash')} />
      </Field>
      <Field label="Scale strokes">
        <ToggleField
          value={style.scaleStroke}
          label="Scale strokes"
          onchange={(on) => setStyle('scaleStroke', on, 'Scale strokes')} />
      </Field>
    {/if}
    {#if first}
      <Field label="Opacity">
        <Slider
          value={Math.round(first.opacity * 100)}
          min={0}
          max={100}
          precision={0}
          unit="%"
          label="Opacity"
          onchange={(v) => setItems((it) => (it.opacity = v / 100), 'Opacity', 'prop-opacity')} />
      </Field>
      <Field label="Blend">
        <SelectField
          value={first.blend}
          options={BLENDS}
          label="Blend"
          onchange={(v) => setItems((it) => (it.blend = v), 'Blend', 'prop-blend')} />
      </Field>
    {/if}

    {#if paths.length > 0}
      <h3 class="section">Path</h3>
      <Field label="Anchors">
        <span class="value">{anchorCount}{paths.length > 1 ? ` in ${paths.length} paths` : ''}</span>
      </Field>
      <Field label="Closed">
        <ToggleField value={allClosed} label="Closed" onchange={(on) => setSelectedPathsClosed(on)} />
      </Field>
      <div class="ops">
        {#each pathOps as op (op.icon)}
          <button class="op" title={op.label} aria-label={op.label} onclick={() => op.run()}>
            <Icon name={op.icon} size={15} />
          </button>
        {/each}
        <span class="op-sep"></span>
        {#each combineOps as op (op.icon)}
          <button
            class="op"
            title={op.label}
            aria-label={op.label}
            disabled={paths.length < 2}
            onclick={() => booleanSelection(op.op)}>
            <Icon name={op.icon} size={15} />
          </button>
        {/each}
      </div>
    {/if}

    {#if !isEmpty(bounds)}
      <h3 class="section">Transform</h3>
      <Field label="X">
        <NumberField value={bounds.minX} precision={1} unit=" px" label="X" onchange={setX} />
      </Field>
      <Field label="Y">
        <NumberField value={bounds.minY} precision={1} unit=" px" label="Y" onchange={setY} />
      </Field>
      {#if box}
        {@const sx = Math.hypot(box.m[0], box.m[1])}
        {@const sy = Math.hypot(box.m[2], box.m[3])}
        <Field label="W">
          <NumberField
            value={box.w * sx}
            min={0.1}
            precision={1}
            unit=" px"
            label="Width"
            onchange={(v) => setSize(v / sx, box.h)} />
        </Field>
        <Field label="H">
          <NumberField
            value={box.h * sy}
            min={0.1}
            precision={1}
            unit=" px"
            label="Height"
            onchange={(v) => setSize(box.w, v / sy)} />
        </Field>
      {/if}
      <Field label="Rotation">
        <NumberField value={rotation} min={-360} max={360} precision={1} unit="°" label="Rotation" onchange={setRotation} />
      </Field>
    {/if}
  {/if}
</Panel>

{#if picker}
  <ColorPopover
    title={picker.target === 'fill' ? 'Fill' : picker.target === 'stroke' ? 'Stroke' : 'Background'}
    paint={pickerPaint(picker.target)}
    allowNone={picker.target !== 'bg'}
    x={picker.x}
    y={picker.y}
    onchange={(p) => onpick(picker!.target, p)}
    onclose={() => (picker = null)} />
{/if}

<style>
  .section {
    margin: 8px 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section:first-child {
    margin-top: 2px;
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

  .value {
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-primary);
  }

  .ops {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1px;
    padding: 4px 8px;
  }

  .op {
    width: 26px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .op:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .op:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .op-sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--border);
  }
</style>
