<script lang="ts">
  import Section from './Section.svelte';
  import Field from '../../Field.svelte';
  import NumberField from '../../NumberField.svelte';
  import SelectField from '../../SelectField.svelte';
  import ToggleField from '../../ToggleField.svelte';
  import { preferences, setGroup } from '$lib/stores/preferences';

  const START = [
    { value: 'last', label: 'The last file' },
    { value: 'blank', label: 'A blank document' }
  ];

  const g = $derived($preferences.general);
</script>

<Section title="Start" help="The welcome dialog still shows when an autosaved copy is waiting to be restored.">
  <Field label="Skip the welcome">
    <ToggleField value={g.skipWelcome} label="Skip the welcome dialog" onchange={(v) => setGroup('general', { skipWelcome: v })} />
  </Field>
  <Field label="Open instead">
    <SelectField
      value={g.startWith}
      options={START}
      disabled={!g.skipWelcome}
      label="What opens instead of the welcome"
      onchange={(v) => setGroup('general', { startWith: v === 'last' ? 'last' : 'blank' })} />
  </Field>
</Section>

<Section title="Saving" help="A copy of the document stays in this browser, the last five of them, in case the tab closes.">
  <Field label="Autosave">
    <ToggleField value={g.autosave} label="Autosave" onchange={(v) => setGroup('general', { autosave: v })} />
  </Field>
  <Field label="After">
    <NumberField
      value={g.autosaveDelay}
      min={1}
      max={60}
      precision={0}
      unit=" s"
      disabled={!g.autosave}
      label="Seconds after the last change"
      onchange={(v) => setGroup('general', { autosaveDelay: v })} />
  </Field>
</Section>

<Section title="Editing">
  <Field label="Undo steps">
    <NumberField
      value={g.undoLimit}
      min={20}
      max={1000}
      step={10}
      precision={0}
      label="Undo steps"
      onchange={(v) => setGroup('general', { undoLimit: v })} />
  </Field>
  <Field label="Confirm deletes" hint="Ask before a layer or a symbol is deleted">
    <ToggleField
      value={g.confirmDelete}
      label="Ask before a layer or a symbol is deleted"
      onchange={(v) => setGroup('general', { confirmDelete: v })} />
  </Field>
</Section>

<Section title="Interface">
  <Field label="Tooltips" hint="Names and keys of the buttons when the pointer rests on them">
    <ToggleField value={g.tooltips} label="Tooltips" onchange={(v) => setGroup('general', { tooltips: v })} />
  </Field>
</Section>
