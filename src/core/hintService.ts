import { cloneCard } from "./boardState";
import { isActiveTableauCard, isValidLaneSequence } from "./cardRules";
import { canMoveToLane, getMaxMovableCardCount } from "./moveService";
import type { Card, MoveSource, MoveTarget, RuleSettings, RunState } from "./types";

export interface HintCandidate {
  priority: number;
  card: Card;
  source: MoveSource;
  target: MoveTarget;
  target_inactive_count: number;
  exposed_card?: Card;
  moving_count?: number;
}

type HintState = Pick<RunState, "free_cells" | "tableau">;

export function findHintCandidates(
  runState: HintState,
  settings: RuleSettings,
  supportsBulkMove: boolean,
): HintCandidate[] {
  const candidates = [
    ...findFreeCellToLaneHintCandidates(runState, settings),
    ...findInactiveExposureHintCandidates(runState, settings, supportsBulkMove),
  ];
  candidates.sort(compareHintCandidates);
  return candidates;
}

export function findFreeCellToLaneHintCandidates(runState: HintState, settings: RuleSettings): HintCandidate[] {
  const candidates: HintCandidate[] = [];
  runState.free_cells.forEach((card, freeCellIndex) => {
    if (!card) {
      return;
    }
    runState.tableau.forEach((targetLane, targetLaneIndex) => {
      if (targetLane.length === 0) {
        return;
      }
      if (!canMoveToLane(runState, settings, card, targetLaneIndex)) {
        return;
      }
      candidates.push({
        priority: 1,
        card: cloneCard(card),
        source: { type: "free_cell", index: freeCellIndex, card_index: -1 },
        target: { type: "lane", index: targetLaneIndex },
        target_inactive_count: getInactiveCardCount(targetLane, settings),
      });
    });
  });
  return candidates;
}

export function findInactiveExposureHintCandidates(
  runState: HintState,
  settings: RuleSettings,
  supportsBulkMove: boolean,
): HintCandidate[] {
  const candidates: HintCandidate[] = [];
  const tableau = runState.tableau;
  tableau.forEach((sourceLane, sourceLaneIndex) => {
    if (sourceLane.length < 2) {
      return;
    }
    for (let startIndex = 1; startIndex < sourceLane.length; startIndex++) {
      if (!isDraggableLaneStart(sourceLane, startIndex, settings, supportsBulkMove)) {
        continue;
      }
      const exposedCard = sourceLane[startIndex - 1];
      if (isActiveTableauCard(sourceLane, startIndex - 1, settings.color_count, settings.marks_per_color)) {
        continue;
      }
      const movingCount = sourceLane.length - startIndex;
      const movingCard = sourceLane[startIndex];
      tableau.forEach((targetLane, targetLaneIndex) => {
        if (targetLaneIndex === sourceLaneIndex || targetLane.length === 0) {
          return;
        }
        if (!canMoveToLane(runState, settings, movingCard, targetLaneIndex)) {
          return;
        }
        if (movingCount > getMaxMovableCardCount(runState, sourceLaneIndex, targetLaneIndex)) {
          return;
        }
        candidates.push({
          priority: 2,
          card: cloneCard(movingCard),
          exposed_card: cloneCard(exposedCard),
          moving_count: movingCount,
          source: { type: "lane", index: sourceLaneIndex, card_index: startIndex },
          target: { type: "lane", index: targetLaneIndex },
          target_inactive_count: getInactiveCardCount(targetLane, settings),
        });
      });
    }
  });
  return candidates;
}

export function isDraggableLaneStart(
  laneStack: readonly Pick<Card, "suit" | "rank">[],
  startIndex: number,
  settings: RuleSettings,
  supportsBulkMove: boolean,
): boolean {
  if (startIndex < 0 || startIndex >= laneStack.length) {
    return false;
  }
  if (startIndex === laneStack.length - 1) {
    return true;
  }
  return supportsBulkMove && isValidLaneSequence(laneStack, startIndex, settings.color_count, settings.marks_per_color);
}

export function getInactiveCardCount(laneStack: readonly Pick<Card, "suit" | "rank">[], settings: RuleSettings): number {
  let count = 0;
  for (let cardIndex = 0; cardIndex < laneStack.length; cardIndex++) {
    if (!isActiveTableauCard(laneStack, cardIndex, settings.color_count, settings.marks_per_color)) {
      count += 1;
    }
  }
  return count;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareHintCandidates(a: HintCandidate, b: HintCandidate): number {
  const aPriority = a.priority ?? 99;
  const bPriority = b.priority ?? 99;
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aTargetInactive = a.target_inactive_count ?? 1 << 30;
  const bTargetInactive = b.target_inactive_count ?? 1 << 30;
  if (aTargetInactive !== bTargetInactive) {
    return aTargetInactive - bTargetInactive;
  }

  if (a.source.type !== b.source.type) {
    return compareText(a.source.type, b.source.type);
  }
  if (a.source.index !== b.source.index) {
    return a.source.index - b.source.index;
  }
  const aCardIndex = a.source.card_index ?? -1;
  const bCardIndex = b.source.card_index ?? -1;
  if (aCardIndex !== bCardIndex) {
    return aCardIndex - bCardIndex;
  }
  return a.target.index - b.target.index;
}

export function makeHintCandidateKey(candidates: readonly HintCandidate[]): string {
  return candidates.map(makeHintCandidateSignature).join("|");
}

export function makeHintCandidateSignature(candidate: HintCandidate): string {
  const { source, target, card } = candidate;
  return `${candidate.priority ?? 0}:${source.type}:${source.index ?? -1}:${source.card_index ?? -1}:${card.id ?? -1}>${target.type}:${target.index ?? -1}`;
}
