import type { Card } from "./types";

type RankedCard = Pick<Card, "suit" | "rank">;

export function cardColorGroup(card: Pick<Card, "suit">, marksPerColor: number): number {
  return Math.trunc((card.suit ?? 0) / Math.max(1, marksPerColor));
}

export function canStackOnTableauCard(
  card: RankedCard,
  targetCard: RankedCard,
  colorCount: number,
  marksPerColor: number,
): boolean {
  if ((card.rank ?? 0) !== (targetCard.rank ?? 0) - 1) {
    return false;
  }
  if (colorCount === 1) {
    return true;
  }

  const targetColor = cardColorGroup(targetCard, marksPerColor);
  const movingColor = cardColorGroup(card, marksPerColor);
  return movingColor === (targetColor + 1) % colorCount;
}

export function isValidLaneSequence(
  stack: readonly RankedCard[],
  startIndex: number,
  colorCount: number,
  marksPerColor: number,
): boolean {
  if (startIndex < 0 || startIndex >= stack.length) {
    return false;
  }

  for (let cardIndex = startIndex + 1; cardIndex < stack.length; cardIndex++) {
    if (!canStackOnTableauCard(stack[cardIndex], stack[cardIndex - 1], colorCount, marksPerColor)) {
      return false;
    }
  }
  return true;
}

export function isActiveTableauCard(
  laneStack: readonly RankedCard[],
  cardIndex: number,
  colorCount: number,
  marksPerColor: number,
): boolean {
  if (cardIndex < 0 || cardIndex >= laneStack.length) {
    return false;
  }
  if (cardIndex === laneStack.length - 1) {
    return true;
  }
  return isValidLaneSequence(laneStack, cardIndex, colorCount, marksPerColor);
}

export function getLaneLongestChainLength(
  laneStack: readonly RankedCard[],
  colorCount: number,
  marksPerColor: number,
): number {
  if (laneStack.length === 0) {
    return 1;
  }

  let longestChain = 1;
  let currentChain = 1;
  for (let cardIndex = 1; cardIndex < laneStack.length; cardIndex++) {
    if (canStackOnTableauCard(laneStack[cardIndex], laneStack[cardIndex - 1], colorCount, marksPerColor)) {
      currentChain += 1;
    } else {
      currentChain = 1;
    }
    longestChain = Math.max(longestChain, currentChain);
  }
  return longestChain;
}
