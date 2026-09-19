<script lang="ts">
  import Logo from './Logo.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { redo, showDocumentSettings, undo } from '$lib/editor/commands';
  import { openPalette, openPreferences, shortcutOf } from '$lib/editor/actions';
  import { keyLabel } from '$lib/editor/keys';
  import { preferences } from '$lib/stores/preferences';

  // the name of a button with the key it answers to now
  function tip(name: string, id: string): string {
    const key = shortcutOf(id, $preferences.shortcuts);
    return key ? `${name} (${keyLabel(key)})` : name;
  }
  import { openDocument, save } from '$lib/io/files';
  import { dialog, dirty, docName } from '$lib/stores/app';
  import { BUILTIN_WORKSPACES, setWorkspace, workspace } from '$lib/stores/workspace';
  import { historyState } from '$lib/editor/editor';
</script>

<div class="topbar">
  <div class="topbar-left">
    <div class="logo" title="brainIMATE">
      <span class="logo-icon"><Logo size={20} /></span>
      <span class="logo-text">brainIMATE</span>
    </div>
    <span class="separator"></span>
    <div class="file-info">
      <button class="filename" title="{$docName}, document settings" onclick={showDocumentSettings}>{$docName}</button>
      <span class="save-dot" class:dirty={$dirty} title={$dirty ? 'Unsaved changes' : 'Saved'}></span>
    </div>
  </div>

  <div class="workspaces">
    {#each BUILTIN_WORKSPACES as ws (ws.id)}
      <button class="tool-btn" class:active={$workspace === ws.id} title="{ws.name} workspace" onclick={() => setWorkspace(ws.id)}>
        {ws.name}
      </button>
    {/each}
  </div>

  <div class="topbar-actions">
    <button class="action-btn" onclick={openDocument} title={tip('Open a file', 'file.open')}>
      <Icon name="open" size={14} />
      <span>Open</span>
    </button>
    <button class="action-btn" onclick={() => save()} title={tip('Save', 'file.save')}>
      <Icon name="save" size={14} />
      <span>Save</span>
    </button>
    <span class="separator"></span>
    <button
      class="action-btn icon-only"
      onclick={undo}
      disabled={!$historyState.canUndo}
      title={tip($historyState.undoLabel ? `Undo ${$historyState.undoLabel.toLowerCase()}` : 'Undo', 'edit.undo')}
      aria-label="Undo">
      <Icon name="undo" size={14} />
    </button>
    <button
      class="action-btn icon-only"
      onclick={redo}
      disabled={!$historyState.canRedo}
      title={tip($historyState.redoLabel ? `Redo ${$historyState.redoLabel.toLowerCase()}` : 'Redo', 'edit.redo')}
      aria-label="Redo">
      <Icon name="redo" size={14} />
    </button>
    <span class="separator"></span>
    <button
      class="action-btn icon-only"
      onclick={openPalette}
      title={tip('Command palette', 'edit.palette')}
      aria-label="Command palette">
      <Icon name="command" size={14} />
    </button>
    <button
      class="action-btn icon-only"
      onclick={openPreferences}
      title={tip('Preferences', 'edit.preferences')}
      aria-label="Preferences">
      <Icon name="settings" size={14} />
    </button>
    <a
      class="action-btn icon-only"
      href="https://github.com/swimmingbrain/brainimate"
      target="_blank"
      rel="noopener"
      title="GitHub"
      aria-label="GitHub">
      <Icon name="github" size={14} />
    </a>
    <button class="action-btn accent" onclick={() => dialog.set({ kind: 'export' })} title={tip('Export', 'file.export')}>
      <Icon name="export" size={14} />
      <span>Export</span>
    </button>
  </div>
</div>

<style>
  .topbar {
    height: var(--topbar-h);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    flex-shrink: 0;
    gap: 10px;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    user-select: none;
  }

  .logo-icon {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-text {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 16px;
    color: var(--text-primary);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .filename {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-editor);
    padding: 1px 4px;
    min-width: 0;
  }

  .filename:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .save-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--success);
  }

  .save-dot.dirty {
    background: var(--accent);
  }

  .workspaces {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 10px;
    color: var(--text-secondary);
    font-size: 11.5px;
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tool-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
    justify-content: flex-end;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .action-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .action-btn.accent {
    margin-left: 4px;
    background: var(--accent);
    color: #111;
  }

  .action-btn.accent:hover {
    background: var(--accent-hover);
    color: #111;
  }

  .action-btn.icon-only {
    padding: 5px 7px;
  }

  .separator {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 3px;
    flex-shrink: 0;
  }

  /* the labels go first on a narrow window, the icons carry the meaning on their own */
  .action-btn span {
    display: none;
  }

  @media (min-width: 900px) {
    .action-btn span {
      display: inline;
    }
  }

  @media (max-width: 760px) {
    .workspaces {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .logo-text,
    .file-info,
    .topbar-left .separator {
      display: none;
    }
  }
</style>
