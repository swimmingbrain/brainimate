import { applyPatches, enablePatches, setAutoFreeze, type Patch } from 'immer';

enablePatches();
// the renderer caches by object identity and tools clone what they change, frozen objects buy nothing
setAutoFreeze(false);

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  // repeated commits with the same key close together fold into one entry
  key: string | null;
  time: number;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

// a number field drag sends many commits, they should undo as one
export const COALESCE_MS = 400;

// undo as immer patches rather than snapshots
export class History<T extends object> {
  private entries: HistoryEntry[] = [];
  // number of entries that are applied, the ones after it are redo
  private cursor = 0;

  constructor(private limit = 200) {}

  // a lower limit drops the oldest steps right away
  setLimit(limit: number) {
    this.limit = Math.max(1, Math.round(limit));
    const extra = this.entries.length - this.limit;
    if (extra <= 0) return;
    this.entries.splice(0, extra);
    this.cursor = Math.max(0, this.cursor - extra);
  }

  push(label: string, patches: Patch[], inverse: Patch[], key: string | null = null, now = Date.now()): void {
    if (patches.length === 0) return;
    const last = this.entries[this.cursor - 1];
    if (key && last && last.key === key && this.cursor === this.entries.length && now - last.time < COALESCE_MS) {
      last.patches = [...last.patches, ...patches];
      last.inverse = [...inverse, ...last.inverse];
      last.time = now;
      return;
    }
    this.entries.length = this.cursor;
    this.entries.push({ label, patches, inverse, key, time: now });
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    this.cursor = this.entries.length;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.entries.length;
  }

  get undoLabel(): string | null {
    return this.canUndo ? this.entries[this.cursor - 1].label : null;
  }

  get redoLabel(): string | null {
    return this.canRedo ? this.entries[this.cursor].label : null;
  }

  get length(): number {
    return this.entries.length;
  }

  undo(state: T): { state: T; label: string } | null {
    if (!this.canUndo) return null;
    const entry = this.entries[--this.cursor];
    return { state: applyPatches(state, entry.inverse), label: entry.label };
  }

  redo(state: T): { state: T; label: string } | null {
    if (!this.canRedo) return null;
    const entry = this.entries[this.cursor++];
    return { state: applyPatches(state, entry.patches), label: entry.label };
  }

  // the next commit starts a new entry even with the same key
  seal(): void {
    const last = this.entries[this.cursor - 1];
    if (last) last.key = null;
  }

  clear(): void {
    this.entries = [];
    this.cursor = 0;
  }

  snapshot(): HistoryState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel
    };
  }
}
