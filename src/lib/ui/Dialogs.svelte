<script lang="ts">
  import Preferences from './dialogs/Preferences.svelte';
  import Shortcuts from './dialogs/Shortcuts.svelte';
  import About from './dialogs/About.svelte';
  import Confirm from './dialogs/Confirm.svelte';
  import ConvertSymbol from './dialogs/ConvertSymbol.svelte';
  import Welcome from './dialogs/Welcome.svelte';
  import NewDoc from './dialogs/NewDoc.svelte';
  import DocSettings from './dialogs/DocSettings.svelte';
  import Export from './dialogs/Export.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import GettingStarted from './dialogs/GettingStarted.svelte';
  import { dialog } from '$lib/stores/app';

  function close() {
    dialog.set(null);
  }
</script>

{#if $dialog}
  {#key $dialog}
    {#if $dialog.kind === 'preferences'}
      <Preferences category={$dialog.category} onclose={close} />
    {:else if $dialog.kind === 'shortcuts'}
      <Shortcuts onclose={close} />
    {:else if $dialog.kind === 'palette'}
      <CommandPalette onclose={close} />
    {:else if $dialog.kind === 'getting-started'}
      <GettingStarted onclose={close} />
    {:else if $dialog.kind === 'about'}
      <About onclose={close} />
    {:else if $dialog.kind === 'confirm'}
      <Confirm
        title={$dialog.title}
        message={$dialog.message}
        confirm={$dialog.confirm}
        danger={$dialog.danger}
        onconfirm={$dialog.onconfirm}
        onclose={close} />
    {:else if $dialog.kind === 'symbol'}
      <ConvertSymbol onclose={close} />
    {:else if $dialog.kind === 'welcome'}
      <Welcome onclose={close} />
    {:else if $dialog.kind === 'new-doc'}
      <NewDoc onclose={close} />
    {:else if $dialog.kind === 'doc-settings'}
      <DocSettings onclose={close} />
    {:else if $dialog.kind === 'export'}
      <Export onclose={close} />
    {/if}
  {/key}
{/if}
