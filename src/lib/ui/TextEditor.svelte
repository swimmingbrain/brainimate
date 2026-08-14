<script lang="ts">
  import { onMount } from 'svelte';
  import type { TextItem } from '$lib/core/types';
  import { applyPoint, multiply } from '$lib/core/mat';
  import { cssFamily, fontVersion } from '$lib/core/fonts';
  import { localBounds } from '$lib/core/items';
  import { paintColor } from '$lib/core/style';
  import { docVersion, editor } from '$lib/editor/editor';
  import { endTextEdit, typeText } from '$lib/editor/text';
  import { view } from '$lib/stores/app';

  // a textarea laid over the text being typed, the stage leaves the item out meanwhile
  let { id }: { id: string } = $props();

  let area = $state<HTMLTextAreaElement | null>(null);

  const item = $derived.by((): TextItem | null => {
    void $docVersion;
    void $fontVersion;
    const it = editor.itemById(id, false);
    return it?.type === 'text' ? it : null;
  });

  // where the line boxes are on the screen, with room for the caret on the side the text grows to
  const place = $derived.by(() => {
    if (!item) return null;
    const v = $view;
    const m = multiply([v.zoom, 0, 0, v.zoom, v.panX, v.panY], multiply(editor.base(), editor.worldMatrixOf(id)));
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const b = localBounds(item);
    const room = item.size;
    let left = b.minX;
    let width = b.maxX - b.minX;
    if (item.width === null) {
      if (item.align === 'right') left -= room;
      else if (item.align === 'center') left -= room / 2;
      width += room;
    }
    const p = applyPoint(m, { x: left, y: b.minY });
    const lines = Math.max(1, Math.round((b.maxY - b.minY) / (item.size * item.lineHeight)));
    return {
      x: p.x,
      y: p.y,
      angle: Math.atan2(m[1], m[0]),
      scale,
      width: width * scale,
      height: lines * item.size * item.lineHeight * scale
    };
  });

  const color = $derived.by(() => {
    if (!item) return '#000000';
    return paintColor(item.style.fill) ?? paintColor(item.style.stroke) ?? '#000000';
  });

  // an undo while typing changes the text under the field
  $effect(() => {
    if (area && item && area.value !== item.text) area.value = item.text;
  });

  onMount(() => {
    if (!area) return;
    area.value = item?.text ?? '';
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });

  function onkeydown(e: KeyboardEvent) {
    // the editor's shortcuts stay out while typing
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      area?.blur();
      endTextEdit();
    }
  }
</script>

{#if item && place}
  <textarea
    class="text-editor"
    bind:this={area}
    aria-label="Text"
    spellcheck="false"
    wrap={item.width === null ? 'off' : 'soft'}
    style:left="{place.x}px"
    style:top="{place.y}px"
    style:width="{place.width}px"
    style:height="{place.height}px"
    style:transform="rotate({place.angle}rad)"
    style:font-family={cssFamily(item.font)}
    style:font-size="{item.size * place.scale}px"
    style:font-weight={item.weight}
    style:font-style={item.italic ? 'italic' : 'normal'}
    style:line-height={item.lineHeight}
    style:letter-spacing="{item.spacing * place.scale}px"
    style:text-align={item.align}
    style:white-space={item.width === null ? 'pre' : 'pre-wrap'}
    style:color
    oninput={() => area && typeText(id, area.value)}
    onblur={endTextEdit}
    {onkeydown}></textarea>
{/if}

<style>
  .text-editor {
    position: absolute;
    z-index: 2;
    margin: 0;
    padding: 0;
    border: none;
    outline: 1px dashed var(--accent);
    outline-offset: 2px;
    background: transparent;
    resize: none;
    overflow: hidden;
    transform-origin: 0 0;
    caret-color: var(--accent);
    font-kerning: normal;
  }
</style>
