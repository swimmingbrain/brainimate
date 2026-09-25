<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import { shortcutOf } from '$lib/editor/actions';
  import { keyLabel } from '$lib/editor/keys';
  import { preferences } from '$lib/stores/preferences';

  let { onclose }: { onclose: () => void } = $props();

  // the key a step talks about, as it is set now
  function key(id: string): string {
    const k = shortcutOf(id, $preferences.shortcuts);
    return k ? keyLabel(k) : 'the toolbar';
  }

  const steps = $derived([
    {
      title: 'Draw',
      text: `Pick the brush (${key('tool.brush')}) or the pen (${key('tool.pen')}) and draw on the stage.`,
      svg: '<path d="M8 30c8-14 16-18 22-10s14 6 20-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="50" cy="12" r="2.5" fill="currentColor"/>'
    },
    {
      title: 'Select and bend',
      text: `With the selection tool (${key('tool.select')}) drag a shape to move it, drag its edge to bend it.`,
      svg: '<path d="M10 32Q30 6 50 32" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 32Q30 20 50 32" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2" opacity=".5"/><path d="M28 14v9l2.5-2.4 1.8 3.8 1.6-.7-1.7-3.7H35z" fill="currentColor"/>'
    },
    {
      title: 'Keyframes',
      text: `Go to a later frame and press ${key('timeline.keyframe')} for a keyframe, then change the drawing there.`,
      svg: '<rect x="4" y="16" width="52" height="10" fill="none" stroke="currentColor" stroke-opacity=".4"/><circle cx="10" cy="21" r="3" fill="currentColor"/><circle cx="46" cy="21" r="3" fill="currentColor"/>'
    },
    {
      title: 'Tween',
      text: 'Right click the frames between two keyframes and pick Create tween, the drawing moves on its own.',
      svg: '<rect x="4" y="16" width="52" height="10" fill="currentColor" fill-opacity=".25" stroke="currentColor"/><circle cx="10" cy="21" r="3" fill="currentColor"/><path d="M16 21h22m-4-3 4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="46" cy="21" r="3" fill="currentColor"/>'
    },
    {
      title: 'Bones',
      text: `Click joint after joint with the bone tool (${key('tool.bone')}), then drag a joint with the selection tool to pose.`,
      svg: '<path d="M10 32 26 18 44 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="10" cy="32" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="26" cy="18" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="44" cy="24" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    },
    {
      title: 'Export',
      text: `Press ${key('file.export')} for a GIF, a video, PNG frames, SVG or a sprite sheet.`,
      svg: '<rect x="12" y="8" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M30 21h18m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    }
  ]);
</script>

<Dialog title="Getting started" description="Six steps from an empty stage to a moving drawing." width={620} {onclose}>
  <ol class="steps">
    {#each steps as step, i (step.title)}
      <li class="step">
        <svg class="art" viewBox="0 0 60 42" width="60" height="42" aria-hidden="true">{@html step.svg}</svg>
        <div class="text">
          <span class="title"><span class="num">{i + 1}</span>{step.title}</span>
          <span class="line">{step.text}</span>
        </div>
      </li>
    {/each}
  </ol>
  {#snippet footer()}
    <button class="dialog-btn primary" onclick={onclose}>Got it</button>
  {/snippet}
</Dialog>

<style>
  .steps {
    list-style: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .art {
    flex-shrink: 0;
    color: var(--accent);
    background: var(--bg-deep);
    border: 1px solid var(--border);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .num {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--accent);
  }

  .line {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover {
    background: var(--accent-hover);
  }

  @media (max-width: 560px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
