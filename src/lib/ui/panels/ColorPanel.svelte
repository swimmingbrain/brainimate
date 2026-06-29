<script lang="ts">
  import Panel from '../Panel.svelte';
  import ColorPicker from '../ColorPicker.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import type { Paint } from '$lib/core/types';
  import { cssPaint } from '$lib/core/gradient';
  import { docVersion } from '$lib/editor/editor';
  import { clearColor, setGradientAngle, setPaint, shownPaint, styledItems, swapColors } from '$lib/editor/commands';
  import { colorTarget, fillPaint, frame, selection, strokePaint } from '$lib/stores/app';

  // read again when the document, the selection or the current colors move
  const paints = $derived.by(() => {
    void $docVersion;
    void $selection;
    void $frame;
    void $fillPaint;
    void $strokePaint;
    return { fill: shownPaint('fill'), stroke: shownPaint('stroke'), selected: styledItems().length > 0 };
  });
  const target = $derived($colorTarget);
  const paint = $derived(target === 'fill' ? paints.fill : paints.stroke);

  function chipStyle(p: Paint | null): string {
    const css = cssPaint(p);
    return css ? `--c: ${css}` : '';
  }
</script>

<Panel>
  <div class="head">
    <div class="chips">
      <button
        class="chip stroke"
        class:front={target === 'stroke'}
        class:none={paints.stroke === null}
        style={chipStyle(paints.stroke)}
        title="Stroke"
        aria-label="Stroke"
        aria-pressed={target === 'stroke'}
        onclick={() => colorTarget.set('stroke')}></button>
      <button
        class="chip fill"
        class:front={target === 'fill'}
        class:none={paints.fill === null}
        style={chipStyle(paints.fill)}
        title="Fill"
        aria-label="Fill"
        aria-pressed={target === 'fill'}
        onclick={() => colorTarget.set('fill')}></button>
    </div>
    <div class="what">
      <span class="name">{target === 'fill' ? 'Fill' : 'Stroke'}</span>
      <span class="hint">{paints.selected ? 'Selection' : 'New shapes'}</span>
    </div>
    <button class="icon-btn" title="Swap fill and stroke (Shift+X)" aria-label="Swap fill and stroke" onclick={swapColors}>
      <Icon name="swap" size={14} />
    </button>
    <button class="icon-btn" title="None (/)" aria-label="No color" onclick={clearColor}>
      <Icon name="none" size={14} />
    </button>
  </div>
  <ColorPicker
    {paint}
    allowNone={false}
    onchange={(p) => setPaint(target, p)}
    onangle={paints.selected ? (deg) => setGradientAngle(target, deg) : undefined} />
</Panel>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 6px;
  }

  .chips {
    position: relative;
    width: 38px;
    height: 38px;
    flex-shrink: 0;
  }

  .chip {
    position: absolute;
    width: 26px;
    height: 26px;
    outline: 1px solid var(--border);
    background: repeating-conic-gradient(#9a9aa2 0 25%, #d4d4d8 0 50%) 0 0 / 8px 8px;
  }

  .chip::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--c, #fff);
  }

  .chip.fill {
    left: 0;
    top: 0;
    z-index: 1;
  }

  /* the stroke chip is a thick frame with a hole, like in the other drawing apps */
  .chip.stroke {
    right: 0;
    bottom: 0;
  }

  .chip.stroke::after {
    content: '';
    position: absolute;
    inset: 6px;
    background: var(--bg-surface);
    outline: 1px solid var(--border);
  }

  .chip.front {
    z-index: 2;
    outline-color: var(--text-secondary);
  }

  .chip.none::before {
    background: #fff;
  }

  .chip.fill.none::after,
  .chip.stroke.none::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -4px;
    bottom: -4px;
    inset-inline: auto;
    width: 1.5px;
    margin-left: -0.75px;
    background: var(--error);
    outline: none;
    transform: rotate(45deg);
  }

  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .name {
    font-size: 11.5px;
    color: var(--text-primary);
  }

  .hint {
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
