import { createStore, type UseStore } from 'idb-keyval';

// one store for the autosave, the recent files and the last save time. tests and the server
// have no indexeddb, everything that uses it does nothing there
let store: UseStore | null = null;

export function db(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore('brainimate', 'keyval');
  return store;
}
