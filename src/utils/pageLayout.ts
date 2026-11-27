/**
 * pageLayout.ts
 * Calculates spread/page layout for the Grimoire card collection.
 * 10 cards per spread (5 per page), displayed as a two-page book.
 */

export const CARDS_PER_SPREAD = 10;
export const CARDS_PER_PAGE = 5; // each page (left/right) shows 5 cards

export interface SpreadLayout {
  spreadIndex: number;    // 0-based
  totalSpreads: number;
  startCardIndex: number; // 0-based card index on this spread
  endCardIndex: number;   // exclusive
  leftCards: number[];    // 0-based card indices
  rightCards: number[];   // 0-based card indices
}

export function getSpreadLayout(
  spreadIndex: number,
  totalCards: number
): SpreadLayout {
  const totalSpreads = Math.max(1, Math.ceil(totalCards / CARDS_PER_SPREAD));
  const safeIdx = Math.max(0, Math.min(spreadIndex, totalSpreads - 1));
  const start = safeIdx * CARDS_PER_SPREAD;
  const end = Math.min(start + CARDS_PER_SPREAD, totalCards);

  const leftCards: number[] = [];
  const rightCards: number[] = [];

  for (let i = start; i < end; i++) {
    if (i - start < CARDS_PER_PAGE) {
      leftCards.push(i);
    } else {
      rightCards.push(i);
    }
  }

  // Pad with -1 for empty slots
  while (leftCards.length < CARDS_PER_PAGE) leftCards.push(-1);
  while (rightCards.length < CARDS_PER_PAGE) rightCards.push(-1);

  return {
    spreadIndex: safeIdx,
    totalSpreads,
    startCardIndex: start,
    endCardIndex: end,
    leftCards,
    rightCards,
  };
}

export function getTotalSpreads(totalCards: number): number {
  return Math.max(1, Math.ceil(totalCards / CARDS_PER_SPREAD));
}
