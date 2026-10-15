import { isSafeAutoFoundationMove } from "./autoCompleteService";
import { cloneCard } from "./boardState";
import { canStackOnTableauCard, isActiveTableauCard } from "./cardRules";
import { canMoveToFoundation } from "./moveService";
import type { BoardSettings, Card, MoveCandidate, RuleSettings, RunState } from "./types";

type SkillSettings = Pick<BoardSettings, "color_count" | "marks_per_color" | "rank_count">;

export interface FreeCellDeepTarget {
  card: Card;
  source_index: number;
  target_index: number;
}

export interface InactiveSequenceEntry {
  card: Card;
  lane_index: number;
  card_index: number;
  weight: number;
  order: number;
}

export interface InactiveColumnTarget {
  target_lane_index: number;
  sequence: InactiveSequenceEntry[];
}

function isActive(laneStack: readonly Card[], cardIndex: number, settings: RuleSettings): boolean {
  return isActiveTableauCard(laneStack, cardIndex, settings.color_count, settings.marks_per_color);
}

/** テレポート対象：安全に完成置き場へ送れる不活性カードのうち、最も「悪い」もの */
export function findTeleportTarget(
  runState: Pick<RunState, "tableau" | "foundations">,
  settings: SkillSettings,
): MoveCandidate | null {
  let bestTarget: MoveCandidate | null = null;
  let bestScore = -1;
  let bestLaneIndex = 1 << 30;
  let bestCardIndex = -1;

  runState.tableau.forEach((laneStack, laneIndex) => {
    for (let cardIndex = 0; cardIndex < laneStack.length; cardIndex++) {
      if (isActive(laneStack, cardIndex, settings)) {
        continue;
      }
      const card = laneStack[cardIndex];
      if (!canMoveToFoundation(runState, card, card.suit)) {
        continue;
      }
      if (!isSafeAutoFoundationMove(runState, settings, card)) {
        continue;
      }
      const score = getCardDisorderScore(laneStack, cardIndex);
      if (
        score > bestScore ||
        (score === bestScore && laneIndex < bestLaneIndex) ||
        (score === bestScore && laneIndex === bestLaneIndex && cardIndex > bestCardIndex)
      ) {
        bestScore = score;
        bestLaneIndex = laneIndex;
        bestCardIndex = cardIndex;
        bestTarget = {
          card: cloneCard(card),
          source: { type: "lane", index: laneIndex, card_index: cardIndex, exact_card_index: true },
          target: { type: "foundation", index: card.suit },
        };
      }
    }
  });

  return bestTarget;
}

/** アンロード対象：フリーセルの最大数字カードと、不活性カード合計が最大のレーン */
export function findFreeCellDeepTarget(
  runState: Pick<RunState, "tableau" | "free_cells">,
  settings: RuleSettings,
): FreeCellDeepTarget | null {
  let bestSourceIndex = -1;
  let bestRank = -1;
  runState.free_cells.forEach((card, freeCellIndex) => {
    if (!card) {
      return;
    }
    if (card.rank > bestRank) {
      bestRank = card.rank;
      bestSourceIndex = freeCellIndex;
    }
  });

  if (bestSourceIndex < 0) {
    return null;
  }

  const targetLaneIndex = getLaneIndexWithLargestInactiveSum(runState, settings);
  if (targetLaneIndex < 0) {
    return null;
  }

  return {
    card: cloneCard(runState.free_cells[bestSourceIndex] as Card),
    source_index: bestSourceIndex,
    target_index: targetLaneIndex,
  };
}

export function getLaneIndexWithLargestInactiveSum(runState: Pick<RunState, "tableau">, settings: RuleSettings): number {
  let bestLaneIndex = -1;
  let bestSum = -1;
  runState.tableau.forEach((laneStack, laneIndex) => {
    let inactiveSum = 0;
    for (let cardIndex = 0; cardIndex < laneStack.length; cardIndex++) {
      if (!isActive(laneStack, cardIndex, settings)) {
        inactiveSum += laneStack[cardIndex].rank;
      }
    }
    if (inactiveSum > bestSum) {
      bestSum = inactiveSum;
      bestLaneIndex = laneIndex;
    }
  });
  return bestLaneIndex;
}

/** アセンブル対象：不活性カードから評価値最大の合法な列を探し、最初の空レーンへ置く */
export function findInactiveColumnSkillTarget(
  runState: Pick<RunState, "tableau">,
  settings: RuleSettings,
): InactiveColumnTarget | null {
  const targetLaneIndex = getFirstEmptyLaneIndex(runState);
  if (targetLaneIndex < 0) {
    return null;
  }
  const sequence = findBestInactiveCardSequence(runState, settings);
  if (sequence.length === 0) {
    return null;
  }
  return { target_lane_index: targetLaneIndex, sequence };
}

export function getFirstEmptyLaneIndex(runState: Pick<RunState, "tableau">): number {
  return runState.tableau.findIndex((lane) => lane.length === 0);
}

export function findBestInactiveCardSequence(
  runState: Pick<RunState, "tableau">,
  settings: RuleSettings,
): InactiveSequenceEntry[] {
  const candidates = collectInactiveCardCandidates(runState, settings);
  if (candidates.length === 0) {
    return [];
  }

  candidates.sort(compareInactiveSequenceCandidates);
  const bestSequences: InactiveSequenceEntry[][] = [];
  const bestScores: number[] = [];
  let bestIndex = -1;
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    let sequence: InactiveSequenceEntry[] = [candidate];
    let score = candidate.weight;
    for (let previousIndex = 0; previousIndex < candidateIndex; previousIndex++) {
      const previousCandidate = candidates[previousIndex];
      if (!canStackOnTableauCard(candidate.card, previousCandidate.card, settings.color_count, settings.marks_per_color)) {
        continue;
      }
      const candidateScore = bestScores[previousIndex] + candidate.weight;
      const candidateSequence = [...bestSequences[previousIndex], candidate];
      if (candidateScore > score || (candidateScore === score && candidateSequence.length > sequence.length)) {
        score = candidateScore;
        sequence = candidateSequence;
      }
    }
    bestSequences.push(sequence);
    bestScores.push(score);
    if (
      bestIndex < 0 ||
      score > bestScores[bestIndex] ||
      (score === bestScores[bestIndex] && sequence.length > bestSequences[bestIndex].length)
    ) {
      bestIndex = candidateIndex;
    }
  }

  return bestIndex < 0 ? [] : bestSequences[bestIndex];
}

export function collectInactiveCardCandidates(
  runState: Pick<RunState, "tableau">,
  settings: RuleSettings,
): InactiveSequenceEntry[] {
  const candidates: InactiveSequenceEntry[] = [];
  let order = 0;
  runState.tableau.forEach((laneStack, laneIndex) => {
    for (let cardIndex = 0; cardIndex < laneStack.length; cardIndex++) {
      if (isActive(laneStack, cardIndex, settings)) {
        continue;
      }
      candidates.push({
        card: cloneCard(laneStack[cardIndex]),
        lane_index: laneIndex,
        card_index: cardIndex,
        weight: getCardDisorderScore(laneStack, cardIndex),
        order,
      });
      order += 1;
    }
  });
  return candidates;
}

export function compareInactiveSequenceCandidates(a: InactiveSequenceEntry, b: InactiveSequenceEntry): number {
  if (a.card.rank === b.card.rank) {
    return a.order - b.order;
  }
  return b.card.rank - a.card.rank;
}

export function removeInactiveColumnSequence(
  runState: Pick<RunState, "tableau">,
  sequence: readonly Pick<InactiveSequenceEntry, "lane_index" | "card_index">[],
): void {
  const removalsByLane = new Map<number, number[]>();
  for (const entry of sequence) {
    const indices = removalsByLane.get(entry.lane_index) ?? [];
    indices.push(entry.card_index);
    removalsByLane.set(entry.lane_index, indices);
  }

  for (const [laneIndex, cardIndices] of removalsByLane) {
    const laneStack = runState.tableau[laneIndex];
    cardIndices.sort((a, b) => b - a);
    for (const cardIndex of cardIndices) {
      if (cardIndex >= 0 && cardIndex < laneStack.length) {
        laneStack.splice(cardIndex, 1);
      }
    }
  }
}

export function getLaneDisorderScore(laneStack: readonly Pick<Card, "rank">[]): number {
  let score = 0;
  for (let cardIndex = 0; cardIndex < laneStack.length; cardIndex++) {
    score += getCardDisorderScore(laneStack, cardIndex);
  }
  return score;
}

/** そのカードより下（配列後方）にある、より大きい数字のカード枚数 */
export function getCardDisorderScore(laneStack: readonly Pick<Card, "rank">[], cardIndex: number): number {
  if (cardIndex < 0 || cardIndex >= laneStack.length) {
    return 0;
  }
  const rank = laneStack[cardIndex].rank ?? 0;
  let score = 0;
  for (let lowerIndex = cardIndex + 1; lowerIndex < laneStack.length; lowerIndex++) {
    if ((laneStack[lowerIndex].rank ?? 0) > rank) {
      score += 1;
    }
  }
  return score;
}
