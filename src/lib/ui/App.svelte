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
  import { filesPicked, importFiles, setImportInput } from '$lib/editor/importer';
  import { installUnloadGuard, startup } from '$lib/io/files';
  import { installSettings } from '$lib/editor/settings';
  import { installTooltips } from './tooltips';
  import { installAutosave } from '$lib/io/autosave';
  import { installTouch, touchUi } from '$lib/editor/touch';
  import { installAudio } from '$lib/io/audio';
  import TouchBar from './TouchBar.svelte';
  import TouchKeys from './TouchKeys.svelte';
  import Icon from '$lib/icons/Icon.svelte';

  // what the stage keeps at the least when the dock or the timeline grow
  const MIN_STAGE_W = 320;
  const MIN_STAGE_H = 160;

  let mainWidth = $state(0);
  let mainHeight = $state(0);

  const panels = $derived({ ...$preferences.panels, right: $preferences.toolbar.side === 'right' });

  // on a tablet the panels can go away for a bigger stage: next to it in landscape, as a drawer over
  // it in portrait, where they start closed
  let windowWidth = $state(1280);
  let drawer = $state(false);
  const touch = $derived($touchUi);
  const narrow = $derived(windowWidth <= 900);
  const dockOpen = $derived(!touch || (narrow ? drawer : $preferences.touch.dock));

  function toggleDock() {
    if (narrow) drawer = !drawer;
    else setGroup('touch', { dock: !$preferences.touch.dock });
  }

  // the toolbar column sits left or right of the stage, the timeline row goes away when it is hidden
  const grid = $derived.by(() => {
    const tools = $preferences.toolbar.buttons === 'small' ? '28px' : 'var(--toolbar-h)';
    const dock = dockOpen ? `3px ${panels.dockWidth}px` : '0px 0px';
    const cols = panels.right ? `minmax(0, 1fr) ${tools} ${dock}` : `${tools} minmax(0, 1fr) ${dock}`;
    const rows = panels.timeline ? `minmax(0, 1fr) 3px ${panels.timelineHeight}px` : 'minmax(0, 1fr)';
    return `grid-template-columns: ${cols}; grid-template-rows: ${rows}`;
  });

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
    const offAutosave = installAutosave();
    const offGuard = installUnloadGuard();
    const offSettings = installSettings();
    const offTips = installTooltips();
    const offTouch = installTouch();
    const offAudio = installAudio();
    void startup();
    return () => {
      off();
      offSettings();
      offTips();
      offTouch();
      offAudio();
      offAutosave();
      offGuard();
      setImportInput(null);
    };
  });

  // files dropped outside the stage, a project opens and pictures land in the middle
  function hasFiles(e: DragEvent): boolean {
    return [...(e.dataTransfer?.types ?? [])].includes('Files');
  }

  function ondragover(e: DragEvent) {
    if (!hasFiles(e) || e.defaultPrevented) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function ondrop(e: DragEvent) {
    // the stage already took what was dropped on it
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    e.preventDefault();
    void importFiles(files);
  }
</script>

<svelte:window {ondragover} {ondrop} bind:innerWidth={windowWidth} />

<div class="editor-app">
  <TopBar />
  <MenuBar />

  <main
    class="main-area"
    class:right={panels.right}
    class:no-timeline={!panels.timeline}
    class:touch
    class:no-dock={!dockOpen}
    bind:clientWidth={mainWidth}
    bind:clientHeight={mainHeight}
    style={grid}>
    <div class="toolbar-area">
      <Toolbar />
    </div>

    <section class="stage-area" data-panel="stage">
      <StageBar />
      <Stage />
      {#if touch}
        <TouchKeys />
        <TouchBar {dockOpen} ontoggledock={toggleDock} />
      {/if}
    </section>

    <div class="rz rz-v">
      <Resizer onresize={resizeDock} />
    </div>

    <div class="dock-area" class:drawer={touch && narrow} data-panel="dock">
      {#if touch && narrow}
        <div class="drawer-head">
          <span>Panels</span>
          <button class="drawer-close" aria-label="Close the panels" title="Close" onclick={() => (drawer = false)}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div class="drawer-body"><Dock /></div>
      {:else}
        <Dock />
      {/if}
    </div>

    {#if panels.timeline}
      <div class="rz rz-h">
        <Resizer direction="horizontal" onresize={resizeTimeline} />
      </div>

      <div class="timeline-area" data-panel="timeline">
        <Timeline />
      </div>
    {/if}
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
    position: relative;
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

  /* the toolbar on the right: the stage and the timeline take the first column */
  .main-area.right .toolbar-area {
    grid-column: 2;
  }

  .main-area.right .stage-area,
  .main-area.right .rz-h,
  .main-area.right .timeline-area {
    grid-column: 1;
  }

  .main-area.no-timeline .toolbar-area,
  .main-area.no-timeline .rz-v,
  .main-area.no-timeline .dock-area {
    grid-row: 1;
  }

  /* the panels put away on a tablet, the stage takes their room */
  .main-area.no-dock .rz-v,
  .main-area.no-dock .dock-area {
    display: none;
  }

  /* one column on a narrow window: tools, stage, timeline, then the panels. nothing is dropped and
     the side of the toolbar does not matter here */
  @media (max-width: 900px) {
    .main-area {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-rows: var(--toolbar-h) minmax(300px, 1fr) 220px 360px !important;
      overflow-y: auto;
    }

    .main-area.no-timeline {
      grid-template-rows: var(--toolbar-h) minmax(300px, 1fr) 360px !important;
    }

    .rz {
      display: none;
    }

    .main-area .toolbar-area {
      grid-column: 1;
      grid-row: 1;
    }

    .main-area .stage-area {
      grid-column: 1;
      grid-row: 2;
    }

    .main-area .timeline-area {
      grid-column: 1;
      grid-row: 3;
      border-top: 1px solid var(--border);
    }

    .main-area .dock-area {
      grid-column: 1;
      grid-row: 4;
      border-top: 1px solid var(--border);
    }

    .main-area.no-timeline .dock-area {
      grid-row: 3;
    }

    .main-area.right .toolbar-area {
      grid-column: 1;
    }

    /* a tablet in portrait: tools on top, the stage takes what is left, a short timeline under it and
       the panels as a drawer over the stage. the page never scrolls */
    .main-area.touch {
      grid-template-rows: var(--toolbar-h) minmax(0, 1fr) 190px !important;
      overflow: hidden;
    }

    .main-area.touch.no-timeline {
      grid-template-rows: var(--toolbar-h) minmax(0, 1fr) !important;
    }

    .main-area.touch .dock-area {
      position: fixed;
      right: 0;
      top: calc(var(--topbar-h) + var(--menubar-h));
      bottom: var(--statusbar-h);
      width: min(340px, 88vw);
      z-index: 40;
      background: var(--bg-surface);
      border-left: 1px solid var(--border);
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.45);
    }
  }

  .dock-area.drawer {
    display: flex;
    flex-direction: column;
  }

  .main-area.no-dock .dock-area.drawer {
    display: none;
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    padding: 0 6px 0 12px;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }

  .drawer-close {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .drawer-body {
    flex: 1;
    min-height: 0;
  }
</style>
