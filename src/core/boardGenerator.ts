import { cloneCard } from "./boardState";
import { getCurrentLongestChainLength } from "./energyService";
import { getLaneDisorderScore } from "./rebirthSkillService";
import type { Rng } from "./rng";
import type { BoardSettings, Card, RunState } from "./types";

type GeneratorSettings = Pick<
  BoardSettings,
  "suit_count" | "rank_count" | "lane_count" | "free_cell_count" | "color_count" | "marks_per_color"
>;

export function createInitialRunState(settings: GeneratorSettings, rng: Rng, sortLaneCount = 0): RunState {
  const deck = createDeck(settings.suit_count ?? 1, settings.rank_count ?? 2);
  shuffleDeck(deck, rng);
  const tableau = dealTableau(deck, settings.lane_count ?? 1);
  applyInitialSortBonuses(tableau, Math.min(sortLaneCount, tableau.length));

  const freeCells: (Card | null)[] = [];
  for (let index = 0; index < (settings.free_cell_count ?? 1); index++) {
    freeCells.push(null);
  }

  const foundations: Card[][] = [];
  for (let index = 0; index < (settings.suit_count ?? 1); index++) {
    foundations.push([]);
  }

  return {
    tableau,
    free_cells: freeCells,
    foundations,
    energy: 0,
    max_chain: getCurrentLongestChainLength(tableau, settings),
    emptied_lanes: [],
    max_active_lane_energy_score: 0,
    inactive_activation_count: 0,
  };
}

export function createDeck(suitCount: number, rankCount: number): Card[] {
  const deck: Card[] = [];
  let nextCardId = 0;
  for (let suitIndex = 0; suitIndex < Math.max(0, suitCount); suitIndex++) {
    for (let rank = 1; rank <= Math.max(0, rankCount); rank++) {
      deck.push({ id: nextCardId, suit: suitIndex, rank });
      nextCardId += 1;
    }
  }
  return deck;
}

export function shuffleDeck<T>(deck: T[], rng: Rng): void {
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = rng.randiRange(0, index);
    const temp = deck[index];
    deck[index] = deck[swapIndex];
    deck[swapIndex] = temp;
  }
}

export function dealTableau(deck: readonly Card[], laneCount: number): Card[][] {
  const safeLaneCount = Math.max(1, laneCount);
  const tableau: Card[][] = [];
  for (let laneIndex = 0; laneIndex < safeLaneCount; laneIndex++) {
    tableau.push([]);
  }
  deck.forEach((card, cardIndex) => {
    tableau[cardIndex % safeLaneCount].push(cloneCard(card));
  });
  return tableau;
}

export function applyInitialSortBonuses(tableau: Card[][], sortLaneCount: number): void {
  if (sortLaneCount <= 0) {
    return;
  }
  for (const laneIndex of getWorstLaneIndices(tableau, Math.min(sortLaneCount, tableau.length))) {
    tableau[laneIndex] = sortLaneForInitialBonus(tableau[laneIndex]);
  }
}

export function getWorstLaneIndices(tableau: readonly (readonly Pick<Card, "rank">[])[], count: number): number[] {
  const result: number[] = [];
  const selected = new Set<number>();
  for (let selection = 0; selection < count; selection++) {
    let bestIndex = -1;
    let worstScore = -1;
    for (let laneIndex = 0; laneIndex < tableau.length; laneIndex++) {
      if (selected.has(laneIndex)) {
        continue;
      }
      const score = getLaneDisorderScore(tableau[laneIndex]);
      if (score > worstScore || (score === worstScore && laneIndex < bestIndex)) {
        worstScore = score;
        bestIndex = laneIndex;
      }
    }
    if (bestIndex < 0) {
      break;
    }
    selected.add(bestIndex);
    result.push(bestIndex);
  }
  return result;
}

/** UI で下側ほど数字が小さくなるよう、配列先頭（奥）に大きい数字を並べる */
export function sortLaneForInitialBonus<T extends Pick<Card, "rank">>(laneStack: readonly T[]): T[] {
  const entries = laneStack.map((card, originalIndex) => ({ card, rank: card.rank ?? 0, originalIndex }));
  entries.sort((a, b) => (a.rank === b.rank ? a.originalIndex - b.originalIndex : a.rank - b.rank));
  return entries.map((entry) => ({ ...entry.card })).reverse();
}
