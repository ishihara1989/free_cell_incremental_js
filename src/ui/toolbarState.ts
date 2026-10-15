/** Godot 版 freecell_toolbar_state.gd の移植。ツールバーの表示状態を純粋関数で求める。 */
export interface ToolbarInput {
  won: boolean;
  moveCount: number;
  undoCount: number;
  redoCount: number;
  supportsHint: boolean;
  canShowHint: boolean;
  supportsAutoComplete: boolean;
  autoCompleteEnabled: boolean;
  supportsAutoHintMove: boolean;
  canAutoMoveHints: boolean;
  supportsTeleportSkill: boolean;
  canUseTeleportSkill: boolean;
  supportsFreeCellDeepSkill: boolean;
  canUseFreeCellDeepSkill: boolean;
  supportsInactiveColumnSkill: boolean;
  canUseInactiveColumnSkill: boolean;
}

export function buildToolbarState(input: ToolbarInput) {
  const won = input.won;
  return {
    moveCounterText: `手数: ${input.moveCount}`,
    undoDisabled: won || input.undoCount <= 0,
    redoDisabled: won || input.redoCount <= 0,
    newGameDisabled: false,
    giveUpDisabled: won,
    hintVisible: input.supportsHint,
    hintDisabled: won || !input.canShowHint,
    autoCompleteVisible: input.supportsAutoComplete,
    autoCompleteDisabled: !input.supportsAutoComplete,
    autoCompletePressed: input.autoCompleteEnabled,
    autoHintVisible: input.supportsAutoHintMove,
    autoHintDisabled: won || !input.canAutoMoveHints,
    teleportVisible: input.supportsTeleportSkill,
    teleportDisabled: won || !input.canUseTeleportSkill,
    freeCellDeepVisible: input.supportsFreeCellDeepSkill,
    freeCellDeepDisabled: won || !input.canUseFreeCellDeepSkill,
    inactiveColumnVisible: input.supportsInactiveColumnSkill,
    inactiveColumnDisabled: won || !input.canUseInactiveColumnSkill,
    victoryActionsVisible: won,
  };
}

export function buildResourceState(input: {
  pointDisplayText: string;
  energy: number;
  maxChain: number;
  supportsChainEnergy: boolean;
}) {
  return {
    pointsText: `${input.pointDisplayText} P`,
    energyText: input.supportsChainEnergy ? `${input.energy} EN` : "未解放",
    chainText: `最大チェーン ${input.maxChain}`,
  };
}
