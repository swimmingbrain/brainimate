<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import NumberField from '../NumberField.svelte';
  import { contextMenu, frame, playing } from '$lib/stores/app';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { docVersion, editor } from '$lib/editor/editor';
  import {
    firstFrame,
    fitTimeline,
    goToFrame,
    lastFrame,
    stepFrame,
    toggleOnion,
    togglePlay
  } from '$lib/editor/commands';
  import { formatTime } from '$lib/anim/playback';
  import { MAX_FRAME_W, MIN_FRAME_W } from './metrics';

  const timeline = $derived($preferences.timeline);
  // the frame rate belongs to the document, the preference is only the default for new ones
  const fps = $derived.by(() => {
    void $docVersion;
    return editor.doc.fps;
  });
  const length = $derived.by(() => {
    void $docVersion;
    return editor.length();
  });

  // right click on the onion button: how the ghosts look
  function onionMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Onion skin', checked: timeline.onion, action: toggleOnion },
        { label: '', separator: true },
        {
          label: 'Outlines only',
          checked: timeline.onionOutline,
          action: () => setGroup('timeline', { onionOutline: !timeline.onionOutline })
        },
        {
          label: 'Keyframes only',
          checked: timeline.onionKeyframes,
          action: () => setGroup('timeline', { onionKeyframes: !timeline.onionKeyframes })
        }
      ]
    });
  }

  function setFps(v: number) {
    editor.commit(
      'Frame rate',
      (d) => {
        d.fps = Math.round(v);
      },
      'doc-fps'
    );
  }
</script>

<div class="bar">
  <div class="group">
    <button
      class="icon-btn"
      class:on={timeline.onion}
      onclick={toggleOnion}
      oncontextmenu={onionMenu}
      title="Onion skin (Alt+Shift+O), right click for options"
      aria-label="Onion skin"
      aria-pressed={timeline.onion}>
      <Icon name="onion" size={14} />
    </button>
    <div class="count" title="Onion skin frames before">
      <NumberField
        value={timeline.onionBefore}
        min={0}
        max={10}
        precision={0}
        label="Onion skin frames before"
        onchange={(v) => setGroup('timeline', { onionBefore: v })} />
    </div>
    <div class="count" title="Onion skin frames after">
      <NumberField
        value={timeline.onionAfter}
        min={0}
        max={10}
        precision={0}
        label="Onion skin frames after"
        onchange={(v) => setGroup('timeline', { onionAfter: v })} />
    </div>
    <button
      class="icon-btn"
      class:on={timeline.autoKey}
      onclick={() => setGroup('timeline', { autoKey: !timeline.autoKey })}
      title="Auto key"
      aria-label="Auto key"
      aria-pressed={timeline.autoKey}>
      <Icon name="autokey" size={14} />
    </button>
    <button
      class="icon-btn"
      class:on={timeline.loop}
      onclick={() => setGroup('timeline', { loop: !timeline.loop })}
      title="Loop"
      aria-label="Loop"
      aria-pressed={timeline.loop}>
      <Icon name="loop" size={14} />
    </button>
  </div>

  <span class="sep"></span>

  <div class="group transport">
    <button class="icon-btn" title="First frame (Shift+,)" aria-label="First frame" onclick={firstFrame}>
      <Icon name="first" size={13} />
    </button>
    <button class="icon-btn" title="Previous frame (,)" aria-label="Previous frame" onclick={() => stepFrame(-1)}>
      <Icon name="prev" size={13} />
    </button>
    <button
      class="icon-btn play"
      class:on={$playing}
      title={$playing ? 'Pause (Enter)' : 'Play (Enter)'}
      aria-label={$playing ? 'Pause' : 'Play'}
      onclick={togglePlay}>
      <Icon name={$playing ? 'pause' : 'play'} size={13} />
    </button>
    <button class="icon-btn" title="Next frame (.)" aria-label="Next frame" onclick={() => stepFrame(1)}>
      <Icon name="next" size={13} />
    </button>
    <button class="icon-btn" title="Last frame (Shift+.)" aria-label="Last frame" onclick={lastFrame}>
      <Icon name="last" size={13} />
    </button>
  </div>

  <span class="sep"></span>

  <div class="group readout">
    <div class="field" title="Current frame">
      <NumberField
        value={$frame + 1}
        min={1}
        max={99999}
        precision={0}
        label="Current frame"
        onchange={(v) => goToFrame(v - 1)} />
    </div>
    <div class="field fps" title="Frames per second">
      <NumberField value={fps} min={1} max={120} precision={0} unit=" fps" label="Frames per second" onchange={setFps} />
    </div>
    <span class="time" title="Minutes, seconds and frames of {length} frames">{formatTime($frame, fps)}</span>
  </div>

  <div class="spacer"></div>

  <div class="group zoom">
    <Icon name="minus" size={11} />
    <input
      class="range"
      type="range"
      min={MIN_FRAME_W}
      max={MAX_FRAME_W}
      step="1"
      value={timeline.frameWidth}
      style="--fill: {((timeline.frameWidth - MIN_FRAME_W) / (MAX_FRAME_W - MIN_FRAME_W)) * 100}%"
      aria-label="Frame width"
      title="Frame width (Ctrl+wheel)"
      oninput={(e) => setGroup('timeline', { frameWidth: Number(e.currentTarget.value) })} />
    <Icon name="plus" size={11} />
    <button class="text-btn" title="Fit the whole animation" onclick={fitTimeline}>Fit</button>
  </div>
</div>

<style>
  .bar {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .bar::-webkit-scrollbar {
    height: 0;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 24px;
    height: 22px;
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

  .count {
    width: 30px;
    margin: 0 1px;
  }

  .sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    flex-shrink: 0;
  }

  /* the frame and time change while playing, on their own layer they do not paint the page again */
  .readout {
    gap: 6px;
    will-change: transform;
  }

  .field {
    width: 52px;
  }

  .field.fps {
    width: 62px;
  }

  .time {
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--text-muted);
    min-width: 58px;
  }

  .spacer {
    flex: 1;
  }

  .zoom {
    gap: 6px;
    color: var(--text-muted);
  }

  .text-btn {
    height: 20px;
    padding: 0 7px;
    font-size: 11px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .text-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .range {
    width: 90px;
    height: 14px;
    appearance: none;
    background: none;
    outline: none;
    cursor: pointer;
  }

  .range::-webkit-slider-runnable-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--border) var(--fill));
  }

  .range::-moz-range-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--border) var(--fill));
  }

  .range::-webkit-slider-thumb {
    appearance: none;
    width: 9px;
    height: 13px;
    margin-top: -5px;
    background: var(--text-secondary);
    border: none;
  }

  .range::-moz-range-thumb {
    width: 9px;
    height: 13px;
    background: var(--text-secondary);
    border: none;
    border-radius: 0;
  }

  .range:hover::-webkit-slider-thumb {
    background: var(--accent);
  }

  .range:hover::-moz-range-thumb {
    background: var(--accent);
  }
</style>
