import type { Doc, InstanceItem, Item, Layer, Symbol } from './types';
import { newId } from './ids';
import { multiply } from './mat';
import { withNewIds } from './items';
import { instanceSlices } from '$lib/render/frame';

// every item of a list, groups opened
export function walkItems(items: Item[], fn: (item: Item) => void) {
  for (const item of items) {
    fn(item);
    if (item.type === 'group') walkItems(item.children, fn);
  }
}

// every item of every keyframe of the layers, groups opened
export function eachItem(layers: Layer[], fn: (item: Item) => void) {
  for (const layer of layers) for (const key of layer.keyframes) walkItems(key.items, fn);
}

// the next free 'Symbol 3' like name
export function nextSymbolName(symbols: Record<string, Symbol>, base = 'Symbol'): string {
  let n = 0;
  const pattern = new RegExp(`^${base} (\\d+)$`);
  for (const s of Object.values(symbols)) {
    const m = pattern.exec(s.name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${base} ${n + 1}`;
}

// how many instances show each symbol, on the main timeline and inside other symbols. an instance
// held over several keyframes keeps its id, so it counts once
export function useCounts(doc: Doc): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const count = (layers: Layer[], scope: string) =>
    eachItem(layers, (item) => {
      if (item.type !== 'instance') return;
      const key = `${scope}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      counts.set(item.symbol, (counts.get(item.symbol) ?? 0) + 1);
    });
  count(doc.layers, '');
  for (const s of Object.values(doc.symbols)) count(s.layers, s.id);
  return counts;
}

export function symbolUses(doc: Doc, id: string): number {
  return useCounts(doc).get(id) ?? 0;
}

// the symbols an instance of from shows somewhere inside, nested ones too
export function nestedSymbols(symbols: Record<string, Symbol>, from: string): Set<string> {
  const found = new Set<string>();
  const visit = (id: string) => {
    const symbol = symbols[id];
    if (!symbol) return;
    eachItem(symbol.layers, (item) => {
      if (item.type !== 'instance' || found.has(item.symbol)) return;
      found.add(item.symbol);
      visit(item.symbol);
    });
  };
  visit(from);
  return found;
}

// an instance of symbol placed inside target would end up inside itself
export function makesLoop(symbols: Record<string, Symbol>, symbol: string, target: string): boolean {
  return symbol === target || nestedSymbols(symbols, symbol).has(target);
}

// the instances among some items, groups opened
export function instancesIn(items: Item[]): InstanceItem[] {
  const out: InstanceItem[] = [];
  const walk = (list: Item[]) => {
    for (const item of list) {
      if (item.type === 'instance') out.push(item);
      else if (item.type === 'group') walk(item.children);
    }
  };
  walk(items);
  return out;
}

// a copy with a new id and new item ids, the same new id for an item in every keyframe of a layer
export function copySymbol(symbol: Symbol, name: string): Symbol {
  const copy = JSON.parse(JSON.stringify(symbol)) as Symbol;
  copy.id = newId();
  copy.name = name;
  const layerIds = new Map(copy.layers.map((l) => [l.id, newId()]));
  for (const layer of copy.layers) {
    layer.id = layerIds.get(layer.id)!;
    if (layer.parent) layer.parent = layerIds.get(layer.parent) ?? null;
    const ids = new Map<string, string>();
    const renew = (items: Item[]) => {
      for (const item of items) {
        if (!ids.has(item.id)) ids.set(item.id, newId());
        item.id = ids.get(item.id)!;
        if (item.type === 'group') renew(item.children);
      }
    };
    for (const key of layer.keyframes) renew(key.items);
  }
  return copy;
}

// what an instance shows on its frame as plain items with new ids, for break apart. the instance
// matrix and alpha go into each of them
export function instanceParts(item: InstanceItem, offset: number): Item[] {
  const out: Item[] = [];
  for (const slice of instanceSlices(item, offset)) {
    for (const child of slice.items) {
      const part = withNewIds(child);
      part.transform = multiply(item.transform, child.transform);
      part.opacity = child.opacity * item.opacity * item.alpha;
      out.push(part);
    }
  }
  return out;
}
