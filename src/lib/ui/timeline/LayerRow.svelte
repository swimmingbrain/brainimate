<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Layer } from '$lib/core/types';

  // one layer: its header on the left, its keyframes and holds on the right
  let {
    layer,
    active,
    onactivate,
    onrename,
    ontoggle
  }: {
    layer: Layer;
    active: boolean;
    onactivate: () => void;
    onrename: (name: string) => void;
    ontoggle: (key: 'visible' | 'locked' | 'outline', value: boolean) => void;
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);

  // a span runs from a keyframe to the next one or to the end of the layer
  const spans = $derived(
    layer.keyframes.map((k, i) => {
      const end = i + 1 < layer.keyframes.length ? layer.keyframes[i + 1].frame : layer.length;
      return { from: k.frame, to: Math.max(k.frame + 1, end), empty: k.items.length === 0, tween: k.tween !== null };
    })
  );

  async function startRename() {
    draft = layer.name;
    editing = true;
    await tick();
    input?.focus();
    input?.select();
  }

  function finishRename() {
    if (!editing) return;
    editing = false;
    if (draft.trim() && draft.trim() !== layer.name) onrename(draft);
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') finishRename();
    else if (e.key === 'Escape') editing = false;
  }
</script>

<div class="row" class:active class:hidden={!layer.visible}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="layer" role="button" tabindex="-1" onclick={onactivate}>
    <span class="swatch" style="background: {layer.color}"></span>
    <Icon name="layer" size={12} />
    {#if editing}
      <input class="rename" bind:this={input} bind:value={draft} onblur={finishRename} {onkeydown} aria-label="Layer name" />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="name" title="Double click to rename" ondblclick={startRename}>{layer.name}</span>
    {/if}
    <span class="toggles">
      <button
        class="toggle"
        class:off={!layer.visible}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        onclick={(e) => {
          e.stopPropagation();
          ontoggle('visible', !layer.visible);
        }}>
        <Icon name={layer.visible ? 'eye' : 'eye-off'} size={12} />
      </button>
      <button
        class="toggle"
        class:on={layer.locked}
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
        aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
        onclick={(e) => {
          e.stopPropagation();
          ontoggle('locked', !layer.locked);
        }}>
        <Icon name={layer.locked ? 'lock' : 'unlock'} size={12} />
      </button>
      <button
        class="toggle"
        title={layer.outline ? 'Show filled' : 'Show as outlines'}
        aria-label={layer.outline ? 'Show filled' : 'Show as outlines'}
        onclick={(e) => {
          e.stopPropagation();
          ontoggle('outline', !layer.outline);
        }}>
        <span class="outline-box" class:hollow={layer.outline} style="--c: {layer.color}"></span>
      </button>
    </span>
  </div>
  <div class="frames">
    {#each spans as span (span.from)}
      {#if span.to - span.from > 1}
        <div
          class="span"
          class:tween={span.tween}
          style="left: calc(var(--fw) * {span.from}); width: calc(var(--fw) * {span.to - span.from})">
        </div>
        <span class="end" style="left: calc(var(--fw) * {span.to - 1})"></span>
      {/if}
      <span class="key" class:empty={span.empty} style="left: calc(var(--fw) * {span.from})"></span>
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    flex-shrink: 0;
    height: var(--layer-row-h);
    border-bottom: 1px solid var(--border);
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
    cursor: default;
    outline: none;
  }

  .row.active .layer {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .row.hidden .name {
    color: var(--text-muted);
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

  .rename {
    flex: 1;
    min-width: 0;
    padding: 1px 4px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--accent);
    outline: none;
  }

  .toggles {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .toggle {
    width: 16px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .toggle:hover {
    color: var(--text-primary);
  }

  .toggle.off {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .toggle.on {
    color: var(--accent);
  }

  /* filled in the layer color, hollow while the layer shows as outlines */
  .outline-box {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--c);
    background: var(--c);
  }

  .outline-box.hollow {
    background: none;
  }

  /* a line on every frame and a lighter cell every fifth, like the classic timelines */
  .frames {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    background:
      repeating-linear-gradient(to right, transparent 0 calc(var(--fw) - 1px), var(--frame-line) calc(var(--fw) - 1px) var(--fw)),
      repeating-linear-gradient(to right, transparent 0 calc(var(--fw) * 4), var(--frame-line-major) calc(var(--fw) * 4) calc(var(--fw) * 5));
  }

  .span {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--frame-hold);
    border-right: 1px solid var(--frame-hold-edge);
  }

  .span.tween {
    background: var(--tween);
    border-right-color: var(--tween-edge);
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

  .key.empty {
    background: none;
    border: 1px solid var(--keyframe);
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
</style>
