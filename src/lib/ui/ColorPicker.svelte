<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import NumberField from './NumberField.svelte';
  import SelectField from './SelectField.svelte';
  import type { Paint } from '$lib/core/types';
  import { hexToHsv, hexToRgb, hsvToHex, parseHex, rgbToHex, rgbToHsv, type Hsv } from '$lib/core/color';
  import {
    addStop,
    convertPaint,
    cssPaint,
    gradientAngle,
    isGradient,
    reverseGradient,
    type PaintType
  } from '$lib/core/gradient';
  import { activeStop } from '$lib/stores/app';
  import { preferences, rememberColor } from '$lib/stores/preferences';

  // hsv square, hue and alpha bars, the numbers, and the stops when the paint is a gradient
  let {
    paint,
    onchange,
    onangle,
    allowNone = true,
    allowGradient = true
  }: {
    paint: Paint | null;
    onchange: (paint: Paint | null) => void;
    // given when the gradients of a selection can be turned
    onangle?: (angle: number) => void;
    allowNone?: boolean;
    allowGradient?: boolean;
  } = $props();

  const TYPES = [
    { value: 'solid', label: 'Solid' },
    { value: 'linear', label: 'Linear gradient' },
    { value: 'radial', label: 'Radial gradient' }
  ];
  const CHECKER = 'repeating-conic-gradient(#9a9aa2 0 25%, #d4d4d8 0 50%) 0 0 / 8px 8px';
  // a stop dragged this far off the bar goes away on release
  const LEAVE = 28;
  const RGB = ['r', 'g', 'b'] as const;

  type EyeDropperResult = { sRGBHex: string };
  type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };
  const dropper = typeof window !== 'undefined' ? (window as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined;

  let square = $state<HTMLCanvasElement | null>(null);
  let squareWidth = $state(0);
  let bar = $state<HTMLDivElement | null>(null);
  let h = $state(0);
  let s = $state(0);
  let v = $state(0);
  let a = $state(1);
  let leaving = $state(-1);
  // the color last sent or read, an outside change looks different and resets the square
  let shown = '';

  const gradient = $derived(isGradient(paint) ? paint : null);
  const stopIndex = $derived(gradient ? Math.max(0, Math.min($activeStop, gradient.stops.length - 1)) : 0);
  const target = $derived.by(() => {
    if (!paint) return null;
    if (paint.type === 'solid') return { color: paint.color, alpha: paint.alpha };
    const stop = paint.stops[stopIndex];
    return stop ? { color: stop.color, alpha: stop.alpha } : null;
  });
  const hex = $derived(hsvToHex({ h, s, v }));
  const rgb = $derived(hexToRgb(hex));
  const hueColor = $derived(hsvToHex({ h, s: 1, v: 1 }));
  const ramp = $derived(gradient ? `${cssPaint(convertPaint(gradient, 'linear'))}, ${CHECKER}` : '');
  const recent = $derived($preferences.recentColors);

  $effect(() => {
    const t = target;
    if (!t) return;
    const key = `${t.color}/${t.alpha}`;
    if (key === shown) return;
    shown = key;
    readHsv(hexToHsv(t.color));
    a = t.alpha;
  });

  // gray has no hue and black no saturation, the old ones stay so the square does not jump
  function readHsv(next: Hsv) {
    if (next.s > 0 && next.v > 0) h = next.h;
    if (next.v > 0) s = next.s;
    v = next.v;
  }

  $effect(() => {
    const c = square;
    const w = squareWidth;
    const color = hueColor;
    if (!c || w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    const white = ctx.createLinearGradient(0, 0, c.width, 0);
    white.addColorStop(0, '#ffffff');
    white.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, c.width, c.height);
    const black = ctx.createLinearGradient(0, 0, 0, c.height);
    black.addColorStop(0, 'rgba(0, 0, 0, 0)');
    black.addColorStop(1, '#000000');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, c.width, c.height);
  });

  function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  function emit(color: string, alpha: number) {
    shown = `${color}/${alpha}`;
    if (!paint || paint.type === 'solid') {
      onchange({ type: 'solid', color, alpha });
      return;
    }
    const stops = paint.stops.map((st, i) => (i === stopIndex ? { ...st, color, alpha } : { ...st }));
    onchange({ ...paint, stops });
  }

  function setHsv(nh: number, ns: number, nv: number) {
    h = nh;
    s = clamp(ns, 0, 1);
    v = clamp(nv, 0, 1);
    emit(hsvToHex({ h, s, v }), a);
  }

  function setAlpha(na: number) {
    a = Math.round(clamp(na, 0, 1) * 100) / 100;
    emit(hex, a);
  }

  function setHex(color: string, remember = false) {
    readHsv(hexToHsv(color));
    emit(color, a);
    if (remember) rememberColor(color);
  }

  function setRgb(part: 'r' | 'g' | 'b', value: number, remember = false) {
    const next = { ...rgb, [part]: value };
    readHsv(rgbToHsv(next));
    const color = rgbToHex(next);
    emit(color, a);
    if (remember) rememberColor(color);
  }

  // follows the pointer on a bar or the square, x and y from 0 to 1, the color is remembered at the end
  function track(e: PointerEvent, apply: (x: number, y: number) => void) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      apply(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
    };
    const up = (ev: PointerEvent) => {
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', at);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      rememberColor(hex);
    };
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    at(e);
  }

  function setType(type: string) {
    activeStop.set(0);
    onchange(convertPaint(paint, type as PaintType));
  }

  async function pickFromScreen() {
    if (!dropper) return;
    try {
      const result = await new dropper().open();
      const color = parseHex(result.sRGBHex);
      if (color) setHex(color, true);
    } catch {
      // closed with escape
    }
  }

  function moveStop(i: number, t: number) {
    if (!gradient) return;
    onchange({ ...gradient, stops: gradient.stops.map((st, k) => (k === i ? { ...st, t } : { ...st })) });
  }

  function removeStop(i: number) {
    if (!gradient || gradient.stops.length <= 2) return;
    activeStop.set(Math.max(0, i - 1));
    onchange({ ...gradient, stops: gradient.stops.filter((_, k) => k !== i) });
  }

  // a press on the ramp adds a stop there with the color the gradient already has
  function onbardown(e: PointerEvent) {
    if (!gradient || !bar || e.button !== 0) return;
    const r = bar.getBoundingClientRect();
    const { paint: next, index } = addStop(gradient, clamp((e.clientX - r.left) / r.width, 0, 1));
    activeStop.set(index);
    onchange(next);
  }

  function onstopdown(e: PointerEvent, i: number) {
    if (!bar || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    activeStop.set(i);
    const el = bar;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const off = Math.abs(ev.clientY - (r.top + r.height / 2)) > LEAVE;
      leaving = off && (gradient?.stops.length ?? 0) > 2 ? i : -1;
      if (!off) moveStop(i, clamp((ev.clientX - r.left) / r.width, 0, 1));
    };
    const up = (ev: PointerEvent) => {
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (leaving === i) removeStop(i);
      leaving = -1;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
</script>

<div class="picker">
  <div class="row">
    {#if allowGradient}
      <span class="type">
        <SelectField value={paint?.type ?? 'solid'} options={TYPES} label="Paint type" onchange={setType} />
      </span>
    {:else}
      <span class="grow"></span>
    {/if}
    {#if dropper}
      <button class="icon-btn" title="Pick from the screen" aria-label="Pick from the screen" onclick={pickFromScreen}>
        <Icon name="eyedropper" size={14} />
      </button>
    {/if}
    {#if allowNone}
      <button
        class="icon-btn"
        class:on={paint === null}
        title="None"
        aria-label="No color"
        onclick={() => onchange(null)}>
        <Icon name="none" size={14} />
      </button>
    {/if}
  </div>

  {#if gradient}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stops" bind:this={bar} onpointerdown={onbardown} title="Click to add a stop, drag one off to remove it">
      <div class="ramp" style="background: {ramp}"></div>
      {#each gradient.stops as stop, i (i)}
        <span
          class="stop"
          class:active={i === stopIndex}
          class:leaving={i === leaving}
          style="left: {stop.t * 100}%; --c: {stop.color}"
          onpointerdown={(e) => onstopdown(e, i)}></span>
      {/each}
    </div>
    <div class="row">
      <span class="label">Location</span>
      <span class="num">
        <NumberField
          value={(gradient.stops[stopIndex]?.t ?? 0) * 100}
          min={0}
          max={100}
          precision={0}
          unit="%"
          label="Stop location"
          onchange={(t) => moveStop(stopIndex, t / 100)} />
      </span>
      {#if gradient.type === 'linear' && onangle}
        <span class="label">Angle</span>
        <span class="num">
          <NumberField
            value={gradientAngle(gradient)}
            min={-180}
            max={180}
            precision={0}
            unit="°"
            label="Gradient angle"
            onchange={(deg) => onangle?.(deg)} />
        </span>
      {/if}
      <span class="grow"></span>
      <button
        class="icon-btn"
        title="Reverse the gradient"
        aria-label="Reverse"
        onclick={() => gradient && onchange(reverseGradient(gradient))}>
        <Icon name="reverse" size={14} />
      </button>
    </div>
  {/if}

  <div class="square" bind:clientWidth={squareWidth}>
    <canvas bind:this={square} onpointerdown={(e) => track(e, (x, y) => setHsv(h, x, 1 - y))}></canvas>
    <span class="square-mark" style="left: {s * 100}%; top: {(1 - v) * 100}%"></span>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="bar hue" onpointerdown={(e) => track(e, (x) => setHsv(x * 360, s, v))}>
    <span class="bar-mark" style="left: {(h / 360) * 100}%"></span>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bar alpha"
    style="background: linear-gradient(90deg, transparent, {hex}), {CHECKER}"
    onpointerdown={(e) => track(e, (x) => setAlpha(x))}>
    <span class="bar-mark" style="left: {a * 100}%"></span>
  </div>

  <div class="row">
    <span class="preview" style="background: {CHECKER}">
      <span class="preview-alpha" style="opacity: {a}; background: {hex}"></span>
    </span>
    <span class="hash">#</span>
    <input
      class="hex"
      value={hex.slice(1).toUpperCase()}
      maxlength="7"
      spellcheck="false"
      aria-label="Hex color"
      onkeydown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        e.stopPropagation();
      }}
      onchange={(e) => {
        const color = parseHex(e.currentTarget.value);
        if (color) setHex(color, true);
        else e.currentTarget.value = hex.slice(1).toUpperCase();
      }} />
    <span class="label">A</span>
    <span class="num">
      <NumberField
        value={Math.round(a * 100)}
        min={0}
        max={100}
        precision={0}
        unit="%"
        label="Alpha"
        oninput={(n) => setAlpha(n / 100)}
        onchange={(n) => setAlpha(n / 100)} />
    </span>
  </div>

  <div class="grid">
    {#each RGB as part (part)}
      <span class="label">{part.toUpperCase()}</span>
      <NumberField
        value={rgb[part]}
        min={0}
        max={255}
        precision={0}
        label={part.toUpperCase()}
        oninput={(n) => setRgb(part, n)}
        onchange={(n) => setRgb(part, n, true)} />
    {/each}
    <span class="label">H</span>
    <NumberField
      value={h}
      min={0}
      max={360}
      precision={0}
      unit="°"
      label="Hue"
      oninput={(n) => setHsv(n, s, v)}
      onchange={(n) => {
        setHsv(n, s, v);
        rememberColor(hex);
      }} />
    <span class="label">S</span>
    <NumberField
      value={s * 100}
      min={0}
      max={100}
      precision={0}
      unit="%"
      label="Saturation"
      oninput={(n) => setHsv(h, n / 100, v)}
      onchange={(n) => {
        setHsv(h, n / 100, v);
        rememberColor(hex);
      }} />
    <span class="label">B</span>
    <NumberField
      value={v * 100}
      min={0}
      max={100}
      precision={0}
      unit="%"
      label="Brightness"
      oninput={(n) => setHsv(h, s, n / 100)}
      onchange={(n) => {
        setHsv(h, s, n / 100);
        rememberColor(hex);
      }} />
  </div>

  {#if recent.length > 0}
    <div class="recent" aria-label="Recent colors">
      {#each recent as color (color)}
        <button
          class="chip"
          style="background: {color}"
          title={color.toUpperCase()}
          aria-label={color}
          onclick={() => setHex(color, true)}></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 4px 8px 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
  }

  .type {
    flex: 1;
    min-width: 0;
  }

  .grow {
    flex: 1;
  }

  .label {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .num {
    width: 54px;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .icon-btn.on {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .square {
    position: relative;
    height: 132px;
    border: 1px solid var(--border);
    touch-action: none;
  }

  .square canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }

  .square-mark {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border: 1.5px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  .bar {
    position: relative;
    height: 12px;
    border: 1px solid var(--border);
    cursor: ew-resize;
    touch-action: none;
  }

  .hue {
    background: linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00);
  }

  .bar-mark {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 4px;
    margin-left: -2px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  .stops {
    position: relative;
    height: 26px;
    margin: 0 5px;
    cursor: copy;
    touch-action: none;
  }

  .ramp {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 14px;
    border: 1px solid var(--border);
  }

  .stop {
    position: absolute;
    top: 13px;
    width: 10px;
    height: 12px;
    margin-left: -5px;
    background: var(--c);
    border: 1px solid var(--text-muted);
    cursor: ew-resize;
  }

  .stop::before {
    content: '';
    position: absolute;
    left: 2px;
    top: -4px;
    width: 4px;
    height: 4px;
    background: var(--text-muted);
    transform: rotate(45deg);
  }

  .stop.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .stop.active::before {
    background: var(--accent);
  }

  .stop.leaving {
    opacity: 0.3;
  }

  .preview {
    position: relative;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border: 1px solid var(--border);
  }

  .preview-alpha {
    position: absolute;
    inset: 0;
  }

  .hash {
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .hex {
    width: 0;
    flex: 1;
    min-width: 56px;
    padding: 3px 6px;
    font-family: var(--font-editor);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    outline: none;
    text-transform: uppercase;
  }

  .hex:focus {
    border-color: var(--accent);
  }

  .grid {
    display: grid;
    grid-template-columns: auto 1fr auto 1fr auto 1fr;
    align-items: center;
    gap: 4px 6px;
  }

  .recent {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding-top: 2px;
  }

  .chip {
    width: 16px;
    height: 16px;
    border: 1px solid var(--border);
  }

  .chip:hover {
    border-color: var(--text-secondary);
  }
</style>
