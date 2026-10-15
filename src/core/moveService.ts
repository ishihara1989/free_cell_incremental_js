import { canStackOnTableauCard, isValidLaneSequence } from "./cardRules";
import type { Card, MoveSource, MoveTarget, RuleSettings, RunState } from "./types";

type FoundationState = Pick<RunState, "foundations">;
type TableauState = Pick<RunState, "tableau">;
type CellState = Pick<RunState, "free_cells" | "tableau">;

export function isValidMove(
  runState: RunState,
  settings: RuleSettings,
  source: MoveSource | null,
  target: MoveTarget | null,
  dragCards: readonly Card[],
  supportsBulkMove: boolean,
): boolean {
  if (!source || !target || dragCards.length === 0) {
    return false;
  }
  if (source.type === target.type && source.index === target.index) {
    return false;
  }

  const bottomCard = dragCards[0];
  const movingCount = dragCards.length;
  if (source.type === "foundation" && target.type !== "lane") {
    return false;
  }
  switch (target.type) {
    case "free_cell":
      return movingCount === 1 && runState.free_cells[target.index] === null;
    case "foundation":
      return movingCount === 1 && canMoveToFoundation(runState, bottomCard, target.index);
    case "lane":
      if (source.type === "lane") {
        const laneIndex = source.index;
        const cardIndex = source.card_index ?? -1;
        if (!isValidLaneSequence(runState.tableau[laneIndex], cardIndex, settings.color_count, settings.marks_per_color)) {
          return false;
        }
        if (movingCount > 1 && !supportsBulkMove) {
          return false;
        }
        if (movingCount > getMaxMovableCardCount(runState, laneIndex, target.index)) {
          return false;
        }
      } else if (movingCount > 1) {
        return false;
      }
      return canMoveToLane(runState, settings, bottomCard, target.index);
    default:
      return false;
  }
}

export function canMoveToFoundation(
  runState: FoundationState,
  card: Pick<Card, "suit" | "rank">,
  foundationIndex: number,
): boolean {
  if ((card.suit ?? -1) !== foundationIndex) {
    return false;
  }
  if (foundationIndex < 0 || foundationIndex >= runState.foundations.length) {
    return false;
  }
  return (card.rank ?? 0) === runState.foundations[foundationIndex].length + 1;
}

export function isReachCard(runState: FoundationState, card: Pick<Card, "suit" | "rank">): boolean {
  return canMoveToFoundation(runState, card, card.suit ?? -1);
}

export function canMoveToLane(
  runState: TableauState,
  settings: RuleSettings,
  card: Pick<Card, "suit" | "rank">,
  laneIndex: number,
): boolean {
  if (laneIndex < 0 || laneIndex >= runState.tableau.length) {
    return false;
  }
  const laneStack = runState.tableau[laneIndex];
  if (laneStack.length === 0) {
    return true;
  }
  const topCard = laneStack[laneStack.length - 1];
  return canStackOnTableauCard(card, topCard, settings.color_count, settings.marks_per_color);
}

export function getMaxMovableCardCount(runState: CellState, sourceLaneIndex: number, targetLaneIndex: number): number {
  return (
    (countEmptyFreeCells(runState) + 1) *
    2 ** countEmptyAuxiliaryLanes(runState, sourceLaneIndex, targetLaneIndex)
  );
}

export function countEmptyFreeCells(runState: Pick<RunState, "free_cells">): number {
  return runState.free_cells.filter((card) => card === null).length;
}

export function countEmptyAuxiliaryLanes(runState: TableauState, sourceLaneIndex: number, targetLaneIndex: number): number {
  let count = 0;
  runState.tableau.forEach((lane, laneIndex) => {
    if (laneIndex === sourceLaneIndex) {
      return;
    }
    if (lane.length === 0) {
      count += 1;
    }
    if (laneIndex === targetLaneIndex && lane.length === 0) {
      count -= 1;
    }
  });
  return Math.max(0, count);
}
