<script lang="ts">
  import Section from './Section.svelte';
  import Field from '../../Field.svelte';
  import SelectField from '../../SelectField.svelte';
  import Icon from '$lib/icons/Icon.svelte';
  import { TOOL_IDS, TOOL_INFO, type ToolId } from '$lib/tools/tool';
  import { keysOf } from '$lib/editor/actions';
  import { keyLabel } from '$lib/editor/keys';
  import { preferences, setGroup } from '$lib/stores/preferences';

  // the height of one row, the drag counts rows by it
  const ROW = 30;

  const SIDES = [
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' }
  ];
  const SIZES = [
    { value: 'normal', label: 'Normal' },
    { value: 'small', label: 'Small' }
  ];

  const tb = $derived($preferences.toolbar);
  const order = $derived(tb.order);

  // the row being dragged: where it came from, where it would land and how far the pointer went
  let drag = $state<{ id: ToolId; from: number; to: number; dy: number; startY: number } | null>(null);

  function keyOf(id: ToolId): string {
    const key = keysOf(`tool.${id}`, $preferences.shortcuts)[0];
    return key ? keyLabel(key) : '';
  }

  function setOrder(next: ToolId[]) {
    setGroup('toolbar', { order: next });
  }

  function moveTool(from: number, to: number) {
    if (from === to) return;
    const next = [...order];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
  }

  function toggle(id: ToolId, shown: boolean) {
    const hidden = shown ? tb.hidden.filter((t) => t !== id) : [...tb.hidden, id];
    setGroup('toolbar', { hidden });
  }

  function onpointerdown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { id: order[i], from: i, to: i, dy: 0, startY: e.clientY };
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const to = Math.max(0, Math.min(order.length - 1, drag.from + Math.round(dy / ROW)));
    drag = { ...drag, dy, to };
  }

  function onpointerup() {
    if (!drag) return;
    const { from, to } = drag;
    drag = null;
    moveTool(from, to);
  }

  // alt with the arrows moves the tool from the keyboard
  function onkeydown(e: KeyboardEvent, i: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    e.stopPropagation();
    const to = Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)));
    moveTool(i, to);
    const target = e.currentTarget as HTMLElement;
    queueMicrotask(() => target.closest('.list')?.querySelectorAll<HTMLElement>('.grip')[to]?.focus());
  }

  // the rows between the dragged one and its landing place step aside by one row
  function offset(i: number): number {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -ROW;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return ROW;
    return 0;
  }

  // a line where the group of the tool changes, like in the toolbar
  function newGroup(i: number): boolean {
    return i > 0 && TOOL_INFO[order[i - 1]].group !== TOOL_INFO[order[i]].group;
  }

  function resetOrder() {
    setGroup('toolbar', { order: [...TOOL_IDS], hidden: [] });
  }
</script>

<Section title="Toolbar">
  <Field label="Side">
    <SelectField
      value={tb.side}
      options={SIDES}
      label="Toolbar side"
      onchange={(v) => setGroup('toolbar', { side: v === 'right' ? 'right' : 'left' })} />
  </Field>
  <Field label="Buttons">
    <SelectField
      value={tb.buttons}
      options={SIZES}
      label="Toolbar button size"
      onchange={(v) => setGroup('toolbar', { buttons: v === 'small' ? 'small' : 'normal' })} />
  </Field>
</Section>

<Section title="Tools" help="Drag a tool by its grip to move it, Alt with the arrows does it from the keyboard. Hidden tools keep their keys.">
  <div class="list" class:dragging={drag !== null} role="list">
    {#each order as id, i (id)}
      <div
        class="row"
        class:lifted={drag?.from === i}
        class:hidden={tb.hidden.includes(id)}
        class:sep={newGroup(i)}
        role="listitem"
        style="transform: translateY({offset(i)}px)">
        <button
          class="grip"
          title="Drag to move {TOOL_INFO[id].name}"
          aria-label="Move {TOOL_INFO[id].name}, Alt and the arrows"
          onpointerdown={(e) => onpointerdown(e, i)}
          {onpointermove}
          {onpointerup}
          onpointercancel={onpointerup}
          onkeydown={(e) => onkeydown(e, i)}>
          <Icon name="grip" size={14} />
        </button>
        <label class="check">
          <input
            type="checkbox"
            checked={!tb.hidden.includes(id)}
            onchange={(e) => toggle(id, e.currentTarget.checked)} />
          <span class="icon"><Icon name={TOOL_INFO[id].icon} size={14} /></span>
          <span class="name">{TOOL_INFO[id].name}</span>
        </label>
        <span class="key">{keyOf(id)}</span>
      </div>
    {/each}
  </div>
  <div class="actions">
    <button class="small-btn" onclick={resetOrder}>Reset to default</button>
  </div>
</Section>

<style>
  .list {
    position: relative;
    display: flex;
    flex-direction: column;
    margin: 0 8px;
    border: 1px solid var(--border);
    background: var(--bg-deep);
    user-select: none;
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px 0 2px;
    background: var(--bg-deep);
    transition: transform 120ms ease;
  }

  /* a line on top that takes no height, the drag counts rows of the same size */
  .row.sep::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: var(--border);
  }

  .dragging .row.lifted {
    z-index: 2;
    transition: none;
    background: var(--bg-elevated);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .row.hidden .icon,
  .row.hidden .name {
    opacity: 0.45;
  }

  .grip {
    width: 22px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: grab;
    touch-action: none;
  }

  .dragging .grip {
    cursor: grabbing;
  }

  .grip:hover {
    color: var(--text-primary);
  }

  .check {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .check input {
    accent-color: var(--accent);
    cursor: pointer;
  }

  .icon {
    display: flex;
    color: var(--text-secondary);
  }

  .name {
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .key {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .actions {
    padding: 8px 8px 0;
  }

  .small-btn {
    padding: 4px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .small-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
