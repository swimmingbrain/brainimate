// how well a typed query matches a name: every letter of the query in order, more for letters that
// start a word or follow each other, null when it does not match at all
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  // the whole query in one piece beats letters spread over the name
  const whole = t.indexOf(q);
  if (whole >= 0) return 100 - whole - t.length * 0.1 + (whole === 0 || t[whole - 1] === ' ' ? 20 : 0);
  let score = 0;
  let from = 0;
  let last = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = t.indexOf(ch, from);
    if (at < 0) return null;
    const wordStart = at === 0 || t[at - 1] === ' ' || t[at - 1] === '-';
    score += 1 + (wordStart ? 4 : 0) + (at === last + 1 ? 3 : 0);
    last = at;
    from = at + 1;
  }
  return score - t.length * 0.1;
}

// the items that match, best first, the order they came in breaks ties
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query.trim()) return items;
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = fuzzyScore(query, text(item));
    if (score !== null) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.item);
}
