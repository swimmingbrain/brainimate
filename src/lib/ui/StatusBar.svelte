<script lang="ts">
  import { TOOL_INFO } from '$lib/tools';
  import { TOOL_HINTS } from '$lib/tools/hints';
  import { zoomFit } from '$lib/editor/view';
  import { activeTool, playing, selection, stageSize, view } from '$lib/stores/app';
</script>

<!-- the frame and the time live in the timeline bar, playing changes nothing down here -->
<div class="status-bar">
  <div class="left">
    <span class="status-item tool">{TOOL_INFO[$activeTool].name}</span>
    <span class="sep"></span>
    <span class="status-item hint" title={TOOL_HINTS[$activeTool]}>{TOOL_HINTS[$activeTool]}</span>
  </div>

  <div class="right">
    {#if $playing}
      <span class="status-item live">playing</span>
      <span class="sep"></span>
    {/if}
    <span class="status-item">{$selection.size === 0 ? 'nothing selected' : `${$selection.size} selected`}</span>
    <span class="sep"></span>
    <span class="status-item">{$stageSize.width} x {$stageSize.height}</span>
    <span class="sep"></span>
    <button class="status-item toggle" onclick={zoomFit} title="Fit in window (Ctrl+0)">
      {Math.round($view.zoom * 100)}%
    </button>
    <span class="sep credit-sep"></span>
    <span class="status-item credit">
      made with <span class="heart">&hearts;</span> by
      <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
    </span>
  </div>
</div>

<style>
  .status-bar {
    height: var(--statusbar-h);
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    font-size: 10.5px;
    color: var(--text-muted);
    flex-shrink: 0;
    user-select: none;
    font-family: var(--font-editor);
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .left {
    flex: 1;
    overflow: hidden;
  }

  .right {
    flex-shrink: 0;
  }

  .hint {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .tool {
    color: var(--text-secondary);
  }

  .live {
    color: var(--accent);
  }

  .sep {
    width: 1px;
    height: 10px;
    background: var(--border);
    margin: 0 4px;
  }

  .toggle {
    font-family: inherit;
    font-size: inherit;
    color: var(--text-muted);
    padding: 0 2px;
  }

  .toggle:hover {
    color: var(--text-secondary);
  }

  .credit a {
    color: var(--accent);
    text-decoration: none;
  }

  .credit a:hover {
    color: var(--accent-hover);
  }

  .heart {
    color: var(--error);
    font-size: 11px;
  }

  @media (max-width: 900px) {
    .credit,
    .credit-sep {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .hint {
      display: none;
    }
  }
</style>
