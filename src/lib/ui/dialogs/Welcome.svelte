<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import NewDocForm from '../NewDocForm.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { version } from '$lib/version';
  import { recentFiles, removeRecent } from '$lib/io/recent';
  import { autosaveOffer } from '$lib/io/autosave';
  import { confirmDiscard, createDocument, openDocument, openRecent, restoreAutosave } from '$lib/io/files';
  import { preferences, setGroup } from '$lib/stores/preferences';

  let { onclose }: { onclose: () => void } = $props();

  function create(width: number, height: number, fps: number, bg: string) {
    confirmDiscard(() => createDocument(width, height, fps, bg), 'Start a new document');
  }

  // today only shows the time, older ones the day too
  function when(time: number): string {
    const d = new Date(time);
    const today = new Date().toDateString() === d.toDateString();
    if (today) return `today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<Dialog
  title="Welcome to brainIMATE"
  description="Start a new document or pick up where you left off."
  width={760}
  {onclose}>
  <div class="columns">
    <section class="col">
      <h3 class="section">New document</h3>
      <NewDocForm oncreate={create} />
    </section>
    <section class="col">
      {#if $autosaveOffer}
        {@const snap = $autosaveOffer}
        <button class="restore" onclick={() => restoreAutosave(snap)}>
          <Icon name="undo" size={14} />
          <span class="restore-text">
            <span class="restore-title">{snap.name}</span>
            <span class="restore-time">Autosaved {when(snap.time)}, not saved to a file</span>
          </span>
          <span class="restore-go">Restore</span>
        </button>
      {/if}
      <div class="col-head">
        <h3 class="section">Recent files</h3>
        <button class="open" onclick={openDocument}>
          <Icon name="open" size={13} />
          Open file...
        </button>
      </div>
      {#if $recentFiles.length === 0}
        <p class="empty">Files you open or save show up here.</p>
      {:else}
        <ul class="recent">
          {#each $recentFiles as file (file.time + file.name)}
            <li>
              <button class="recent-item" onclick={() => openRecent(file)} title={file.name}>
                {#if file.thumbnail}
                  <img class="thumb" src={file.thumbnail} alt="" width="80" height="45" />
                {:else}
                  <span class="thumb"></span>
                {/if}
                <span class="recent-text">
                  <span class="recent-name">{file.name}</span>
                  <span class="recent-time">{when(file.time)}</span>
                </span>
              </button>
              <button
                class="forget"
                onclick={() => removeRecent(file)}
                title="Take it off the list, the file stays"
                aria-label="Remove {file.name} from the list">
                <Icon name="close" size={12} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
  {#snippet footer()}
    <div class="foot">
      <span class="version">brainIMATE {version}</span>
      <label class="skip" title="The preferences bring it back, General, Start">
        <input
          type="checkbox"
          checked={$preferences.general.skipWelcome}
          onchange={(e) => setGroup('general', { skipWelcome: e.currentTarget.checked })} />
        Don't show again
      </label>
      <a href="https://github.com/swimmingbrain/brainimate" target="_blank" rel="noopener" class="github">
        <Icon name="github" size={12} /> GitHub
      </a>
    </div>
  {/snippet}
</Dialog>

<style>
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 24px;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .section {
    padding-bottom: 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .col-head {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .col-head .section {
    flex: 1;
  }

  .open {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    margin-bottom: 3px;
    font-size: 11.5px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
  }

  .open:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .restore {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    text-align: left;
    color: var(--warning);
    background: rgba(229, 192, 123, 0.08);
    border: 1px solid rgba(229, 192, 123, 0.35);
  }

  .restore:hover {
    background: rgba(229, 192, 123, 0.14);
  }

  .restore-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .restore-title {
    font-size: 12.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .restore-time {
    font-size: 11px;
    color: var(--text-muted);
  }

  .restore-go {
    font-size: 11.5px;
    font-weight: 500;
  }

  .empty {
    padding: 16px 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  .recent {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 330px;
    overflow-y: auto;
  }

  .recent li {
    position: relative;
  }

  .recent-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px;
    text-align: left;
    color: var(--text-secondary);
  }

  .recent-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .forget {
    position: absolute;
    top: 50%;
    right: 6px;
    width: 22px;
    height: 22px;
    margin-top: -11px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0;
  }

  .recent li:hover .forget,
  .forget:focus-visible {
    opacity: 1;
  }

  .forget:hover {
    color: var(--text-primary);
    background: var(--bg-elevated);
  }

  .thumb {
    width: 80px;
    height: 45px;
    flex-shrink: 0;
    object-fit: contain;
    background: var(--bg-deep);
    border: 1px solid var(--border);
  }

  .recent-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .recent-name {
    font-size: 12.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-time {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .foot {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .skip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    margin-right: 16px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .skip input {
    accent-color: var(--accent);
  }

  .github {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  @media (max-width: 640px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
