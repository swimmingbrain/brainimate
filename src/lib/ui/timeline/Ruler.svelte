<script lang="ts">
  import { RULER_H, prepareCanvas, timelineColors } from './metrics';

  // frame numbers every 5 frames (1 based), a tick on every frame, the onion range and the playhead, all on
  // one canvas. moving elements over it cost more per frame than drawing the few ticks again
  let {
    frame,
    frameWidth,
    scrollX,
    width,
    length,
    onion,
    onscrub,
    onrange
  }: {
    frame: number;
    frameWidth: number;
    scrollX: number;
    width: number;
    length: number;
    onion: { before: number; after: number; beforeColor: string; afterColor: string } | null;
    onscrub: (frame: number) => void;
    onrange: (before: number, after: number) => void;
  } = $props();

  // px from a bracket that still grabs it
  const GRAB = 5;
  const MAX_ONION = 10;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let drag: 'scrub' | 'before' | 'after' | null = null;
  let hoverBracket = $state(false);

  function x(f: number): number {
    return f * frameWidth - scrollX;
  }

  function bracketX(side: 'before' | 'after'): number {
    if (!onion) return -100;
    return side === 'before' ? x(frame - onion.before) : x(frame + onion.after + 1);
  }

  function draw() {
    if (!canvas || width <= 0) return;
    const ctx = prepareCanvas(canvas, width, RULER_H);
    if (!ctx) return;
    const c = timelineColors();
    const h = RULER_H;
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, width, h);

    // the frames past the end of the document are a little darker
    const end = x(length);
    if (end < width) {
      ctx.fillStyle = c.fifth;
      ctx.fillRect(Math.max(0, end), 0, width - Math.max(0, end), h);
    }

    const first = Math.max(0, Math.floor(scrollX / frameWidth));
    const last = Math.ceil((scrollX + width) / frameWidth);
    // numbers every 5 frames, every 10 when the frames get too narrow for them
    const every = frameWidth * 5 >= 24 ? 5 : 10;
    ctx.font = '9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let f = first; f <= last; f++) {
      const px = Math.round(x(f)) + 0.5;
      const n = f + 1;
      const major = n % 5 === 0;
      ctx.fillStyle = major ? c.muted : c.holdEdge;
      ctx.fillRect(px - 0.5, h - (major ? 7 : 4), 1, major ? 7 : 4);
      if (n % every === 0 || n === 1) {
        ctx.fillStyle = c.muted;
        ctx.fillText(String(n), x(f) + frameWidth / 2, 11);
      }
    }

    if (onion) {
      const a = bracketX('before');
      const b = bracketX('after');
      ctx.fillStyle = c.accentDim;
      ctx.fillRect(a, 14, b - a, 12);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = onion.beforeColor;
      ctx.beginPath();
      ctx.moveTo(a + 4, 14.75);
      ctx.lineTo(a + 0.75, 14.75);
      ctx.lineTo(a + 0.75, 25.25);
      ctx.lineTo(a + 4, 25.25);
      ctx.stroke();
      ctx.strokeStyle = onion.afterColor;
      ctx.beginPath();
      ctx.moveTo(b - 4, 14.75);
      ctx.lineTo(b - 0.75, 14.75);
      ctx.lineTo(b - 0.75, 25.25);
      ctx.lineTo(b - 4, 25.25);
      ctx.stroke();
    }

    // the playhead cell with its triangle handle at the bottom
    const head = x(frame);
    ctx.fillStyle = c.accentDim;
    ctx.fillRect(head, 0, frameWidth, h - 1);
    const mid = head + frameWidth / 2;
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.moveTo(mid - 5, h - 8);
    ctx.lineTo(mid + 5, h - 8);
    ctx.lineTo(mid, h - 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = c.border;
    ctx.fillRect(0, h - 1, width, 1);
  }

  function local(e: PointerEvent): number {
    return e.clientX - canvas!.getBoundingClientRect().left;
  }

  function frameAt(px: number): number {
    return Math.max(0, Math.floor((px + scrollX) / frameWidth));
  }

  // the brackets sit in the lower half, above them a press always scrubs
  function bracketAt(e: PointerEvent): 'before' | 'after' | null {
    if (!onion) return null;
    const rect = canvas!.getBoundingClientRect();
    if (e.clientY - rect.top < 12) return null;
    const px = local(e);
    const a = Math.abs(px - bracketX('before'));
    const b = Math.abs(px - bracketX('after'));
    if (Math.min(a, b) > GRAB) return null;
    return a <= b ? 'before' : 'after';
  }

  function dragBracket(px: number) {
    if (!onion) return;
    // the bracket edge is between cells, so it rounds instead of flooring
    const edge = Math.round((px + scrollX) / frameWidth);
    if (drag === 'before') onrange(Math.max(0, Math.min(MAX_ONION, frame - edge)), onion.after);
    else onrange(onion.before, Math.max(0, Math.min(MAX_ONION, edge - frame - 1)));
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 || !canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drag = bracketAt(e) ?? 'scrub';
    if (drag === 'scrub') onscrub(frameAt(local(e)));
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) {
      hoverBracket = bracketAt(e) !== null;
      return;
    }
    if (drag === 'scrub') onscrub(frameAt(local(e)));
    else dragBracket(local(e));
  }

  function onpointerup(e: PointerEvent) {
    drag = null;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  $effect(() => {
    void [frame, frameWidth, scrollX, width, length, onion];
    draw();
  });
</script>

<div class="ruler-wrap" style="width: {width}px; height: {RULER_H}px">
  <canvas
    class="ruler"
    class:bracket={hoverBracket}
    bind:this={canvas}
    style="width: {width}px; height: {RULER_H}px"
    aria-label="Frame ruler"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    onpointerleave={() => (hoverBracket = false)}></canvas>
</div>

<style>
  .ruler-wrap {
    position: relative;
    overflow: hidden;
  }

  .ruler {
    display: block;
    cursor: ew-resize;
    touch-action: none;
  }

  .ruler.bracket {
    cursor: col-resize;
  }
</style>
