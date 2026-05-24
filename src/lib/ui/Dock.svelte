<script lang="ts">
  import type { Component } from 'svelte';
  import PanelTabs from './PanelTabs.svelte';
  import Resizer from './Resizer.svelte';
  import Properties from './panels/Properties.svelte';
  import ColorPanel from './panels/ColorPanel.svelte';
  import Swatches from './panels/Swatches.svelte';
  import Library from './panels/Library.svelte';
  import Align from './panels/Align.svelte';
  import Transform from './panels/Transform.svelte';
  import Rig from './panels/Rig.svelte';
  import { DOCK_BOTTOM, DOCK_TOP, togglePanel } from '$lib/stores/app';
  import { preferences, setGroup, type DockTab } from '$lib/stores/preferences';

  const LABELS: Record<DockTab, string> = {
    properties: 'Properties',
    color: 'Color',
    swatches: 'Swatches',
    library: 'Library',
    align: 'Align',
    transform: 'Transform',
    rig: 'Rig'
  };

  const PANELS: Record<DockTab, Component> = {
    properties: Properties,
    color: ColorPanel,
    swatches: Swatches,
    library: Library,
    align: Align,
    transform: Transform,
    rig: Rig
  };

  let height = $state(0);

  const panels = $derived($preferences.panels);
  const top = $derived(DOCK_TOP.filter((t) => !panels.hidden.includes(t)));
  const bottom = $derived(DOCK_BOTTOM.filter((t) => !panels.hidden.includes(t)));
  // a hidden tab hands over to the first one still shown
  const topTab = $derived(top.includes(panels.topTab) ? panels.topTab : top[0]);
  const bottomTab = $derived(bottom.includes(panels.bottomTab) ? panels.bottomTab : bottom[0]);

  function tabsOf(ids: DockTab[]) {
    return ids.map((id) => ({ id, label: LABELS[id] }));
  }

  function resize(delta: number) {
    if (height <= 0) return;
    setGroup('panels', { dockSplit: Math.max(0.15, Math.min(0.85, panels.dockSplit + delta / height)) });
  }
</script>

<aside class="dock" bind:clientHeight={height}>
  {#if top.length > 0}
    {@const TopPanel = PANELS[topTab]}
    <section class="group" style={bottom.length > 0 ? `flex: 0 0 ${panels.dockSplit * 100}%` : 'flex: 1'}>
      <PanelTabs
        tabs={tabsOf(top)}
        active={topTab}
        onchange={(id) => setGroup('panels', { topTab: id as DockTab })}
        onclose={(id) => togglePanel(id as DockTab)} />
      <TopPanel />
    </section>
  {/if}
  {#if top.length > 0 && bottom.length > 0}
    <Resizer direction="horizontal" onresize={resize} />
  {/if}
  {#if bottom.length > 0}
    {@const BottomPanel = PANELS[bottomTab]}
    <section class="group grow">
      <PanelTabs
        tabs={tabsOf(bottom)}
        active={bottomTab}
        onchange={(id) => setGroup('panels', { bottomTab: id as DockTab })}
        onclose={(id) => togglePanel(id as DockTab)} />
      <BottomPanel />
    </section>
  {/if}
  {#if top.length === 0 && bottom.length === 0}
    <p class="all-hidden">Every panel is hidden. The Window menu brings them back.</p>
  {/if}
</aside>

<style>
  .dock {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg-surface);
  }

  .group {
    display: flex;
    flex-direction: column;
    min-height: 64px;
    overflow: hidden;
  }

  .group.grow {
    flex: 1;
  }

  .all-hidden {
    padding: 24px 16px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
    text-align: center;
  }
</style>
