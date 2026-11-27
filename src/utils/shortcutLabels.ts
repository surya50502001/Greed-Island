/**
 * shortcutLabels.ts
 * Generates spreadsheet-style alphabetical shortcut labels for the card collection
 * while reserving 'G' exclusively for opening/closing the Grimoire.
 *
 * Alphabet (25 letters, skipping G): A-F, H-Z
 *   Card 1  → A
 *   Card 6  → F
 *   Card 7  → H
 *   Card 25 → Z
 *   Card 26 → AA
 *   Card 50 → AZ
 *   Card 51 → BA
 */

export const SHORTCUT_ALPHABET = 'ABCDEFHIJKLMNOPQRSTUVWXYZ';
const BASE = SHORTCUT_ALPHABET.length; // 25

export function indexToShortcut(oneBased: number): string {
  if (!Number.isInteger(oneBased) || oneBased < 1) return '';
  let result = '';
  let n = oneBased;
  while (n > 0) {
    n--;
    result = SHORTCUT_ALPHABET[n % BASE] + result;
    n = Math.floor(n / BASE);
  }
  return result;
}

export function shortcutToIndex(label: string): number {
  if (!label) return -1;
  const upper = label.toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    const idx = SHORTCUT_ALPHABET.indexOf(upper[i]);
    if (idx === -1) return -1; // rejects 'G' and any non-shortcut character
    result = result * BASE + (idx + 1);
  }
  return result; // 1-based index
}

/** Returns whether input is a valid non-empty prefix of any shortcut in [1..totalCards] */
export function isValidPrefix(input: string, totalCards: number): boolean {
  if (!input || totalCards < 1) return false;
  const upper = input.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    if (SHORTCUT_ALPHABET.indexOf(upper[i]) === -1) return false;
  }
  for (let i = 1; i <= totalCards; i++) {
    const lbl = indexToShortcut(i);
    if (lbl.startsWith(upper)) return true;
  }
  return false;
}

/** Returns whether the label exactly matches a valid card index in [1..totalCards] */
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
  if (totalCards < 1) return 0;
  return indexToShortcut(totalCards).length;
}
