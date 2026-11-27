/**
 * shortcutLabels.ts
 * Generates spreadsheet-style alphabetical shortcut labels for card collection.
 * Card 1 → A, Card 26 → Z, Card 27 → AA, Card 52 → AZ, Card 53 → BA, etc.
 * This mirrors Excel column naming exactly.
 */

export function indexToShortcut(oneBased: number): string {
  let result = '';
  let n = oneBased;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

export function shortcutToIndex(label: string): number {
  const upper = label.toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i) - 64; // A=1, B=2, ...
    if (code < 1 || code > 26) return -1; // invalid character
    result = result * 26 + code;
  }
  return result; // 1-based index
}

/** Returns all valid prefixes given a full label set */
export function isValidPrefix(input: string, totalCards: number): boolean {
  const upper = input.toUpperCase();
  for (let i = 1; i <= totalCards; i++) {
    const lbl = indexToShortcut(i);
    if (lbl.startsWith(upper)) return true;
  }
  return false;
}

/** Returns whether the label exactly matches a valid card index */
export function isExactMatch(input: string, totalCards: number): boolean {
  const idx = shortcutToIndex(input);
  return idx >= 1 && idx <= totalCards;
}

/** Builds a map of shortcut → card index (1-based) for quick lookup */
export function buildShortcutMap(totalCards: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i <= totalCards; i++) {
    map.set(indexToShortcut(i), i);
  }
  return map;
}

/** How many characters can a shortcut have for N cards? */
export function maxShortcutLength(totalCards: number): number {
  return indexToShortcut(totalCards).length;
}
