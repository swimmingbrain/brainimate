<script lang="ts">
  import { tick } from 'svelte';
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import Menu from '../Menu.svelte';
  import NumberField from '../NumberField.svelte';
  import SelectField from '../SelectField.svelte';
  import Slider from '../Slider.svelte';
  import ToggleField from '../ToggleField.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Bone, Layer } from '$lib/core/types';
  import { PALETTE } from '$lib/core/palette';
  import { docVersion, editStack, editor } from '$lib/editor/editor';
  import {
    activeRigLayer,
    addRigTemplate,
    bindSelection,
    canEditRig,
    deleteBone,
    renameBone,
    resetAllPoses,
    resetPose,
    setBone,
    togglePin,
    unbindSelection
  } from '$lib/editor/rig';
  import { addRigLayer } from '$lib/editor/layers';
  import { boneDepth, childrenOf, rootsOf } from '$lib/rig/bones';
  import { TEMPLATES } from '$lib/rig/templates';
  import { activeLayer, boneSelection, contextMenu, selection, type MenuItem } from '$lib/stores/app';
  import { preferences, setGroup, type BindMode } from '$lib/stores/preferences';

  const COLOR_NAMES = ['Blue', 'Teal', 'Rose', 'Yellow', 'Purple', 'Green', 'Orange', 'Magenta'];
  const MODES = [
    { value: 'auto', label: 'Smooth or rigid' },
    { value: 'smooth', label: 'Smooth' },
    { value: 'rigid', label: 'Rigid' }
  ];
  const INDENT = 12;

  // the rig layer shown: the active one, or the topmost one
  const layer = $derived.by((): Layer | null => {
    void $docVersion;
    void $activeLayer;
    void $editStack;
    return activeRigLayer();
  });

  // the bones as a tree, parents above their children
  const rows = $derived.by(() => {
    if (!layer) return [];
    const bones = layer.bones;
    const out: { bone: Bone; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (b: Bone) => {
      if (seen.has(b.id)) return;
      seen.add(b.id);
      out.push({ bone: b, depth: boneDepth(bones, b.id) });
      for (const c of childrenOf(bones, b.id)) walk(c);
    };
    for (const r of rootsOf(bones)) walk(r);
    for (const b of bones) walk(b);
    return out;
  });

  const editable = $derived(layer ? canEditRig(layer) : false);
  const r = $derived($preferences.rig);

  const templateItems: MenuItem[] = TEMPLATES.map((t) => ({ label: t.label, action: () => addRigTemplate(t.id) }));

  let renaming = $state<string | null>(null);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);

  async function startRename(bone: Bone) {
    boneSelection.set(bone.id);
    draft = bone.name;
    renaming = bone.id;
    await tick();
    input?.focus();
    input?.select();
  }

  function finishRename(keep: boolean) {
    const id = renaming;
    renaming = null;
    if (keep && id) renameBone(id, draft);
  }

  function pick(bone: Bone) {
    boneSelection.set(bone.id);
    editor.markOverlay();
  }

  function onkeydown(e: KeyboardEvent) {
    const id = $boneSelection;
    if ((e.key === 'Delete' || e.key === 'Backspace') && id) {
      e.preventDefault();
      e.stopPropagation();
      deleteBone(id);
    }
  }

  function colorMenu(e: MouseEvent, bone: Bone) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu.set({
      x: rect.left,
      y: rect.bottom + 2,
      items: PALETTE.map((color, i) => ({
        label: COLOR_NAMES[i] ?? color,
        color,
        checked: bone.color === color,
        action: () => setBone(bone.id, { color }, 'Bone color')
      }))
    });
  }
</script>

<div class="rig">
  <Panel
    icon={layer && layer.bones.length > 0 ? undefined : 'bone'}
    empty={layer && layer.bones.length > 0
      ? undefined
      : 'Draw bones with the bone tool (M): click a joint, the next joint, and so on, Esc ends the chain. Or start from a template.'}>
    {#if layer && layer.bones.length > 0}
      <div class="head">
        <Icon name="bone" size={12} />
        <span class="layer">{layer.name}</span>
        {#if !editable}<span class="locked">locked</span>{/if}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="rows" role="tree" aria-label="Bones" tabindex="0" {onkeydown}>
        {#each rows as row (row.bone.id)}
          {@const bone = row.bone}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="row"
            class:picked={$boneSelection === bone.id}
            role="treeitem"
            aria-selected={$boneSelection === bone.id}
            tabindex="-1"
            style="padding-left: {8 + row.depth * INDENT}px"
            onclick={() => pick(bone)}>
            <button
              class="dot"
              style="background: {bone.color}"
              title="Bone color"
              aria-label="Bone color"
              onclick={(e) => colorMenu(e, bone)}></button>
            {#if renaming === bone.id}
              <input
                class="rename"
                bind:this={input}
                bind:value={draft}
                aria-label="Bone name"
                onblur={() => finishRename(true)}
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') finishRename(true);
                  else if (e.key === 'Escape') finishRename(false);
                }} />
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="name" title="Double click to rename" ondblclick={() => startRename(bone)}>{bone.name}</span>
            {/if}
            <button
              class="pin"
              class:on={bone.pinned}
              title={bone.pinned ? 'Unpin joint' : 'Pin joint'}
              aria-label={bone.pinned ? 'Unpin joint' : 'Pin joint'}
              aria-pressed={bone.pinned}
              onclick={(e) => {
                e.stopPropagation();
                togglePin(bone.id);
              }}>
              <Icon name="pin" size={12} />
            </button>
          </div>
        {/each}
      </div>

      <h3 class="section">Bind</h3>
      <div class="ops">
        <button class="op" disabled={$selection.size === 0} onclick={bindSelection}>
          {$boneSelection ? 'Bind to bone' : 'Bind selection'}
        </button>
        <button class="op" disabled={$selection.size === 0} onclick={unbindSelection}>Unbind</button>
      </div>
      <Field label="Mode">
        <SelectField
          value={r.bindMode}
          options={MODES}
          label="How drawings follow the bones"
          onchange={(v) => setGroup('rig', { bindMode: v as BindMode })} />
      </Field>
      <Field label="Reach" hint="The reach of new bones, a share of their length">
        <Slider
          value={r.reach}
          min={5}
          max={100}
          precision={0}
          unit="%"
          label="Reach of new bones"
          onchange={(v) => setGroup('rig', { reach: v })} />
      </Field>
      <Field label="Show reach">
        <ToggleField
          value={r.showCapsules}
          label="Show the reach of each bone"
          onchange={(on) => setGroup('rig', { showCapsules: on })} />
      </Field>

      <h3 class="section">Pose</h3>
      <div class="ops">
        <button class="op" disabled={!editable} onclick={resetPose}>Reset pose</button>
        <button class="op" disabled={!editable} onclick={resetAllPoses}>Reset all poses</button>
      </div>
      <Field label="IK chain" hint="How many bones a dragged joint turns at most">
        <NumberField
          value={r.chainLimit}
          min={1}
          max={12}
          precision={0}
          label="IK chain limit"
          onchange={(v) => setGroup('rig', { chainLimit: Math.round(v) })} />
      </Field>
      <Field label="Show bones">
        <ToggleField
          value={r.showBones}
          label="Show the bones with the selection tool"
          onchange={(on) => setGroup('rig', { showBones: on })} />
      </Field>
    {/if}
  </Panel>
  <div class="bar">
    <span class="count">
      {layer ? (layer.bones.length === 1 ? '1 bone' : `${layer.bones.length} bones`) : 'No rig layer'}
    </span>
    <Menu items={templateItems}>
      {#snippet trigger({ toggle })}
        <button class="text-btn" title="Add a template" onclick={toggle}>
          Template
          <Icon name="chevron-down" size={11} />
        </button>
      {/snippet}
    </Menu>
    <button class="btn" title="New rig layer" aria-label="New rig layer" onclick={addRigLayer}>
      <Icon name="plus" size={13} />
    </button>
    <button
      class="btn"
      title="Delete bone"
      aria-label="Delete bone"
      disabled={!$boneSelection || !editable}
      onclick={() => $boneSelection && deleteBone($boneSelection)}>
      <Icon name="trash" size={13} />
    </button>
  </div>
</div>

<style>
  .rig {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px 6px;
    color: var(--text-muted);
  }

  .layer {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .locked {
    font-size: 10.5px;
    color: var(--warning);
  }

  .rows {
    display: flex;
    flex-direction: column;
    outline: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 24px;
    padding-right: 6px;
    cursor: default;
    user-select: none;
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.picked {
    background: var(--accent-dim);
  }

  .rows:focus-visible .row.picked {
    box-shadow: inset 1px 0 0 var(--accent);
  }

  .dot {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.4);
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

  .pin {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0.45;
  }

  .row:hover .pin {
    opacity: 1;
  }

  .pin.on {
    color: var(--error);
    opacity: 1;
  }

  .section {
    margin: 10px 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }

  .op {
    padding: 3px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .op:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .op:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    padding: 0 6px 0 10px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .count {
    flex: 1;
    font-size: 11px;
    color: var(--text-muted);
  }

  .text-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 6px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .text-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
