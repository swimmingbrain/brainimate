import { describe, expect, it } from 'vitest';
import { produceWithPatches } from 'immer';
import { History } from './history';

interface State {
  n: number;
  list: number[];
}

function edit(history: History<State>, state: State, label: string, fn: (d: State) => void, key?: string, now?: number) {
  const [next, patches, inverse] = produceWithPatches(state, fn);
  history.push(label, patches, inverse, key ?? null, now);
  return next;
}

describe('History', () => {
  it('undoes and redoes in order', () => {
    const h = new History<State>();
    let s: State = { n: 0, list: [] };
    s = edit(h, s, 'one', (d) => void (d.n = 1));
    s = edit(h, s, 'push', (d) => void d.list.push(5));
    expect(h.undoLabel).toBe('push');
    s = h.undo(s)!.state;
    expect(s).toEqual({ n: 1, list: [] });
    s = h.undo(s)!.state;
    expect(s).toEqual({ n: 0, list: [] });
    expect(h.undo(s)).toBeNull();
    s = h.redo(s)!.state;
    s = h.redo(s)!.state;
    expect(s).toEqual({ n: 1, list: [5] });
  });

  it('drops the redo branch on a new edit', () => {
    const h = new History<State>();
    let s: State = { n: 0, list: [] };
    s = edit(h, s, 'a', (d) => void (d.n = 1));
    s = h.undo(s)!.state;
    s = edit(h, s, 'b', (d) => void (d.n = 2));
    expect(h.canRedo).toBe(false);
    expect(h.length).toBe(1);
  });

  it('folds quick commits with the same key into one entry', () => {
    const h = new History<State>();
    let s: State = { n: 0, list: [] };
    s = edit(h, s, 'width', (d) => void (d.n = 1), 'w', 1000);
    s = edit(h, s, 'width', (d) => void (d.n = 2), 'w', 1200);
    s = edit(h, s, 'width', (d) => void (d.n = 3), 'w', 1500);
    expect(h.length).toBe(1);
    s = edit(h, s, 'width', (d) => void (d.n = 4), 'w', 2500);
    expect(h.length).toBe(2);
    s = h.undo(s)!.state;
    expect(s.n).toBe(3);
    s = h.undo(s)!.state;
    expect(s.n).toBe(0);
    s = h.redo(s)!.state;
    expect(s.n).toBe(3);
  });

  it('keeps no more than the limit', () => {
    const h = new History<State>(3);
    let s: State = { n: 0, list: [] };
    for (let i = 1; i <= 5; i++) s = edit(h, s, 'n', (d) => void (d.n = i));
    expect(h.length).toBe(3);
  });
});
