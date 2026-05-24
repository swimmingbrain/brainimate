<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import Ruler from './Ruler.svelte';
  import TimelineBar from './TimelineBar.svelte';
  import { notYet } from '$lib/editor/commands';
  import { frame } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  const fw = $derived($preferences.timeline.frameWidth);

  // one sample row until layers exist: a hold, a tween and a hold, keyed at 1, 13 and 25
  const spans = [
    { from: 0, to: 12, kind: 'hold' },
    { from: 12, to: 24, kind: 'tween' },
    { from: 24, to: 30, kind: 'hold' }
  ];
</script>

<section class="timeline" style="--fw: {fw}px">
  <div class="head">
    <div class="layer-head">
      <div class="actions">
        <button class="mini-btn" onclick={() => notYet('New layer')} title="New layer" aria-label="New layer">
          <Icon name="plus" size={13} />
        </button>
        <button class="mini-btn" onclick={() => notYet('New folder')} title="New folder" aria-label="New folder">
          <Icon name="folder" size={13} />
        </button>
        <button class="mini-btn" onclick={() => notYet('New rig layer')} title="New rig layer" aria-label="New rig layer">
          <Icon name="rig" size={13} />
        </button>
        <button class="mini-btn" onclick={() => notYet('Delete layer')} title="Delete layer" aria-label="Delete layer">
          <Icon name="trash" size={13} />
        </button>
      </div>
      <div class="columns" aria-hidden="true">
        <Icon name="eye" size={12} />
        <Icon name="lock" size={12} />
        <Icon name="outline" size={12} />
      </div>
    </div>
    <div class="ruler-area">
      <Ruler frame={$frame} frameWidth={fw} onscrub={(f) => frame.set(f)} />
    </div>
  </div>

  <div class="body">
    <div class="row active">
      <div class="layer">
        <span class="swatch" style="background: var(--label-blue)"></span>
        <Icon name="layer" size={12} />
        <span class="name">Layer 1</span>
        <span class="toggles">
          <Icon name="eye" size={12} />
          <Icon name="unlock" size={12} />
          <span class="outline-box" style="border-color: var(--label-blue)"></span>
        </span>
      </div>
      <div class="frames">
        {#each spans as span (span.from)}
          <div class="span {span.kind}" style="left: calc(var(--fw) * {span.from}); width: calc(var(--fw) * {span.to - span.from})">
            {#if span.kind === 'tween'}<span class="arrow"></span>{/if}
          </div>
          <span class="key" style="left: calc(var(--fw) * {span.from})"></span>
        {/each}
        <span class="end" style="left: calc(var(--fw) * 29)"></span>
      </div>
    </div>
    <div class="filler">
      <div class="layer"></div>
      <div class="frames"></div>
    </div>
    <div class="playhead" style="left: calc(var(--layer-header-w) + var(--fw) * {$frame} + var(--fw) / 2)"></div>
  </div>

  <TimelineBar />
</section>

<style>
  .timeline {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-surface);
    user-select: none;
  }

  .head {
    height: var(--ruler-h);
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .layer-head {
    width: var(--layer-header-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0 2px;
    border-right: 1px solid var(--border);
  }

  .actions {
    display: flex;
    align-items: center;
  }

  .mini-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .mini-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .columns,
  .toggles {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
  }

  .ruler-area {
    flex: 1;
    min-width: 0;
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .row,
  .filler {
    display: flex;
    flex-shrink: 0;
  }

  .row {
    height: var(--layer-row-h);
    border-bottom: 1px solid var(--border);
  }

  .filler {
    flex: 1;
  }

  .layer {
    width: var(--layer-header-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 6px;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
  }

  .row.active .layer {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .swatch {
    width: 3px;
    align-self: stretch;
    margin: 4px 0;
    flex-shrink: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .outline-box {
    width: 10px;
    height: 10px;
    margin: 0 1px;
    border: 1.5px solid;
  }

  /* a line on every frame and a lighter cell every fifth, like the classic timelines */
  .frames {
    position: relative;
    flex: 1;
    min-width: 0;
    background:
      repeating-linear-gradient(to right, transparent 0 calc(var(--fw) - 1px), var(--frame-line) calc(var(--fw) - 1px) var(--fw)),
      repeating-linear-gradient(to right, transparent 0 calc(var(--fw) * 4), var(--frame-line-major) calc(var(--fw) * 4) calc(var(--fw) * 5));
  }

  .span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-right: 1px solid var(--frame-hold-edge);
  }

  .span.hold {
    background: var(--frame-hold);
  }

  .span.tween {
    background: var(--tween);
    border-right-color: var(--tween-edge);
  }

  /* the tween arrow runs from the key dot to the next key */
  .arrow {
    position: absolute;
    left: calc(var(--fw) / 2 + 5px);
    right: 6px;
    top: 50%;
    height: 1px;
    background: var(--tween-edge);
  }

  .arrow::after {
    content: '';
    position: absolute;
    right: -1px;
    top: -3px;
    border-left: 5px solid var(--tween-edge);
    border-top: 3.5px solid transparent;
    border-bottom: 3.5px solid transparent;
  }

  .key {
    position: absolute;
    top: 50%;
    width: 7px;
    height: 7px;
    margin-left: calc(var(--fw) / 2 - 3.5px);
    margin-top: -3.5px;
    border-radius: 50%;
    background: var(--keyframe);
  }

  /* the end of a span, a small hollow box in the last frame */
  .end {
    position: absolute;
    top: 50%;
    width: 6px;
    height: 8px;
    margin-left: calc(var(--fw) / 2 - 3px);
    margin-top: -4px;
    border: 1px solid var(--text-muted);
  }

  .filler .frames {
    background: repeating-linear-gradient(
      to right,
      transparent 0 calc(var(--fw) * 4),
      var(--frame-line) calc(var(--fw) * 4) calc(var(--fw) * 5)
    );
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    margin-left: -0.5px;
    background: var(--playhead);
    pointer-events: none;
  }
</style>
