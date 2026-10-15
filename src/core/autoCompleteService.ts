import { cloneCard } from "./boardState";
import { cardColorGroup } from "./cardRules";
import { canMoveToFoundation } from "./moveService";
import type { BoardSettings, Card, MoveCandidate, RunState } from "./types";

type AutoSettings = Pick<BoardSettings, "color_count" | "marks_per_color" | "rank_count">;

export function findSafeAutoCompleteMove(
  runState: Pick<RunState, "free_cells" | "foundations" | "tableau">,
  settings: AutoSettings,
): MoveCandidate | null {
  let bestMove: MoveCandidate | null = null;
  let bestRank = 1 << 30;

  runState.free_cells.forEach((card, freeCellIndex) => {
    if (!card) {
      return;
    }
    if (!canMoveToFoundation(runState, card, card.suit)) {
      return;
    }
    if (!isSafeAutoFoundationMove(runState, settings, card)) {
      return;
    }
    if (card.rank < bestRank) {
      bestRank = card.rank;
      bestMove = {
        card: cloneCard(card),
        source: { type: "free_cell", index: freeCellIndex },
        target: { type: "foundation", index: card.suit },
      };
    }
  });

  runState.tableau.forEach((laneStack, laneIndex) => {
    if (laneStack.length === 0) {
      return;
    }
    const card = laneStack[laneStack.length - 1];
    if (!canMoveToFoundation(runState, card, card.suit)) {
      return;
    }
    if (!isSafeAutoFoundationMove(runState, settings, card)) {
      return;
    }
    if (card.rank < bestRank) {
      bestRank = card.rank;
      bestMove = {
        card: cloneCard(card),
        source: { type: "lane", index: laneIndex, card_index: laneStack.length - 1 },
        target: { type: "foundation", index: card.suit },
      };
    }
  });

  return bestMove;
}

export function isSafeAutoFoundationMove(
  runState: Pick<RunState, "foundations">,
  settings: AutoSettings,
  card: Pick<Card, "suit" | "rank">,
): boolean {
  const colorProgress = getColorFoundationMinimums(runState, settings);
  const colorCount = settings.color_count;
  const colorIndex = cardColorGroup(card, settings.marks_per_color);

  for (let step = 1; step <= colorCount; step++) {
    const compareColor = (colorIndex + step) % colorCount;
    const requiredProgress = card.rank - (step + 1);
    if (colorProgress[compareColor] < requiredProgress) {
      return false;
    }
  }
  return true;
}

export function getColorFoundationMinimums(runState: Pick<RunState, "foundations">, settings: AutoSettings): number[] {
  const result: number[] = [];
  for (let colorIndex = 0; colorIndex < settings.color_count; colorIndex++) {
    let minimumProgress = settings.rank_count;
    for (let markIndex = 0; markIndex < settings.marks_per_color; markIndex++) {
      const foundationIndex = colorIndex * settings.marks_per_color + markIndex;
      minimumProgress = Math.min(minimumProgress, runState.foundations[foundationIndex].length);
    }
    result.push(minimumProgress);
  }
  return result;
}
