<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import NumberField from '../NumberField.svelte';
  import { frame, playing } from '$lib/stores/app';
  import { preferences, setGroup } from '$lib/stores/preferences';
  import { docVersion, editor } from '$lib/editor/editor';

  const timeline = $derived($preferences.timeline);
  // the frame rate belongs to the document, the preference is only the default for new ones
  const fps = $derived.by(() => {
    void $docVersion;
    return editor.doc.fps;
  });
  const last = $derived.by(() => {
    void $docVersion;
    return Math.max(0, ...editor.doc.layers.map((l) => l.length - 1));
  });
  const seconds = $derived(($frame / fps).toFixed(2));

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
      onclick={() => setGroup('timeline', { onion: !timeline.onion })}
      title="Onion skin"
      aria-label="Onion skin"
      aria-pressed={timeline.onion}>
      <Icon name="onion" size={14} />
    </button>
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

  <!-- playback arrives with the timeline work -->
  <div class="group transport">
    <button class="icon-btn" title="First frame (Shift+,)" aria-label="First frame" onclick={() => frame.set(0)}>
      <Icon name="first" size={13} />
    </button>
    <button
      class="icon-btn"
      title="Previous frame (,)"
      aria-label="Previous frame"
      onclick={() => frame.update((f) => Math.max(0, f - 1))}>
      <Icon name="prev" size={13} />
    </button>
    <button class="icon-btn play" title="Play (Enter)" aria-label="Play">
      <Icon name={$playing ? 'pause' : 'play'} size={13} />
    </button>
    <button class="icon-btn" title="Next frame (.)" aria-label="Next frame" onclick={() => frame.update((f) => f + 1)}>
      <Icon name="next" size={13} />
    </button>
    <button class="icon-btn" title="Last frame (Shift+.)" aria-label="Last frame" onclick={() => frame.set(last)}>
      <Icon name="last" size={13} />
    </button>
  </div>

  <span class="sep"></span>

  <div class="group readout">
    <div class="field" title="Current frame">
      <NumberField value={$frame + 1} min={1} max={99999} precision={0} label="Current frame" onchange={(v) => frame.set(v - 1)} />
    </div>
    <div class="field fps" title="Frames per second">
      <NumberField value={fps} min={1} max={120} precision={0} unit=" fps" label="Frames per second" onchange={setFps} />
    </div>
    <span class="time">{seconds}s</span>
  </div>

  <div class="spacer"></div>

  <div class="group zoom">
    <Icon name="minus" size={11} />
    <input
      class="range"
      type="range"
      min="4"
      max="24"
      step="1"
      value={timeline.frameWidth}
      style="--fill: {((timeline.frameWidth - 4) / 20) * 100}%"
      aria-label="Frame width"
      title="Frame width"
      oninput={(e) => setGroup('timeline', { frameWidth: Number(e.currentTarget.value) })} />
    <Icon name="plus" size={11} />
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

  .sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    flex-shrink: 0;
  }

  .readout {
    gap: 6px;
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
    min-width: 44px;
  }

  .spacer {
    flex: 1;
  }

  .zoom {
    gap: 6px;
    color: var(--text-muted);
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
