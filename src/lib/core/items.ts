import type { GroupItem, Item, Mat, PathData, PathItem, Style } from './types';
import { identity, multiply } from './mat';
import { newId } from './ids';
import { pathBounds, transformPath } from './path';
import { emptyBox, fromRect, transformBox, union, type Box } from './bbox';

export function makePathItem(
  name: string,
  path: PathData,
  style: Style,
  transform: Mat = identity(),
  subpaths: PathData[] = []
): PathItem {
  return {
    id: newId(),
    name,
    type: 'path',
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    path,
    subpaths,
    style,
    skin: null
  };
}

// items are plain data, a json round trip is the simplest deep copy and also reads through immer drafts
export function cloneItem<T extends Item>(item: T): T {
  return JSON.parse(JSON.stringify(item)) as T;
}

export function cloneItems(items: Item[]): Item[] {
  return JSON.parse(JSON.stringify(items)) as Item[];
}

// a copy with fresh ids all the way down, for paste and duplicate
export function withNewIds<T extends Item>(item: T): T {
  const copy = cloneItem(item);
  const renew = (it: Item) => {
    it.id = newId();
    if (it.type === 'group') it.children.forEach(renew);
  };
  renew(copy);
  return copy;
}

// a rough box for text until real font metrics arrive with the text tool
function textBox(item: Extract<Item, { type: 'text' }>): Box {
  const lines = item.text.split('\n');
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const w = longest * item.size * 0.55;
  const h = lines.length * item.size * item.lineHeight;
  const x = item.align === 'center' ? -w / 2 : item.align === 'right' ? -w : 0;
  return fromRect(x, 0, w, h);
}

// bounds in the space m maps the item's local space to, tight for paths
export function itemBounds(item: Item, m: Mat): Box {
  switch (item.type) {
    case 'path':
      return pathBounds(transformPath(item.path, m));
    case 'group': {
      let b = emptyBox();
      for (const child of item.children) b = union(b, itemBounds(child, multiply(m, child.transform)));
      return b;
    }
    case 'text':
      return transformBox(textBox(item), m);
    case 'image':
      return transformBox(fromRect(0, 0, item.width, item.height), m);
    default:
      return emptyBox();
  }
}

// bounds in the item's own space, before its transform
export function localBounds(item: Item): Box {
  return itemBounds(item, identity());
}

export interface Found {
  item: Item;
  // the list that holds the item, the keyframe items or a group's children
  list: Item[];
  index: number;
  // outermost group first
  parents: GroupItem[];
}

export function findItem(items: Item[], id: string, parents: GroupItem[] = []): Found | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id === id) return { item, list: items, index: i, parents };
    if (item.type === 'group') {
      const inside = findItem(item.children, id, [...parents, item]);
      if (inside) return inside;
    }
  }
  return null;
}

// the product of the group transforms around an item
export function parentMatrix(parents: GroupItem[]): Mat {
  let m = identity();
  for (const g of parents) m = multiply(m, g.transform);
  return m;
}
