import { get } from 'svelte/store';
import { preferences } from '$lib/stores/preferences';

// the tooltips are the browser's own titles. with them off, the titles under the pointer move into
// data-tip until they are on again, so nothing pops up and the buttons keep their names
export function installTooltips(): () => void {
  const onover = (e: Event) => {
    const on = get(preferences).general.tooltips;
    for (let el = e.target instanceof Element ? e.target : null; el; el = el.parentElement) {
      if (on && el.hasAttribute('data-tip')) {
        if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('data-tip') ?? '');
        el.removeAttribute('data-tip');
      } else if (!on && el.hasAttribute('title')) {
        el.setAttribute('data-tip', el.getAttribute('title') ?? '');
        el.removeAttribute('title');
      }
    }
  };
  document.addEventListener('pointerover', onover, true);
  return () => document.removeEventListener('pointerover', onover, true);
}
