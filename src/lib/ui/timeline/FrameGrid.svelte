<script lang="ts">
  import { tick } from 'svelte';
  import type { Keyframe, Layer } from '$lib/core/types';
  import { hasFrames, type FrameRange, type LayerRow } from '$lib/anim/timeline';
  import { docVersion, editor } from '$lib/editor/editor';
  import {
    clearKeyframes,
    copySelectedFrames,
    createTween,
    insertBlankKeyframes,
    insertFrames,
    insertKeyframeAt,
    insertKeyframes,
    moveSelectedKeyframes,
    pasteSelectedFrames,
    removeFrames,
    removeTween,
    reverseSelectedFrames,
    selectAllFrames,
    setFramesLabel
  } from '$lib/editor/commands';
  import { pause } from '$lib/anim/playback';
  import { activeLayer, contextMenu, frame, frameClipboard, frameSelection, type MenuItem } from '$lib/stores/app';
  import { ROW_H, prepareCanvas, timelineColors, type TimelineColors } from './metrics';

  // the frames of every row on one canvas, drawn again only when something it shows changes
  let {
    rows,
    frameWidth,
    scrollX,
    scrollY,
    width,
    height
  }: {
    rows: LayerRow[];
    frameWidth: number;
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
  } = $props();

  // px the pointer travels before a press turns into a drag
  const DRAG = 3;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let labelInput = $state<HTMLInputElement | null>(null);
  // keyframes being dragged, by this many frames
  let shift = $state(0);
  let copying = $state(false);
  // where the label field shows, and what is typed into it
  let label = $state<{ x: number; y: number } | null>(null);
  let labelText = $state('');

  interface Cell {
    row: number;
    layer: Layer;
    frame: number;
  }

  let press: {
    kind: 'move' | 'range';
    start: Cell;
    x: number;
    y: number;
    moved: boolean;
    // the selection to fall back to when a press inside it does not move
    collapse: boolean;
  } | null = null;

  function x(f: number): number {
    return f * frameWidth - scrollX;
  }

  function isEmpty(k: Keyframe, layer: Layer): boolean {
    return layer.type === 'rig' ? Object.keys(k.pose).length === 0 : k.items.length === 0;
  }

  function drawFlag(ctx: CanvasRenderingContext2D, px: number, cy: number, c: TimelineColors) {
    ctx.fillStyle = c.label;
    ctx.fillRect(px, cy - 5, 1, 10);
    ctx.beginPath();
    ctx.moveTo(px + 1, cy - 5);
    ctx.lineTo(px + 6, cy - 3);
    ctx.lineTo(px + 1, cy - 1);
    ctx.closePath();
    ctx.fill();
  }

  function drawArrow(ctx: CanvasRenderingContext2D, x0: number, x1: number, cy: number, color: string, dashed: boolean) {
    if (x1 - x0 < 4) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [3, 2] : []);
    ctx.beginPath();
    ctx.moveTo(x0, cy + 0.5);
    ctx.lineTo(x1, cy + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    if (dashed) return;
    ctx.beginPath();
    ctx.moveTo(x1 - 4, cy - 3);
    ctx.lineTo(x1, cy + 0.5);
    ctx.lineTo(x1 - 4, cy + 4);
    ctx.stroke();
  }

  function drawRow(ctx: CanvasRenderingContext2D, row: LayerRow, y: number, first: number, last: number, c: TimelineColors) {
    const layer = row.layer;
    if (!hasFrames(layer)) {
      ctx.fillStyle = c.folder;
      ctx.fillRect(0, y, width, ROW_H);
      return;
    }
    const keys = layer.keyframes;
    const cy = y + ROW_H / 2;
    const r = Math.max(1.5, Math.min(3.5, frameWidth / 2 - 1));
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const next = keys[i + 1];
      const from = k.frame;
      const to = Math.min(next?.frame ?? layer.length, layer.length);
      if (to <= from || to < first || from > last) continue;
      const x0 = x(from);
      const x1 = x(to);
      const empty = isEmpty(k, layer);
      const rig = layer.type === 'rig';
      const tween = k.tween !== null;
      ctx.fillStyle = tween ? (rig ? c.pose : c.tween) : empty ? c.empty : c.hold;
      ctx.fillRect(x0, y + 1, x1 - x0, ROW_H - 2);
      if (tween) {
        ctx.strokeStyle = rig ? c.poseEdge : c.tweenEdge;
        ctx.strokeRect(x0 + 0.5, y + 1.5, x1 - x0 - 1, ROW_H - 3);
        drawArrow(ctx, x0 + frameWidth, x1 - 2, cy, rig ? c.poseEdge : c.tweenEdge, !next);
      } else {
        ctx.fillStyle = c.holdEdge;
        ctx.fillRect(Math.round(x1) - 1, y + 1, 1, ROW_H - 2);
        // a hold ends in a small hollow box in its last frame
        if (to - from > 1 && frameWidth >= 6) {
          const bw = Math.min(5, frameWidth - 3);
          ctx.strokeStyle = c.muted;
          ctx.strokeRect(Math.round(x(to - 1) + (frameWidth - bw) / 2) + 0.5, cy - 3.5, bw - 1, 7);
        }
      }
      ctx.fillStyle = c.holdEdge;
      ctx.fillRect(Math.round(x0), y + 1, 1, ROW_H - 2);
      if (k.label && x1 - x0 > frameWidth + 8) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + frameWidth, y, x1 - x0 - frameWidth - 2, ROW_H);
        ctx.clip();
        drawFlag(ctx, Math.round(x0 + frameWidth + 2), cy, c);
        ctx.fillStyle = c.text;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(k.label, x0 + frameWidth + 10, cy + 0.5);
        ctx.restore();
      }
      const kx = x0 + frameWidth / 2;
      ctx.beginPath();
      ctx.arc(kx, cy, r, 0, Math.PI * 2);
      if (empty) {
        ctx.strokeStyle = c.keyframe;
        ctx.stroke();
      } else {
        ctx.fillStyle = c.keyframe;
        ctx.fill();
      }
    }
  }

  // the rows of the selection that are on screen, top and bottom
  function selectedRows(sel: FrameRange): { top: number; bottom: number; rows: number[] } | null {
    const ids = new Set(sel.layers);
    const list: number[] = [];
    rows.forEach((row, i) => {
      if (ids.has(row.layer.id)) list.push(i);
    });
    if (list.length === 0) return null;
    return { top: Math.min(...list), bottom: Math.max(...list), rows: list };
  }

  function drawSelection(ctx: CanvasRenderingContext2D, sel: FrameRange, c: TimelineColors) {
    const picked = selectedRows(sel);
    if (!picked) return;
    const x0 = x(sel.from);
    const w = (sel.to - sel.from + 1) * frameWidth;
    ctx.fillStyle = c.accentDim;
    for (const i of picked.rows) ctx.fillRect(x0, i * ROW_H - scrollY, w, ROW_H);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1;
    const top = picked.top * ROW_H - scrollY;
    const h = (picked.bottom - picked.top + 1) * ROW_H;
    ctx.strokeRect(Math.round(x0) + 0.5, top + 0.5, Math.round(w) - 1, h - 1);
    if (shift === 0) return;
    // where the dragged keyframes would land
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(Math.round(x(sel.from + shift)) + 0.5, top + 0.5, Math.round(w) - 1, h - 1);
    ctx.setLineDash([]);
    ctx.strokeStyle = c.accent;
    for (const i of picked.rows) {
      const layer = rows[i].layer;
      for (const k of layer.keyframes) {
        if (k.frame < sel.from || k.frame > sel.to) continue;
        ctx.beginPath();
        ctx.arc(x(k.frame + shift) + frameWidth / 2, i * ROW_H - scrollY + ROW_H / 2, 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function draw() {
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;
    const c = timelineColors();
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, width, height);
    const first = Math.max(0, Math.floor(scrollX / frameWidth));
    const last = Math.ceil((scrollX + width) / frameWidth);
    const bottom = Math.min(height, rows.length * ROW_H - scrollY);

    // a darker cell every fifth frame, a faint line between frames
    ctx.fillStyle = c.fifth;
    for (let f = first; f <= last; f++) if ((f + 1) % 5 === 0) ctx.fillRect(x(f), 0, frameWidth, bottom);
    if (frameWidth >= 6) {
      ctx.fillStyle = c.line;
      for (let f = first; f <= last; f++) ctx.fillRect(Math.round(x(f + 1)) - 1, 0, 1, bottom);
    }

    const r0 = Math.max(0, Math.floor(scrollY / ROW_H));
    const r1 = Math.min(rows.length - 1, Math.floor((scrollY + height) / ROW_H));
    ctx.lineWidth = 1;
    for (let r = r0; r <= r1; r++) {
      const y = r * ROW_H - scrollY;
      drawRow(ctx, rows[r], y, first, last, c);
      ctx.fillStyle = c.border;
      ctx.fillRect(0, y + ROW_H - 1, width, 1);
    }
    const sel = $frameSelection;
    if (sel) drawSelection(ctx, sel, c);
  }

  let queued = false;

  // several changes in one frame draw once
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  }

  $effect(() => {
    void [rows, frameWidth, scrollX, scrollY, width, height, $docVersion, $frameSelection, shift];
    schedule();
  });

  function cellAt(e: MouseEvent): Cell | null {
    const rect = canvas!.getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top + scrollY) / ROW_H);
    if (row < 0 || row >= rows.length) return null;
    const f = Math.max(0, Math.floor((e.clientX - rect.left + scrollX) / frameWidth));
    return { row, layer: rows[row].layer, frame: f };
  }

  function inSelection(cell: Cell): boolean {
    const sel = $frameSelection;
    return !!sel && sel.layers.includes(cell.layer.id) && cell.frame >= sel.from && cell.frame <= sel.to;
  }

  // the layers that hold frames from row a to row b, top first
  function rangeOf(a: Cell, b: Cell): FrameRange {
    const lo = Math.min(a.row, b.row);
    const hi = Math.max(a.row, b.row);
    const layers = rows
      .slice(lo, hi + 1)
      .map((r) => r.layer)
      .filter(hasFrames)
      .map((l) => l.id);
    return { layers, from: Math.min(a.frame, b.frame), to: Math.max(a.frame, b.frame) };
  }

  function hasKeys(sel: FrameRange): boolean {
    return sel.layers.some((id) => {
      const layer = editor.layerById(id);
      return !!layer && layer.keyframes.some((k) => k.frame >= sel.from && k.frame <= sel.to);
    });
  }

  function pick(cell: Cell) {
    frame.set(cell.frame);
    if (hasFrames(cell.layer)) {
      activeLayer.set(cell.layer.id);
      frameSelection.set({ layers: [cell.layer.id], from: cell.frame, to: cell.frame });
    } else {
      frameSelection.set(null);
    }
  }

  // where shift clicks and range drags start from
  let anchor: Cell | null = null;

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 || !canvas) return;
    const cell = cellAt(e);
    if (!cell) return;
    pause();
    canvas.setPointerCapture(e.pointerId);
    if (e.shiftKey && anchor) {
      frameSelection.set(rangeOf(anchor, cell));
      press = { kind: 'range', start: anchor, x: e.clientX, y: e.clientY, moved: true, collapse: false };
      return;
    }
    const sel = $frameSelection;
    if (sel && inSelection(cell) && hasKeys(sel)) {
      press = { kind: 'move', start: cell, x: e.clientX, y: e.clientY, moved: false, collapse: true };
      return;
    }
    pick(cell);
    anchor = cell;
    const onKey = hasFrames(cell.layer) && cell.layer.keyframes.some((k) => k.frame === cell.frame);
    press = { kind: onKey ? 'move' : 'range', start: cell, x: e.clientX, y: e.clientY, moved: false, collapse: false };
  }

  function onpointermove(e: PointerEvent) {
    if (!press) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG) return;
    press.moved = true;
    const cell = cellAt(e);
    if (press.kind === 'range') {
      if (cell) frameSelection.set(rangeOf(press.start, cell));
      return;
    }
    const rect = canvas!.getBoundingClientRect();
    const f = Math.floor((e.clientX - rect.left + scrollX) / frameWidth);
    shift = f - press.start.frame;
    copying = e.altKey;
  }

  function onpointerup(e: PointerEvent) {
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const p = press;
    press = null;
    if (!p) return;
    if (p.kind === 'move' && shift !== 0) {
      const by = shift;
      shift = 0;
      moveSelectedKeyframes(by, copying || e.altKey);
      return;
    }
    shift = 0;
    // a click inside a bigger selection picks just that frame
    if (!p.moved && p.collapse) {
      pick(p.start);
      anchor = p.start;
    }
  }

  function ondblclick(e: MouseEvent) {
    const cell = cellAt(e);
    if (!cell || !hasFrames(cell.layer)) return;
    insertKeyframeAt(cell.layer.id, cell.frame);
  }

  async function startLabel(cell: Cell) {
    const layer = editor.layerById(cell.layer.id);
    const key = layer?.keyframes.filter((k) => k.frame <= cell.frame).pop();
    labelText = key?.label ?? '';
    label = { x: x(cell.frame), y: cell.row * ROW_H - scrollY };
    await tick();
    // the menu that opened this hands the focus back as it closes, so the field takes it a frame later
    requestAnimationFrame(() => {
      labelInput?.focus();
      labelInput?.select();
    });
  }

  function finishLabel(keep: boolean) {
    if (!label) return;
    label = null;
    if (keep) setFramesLabel(labelText);
  }

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    const cell = cellAt(e);
    if (!cell) return;
    if (!inSelection(cell)) {
      pick(cell);
      anchor = cell;
    }
    const sel = $frameSelection;
    const single = !sel || sel.from === sel.to;
    const items: MenuItem[] = [
      { label: 'Insert frame', shortcut: 'F5', action: insertFrames },
      { label: 'Remove frame', shortcut: 'Shift+F5', action: removeFrames },
      { label: '', separator: true },
      { label: 'Insert keyframe', shortcut: 'F6', action: insertKeyframes },
      { label: 'Insert blank keyframe', shortcut: 'F7', action: insertBlankKeyframes },
      { label: 'Clear keyframe', shortcut: 'Shift+F6', action: clearKeyframes },
      { label: '', separator: true },
      { label: 'Create tween', action: createTween },
      { label: 'Remove tween', action: removeTween },
      { label: '', separator: true },
      { label: 'Copy frames', shortcut: 'Ctrl+Alt+C', action: copySelectedFrames },
      { label: 'Paste frames', shortcut: 'Ctrl+Alt+V', disabled: !$frameClipboard, action: pasteSelectedFrames },
      { label: 'Reverse frames', disabled: single, action: reverseSelectedFrames },
      { label: '', separator: true },
      { label: 'Set label...', action: () => startLabel(cell) },
      { label: 'Select all frames', action: selectAllFrames }
    ];
    contextMenu.set({ x: e.clientX, y: e.clientY, items });
  }
</script>

<div class="grid">
  <canvas
    bind:this={canvas}
    style="width: {width}px; height: {height}px"
    aria-label="Frames"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {ondblclick}
    {oncontextmenu}></canvas>
  {#if label}
    <input
      class="label-input"
      bind:this={labelInput}
      bind:value={labelText}
      style="left: {Math.max(0, label.x)}px; top: {label.y + 2}px"
      placeholder="Label"
      aria-label="Label for the picked frames"
      onblur={() => finishLabel(true)}
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finishLabel(true);
        else if (e.key === 'Escape') finishLabel(false);
      }} />
  {/if}
</div>

<style>
  .grid {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    touch-action: none;
  }

  .label-input {
    position: absolute;
    width: 140px;
    height: 20px;
    padding: 0 5px;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    outline: none;
    z-index: 5;
  }
</style>
