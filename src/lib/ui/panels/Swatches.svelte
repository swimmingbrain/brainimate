<script lang="ts">
  import Panel from '../Panel.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { solid, paintColor } from '$lib/core/style';
  import { LAYER_COLORS, docVersion, editor } from '$lib/editor/editor';
  import { setPaint, shownPaint } from '$lib/editor/commands';
  import { addToast, colorTarget } from '$lib/stores/app';
  import { rememberColor } from '$lib/stores/preferences';

  const GRAYS = ['#000000', '#1f1f1f', '#3d3d3d', '#5c5c5c', '#7a7a7a', '#999999', '#b8b8b8', '#d6d6d6', '#ffffff'];
  // twelve hues around the wheel, a step of 30 degrees each
  const PALETTE = [
    '#e53935',
    '#f4511e',
    '#fb8c00',
    '#fdd835',
    '#7cb342',
    '#43a047',
    '#00897b',
    '#00acc1',
    '#1e88e5',
    '#3949ab',
    '#8e24aa',
    '#d81b60'
  ];

  const swatches = $derived.by(() => {
    void $docVersion;
    return editor.doc.swatches;
  });

  // a click sets the chip in front, shift the other one
  function apply(color: string, e: MouseEvent) {
    const front = $colorTarget;
    const target = e.shiftKey ? (front === 'fill' ? 'stroke' : 'fill') : front;
    setPaint(target, solid(color));
    rememberColor(color);
  }

  function addCurrent() {
    const color = paintColor(shownPaint($colorTarget));
    if (!color) {
      addToast('There is no color to add');
      return;
    }
    if (swatches.includes(color)) {
      addToast('That color is a swatch already');
      return;
    }
    editor.commit('Add swatch', (d) => {
      d.swatches.push(color);
    });
  }

  function remove(index: number) {
    editor.commit('Remove swatch', (d) => {
      d.swatches.splice(index, 1);
    });
  }
</script>

{#snippet chip(color: string)}
  <button
    class="chip"
    style="background: {color}"
    title="{color.toUpperCase()}, shift click for the other chip"
    aria-label={color}
    onclick={(e) => apply(color, e)}></button>
{/snippet}

<Panel>
  <h3 class="section">Default</h3>
  <div class="chips">
    {#each GRAYS as color (color)}
      {@render chip(color)}
    {/each}
  </div>
  <div class="chips">
    {#each PALETTE as color (color)}
      {@render chip(color)}
    {/each}
  </div>
  <h3 class="section">Layer colors</h3>
  <div class="chips">
    {#each LAYER_COLORS as color (color)}
      {@render chip(color)}
    {/each}
  </div>
  <h3 class="section with-action">
    <span>Document</span>
    <button class="add" title="Add the current color" aria-label="Add the current color" onclick={addCurrent}>
      <Icon name="plus" size={12} />
    </button>
  </h3>
  {#if swatches.length === 0}
    <p class="empty">Colors you add here are saved with the document.</p>
  {:else}
    <div class="chips">
      {#each swatches as color, i (color)}
        <span class="own">
          <button
            class="chip"
            style="background: {color}"
            title="{color.toUpperCase()}, right click to remove"
            aria-label={color}
            onclick={(e) => apply(color, e)}
            oncontextmenu={(e) => {
              e.preventDefault();
              remove(i);
            }}></button>
          <button class="remove" title="Remove" aria-label="Remove {color}" onclick={() => remove(i)}>
            <Icon name="close" size={8} />
          </button>
        </span>
      {/each}
    </div>
  {/if}
</Panel>

<style>
  .section {
    margin: 8px 8px 6px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .section:first-child {
    margin-top: 2px;
  }

  .with-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .add {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .add:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 0 8px 4px;
  }

  .chip {
    width: 18px;
    height: 18px;
    border: 1px solid var(--border);
  }

  .chip:hover {
    border-color: var(--text-secondary);
  }

  .own {
    position: relative;
    display: flex;
  }

  .remove {
    position: absolute;
    right: -4px;
    top: -4px;
    width: 11px;
    height: 11px;
    display: none;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .own:hover .remove {
    display: flex;
  }

  .empty {
    padding: 2px 8px 8px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
</style>
