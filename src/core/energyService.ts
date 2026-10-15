import { cloneTableau } from "./boardState";
import { getLaneLongestChainLength, isActiveTableauCard, isValidLaneSequence } from "./cardRules";
import type { Card, EnergySupportFlags, RuleSettings, RunState } from "./types";

type Tableau = readonly (readonly Card[])[];

export function registerChainProgress(
  runState: Pick<RunState, "energy" | "max_chain">,
  chainSize: number,
  supportsChainEnergy: boolean,
): void {
  const previousMax = runState.max_chain ?? 1;
  if (chainSize <= previousMax) {
    return;
  }

  runState.max_chain = chainSize;
  if (!supportsChainEnergy) {
    return;
  }

  // 2 以上の新規到達チェーン数ぶんエネルギーを得る
  const gain = Math.max(0, chainSize + 1 - Math.max(2, previousMax + 1));
  if (gain > 0) {
    runState.energy = (runState.energy ?? 0) + gain;
  }
}

export function syncChainProgress(
  runState: RunState,
  settings: RuleSettings,
  grantEnergy: boolean,
  supportsChainEnergy: boolean,
): void {
  const chainSize = getCurrentLongestChainLength(runState.tableau, settings);
  if (!grantEnergy) {
    runState.max_chain = chainSize;
    return;
  }
  registerChainProgress(runState, chainSize, supportsChainEnergy);
}

export function applyPostActionEnergyProgress(
  runState: RunState,
  settings: RuleSettings,
  previousTableau: Tableau,
  supportFlags: EnergySupportFlags,
): void {
  grantFirstEmptyLaneEnergy(runState, previousTableau, supportFlags.empty_lane_energy);
  grantInactiveActivationEnergy(runState, settings, previousTableau, supportFlags.inactive_activation_energy);
  syncChainProgress(runState, settings, true, supportFlags.chain_energy);
  syncActiveLaneEnergyProgress(runState, settings, true, supportFlags.active_lane_energy);
}

export function grantFirstEmptyLaneEnergy(
  runState: Pick<RunState, "energy" | "emptied_lanes" | "tableau">,
  previousTableau: Tableau,
  supportsEmptyLaneEnergy: boolean,
): void {
  if (!supportsEmptyLaneEnergy) {
    return;
  }

  const emptiedLanes = runState.emptied_lanes ?? [];
  const currentTableau = runState.tableau;
  let gained = 0;
  for (let laneIndex = 0; laneIndex < Math.min(previousTableau.length, currentTableau.length); laneIndex++) {
    if (previousTableau[laneIndex].length === 0 || currentTableau[laneIndex].length !== 0 || emptiedLanes.includes(laneIndex)) {
      continue;
    }
    emptiedLanes.push(laneIndex);
    gained += 3;
  }

  runState.emptied_lanes = emptiedLanes;
  if (gained > 0) {
    runState.energy = (runState.energy ?? 0) + gained;
  }
}

export function syncActiveLaneEnergyProgress(
  runState: Pick<RunState, "energy" | "max_active_lane_energy_score" | "tableau">,
  settings: RuleSettings,
  grantEnergy: boolean,
  supportsActiveLaneEnergy: boolean,
): void {
  const currentScore = getActiveLaneEnergyScore(runState.tableau, settings);
  if (!grantEnergy || !supportsActiveLaneEnergy) {
    runState.max_active_lane_energy_score = currentScore;
    return;
  }

  const previousScore = runState.max_active_lane_energy_score ?? 0;
  if (currentScore <= previousScore) {
    return;
  }

  const previousEnergyValue = Math.floor(Math.sqrt(previousScore));
  const currentEnergyValue = Math.floor(Math.sqrt(currentScore));
  runState.max_active_lane_energy_score = currentScore;
  if (currentEnergyValue > previousEnergyValue) {
    runState.energy = (runState.energy ?? 0) + currentEnergyValue - previousEnergyValue;
  }
}

export function grantInactiveActivationEnergy(
  runState: Pick<RunState, "energy" | "inactive_activation_count" | "tableau">,
  settings: RuleSettings,
  previousTableau: Tableau,
  supportsInactiveActivationEnergy: boolean,
): void {
  if (!supportsInactiveActivationEnergy) {
    runState.inactive_activation_count = runState.inactive_activation_count ?? 0;
    return;
  }

  const activatedCount = countNewlyActiveInactiveCards(previousTableau, runState.tableau, settings);
  if (activatedCount <= 0) {
    return;
  }

  const previousCount = runState.inactive_activation_count ?? 0;
  const currentCount = previousCount + activatedCount;
  runState.inactive_activation_count = currentCount;

  const previousEnergySteps = Math.floor(previousCount / 3);
  const currentEnergySteps = Math.floor(currentCount / 3);
  if (currentEnergySteps > previousEnergySteps) {
    runState.energy = (runState.energy ?? 0) + currentEnergySteps - previousEnergySteps;
  }
}

export function countNewlyActiveInactiveCards(previousTableau: Tableau, currentTableau: Tableau, settings: RuleSettings): number {
  const previousInactiveIds = getTableauCardIdSet(previousTableau, settings, false);
  if (previousInactiveIds.size === 0) {
    return 0;
  }
  let count = 0;
  for (const cardId of getTableauCardIdSet(currentTableau, settings, true)) {
    if (previousInactiveIds.has(cardId)) {
      count += 1;
    }
  }
  return count;
}

export function getActiveTableauCardIdSet(tableau: Tableau, settings: RuleSettings): Set<number> {
  return getTableauCardIdSet(tableau, settings, true);
}

export function getInactiveTableauCardIdSet(tableau: Tableau, settings: RuleSettings): Set<number> {
  return getTableauCardIdSet(tableau, settings, false);
}

function getTableauCardIdSet(tableau: Tableau, settings: RuleSettings, active: boolean): Set<number> {
  const result = new Set<number>();
  for (const laneStack of tableau) {
    for (let cardIndex = 0; cardIndex < laneStack.length; cardIndex++) {
      if (isActiveTableauCard(laneStack, cardIndex, settings.color_count, settings.marks_per_color) === active) {
        result.add(laneStack[cardIndex].id ?? -1);
      }
    }
  }
  return result;
}

export function getActiveLaneEnergyScore(tableau: Tableau, settings: RuleSettings): number {
  let bestScore = 0;
  for (const laneStack of tableau) {
    if (laneStack.length === 0 || !isValidLaneSequence(laneStack, 0, settings.color_count, settings.marks_per_color)) {
      continue;
    }
    const laneScore = laneStack.reduce((sum, card) => sum + (card.rank ?? 0), 0);
    bestScore = Math.max(bestScore, laneScore);
  }
  return bestScore;
}

export function duplicateTableau(tableau: Tableau): Card[][] {
  return cloneTableau(tableau);
}

export function getCurrentLongestChainLength(tableau: Tableau, settings: RuleSettings): number {
  let longestChain = 1;
  for (const laneStack of tableau) {
    longestChain = Math.max(
      longestChain,
      getLaneLongestChainLength(laneStack, settings.color_count, settings.marks_per_color),
    );
  }
  return longestChain;
}
