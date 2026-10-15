import type { Card, MoveSource, MoveTarget, RunState } from "./types";

export function cloneCard(card: Card): Card {
  return { id: card.id, suit: card.suit, rank: card.rank };
}

export function cloneTableau(tableau: readonly (readonly Card[])[]): Card[][] {
  return tableau.map((lane) => lane.map(cloneCard));
}

/** undo / redo 用のスナップショット（深いコピー） */
export function captureRunState(runState: RunState): RunState {
  return {
    tableau: cloneTableau(runState.tableau),
    free_cells: runState.free_cells.map((card) => (card ? cloneCard(card) : null)),
    foundations: runState.foundations.map((stack) => stack.map(cloneCard)),
    energy: runState.energy,
    max_chain: runState.max_chain,
    emptied_lanes: [...runState.emptied_lanes],
    max_active_lane_energy_score: runState.max_active_lane_energy_score,
    inactive_activation_count: runState.inactive_activation_count,
  };
}

export function getCardsFromSource(runState: RunState, source: MoveSource, cardCount: number): Card[] {
  const movedCards: Card[] = [];
  const safeCount = Math.max(1, cardCount);
  const sourceIndex = source.index ?? -1;
  switch (source.type) {
    case "free_cell": {
      if (sourceIndex < 0 || sourceIndex >= runState.free_cells.length) {
        return [];
      }
      const card = runState.free_cells[sourceIndex];
      if (card) {
        movedCards.push(cloneCard(card));
      }
      break;
    }
    case "foundation": {
      if (sourceIndex < 0 || sourceIndex >= runState.foundations.length) {
        return [];
      }
      const stack = runState.foundations[sourceIndex];
      if (stack.length === 0) {
        return [];
      }
      movedCards.push(cloneCard(stack[stack.length - 1]));
      break;
    }
    case "lane": {
      if (sourceIndex < 0 || sourceIndex >= runState.tableau.length) {
        return [];
      }
      const laneStack = runState.tableau[sourceIndex];
      let startIndex = source.card_index ?? laneStack.length - safeCount;
      if (startIndex < 0) {
        startIndex = laneStack.length - safeCount;
      }
      const endIndex = Math.min(laneStack.length, startIndex + safeCount);
      for (let cardIndex = Math.max(0, startIndex); cardIndex < endIndex; cardIndex++) {
        movedCards.push(cloneCard(laneStack[cardIndex]));
      }
      break;
    }
  }
  return movedCards;
}

export function applyCardsToTarget(runState: RunState, cards: readonly Card[], target: MoveTarget): void {
  switch (target.type) {
    case "free_cell":
      runState.free_cells[target.index] = cloneCard(cards[0]);
      break;
    case "foundation":
      runState.foundations[target.index].push(cloneCard(cards[0]));
      break;
    case "lane": {
      const laneStack = runState.tableau[target.index];
      for (const card of cards) {
        laneStack.push(cloneCard(card));
      }
      break;
    }
  }
}

export function removeCardsFromSource(runState: RunState, source: MoveSource, cardCount: number): void {
  switch (source.type) {
    case "free_cell":
      runState.free_cells[source.index] = null;
      break;
    case "foundation": {
      const stack = runState.foundations[source.index];
      if (stack.length > 0) {
        stack.pop();
      }
      break;
    }
    case "lane": {
      const laneStack = runState.tableau[source.index];
      if (source.exact_card_index) {
        laneStack.splice(source.card_index ?? -1, 1);
      } else {
        for (let count = 0; count < cardCount; count++) {
          laneStack.pop();
        }
      }
      break;
    }
  }
}
