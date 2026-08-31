<script lang="ts">
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import type { Bone } from '$lib/core/types';
  import { PALETTE } from '$lib/core/palette';
  import { docVersion, editor } from '$lib/editor/editor';
  import {
    canEditRig,
    deleteBone,
    renameBone,
    setBone,
    setBoneRadius,
    setPoseField,
    togglePin,
    type BoneFields
  } from '$lib/editor/rig';
  import { boneSelection, frame } from '$lib/stores/app';
  import { poseOf } from '$lib/rig/bones';

  let { bone }: { bone: Bone } = $props();

  const DEG = 180 / Math.PI;

  // the pose of the bone at the frame shown, the deltas from its rest
  const pose = $derived.by(() => {
    void $docVersion;
    void $frame;
    return poseOf(editor.rig()?.pose ?? {}, bone.id);
  });

  const editable = $derived.by(() => {
    void $docVersion;
    const at = editor.findBone(bone.id);
    return at ? canEditRig(at.layer) : false;
  });

  function set(patch: BoneFields, label: string, key: string) {
    setBone(bone.id, patch, label, key);
  }
</script>

<h3 class="section">Bone</h3>
<Field label="Name">
  <input
    class="text"
    value={bone.name}
    aria-label="Bone name"
    disabled={!editable}
    onchange={(e) => renameBone(bone.id, e.currentTarget.value)} />
</Field>
<Field label="Length">
  <NumberField
    value={bone.length}
    min={1}
    precision={1}
    unit=" px"
    label="Length"
    disabled={!editable}
    onchange={(v) => set({ length: v }, 'Bone length', 'bone-length')} />
</Field>
<Field label="Rotation" hint="At rest, from its parent">
  <NumberField
    value={bone.rotation * DEG}
    min={-360}
    max={360}
    precision={1}
    unit="°"
    label="Rest rotation"
    disabled={!editable}
    onchange={(v) => set({ rotation: v / DEG }, 'Bone rotation', 'bone-rotation')} />
</Field>
<Field label="X" hint="At rest, from its parent's start">
  <NumberField
    value={bone.x}
    precision={1}
    unit=" px"
    label="Rest x"
    disabled={!editable}
    onchange={(v) => set({ x: v }, 'Bone position', 'bone-x')} />
</Field>
<Field label="Y" hint="At rest, from its parent's start">
  <NumberField
    value={bone.y}
    precision={1}
    unit=" px"
    label="Rest y"
    disabled={!editable}
    onchange={(v) => set({ y: v }, 'Bone position', 'bone-y')} />
</Field>
<Field label="Reach" hint="How far the bone reaches out to the drawings when binding">
  <NumberField
    value={bone.radius}
    min={1}
    precision={1}
    unit=" px"
    label="Reach"
    disabled={!editable}
    onchange={(v) => setBoneRadius(bone.id, v)} />
</Field>
<Field label="Pinned">
  <ToggleField value={bone.pinned} label="Pinned" disabled={!editable} onchange={() => togglePin(bone.id)} />
</Field>
<Field label="Color">
  <div class="colors">
    {#each PALETTE as color (color)}
      <button
        class="swatch"
        class:on={bone.color === color}
        style="background: {color}"
        title={color}
        aria-label="Bone color {color}"
        disabled={!editable}
        onclick={() => set({ color }, 'Bone color', 'bone-color')}></button>
    {/each}
  </div>
</Field>

<h3 class="section">Pose on this frame</h3>
<Field label="Rotation" hint="Turned from the rest rotation">
  <NumberField
    value={pose.rotation * DEG}
    min={-720}
    max={720}
    precision={1}
    unit="°"
    label="Pose rotation"
    disabled={!editable}
    onchange={(v) => setPoseField(bone.id, { rotation: v / DEG }, 'pose-rotation')} />
</Field>
<Field label="X" hint="Moved from the rest place">
  <NumberField
    value={pose.x}
    precision={1}
    unit=" px"
    label="Pose x"
    disabled={!editable}
    onchange={(v) => setPoseField(bone.id, { x: v }, 'pose-x')} />
</Field>
<Field label="Y" hint="Moved from the rest place">
  <NumberField
    value={pose.y}
    precision={1}
    unit=" px"
    label="Pose y"
    disabled={!editable}
    onchange={(v) => setPoseField(bone.id, { y: v }, 'pose-y')} />
</Field>
<div class="ops">
  <button class="op" onclick={() => boneSelection.set(null)}>Done</button>
  <button class="op danger" disabled={!editable} onclick={() => deleteBone(bone.id)}>Delete bone</button>
</div>

<style>
  .section {
    margin: 8px 8px 4px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .text {
    width: 100%;
    padding: 3px 6px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    outline: none;
  }

  .text:focus {
    border-color: var(--accent);
  }

  .colors {
    display: flex;
    gap: 3px;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border: 1px solid rgba(0, 0, 0, 0.4);
  }

  .swatch.on {
    outline: 1px solid var(--text-primary);
    outline-offset: 1px;
  }

  .ops {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
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

  .op.danger:hover:not(:disabled) {
    color: var(--error);
  }

  .op:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
