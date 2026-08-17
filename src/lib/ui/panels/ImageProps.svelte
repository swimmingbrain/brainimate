<script lang="ts">
  import Field from '../Field.svelte';
  import NumberField from '../NumberField.svelte';
  import ToggleField from '../ToggleField.svelte';
  import type { ImageItem, Item } from '$lib/core/types';
  import { makeAsset } from '$lib/core/assets';
  import { docVersion, editor } from '$lib/editor/editor';
  import { IMAGE_ACCEPT, pickFiles, readPicture } from '$lib/editor/importer';
  import { addToast } from '$lib/stores/app';

  // the size of the selected pictures, and another picture in the place of one
  let { items }: { items: ImageItem[] } = $props();

  const first = $derived(items[0]);
  const asset = $derived.by(() => {
    void $docVersion;
    return editor.doc.assets[first.asset] ?? null;
  });

  // kept per panel, most of the time a picture should not get squashed
  let lockRatio = $state(true);

  function set(fn: (item: ImageItem) => void, label: string, key: string) {
    editor.updateItems(
      items.map((it) => it.id),
      (item: Item) => {
        if (item.type === 'image') fn(item);
      },
      label,
      key
    );
  }

  function setWidth(v: number) {
    set(
      (it) => {
        if (lockRatio && it.width > 0) it.height = (it.height * v) / it.width;
        it.width = v;
      },
      'Image size',
      'image-size'
    );
  }

  function setHeight(v: number) {
    set(
      (it) => {
        if (lockRatio && it.height > 0) it.width = (it.width * v) / it.height;
        it.height = v;
      },
      'Image size',
      'image-size'
    );
  }

  // the new picture keeps the width, its own shape decides the height
  async function replace() {
    const [file] = await pickFiles(IMAGE_ACCEPT, false);
    if (!file) return;
    try {
      const pic = await readPicture(file);
      const next = makeAsset('image', file.name, pic.data);
      editor.commit('Replace image', (draft) => {
        if (!draft.assets[next.id]) draft.assets[next.id] = next;
      });
      set(
        (it) => {
          it.asset = next.id;
          it.name = file.name;
          if (pic.width > 0) it.height = (it.width * pic.height) / pic.width;
        },
        'Replace image',
        'image-replace'
      );
    } catch {
      addToast(`${file.name} could not be read as a picture`, 'error');
    }
  }
</script>

<h3 class="section">Image</h3>
{#if asset}
  <Field label="File">
    <span class="value" title={asset.name}>{asset.name}</span>
  </Field>
{/if}
<Field label="Width">
  <NumberField
    value={first.width}
    min={1}
    max={20000}
    precision={1}
    unit=" px"
    label="Image width"
    onchange={setWidth} />
</Field>
<Field label="Height">
  <NumberField
    value={first.height}
    min={1}
    max={20000}
    precision={1}
    unit=" px"
    label="Image height"
    onchange={setHeight} />
</Field>
<Field label="Lock ratio">
  <ToggleField value={lockRatio} label="Lock ratio" onchange={(on) => (lockRatio = on)} />
</Field>
<div class="actions">
  <button class="action" onclick={replace}>Replace image...</button>
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

  .value {
    min-width: 0;
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    padding: 4px 8px;
  }

  .action {
    padding: 3px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .action:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
</style>
