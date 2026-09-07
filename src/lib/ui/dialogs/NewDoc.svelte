<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import NewDocForm from '../NewDocForm.svelte';
  import { confirmDiscard, createDocument } from '$lib/io/files';

  let { onclose }: { onclose: () => void } = $props();

  function create(width: number, height: number, fps: number, bg: string) {
    confirmDiscard(() => createDocument(width, height, fps, bg), 'Start a new document');
  }
</script>

<Dialog title="New document" description="Pick a size to start from." width={400} {onclose}>
  <NewDocForm oncreate={create} />
</Dialog>
