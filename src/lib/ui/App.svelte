<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './TopBar.svelte';
  import MenuBar from './MenuBar.svelte';
  import Toolbar from './Toolbar.svelte';
  import StageBar from './StageBar.svelte';
  import Stage from './Stage.svelte';
  import Dock from './Dock.svelte';
  import Resizer from './Resizer.svelte';
  import StatusBar from './StatusBar.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Dialogs from './Dialogs.svelte';
  import Timeline from './timeline/Timeline.svelte';
  import { MAX_DOCK, MAX_TIMELINE, MIN_DOCK, MIN_TIMELINE, preferences, setGroup } from '$lib/stores/preferences';
  import { installShortcuts } from '$lib/editor/shortcuts';
  import { filesPicked, setImportInput } from '$lib/editor/importer';

  // what the stage keeps at the least when the dock or the timeline grow
  const MIN_STAGE_W = 320;
  const MIN_STAGE_H = 160;

  let mainWidth = $state(0);
  let mainHeight = $state(0);

  const panels = $derived($preferences.panels);

  function resizeDock(delta: number) {
    const limit = Math.min(MAX_DOCK, mainWidth - MIN_STAGE_W);
    setGroup('panels', { dockWidth: Math.max(MIN_DOCK, Math.min(panels.dockWidth - delta, limit)) });
  }

  function resizeTimeline(delta: number) {
    const limit = Math.min(MAX_TIMELINE, mainHeight - MIN_STAGE_H);
    setGroup('panels', { timelineHeight: Math.max(MIN_TIMELINE, Math.min(panels.timelineHeight - delta, limit)) });
  }

  let importInput = $state<HTMLInputElement | null>(null);

  onMount(() => {
    setImportInput(importInput);
    const off = installShortcuts();
    return () => {
      off();
      setImportInput(null);
    };
  });
</script>

<div class="editor-app">
  <TopBar />
  <MenuBar />

  <main
    class="main-area"
    bind:clientWidth={mainWidth}
    bind:clientHeight={mainHeight}
    style="grid-template-columns: var(--toolbar-h) minmax(0, 1fr) 3px {panels.dockWidth}px; grid-template-rows: minmax(0, 1fr) 3px {panels.timelineHeight}px">
    <div class="toolbar-area">
      <Toolbar />
    </div>

    <section class="stage-area" data-panel="stage">
      <StageBar />
      <Stage />
    </section>

    <div class="rz rz-v">
      <Resizer onresize={resizeDock} />
    </div>

    <div class="dock-area" data-panel="dock">
      <Dock />
    </div>

    <div class="rz rz-h">
      <Resizer direction="horizontal" onresize={resizeTimeline} />
    </div>

    <div class="timeline-area" data-panel="timeline">
      <Timeline />
    </div>
  </main>

  <StatusBar />
</div>

<ContextMenu />
<Dialogs />
<input
  class="import-input"
  type="file"
  aria-label="Import file"
  tabindex="-1"
  bind:this={importInput}
  onchange={(e) => filesPicked([...(e.currentTarget.files ?? [])])}
  oncancel={() => filesPicked([])} />

<style>
  .import-input {
    display: none;
  }

  .editor-app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
    overflow: hidden;
  }

  .main-area {
    flex: 1;
    min-height: 0;
    display: grid;
    overflow: hidden;
  }

  /* the tools run the full height, next to the timeline as well */
  .toolbar-area {
    grid-column: 1;
    grid-row: 1 / 4;
    min-height: 0;
  }

  .stage-area {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .rz {
    display: flex;
  }

  .rz-v {
    grid-column: 3;
    grid-row: 1 / 4;
  }

  .rz-h {
    grid-column: 2;
    grid-row: 2;
  }

  .rz-h :global(.resizer) {
    flex: 1;
  }

  .dock-area {
    grid-column: 4;
    grid-row: 1 / 4;
    min-width: 0;
    min-height: 0;
  }

  .timeline-area {
    grid-column: 2;
    grid-row: 3;
    min-width: 0;
    min-height: 0;
  }

  /* one column on a narrow window: tools, stage, timeline, then the panels. nothing is dropped */
  @media (max-width: 900px) {
    .main-area {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-rows: var(--toolbar-h) minmax(300px, 1fr) 220px 360px !important;
      overflow-y: auto;
    }

    .rz {
      display: none;
    }

    .toolbar-area {
      grid-column: 1;
      grid-row: 1;
    }

    .stage-area {
      grid-column: 1;
      grid-row: 2;
    }

    .timeline-area {
      grid-column: 1;
      grid-row: 3;
      border-top: 1px solid var(--border);
    }

    .dock-area {
      grid-column: 1;
      grid-row: 4;
      border-top: 1px solid var(--border);
    }
  }
</style>
