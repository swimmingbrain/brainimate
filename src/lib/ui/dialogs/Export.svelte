<script module lang="ts">
  export type ExportFormat = 'png' | 'svg' | 'sequence' | 'gif' | 'webm' | 'mp4' | 'sprite';

  // what the last export used, the dialog opens with it again
  const last = {
    format: 'png' as ExportFormat,
    scale: 1,
    transparent: false,
    outlineText: false,
    pretty: true,
    background: true,
    allFrames: true,
    gifFps: 0,
    loop: true,
    dither: false,
    quality: 70,
    columns: 0,
    padding: 2,
    zip: true
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from '../Dialog.svelte';
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import Slider from '../Slider.svelte';
  import { editor } from '$lib/editor/editor';
  import { docLength } from '$lib/anim/timeline';
  import { addToast } from '$lib/stores/app';
  import { exportRange, frameCanvas, isAbort, prepareExport, scaledSize } from '$lib/io/render';
  import { downloadBlob, exportName, KINDS, saveBlob, type FileKind } from '$lib/io/save';
  import { exportPng } from '$lib/io/png';
  import { exportSvg } from '$lib/io/svgout';
  import { exportSequence } from '$lib/io/sequence';
  import { exportGif } from '$lib/io/gif';
  import type { VideoOptions } from '$lib/io/video';
  import { exportSpriteSheet, spriteZip } from '$lib/io/spritesheet';

  let { onclose }: { onclose: () => void } = $props();

  const doc = editor.doc;
  const length = docLength(doc);
  // the frame of the main timeline, also while a symbol is open
  const current = editor.editStack[0]?.frame ?? editor.frame;

  let s = $state({ ...last });
  let from = $state(1);
  let to = $state(length);
  let videoOk = $state({ webm: false, mp4: false });
  let busy = $state(false);
  let progress = $state(0);
  let controller: AbortController | null = null;
  let preview = $state<HTMLCanvasElement | null>(null);

  const ANIMATED: ExportFormat[] = ['sequence', 'gif', 'webm', 'mp4', 'sprite'];
  const formats = $derived(
    [
      { value: 'png', label: 'PNG picture' },
      { value: 'svg', label: 'SVG drawing' },
      { value: 'sequence', label: 'PNG sequence' },
      { value: 'gif', label: 'GIF animation' },
      { value: 'webm', label: 'WebM video' },
      { value: 'mp4', label: 'MP4 video' },
      { value: 'sprite', label: 'Sprite sheet' }
    ].filter((f) => (f.value !== 'webm' || videoOk.webm) && (f.value !== 'mp4' || videoOk.mp4))
  );
  const animated = $derived(ANIMATED.includes(s.format));
  const video = $derived(s.format === 'webm' || s.format === 'mp4');
  const range = $derived(s.allFrames ? exportRange(length, null) : exportRange(length, { from: from - 1, to: to - 1 }));
  const frames = $derived(range.to - range.from + 1);
  const size = $derived(scaledSize(doc, s.scale, video));
  const canClear = $derived(s.format !== 'svg' && s.format !== 'mp4');
  const clear = $derived(canClear && s.transparent);
  const gifFps = $derived(s.gifFps || doc.fps);
  const note = $derived.by(() => {
    if (!animated) return `Frame ${current + 1} of ${length}`;
    const fps = s.format === 'gif' ? gifFps : doc.fps;
    const seconds = frames / doc.fps;
    return `${frames} ${frames === 1 ? 'frame' : 'frames'}, ${seconds.toFixed(1)} s at ${fps} fps`;
  });

  // a picture of the frame that gets exported first, see through shows the checkerboard
  async function drawPreview(frame: number, transparent: boolean) {
    await prepareExport(doc);
    const canvas = preview;
    if (!canvas) return;
    const k = Math.min(240 / doc.width, 160 / doc.height);
    const w = Math.max(1, Math.round(doc.width * k));
    const h = Math.max(1, Math.round(doc.height * k));
    const out = frameCanvas(doc, w, h, transparent);
    out.draw(frame);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, w, h);
    ctx?.drawImage(out.canvas, 0, 0);
  }

  $effect(() => {
    void drawPreview(animated ? range.from : current, clear);
  });

  // mediabunny is large, it only loads with this dialog
  const videoModule = () => import('$lib/io/video');

  onMount(() => {
    const { width, height } = scaledSize(doc, 1, true);
    void videoModule().then(async ({ canExport }) => {
      videoOk = { webm: await canExport('webm', width, height), mp4: await canExport('mp4', width, height) };
    });
  });

  function setProgress(p: number) {
    progress = p;
  }

  // the export as one blob on its way, its file name and kind
  function job(signal: AbortSignal): { blob: Promise<Blob>; name: string; kind: FileKind } {
    const base = exportName(doc.name);
    switch (s.format) {
      case 'png':
        return { blob: exportPng(doc, current, s.scale, s.transparent), name: `${base}.png`, kind: KINDS.png };
      case 'svg': {
        const opts = { frame: current, outlineText: s.outlineText, pretty: s.pretty, background: s.background };
        const blob = prepareExport(doc).then(() => new Blob([exportSvg(doc, opts)], { type: KINDS.svg.mime }));
        return { blob, name: `${base}.svg`, kind: KINDS.svg };
      }
      case 'sequence': {
        const opts = { range, scale: s.scale, transparent: s.transparent, name: base };
        return { blob: exportSequence(doc, opts, signal, setProgress), name: `${base} frames.zip`, kind: KINDS.zip };
      }
      case 'gif': {
        const opts = { range, scale: s.scale, fps: gifFps, loop: s.loop, transparent: s.transparent, dither: s.dither };
        return { blob: exportGif(doc, opts, signal, setProgress), name: `${base}.gif`, kind: KINDS.gif };
      }
      case 'webm':
      case 'mp4': {
        const format = s.format;
        const quality = s.quality / 100;
        const opts: VideoOptions = { format, range, scale: s.scale, quality, transparent: s.transparent };
        const blob = videoModule().then(({ exportVideo }) => exportVideo(doc, opts, signal, setProgress));
        return { blob, name: `${base}.${format}`, kind: KINDS[format] };
      }
      case 'sprite': {
        const opts = spriteOptions(base);
        const blob = exportSpriteSheet(doc, opts, signal, setProgress).then((sheet) => spriteZip(base, sheet));
        return { blob, name: `${base} sheet.zip`, kind: KINDS.zip };
      }
    }
  }

  function spriteOptions(name: string) {
    return { range, scale: s.scale, columns: s.columns, padding: s.padding, transparent: s.transparent, name };
  }

  // the sheet and the json as two downloads, no dialog can ask twice for one click
  async function spriteFiles(signal: AbortSignal) {
    const base = exportName(doc.name);
    const sheet = await exportSpriteSheet(doc, spriteOptions(base), signal, setProgress);
    downloadBlob(sheet.png, `${base}.png`);
    downloadBlob(new Blob([sheet.json], { type: KINDS.json.mime }), `${base}.json`);
    return `${base}.png and ${base}.json`;
  }

  async function run() {
    if (busy) return;
    Object.assign(last, s);
    controller = new AbortController();
    const signal = controller.signal;
    busy = true;
    progress = 0;
    try {
      if (s.format === 'sprite' && !s.zip) {
        addToast(`Exported ${await spriteFiles(signal)}`, 'success');
        onclose();
        return;
      }
      const work = job(signal);
      // a closed save dialog never reads the blob, its failure is handled here
      work.blob.catch(() => {});
      if (await saveBlob(work.blob, work.name, work.kind)) {
        addToast(`Exported ${work.name}`, 'success');
        onclose();
      } else {
        controller.abort();
      }
    } catch (e) {
      const why = e instanceof Error ? e.message : 'something went wrong';
      if (!isAbort(e)) addToast(`Export failed: ${why}`, 'error', 6000);
    } finally {
      busy = false;
      controller = null;
    }
  }

  function close() {
    controller?.abort();
    Object.assign(last, s);
    onclose();
  }
</script>

<Dialog title="Export" width={620} onclose={close}>
  <div class="layout">
    <div class="options">
      <Field label="Format">
        <SelectField
          value={s.format}
          options={formats}
          label="Format"
          onchange={(v) => (s.format = v as ExportFormat)} />
      </Field>
      {#if animated}
        <Field label="Frames">
          <SelectField
            value={s.allFrames ? 'all' : 'range'}
            options={[
              { value: 'all', label: length === 1 ? 'The only one' : `All ${length} frames` },
              { value: 'range', label: 'From, to' }
            ]}
            label="Frames"
            onchange={(v) => (s.allFrames = v === 'all')} />
        </Field>
        {#if !s.allFrames}
          <Field label="From">
            <NumberField value={from} min={1} max={length} precision={0} label="From" onchange={(v) => (from = v)} />
          </Field>
          <Field label="To">
            <NumberField value={to} min={1} max={length} precision={0} label="To" onchange={(v) => (to = v)} />
          </Field>
        {/if}
      {/if}
      {#if s.format !== 'svg'}
        <Field label="Scale">
          <NumberField
            value={s.scale}
            min={0.25}
            max={4}
            step={0.25}
            precision={2}
            unit="x"
            label="Scale"
            onchange={(v) => (s.scale = v)} />
        </Field>
        <Field label="Size">
          <span class="value">{size.width} &times; {size.height} px</span>
        </Field>
      {/if}
      {#if s.format === 'gif'}
        <Field label="Frame rate" hint="Frames a second, the document plays at {doc.fps}">
          <NumberField
            value={gifFps}
            min={1}
            max={50}
            precision={0}
            unit=" fps"
            label="Frame rate"
            onchange={(v) => (s.gifFps = v)} />
        </Field>
        <Field label="Loop">
          <ToggleField value={s.loop} label="Loop" onchange={(v) => (s.loop = v)} />
        </Field>
        <Field label="Dither" hint="Hides the bands a gif makes in gradients">
          <ToggleField value={s.dither} label="Dither" onchange={(v) => (s.dither = v)} />
        </Field>
      {/if}
      {#if video}
        <Field label="Quality">
          <Slider
            value={s.quality}
            min={10}
            max={100}
            step={1}
            precision={0}
            label="Quality"
            onchange={(v) => (s.quality = v)} />
        </Field>
      {/if}
      {#if s.format === 'sprite'}
        <Field label="Columns" hint="0 makes the sheet about square">
          <NumberField
            value={s.columns}
            min={0}
            max={64}
            precision={0}
            label="Columns"
            onchange={(v) => (s.columns = v)} />
        </Field>
        <Field label="Padding">
          <NumberField
            value={s.padding}
            min={0}
            max={64}
            precision={0}
            unit=" px"
            label="Padding"
            onchange={(v) => (s.padding = v)} />
        </Field>
        <Field label="One zip" hint="Off saves the png and the json as two downloads">
          <ToggleField value={s.zip} label="One zip" onchange={(v) => (s.zip = v)} />
        </Field>
      {/if}
      {#if s.format === 'svg'}
        <Field label="Outline text" hint="Text as glyph shapes, it looks the same without the font">
          <ToggleField value={s.outlineText} label="Outline text" onchange={(v) => (s.outlineText = v)} />
        </Field>
        <Field label="Pretty print">
          <ToggleField value={s.pretty} label="Pretty print" onchange={(v) => (s.pretty = v)} />
        </Field>
        <Field label="Background">
          <ToggleField value={s.background} label="Background" onchange={(v) => (s.background = v)} />
        </Field>
      {/if}
      {#if canClear}
        <Field label="Transparent" hint="Leave the background out">
          <ToggleField value={s.transparent} label="Transparent" onchange={(v) => (s.transparent = v)} />
        </Field>
      {/if}
    </div>
    <div class="side">
      <div class="preview" class:clear>
        <canvas bind:this={preview} aria-label="Preview"></canvas>
      </div>
      <p class="note">{note}</p>
    </div>
  </div>
  {#if busy}
    <div
      class="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}>
      <div class="bar" style="width: {Math.round(progress * 100)}%"></div>
    </div>
  {/if}
  {#snippet footer()}
    {#if busy}
      <button class="dialog-btn" onclick={() => controller?.abort()}>Cancel export</button>
    {:else}
      <button class="dialog-btn" onclick={close}>Close</button>
    {/if}
    <button class="dialog-btn primary" onclick={run} disabled={busy}>{busy ? 'Exporting...' : 'Export'}</button>
  {/snippet}
</Dialog>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 248px;
    gap: 16px;
  }

  .options {
    min-width: 0;
  }

  .value {
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--text-secondary);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview {
    height: 168px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-deep);
    border: 1px solid var(--border);
  }

  .preview canvas {
    max-width: 240px;
    max-height: 160px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }

  /* a checkerboard under see through exports */
  .preview.clear canvas {
    background-color: #ffffff;
    background-image:
      linear-gradient(45deg, #d0d0d4 25%, transparent 25%),
      linear-gradient(-45deg, #d0d0d4 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #d0d0d4 75%),
      linear-gradient(-45deg, transparent 75%, #d0d0d4 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
  }

  .note {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .progress {
    height: 4px;
    margin-top: 14px;
    background: var(--bg-elevated);
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--accent);
    transition: width 120ms linear;
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  @media (max-width: 560px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
