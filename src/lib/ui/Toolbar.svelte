<script lang="ts">
  import Icon from '$lib/icons/Icon.svelte';
  import ColorPopover from './ColorPopover.svelte';
  import { TOOL_INFO, selectTool } from '$lib/tools';
  import { clearColor, resetColors, setPaint, swapColors } from '$lib/editor/commands';
  import { paintColor } from '$lib/core/style';
  import { activeTool, colorTarget, fillPaint, strokePaint } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  const tools = $derived($preferences.toolbar.tools.map((id) => TOOL_INFO[id]));
  const fillColor = $derived(paintColor($fillPaint));
  const strokeColor = $derived(paintColor($strokePaint));

  let picker = $state<{ target: 'fill' | 'stroke'; x: number; y: number } | null>(null);
  // a click on the chip closes an open picker first, it must not open it again right away
  let closedAt = 0;

  function title(name: string, shortcut: string): string {
    return shortcut ? `${name} (${shortcut})` : name;
  }

  // a click on the chip in front opens the picker, on the one behind brings it to the front
  function pick(target: 'fill' | 'stroke', e: MouseEvent) {
    if ($colorTarget !== target) {
      colorTarget.set(target);
      return;
    }
    if (performance.now() - closedAt < 250) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    picker = { target, x: rect.right + 8, y: rect.top - 40 };
  }
</script>

<div class="toolbar" role="toolbar" aria-label="Tools" aria-orientation="vertical">
  <div class="tools">
    {#each tools as tool, i (tool.id)}
      {#if i > 0 && tools[i - 1].group !== tool.group}
        <span class="sep"></span>
      {/if}
      <button
        class="tool-btn"
        class:active={$activeTool === tool.id}
        title={title(tool.name, tool.shortcut)}
        aria-label={tool.name}
        aria-pressed={$activeTool === tool.id}
        onclick={() => selectTool(tool.id)}>
        <Icon name={tool.icon} size={15} />
      </button>
    {/each}
  </div>

  <div class="colors">
    <div class="chips">
      <button
        class="chip stroke"
        class:front={$colorTarget === 'stroke'}
        class:none={strokeColor === null}
        style={strokeColor ? `--c: ${strokeColor}` : ''}
        title="Stroke color"
        aria-label="Stroke color"
        onclick={(e) => pick('stroke', e)}></button>
      <button
        class="chip fill"
        class:front={$colorTarget === 'fill'}
        class:none={fillColor === null}
        style={fillColor ? `--c: ${fillColor}` : ''}
        title="Fill color"
        aria-label="Fill color"
        onclick={(e) => pick('fill', e)}></button>
    </div>
    <div class="chip-actions">
      <button class="mini" onclick={resetColors} title="Default colors (D)" aria-label="Default colors">
        <span class="mini-default"></span>
      </button>
      <button class="mini" onclick={swapColors} title="Swap fill and stroke (Shift+X)" aria-label="Swap fill and stroke">
        <Icon name="swap" size={11} />
      </button>
      <button class="mini" onclick={clearColor} title="None (/)" aria-label="No color">
        <Icon name="none" size={11} />
      </button>
    </div>
  </div>
</div>

{#if picker}
  <ColorPopover
    title={picker.target === 'fill' ? 'Fill' : 'Stroke'}
    paint={picker.target === 'fill' ? $fillPaint : $strokePaint}
    x={picker.x}
    y={picker.y}
    onchange={(p) => setPaint(picker!.target, p)}
    onclose={() => {
      picker = null;
      closedAt = performance.now();
    }} />
{/if}

<style>
  .toolbar {
    width: var(--toolbar-h);
    height: 100%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  /* the tools scroll on a short window, the color chips stay in view */
  .tools {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 4px 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tools::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tool-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .sep {
    width: 18px;
    height: 1px;
    margin: 3px 0;
    background: var(--border);
    flex-shrink: 0;
  }

  .colors {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0 6px;
    border-top: 1px solid var(--border);
  }

  .chips {
    position: relative;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .chip {
    position: absolute;
    width: 18px;
    height: 18px;
    outline: 1px solid var(--border);
  }

  .chip.fill {
    left: 0;
    top: 0;
    z-index: 1;
    background: var(--c, #fff);
  }

  /* the stroke is a thick frame with a hole, like in the other drawing apps */
  .chip.stroke {
    right: 0;
    bottom: 0;
    background: var(--bg-surface);
    border: 4px solid var(--c, #fff);
  }

  .chip.front {
    z-index: 2;
    outline-color: var(--text-muted);
  }

  .chip.none {
    background: #fff;
    border-color: #fff;
  }

  .chip.stroke.none {
    background: var(--bg-surface);
  }

  .chip.none::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -6px;
    bottom: -6px;
    width: 1.5px;
    margin-left: -0.75px;
    background: var(--error);
    transform: rotate(45deg);
  }

  .chip-actions {
    display: flex;
    gap: 0;
  }

  .mini {
    width: 11px;
    height: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .mini:hover {
    color: var(--text-primary);
  }

  /* two tiny chips, white fill over a black stroke */
  .mini-default {
    position: relative;
    width: 9px;
    height: 9px;
  }

  .mini-default::before,
  .mini-default::after {
    content: '';
    position: absolute;
    width: 6px;
    height: 6px;
    border: 1px solid var(--text-muted);
  }

  .mini-default::before {
    right: 0;
    bottom: 0;
    background: #000;
  }

  .mini-default::after {
    left: 0;
    top: 0;
    background: #fff;
  }

  @media (max-width: 900px) {
    .toolbar {
      width: 100%;
      height: var(--toolbar-h);
      flex-direction: row;
      border-right: none;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      overflow-y: hidden;
    }

    .tools {
      flex-direction: row;
      padding: 0 4px;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .sep {
      width: 1px;
      height: 18px;
      margin: 0 3px;
    }

    .colors {
      flex-direction: row;
      padding: 0 8px;
      border-top: none;
      border-left: 1px solid var(--border);
    }

    .chips {
      width: 24px;
      height: 24px;
    }

    .chip {
      width: 15px;
      height: 15px;
    }
  }
</style>
