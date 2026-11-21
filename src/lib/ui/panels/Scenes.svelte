<script lang="ts">
  import { onMount } from 'svelte';
  import Panel from '../Panel.svelte';
  import Field from '../Field.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { addToast } from '$lib/stores/app';
  import { editor } from '$lib/editor/editor';
  import { insertScene, insertStarter, openScene, saveScene } from '$lib/editor/scenes';
  import { STARTERS } from '$lib/scene/starters';
  import { SCENE_EXT, deleteScene, loadScenes, readSceneFile, renameScene, sceneEntry, sceneFile, scenes, storeScene } from '$lib/scene/library';
  import { pickFiles } from '$lib/editor/importer';
  import { saveBlob } from '$lib/io/save';

  // scenes: ready made places to start in, the open scene kept with everything in it, kept scenes put
  // into this project or opened as new ones

  let name = $state('');
  let busy = $state(false);
  let renaming = $state<string | null>(null);
  let draftName = $state('');

  onMount(() => {
    void loadScenes();
  });

  async function save() {
    busy = true;
    try {
      await saveScene(name.trim() || editor.doc.name || 'Scene');
      name = '';
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The scene could not be saved', 'error');
    } finally {
      busy = false;
    }
  }

  async function insert(id: string) {
    const pkg = await sceneEntry(id);
    if (pkg && insertScene(pkg)) addToast(`${pkg.name} is in the project, under what was there`, 'success', 2200);
  }

  async function open(id: string) {
    const pkg = await sceneEntry(id);
    if (pkg) openScene(pkg);
  }

  async function exportScene(id: string) {
    const pkg = await sceneEntry(id);
    if (!pkg) return;
    await saveBlob(sceneFile(pkg), `${pkg.name}${SCENE_EXT}`, { ext: SCENE_EXT, mime: 'application/json', description: 'brainIMATE scene' }).catch(() => false);
  }

  async function importFile() {
    const files = await pickFiles(`${SCENE_EXT},.json,application/json`, false);
    if (!files[0]) return;
    try {
      const pkg = readSceneFile(await files[0].text());
      await storeScene(pkg);
      addToast(`${pkg.name} is in the scene library`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'The file is not a scene', 'error');
    }
  }

  async function finishRename() {
    const id = renaming;
    renaming = null;
    if (id && draftName.trim()) await renameScene(id, draftName);
  }
</script>

<Panel>
  <h3 class="section">Ready made places</h3>
  <div class="grid">
    {#each STARTERS as s (s.id)}
      <button class="pill" onclick={() => insertStarter(s.id) && addToast(`${s.label} added`, 'success', 1600)}>{s.label}</button>
    {/each}
  </div>
  <p class="note">A room on the background and the furniture on the midground, each piece its own object. In the shop every product can be taken in a hand.</p>

  <h3 class="section">Save this scene</h3>
  <Field label="Name">
    <input class="text" bind:value={name} placeholder={editor.doc.name} aria-label="Scene name" />
  </Field>
  <div class="buttons">
    <button class="btn primary" disabled={busy} onclick={save}><Icon name="save" size={14} /> Save to the scene library</button>
  </div>
  <p class="note">Keeps every layer, the characters with their moves and faces, the objects, the camera with its shots and transitions and the sounds.</p>

  <h3 class="section with-action">
    <span>Scene library</span>
    <button class="link" onclick={importFile}>Open file</button>
  </h3>
  {#if $scenes.length === 0}
    <p class="note">Saved scenes stay here after the browser closes. Insert one into any project or open it as a new one.</p>
  {/if}
  {#each $scenes as entry (entry.id)}
    <div class="entry">
      {#if entry.thumb}<img class="thumb" src={entry.thumb} alt="" width="40" height="72" />{:else}<span class="thumb"></span>{/if}
      <div class="entry-body">
        {#if renaming === entry.id}
          <div class="rename">
            <input class="text" bind:value={draftName} aria-label="New name" onkeydown={(e) => e.key === 'Enter' && finishRename()} />
            <button class="btn" onclick={finishRename}>OK</button>
          </div>
        {:else}
          <span class="entry-name">{entry.name}</span>
          <span class="muted">{entry.layers} layers, {entry.frames} frames</span>
        {/if}
        <div class="entry-actions">
          <button class="btn primary small" onclick={() => insert(entry.id)}>Insert</button>
          <button class="btn small" onclick={() => open(entry.id)}>Open</button>
          <button class="btn small" onclick={() => ((renaming = entry.id), (draftName = entry.name))}>Rename</button>
          <button class="btn small" onclick={() => exportScene(entry.id)}>File</button>
          <button class="btn small danger" aria-label="Delete {entry.name}" onclick={() => deleteScene(entry.id)}><Icon name="trash" size={13} /></button>
        </div>
      </div>
    </div>
  {/each}
</Panel>

<style>
  .btn,
  .pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 36px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .btn.primary {
    color: #111;
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .btn.danger {
    color: var(--error);
  }

  .btn:disabled {
    opacity: 0.5;
  }

  .btn.small {
    min-height: 32px;
    padding: 0 8px;
    font-size: 11.5px;
  }

  .section {
    margin: 10px 8px 6px;
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .with-action {
    justify-content: space-between;
  }

  .link {
    font-family: var(--font-ui);
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
    color: var(--accent);
    min-height: 28px;
  }

  .buttons,
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 8px;
  }

  .grid .pill {
    flex: 1 1 30%;
  }

  .text {
    width: 100%;
    min-height: 30px;
    padding: 0 8px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .rename {
    display: flex;
    gap: 6px;
    padding: 4px 8px;
  }

  .note {
    padding: 0 10px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
  }

  .muted {
    font-size: 11px;
    color: var(--text-muted);
  }

  .entry {
    display: flex;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }

  .thumb {
    width: 48px;
    height: 72px;
    flex-shrink: 0;
    background: #fff;
    border-radius: 4px;
    object-fit: contain;
  }

  .entry-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .entry-name {
    font-size: 12.5px;
    color: var(--text-primary);
  }

  .entry-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
</style>
