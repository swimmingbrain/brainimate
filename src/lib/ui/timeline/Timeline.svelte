<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import Ruler from './Ruler.svelte';
  import TimelineBar from './TimelineBar.svelte';
  import LayerRow from './LayerRow.svelte';
  import { notYet } from '$lib/editor/commands';
  import { docVersion, editor } from '$lib/editor/editor';
  import { addLayer, deleteLayer, renameLayer, setActiveLayer, setLayerFlag } from '$lib/editor/layers';
  import { activeLayer, frame } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  const fw = $derived($preferences.timeline.frameWidth);

  // the top layer is drawn last, so it is listed first
  const layers = $derived.by(() => {
    void $docVersion;
    return [...editor.currentLayers()].reverse();
  });
</script>

<section class="timeline" style="--fw: {fw}px">
  <div class="head">
    <div class="layer-head">
      <div class="actions">
        <button class="mini-btn" onclick={addLayer} title="New layer" aria-label="New layer">
          <Icon name="plus" size={13} />
        </button>
        <button class="mini-btn" onclick={() => notYet('New folder')} title="New folder" aria-label="New folder">
          <Icon name="folder" size={13} />
        </button>
        <button class="mini-btn" onclick={() => notYet('New rig layer')} title="New rig layer" aria-label="New rig layer">
          <Icon name="rig" size={13} />
        </button>
        <button
          class="mini-btn"
          onclick={() => $activeLayer && deleteLayer($activeLayer)}
          title="Delete layer"
          aria-label="Delete layer">
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
    <div class="rows">
      {#each layers as layer (layer.id)}
        <LayerRow
          {layer}
          active={$activeLayer === layer.id}
          onactivate={() => setActiveLayer(layer.id)}
          onrename={(name) => renameLayer(layer.id, name)}
          ontoggle={(key, value) => setLayerFlag(layer.id, key, value)} />
      {/each}
      <div class="filler">
        <div class="layer"></div>
        <div class="frames"></div>
      </div>
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

  .columns {
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

  .rows {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .filler {
    flex: 1;
    display: flex;
    min-height: 12px;
  }

  .filler .layer {
    width: var(--layer-header-w);
    flex-shrink: 0;
    border-right: 1px solid var(--border);
  }

  .filler .frames {
    position: relative;
    flex: 1;
    min-width: 0;
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
