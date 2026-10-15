import { findSafeAutoCompleteMove, isSafeAutoFoundationMove } from "../../core/autoCompleteService";
import { createInitialRunState } from "../../core/boardGenerator";
import {
  applyCardsToTarget,
  captureRunState,
  cloneCard,
  cloneTableau,
  getCardsFromSource,
  removeCardsFromSource,
} from "../../core/boardState";
import { isActiveTableauCard, isValidLaneSequence } from "../../core/cardRules";
import { applyPostActionEnergyProgress, syncActiveLaneEnergyProgress, syncChainProgress } from "../../core/energyService";
import {
  findHintCandidates,
  getInactiveCardCount,
  isDraggableLaneStart,
  makeHintCandidateKey,
  type HintCandidate,
} from "../../core/hintService";
import { canMoveToFoundation, canMoveToLane, getMaxMovableCardCount, isReachCard, isValidMove } from "../../core/moveService";
import {
  findFreeCellDeepTarget,
  findInactiveColumnSkillTarget,
  findTeleportTarget,
  removeInactiveColumnSequence,
} from "../../core/rebirthSkillService";
import { createRng } from "../../core/rng";
import type { BoardSettings, Card, EnergySupportFlags, MoveSource, MoveTarget, RunState, SlotType } from "../../core/types";
import type { FeatureId, GameState } from "../../progress/gameState";
import { formatInteger } from "../../progress/integerText";
import * as M from "../boardLayoutMetrics";
import { renderCardSvg, type HighlightKind } from "../cardSvg";
import { css, darkened, lightened, rgba, type Color } from "../color";
import { confirmDialog } from "../dialog";
import { el, escapeHtml, px } from "../dom";
import type { AppContext, Screen } from "../screen";
import { cardLabel, getSuitInfo, textPresentation } from "../suitInfo";
import { buildResourceState, buildToolbarState } from "../toolbarState";

const TELEPORT_ENERGY_COST = 2;
const FREE_CELL_DEEP_ENERGY_COST = 1;
const INACTIVE_COLUMN_ENERGY_COST = 3;
const BOARD_ZOOM_STEP = 1.15;
const BOARD_EDGE_SCROLL_MARGIN = 80;
const BOARD_EDGE_SCROLL_SPEED = 880;
const DOUBLE_CLICK_MS = 400;
const CLICK_MOVE_TOLERANCE = 6;
const SECTION_TITLE_MAX_FONT = 20;
/** これより狭いレーンでは見出しを番号だけにする */
const COMPACT_LANE_WIDTH = 80;
const FREE_CELL_ACCENT = rgba(0.929412, 0.686275, 0.411765, 0.9);
const METRICS = M.DEFAULT_BOARD_METRICS;

interface DragState {
  cards: Card[];
  source: MoveSource;
  preview: HTMLElement;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  previousStatus: string;
}

interface PanState {
  pointerId: number;
  lastX: number;
  lastY: number;
}

interface PlannedMove {
  card: Card;
  source: MoveSource;
  target: MoveTarget;
  moving_count: number;
}

interface BoardGeometry {
  scale: number;
  titleFont: number;
  slot: M.Vec2;
  card: M.Vec2;
  lane: M.Vec2;
  titleHeight: number;
  sectionGap: number;
  slotGap: number;
  laneGap: number;
  freeCellsAt: M.Vec2;
  foundationsAt: M.Vec2;
  lanesAt: M.Vec2;
  width: number;
  height: number;
}

function sectionTitleFont(scale: number): number {
  return Math.round(Math.min(SECTION_TITLE_MAX_FONT, Math.max(13, 24 * scale)));
}

export class BoardScreen implements Screen {
  readonly element: HTMLElement;
  private readonly gameState: GameState;
  private readonly settings: BoardSettings;
  private run!: RunState;
  private initialRun!: RunState;
  private undoHistory: RunState[] = [];
  private redoHistory: RunState[] = [];
  private won = false;
  private activeHint: HintCandidate | null = null;
  private hintCandidateKey = "";
  private hintRotationIndex = -1;
  private readonly rng = createRng();
  private layoutScale = 1;
  private boardZoom = -1;
  private boardZoomUserControlled = false;
  private topRowVertical = false;
  private tableauLayoutCardCountFloor = 1;
  private geometry: BoardGeometry | null = null;
  private drag: DragState | null = null;
  private pan: PanState | null = null;
  private hoverPreview: HTMLElement | null = null;
  private hoverCardId = -1;
  private lastCardPress = { id: -1, time: 0 };
  private wheelAccumulator = 0;
  private layoutFrame = 0;
  private layoutPendingAfterDrag = false;
  private autoScrollFrame = 0;
  private autoScrollTime = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cleanup: (() => void)[] = [];

  private readonly statusLabel: HTMLElement;
  private readonly victoryActions: HTMLElement;
  private readonly moveCounter: HTMLElement;
  private readonly pointsValue: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly chainValue: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly newGameButton: HTMLButtonElement;
  private readonly giveUpButton: HTMLButtonElement;
  private readonly hintButton: HTMLButtonElement;
  private readonly autoHintButton: HTMLButtonElement;
  private readonly autoCompleteLabel: HTMLLabelElement;
  private readonly autoCompleteInput: HTMLInputElement;
  private readonly teleportButton: HTMLButtonElement;
  private readonly unloadButton: HTMLButtonElement;
  private readonly assembleButton: HTMLButtonElement;
  private readonly viewport: HTMLElement;
  private readonly content: HTMLElement;

  constructor(private readonly ctx: AppContext) {
    this.gameState = ctx.gameState;
    this.settings = this.gameState.getCurrentSettings();

    const toolbarButton = (label: string, onClick: () => void, extraClass = "") =>
      el("button", { className: `btn toolbar-btn ${extraClass}`.trim(), text: label, attrs: { type: "button" }, on: { click: onClick } });

    this.statusLabel = el("p", { className: "board-status", attrs: { role: "status", "aria-live": "polite" } });
    this.victoryActions = el("div", { className: "victory-actions", attrs: { hidden: true } }, [
      toolbarButton("メインメニューに戻る", () => this.backToMenu(), "btn-wide"),
      toolbarButton("続けて最初から", () => this.startNewRun(), "btn-wide btn-primary"),
    ]);
    this.undoButton = toolbarButton("1手戻す", () => this.undo());
    this.redoButton = toolbarButton("1手進める", () => this.redo());
    const resetButton = toolbarButton("初期化", () => this.resetBoard());
    this.newGameButton = toolbarButton("別のゲームを開始", () => this.onNewGamePressed());
    this.giveUpButton = toolbarButton("諦める", () => void this.onGiveUpPressed());
    this.hintButton = toolbarButton("ヒント", () => this.onHintPressed());
    this.autoHintButton = toolbarButton("自動移動", () => this.onAutoHintPressed());
    this.autoCompleteInput = el("input", { attrs: { type: "checkbox" } });
    this.autoCompleteInput.addEventListener("change", () => this.onAutoCompleteToggled(this.autoCompleteInput.checked));
    this.autoCompleteLabel = el("label", { className: "toolbar-check" }, [this.autoCompleteInput, el("span", { text: "自動完成" })]);
    this.moveCounter = el("span", { className: "move-counter", text: "手数: 0" });
    this.pointsValue = el("strong", { className: "resource-value", text: "0 P" });
    this.energyValue = el("strong", { className: "resource-value", text: "0 EN" });
    this.chainValue = el("small", { className: "resource-sub", text: "最大チェーン 1" });
    this.teleportButton = toolbarButton("テレポート 2 EN", () => this.onTeleportPressed(), "btn-skill");
    this.unloadButton = toolbarButton("アンロード 1 EN", () => this.onFreeCellDeepPressed(), "btn-skill");
    this.assembleButton = toolbarButton("アセンブル 3 EN", () => this.onInactiveColumnPressed(), "btn-skill");

    this.content = el("div", { className: "board-content" });
    this.viewport = el("div", { className: "board-viewport" }, [this.content]);
    const zoomControls = el("div", { className: "zoom-controls" }, [
      el("button", {
        className: "zoom-btn",
        text: "＋",
        attrs: { type: "button", title: "拡大", "aria-label": "拡大" },
        on: { click: () => this.zoomFromCenter(true) },
      }),
      el("button", {
        className: "zoom-btn",
        text: "－",
        attrs: { type: "button", title: "縮小", "aria-label": "縮小" },
        on: { click: () => this.zoomFromCenter(false) },
      }),
      el("button", {
        className: "zoom-btn zoom-fit",
        text: "全体",
        attrs: { type: "button", title: "盤面全体を表示" },
        on: { click: () => this.resetZoom() },
      }),
    ]);

    this.element = el("div", { className: "screen board-screen" }, [
      el("div", { className: "panel main-panel board-main" }, [
        el("header", { className: "board-header" }, [el("h1", { className: "board-title", text: "フリーセル盤面" }), this.statusLabel]),
        this.victoryActions,
        el("div", { className: "toolbar" }, [
          el("div", { className: "toolbar-row" }, [
            this.undoButton,
            this.redoButton,
            resetButton,
            this.newGameButton,
            this.giveUpButton,
            this.hintButton,
            this.autoHintButton,
            this.autoCompleteLabel,
            el("span", { className: "toolbar-spacer" }),
            this.moveCounter,
            el("div", { className: "resource-panel" }, [el("span", { className: "resource-header", text: "所持ポイント" }), this.pointsValue]),
          ]),
          el("div", { className: "toolbar-row toolbar-row-secondary" }, [
            el("span", { className: "toolbar-spacer" }),
            el("div", { className: "resource-panel resource-panel-stack" }, [
              el("span", { className: "resource-header", text: "エネルギー" }),
              this.energyValue,
              this.chainValue,
            ]),
            this.teleportButton,
            this.unloadButton,
            this.assembleButton,
          ]),
        ]),
        el("div", { className: "panel-card board-card" }, [this.viewport, zoomControls]),
      ]),
    ]);

    this.autoCompleteInput.checked = this.gameState.isAutoCompleteEnabled();
    this.bindBoardEvents();
    this.startNewRun();
  }

  mount(): void {
    this.resizeObserver = new ResizeObserver(() => this.queueLayoutRefresh());
    this.resizeObserver.observe(this.viewport);
    const onKeyDown = (event: KeyboardEvent) => this.onKeyDown(event);
    document.addEventListener("keydown", onKeyDown);
    this.cleanup.push(() => document.removeEventListener("keydown", onKeyDown));
    this.refreshBoardLayout();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.layoutFrame);
    cancelAnimationFrame(this.autoScrollFrame);
    this.cancelDrag();
    this.hideHoverPreview();
    for (const dispose of this.cleanup) {
      dispose();
    }
  }

  // ------------------------------------------------------------------
  // 進行
  // ------------------------------------------------------------------

  private startNewRun(): void {
    this.run = createInitialRunState(this.settings, this.rng, this.gameState.getInitialSortLaneCount(this.settings.lane_count));
    this.undoHistory = [];
    this.redoHistory = [];
    this.won = false;
    this.cancelDrag();
    this.clearActiveHint();
    syncChainProgress(this.run, this.settings, false, this.supports("chain_energy"));
    syncActiveLaneEnergyProgress(this.run, this.settings, false, this.supports("active_lane_energy"));
    this.runAutoCompleteChain();
    this.tableauLayoutCardCountFloor = Math.max(1, ...this.run.tableau.map((lane) => lane.length));
    this.initialRun = captureRunState(this.run);
    this.refreshAll();
    this.checkForVictory();
    if (!this.won) {
      this.setStatus("");
    }
  }

  private refreshAll(): void {
    this.renderBoard();
    this.updatePointsLabel();
    this.refreshUi();
  }

  private capture(): RunState {
    return captureRunState(this.run);
  }

  private restoreState(state: RunState): void {
    this.run = captureRunState(state);
    this.won = false;
    this.cancelDrag();
    this.clearActiveHint();
    this.refreshAll();
  }

  private checkForVictory(): void {
    if (this.won) {
      return;
    }
    if (!this.run.foundations.every((stack) => stack.length === this.settings.rank_count)) {
      return;
    }

    this.won = true;
    const earnedPoints = this.gameState.getClearScore(this.settings);
    const newAchievements = this.gameState.registerClear(this.settings);
    this.gameState.addPoints(earnedPoints);
    const autoPurchased = this.supports("auto_upgrade_purchase") ? this.gameState.purchaseAvailableUpgradesByDescendingCost() : [];
    this.renderBoard();
    this.updatePointsLabel();
    this.refreshUi();
    this.setStatus(this.buildVictoryStatusMessage(earnedPoints, newAchievements, autoPurchased));
  }

  private buildVictoryStatusMessage(earnedPoints: string, newAchievements: string[], autoPurchased: string[]): string {
    let message = `クリア。${formatInteger(earnedPoints)} 点を獲得しました。`;
    if (newAchievements.length > 0) {
      const titles = newAchievements.map((id) => this.gameState.getAchievement(id)?.title ?? id);
      message = `${message} 実績解放: ${titles.join(", ")}`;
    }
    if (autoPurchased.length > 0) {
      const titles = autoPurchased.map((id) => this.gameState.getUpgrade(id)?.title ?? id);
      message = `${message} 自動取得: ${titles.join(", ")}`;
    }
    return message;
  }

  /** 1 回の操作をまとめて undo 履歴に積む。何も動かなければ履歴を戻す。 */
  private performAction(action: () => boolean): boolean {
    this.clearActiveHint();
    this.undoHistory.push(this.capture());
    const previousRedo = this.redoHistory;
    this.redoHistory = [];
    if (!action()) {
      this.undoHistory.pop();
      this.redoHistory = previousRedo;
      return false;
    }
    return true;
  }

  private moveCardsFromSourceToTarget(source: MoveSource, target: MoveTarget, cardCount: number, grantEnergy = true): Card[] {
    const previousTableau = cloneTableau(this.run.tableau);
    const movedCards = getCardsFromSource(this.run, source, cardCount);
    if (movedCards.length === 0) {
      return [];
    }
    removeCardsFromSource(this.run, source, movedCards.length);
    applyCardsToTarget(this.run, movedCards, target);
    if (grantEnergy) {
      this.applyPostActionEnergy(previousTableau);
    }
    return movedCards;
  }

  private applyPostActionEnergy(previousTableau: Card[][]): void {
    const flags: EnergySupportFlags = {
      chain_energy: this.supports("chain_energy"),
      empty_lane_energy: this.supports("empty_lane_energy"),
      active_lane_energy: this.supports("active_lane_energy"),
      inactive_activation_energy: this.supports("inactive_activation_energy"),
    };
    applyPostActionEnergyProgress(this.run, this.settings, previousTableau, flags);
  }

  private runAutoCompleteChain(): number {
    let movedCount = 0;
    while (this.isAutoCompleteActive() && !this.won) {
      const move = findSafeAutoCompleteMove(this.run, this.settings);
      if (!move) {
        break;
      }
      this.moveCardsFromSourceToTarget(move.source, move.target, 1);
      movedCount += 1;
    }
    return movedCount;
  }

  private withAutoCompleteMessage(message: string, autoCompletedCount: number): string {
    return autoCompletedCount > 0 ? `${message} 自動完成で ${autoCompletedCount} 枚を送りました。` : message;
  }

  // ------------------------------------------------------------------
  // 機能解放
  // ------------------------------------------------------------------

  private supports(feature: FeatureId): boolean {
    return this.gameState.isFeatureUnlocked(feature);
  }

  private isAutoCompleteActive(): boolean {
    return this.supports("auto_complete") && this.gameState.isAutoCompleteEnabled();
  }

  private findHintCandidates(): HintCandidate[] {
    return findHintCandidates(this.run, this.settings, this.supports("bulk_move"));
  }

  private canUseTeleportSkill(): boolean {
    return this.supports("teleport_skill") && this.run.energy >= TELEPORT_ENERGY_COST && findTeleportTarget(this.run, this.settings) !== null;
  }

  private canUseFreeCellDeepSkill(): boolean {
    return (
      this.supports("free_cell_deep_skill") &&
      this.run.energy >= FREE_CELL_DEEP_ENERGY_COST &&
      findFreeCellDeepTarget(this.run, this.settings) !== null
    );
  }

  private canUseInactiveColumnSkill(): boolean {
    return (
      this.supports("inactive_column_skill") &&
      this.run.energy >= INACTIVE_COLUMN_ENERGY_COST &&
      findInactiveColumnSkillTarget(this.run, this.settings) !== null
    );
  }

  // ------------------------------------------------------------------
  // ツールバー
  // ------------------------------------------------------------------

  private refreshUi(): void {
    const supportsHint = this.supports("hint");
    const supportsAutoHint = this.supports("auto_hint_move");
    const hasHints = supportsHint && !this.won && this.findHintCandidates().length > 0;
    const state = buildToolbarState({
      won: this.won,
      moveCount: this.undoHistory.length,
      undoCount: this.undoHistory.length,
      redoCount: this.redoHistory.length,
      supportsHint,
      canShowHint: hasHints,
      supportsAutoComplete: this.supports("auto_complete"),
      autoCompleteEnabled: this.gameState.isAutoCompleteEnabled(),
      supportsAutoHintMove: supportsAutoHint,
      canAutoMoveHints: supportsAutoHint && hasHints,
      supportsTeleportSkill: this.supports("teleport_skill"),
      canUseTeleportSkill: !this.won && this.canUseTeleportSkill(),
      supportsFreeCellDeepSkill: this.supports("free_cell_deep_skill"),
      canUseFreeCellDeepSkill: !this.won && this.canUseFreeCellDeepSkill(),
      supportsInactiveColumnSkill: this.supports("inactive_column_skill"),
      canUseInactiveColumnSkill: !this.won && this.canUseInactiveColumnSkill(),
    });
    this.moveCounter.textContent = state.moveCounterText;
    this.undoButton.disabled = state.undoDisabled;
    this.redoButton.disabled = state.redoDisabled;
    this.newGameButton.disabled = state.newGameDisabled;
    this.giveUpButton.disabled = state.giveUpDisabled;
    this.hintButton.hidden = !state.hintVisible;
    this.hintButton.disabled = state.hintDisabled;
    this.autoCompleteLabel.hidden = !state.autoCompleteVisible;
    this.autoCompleteInput.disabled = state.autoCompleteDisabled;
    this.autoCompleteInput.checked = state.autoCompletePressed;
    this.autoHintButton.hidden = !state.autoHintVisible;
    this.autoHintButton.disabled = state.autoHintDisabled;
    this.teleportButton.hidden = !state.teleportVisible;
    this.teleportButton.disabled = state.teleportDisabled;
    this.unloadButton.hidden = !state.freeCellDeepVisible;
    this.unloadButton.disabled = state.freeCellDeepDisabled;
    this.assembleButton.hidden = !state.inactiveColumnVisible;
    this.assembleButton.disabled = state.inactiveColumnDisabled;
    this.victoryActions.hidden = !state.victoryActionsVisible;
  }

  private updatePointsLabel(): void {
    const state = buildResourceState({
      pointDisplayText: this.gameState.getRegularPointDisplayText(),
      energy: this.run.energy,
      maxChain: this.run.max_chain,
      supportsChainEnergy: this.supports("chain_energy"),
    });
    this.pointsValue.textContent = state.pointsText;
    this.energyValue.textContent = state.energyText;
    this.chainValue.textContent = state.chainText;
  }

  private setStatus(message: string): void {
    this.statusLabel.textContent = textPresentation(message);
    this.statusLabel.classList.toggle("is-empty", message.length === 0);
  }

  private undo(): void {
    if (this.undoHistory.length === 0) {
      this.setStatus("戻せる手がありません。");
      return;
    }
    this.redoHistory.push(this.capture());
    this.restoreState(this.undoHistory.pop() as RunState);
    this.setStatus("1 手戻しました。");
  }

  private redo(): void {
    if (this.redoHistory.length === 0) {
      this.setStatus("進められる手がありません。");
      return;
    }
    this.undoHistory.push(this.capture());
    this.restoreState(this.redoHistory.pop() as RunState);
    this.setStatus("1 手進めました。");
  }

  private resetBoard(): void {
    this.restoreState(this.initialRun);
    this.undoHistory = [];
    this.redoHistory = [];
    this.won = false;
    this.refreshUi();
    this.setStatus("盤面を初期化しました。");
  }

  private onNewGamePressed(): void {
    this.startNewRun();
    if (!this.won) {
      this.setStatus("新しいランダム盤面で開始しました。");
    }
  }

  private async onGiveUpPressed(): Promise<void> {
    this.cancelDrag();
    const confirmed = await confirmDialog({
      title: "挑戦を終了",
      message: "このプレイを諦めて設定画面に戻りますか？",
      okLabel: "諦める",
      danger: true,
    });
    if (confirmed) {
      this.backToMenu();
    }
  }

  private backToMenu(): void {
    this.cancelDrag();
    this.ctx.navigate("menu");
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (document.querySelector(".modal-backdrop")) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || this.won) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      this.redo();
    }
  }

  private onAutoCompleteToggled(pressed: boolean): void {
    if (!this.supports("auto_complete")) {
      this.autoCompleteInput.checked = false;
      return;
    }
    this.gameState.setAutoCompleteEnabled(pressed);
    this.refreshUi();
    if (!pressed) {
      this.setStatus("自動完成を OFF にしました。");
      return;
    }
    if (this.won) {
      this.setStatus("自動完成を ON にしました。");
      return;
    }

    this.cancelDrag();
    let autoCompletedCount = 0;
    const acted = this.performAction(() => {
      autoCompletedCount = this.runAutoCompleteChain();
      return autoCompletedCount > 0;
    });
    this.refreshAll();
    this.setStatus(
      acted ? `自動完成を ON にし、${autoCompletedCount} 枚を完成置き場へ送りました。` : "自動完成を ON にしました。",
    );
    this.checkForVictory();
  }

  private onHintPressed(): void {
    if (!this.supports("hint")) {
      this.setStatus("ヒントは M2 / C2 クリア実績で解放されます。");
      return;
    }
    const candidates = this.findHintCandidates();
    if (candidates.length === 0) {
      this.clearActiveHint();
      this.refreshAll();
      this.setStatus("現在の優先条件に合うヒントはありません。");
      return;
    }

    const candidateKey = makeHintCandidateKey(candidates);
    if (candidateKey === this.hintCandidateKey && this.hintRotationIndex >= 0) {
      this.hintRotationIndex = (this.hintRotationIndex + 1) % candidates.length;
    } else {
      this.hintCandidateKey = candidateKey;
      this.hintRotationIndex = 0;
    }
    this.activeHint = candidates[this.hintRotationIndex];
    this.renderBoard();
    this.refreshUi();
    this.setStatus(this.buildHintStatus(this.activeHint, this.hintRotationIndex + 1, candidates.length));
  }

  private buildHintStatus(hint: HintCandidate, displayIndex: number, totalCount: number): string {
    const prefix = `ヒント ${displayIndex}/${totalCount}: `;
    if (hint.priority === 1) {
      return `${prefix}${this.describeCard(hint.card)} を ${this.describeTarget(hint.source)} から ${this.describeTarget(hint.target)} へ移動できます。`;
    }
    const movingCount = hint.moving_count ?? 1;
    const payload = movingCount <= 1 ? this.describeCard(hint.card) : `${this.describeCard(hint.card)} からの ${movingCount} 枚の列`;
    const exposed = hint.exposed_card ? this.describeCard(hint.exposed_card) : "";
    return `${prefix}${payload} を ${this.describeTarget(hint.target)} へ移動すると、${exposed} が新しく最前列に出ます。`;
  }

  private onAutoHintPressed(): void {
    if (!this.supports("auto_hint_move")) {
      this.setStatus("自動移動は RE4 取得実績と RS3 取得実績で解放されます。");
      return;
    }
    if (!this.supports("hint")) {
      this.setStatus("ヒントが未解放のため自動移動を使えません。");
      return;
    }
    if (this.findHintCandidates().length === 0) {
      this.clearActiveHint();
      this.refreshAll();
      this.setStatus("自動移動できるヒントはありません。");
      return;
    }

    let hintMoves = 0;
    let autoCompleted = 0;
    this.performAction(() => {
      // 1 回の押下で、ヒント候補がなくなるまで最優先手を実行し続ける
      for (let guard = 0; guard < 10000 && !this.won; guard++) {
        const candidates = this.findHintCandidates();
        if (candidates.length === 0) {
          break;
        }
        const hint = candidates[0];
        const moved = this.moveCardsFromSourceToTarget(hint.source, hint.target, hint.moving_count ?? 1);
        if (moved.length === 0) {
          break;
        }
        hintMoves += 1;
        autoCompleted += this.runAutoCompleteChain();
      }
      return hintMoves > 0;
    });
    this.refreshAll();
    this.setStatus(this.withAutoCompleteMessage(`ヒント自動移動で ${hintMoves} 手動かしました。`, autoCompleted));
    this.checkForVictory();
  }

  private onTeleportPressed(): void {
    if (!this.canUseTeleportSkill()) {
      this.setStatus("テレポートを使えません。");
      return;
    }
    const target = findTeleportTarget(this.run, this.settings);
    if (!target) {
      this.setStatus("完成置き場へ送れるカードがありません。");
      return;
    }

    let autoCompleted = 0;
    this.performAction(() => {
      const previousTableau = cloneTableau(this.run.tableau);
      this.moveCardsFromSourceToTarget(target.source, target.target, 1, false);
      this.run.energy = Math.max(0, this.run.energy - TELEPORT_ENERGY_COST);
      this.applyPostActionEnergy(previousTableau);
      autoCompleted = this.runAutoCompleteChain();
      return true;
    });
    this.refreshAll();
    this.setStatus(
      this.withAutoCompleteMessage(
        `${this.describeCard(target.card)} をテレポートで ${this.describeTarget(target.target)} へ送りました。`,
        autoCompleted,
      ),
    );
    this.checkForVictory();
  }

  private onFreeCellDeepPressed(): void {
    if (!this.canUseFreeCellDeepSkill()) {
      this.setStatus("アンロードを使えません。");
      return;
    }
    const target = findFreeCellDeepTarget(this.run, this.settings);
    if (!target) {
      this.setStatus("フリーセルに送れるカードがありません。");
      return;
    }

    let autoCompleted = 0;
    this.performAction(() => {
      const previousTableau = cloneTableau(this.run.tableau);
      this.run.free_cells[target.source_index] = null;
      this.run.tableau[target.target_index].unshift(cloneCard(target.card));
      this.run.energy = Math.max(0, this.run.energy - FREE_CELL_DEEP_ENERGY_COST);
      this.applyPostActionEnergy(previousTableau);
      autoCompleted = this.runAutoCompleteChain();
      return true;
    });
    this.refreshAll();
    this.setStatus(
      this.withAutoCompleteMessage(
        `${this.describeCard(target.card)} をフリーセルからレーン ${target.target_index + 1} の奥へ送りました。`,
        autoCompleted,
      ),
    );
    this.checkForVictory();
  }

  private onInactiveColumnPressed(): void {
    if (!this.canUseInactiveColumnSkill()) {
      this.setStatus("アセンブルを使えません。");
      return;
    }
    const target = findInactiveColumnSkillTarget(this.run, this.settings);
    if (!target) {
      this.setStatus("空レーンへ置ける不活性カード列がありません。");
      return;
    }

    let autoCompleted = 0;
    this.performAction(() => {
      const previousTableau = cloneTableau(this.run.tableau);
      removeInactiveColumnSequence(this.run, target.sequence);
      const targetLane = this.run.tableau[target.target_lane_index];
      for (const entry of target.sequence) {
        targetLane.push(cloneCard(entry.card));
      }
      this.run.energy = Math.max(0, this.run.energy - INACTIVE_COLUMN_ENERGY_COST);
      this.applyPostActionEnergy(previousTableau);
      autoCompleted = this.runAutoCompleteChain();
      return true;
    });
    this.refreshAll();
    this.setStatus(
      this.withAutoCompleteMessage(
        `${target.sequence.length} 枚の不活性カード列をレーン ${target.target_lane_index + 1} へ集約しました。`,
        autoCompleted,
      ),
    );
    this.checkForVictory();
  }

  // ------------------------------------------------------------------
  // 表記
  // ------------------------------------------------------------------

  private describeCard(card: Pick<Card, "suit" | "rank">): string {
    return cardLabel(card, this.settings.marks_per_color);
  }

  private describePayload(cards: Card[]): string {
    return cards.length <= 1 ? this.describeCard(cards[0]) : `${cards.length} 枚の列`;
  }

  private describeTarget(target: { type: SlotType; index: number }): string {
    switch (target.type) {
      case "free_cell":
        return `フリーセル ${target.index + 1}`;
      case "foundation":
        return `完成置き場 ${getSuitInfo(target.index, this.settings.marks_per_color).short}`;
      case "lane":
        return `レーン ${target.index + 1}`;
      default:
        return "不明な場所";
    }
  }

  // ------------------------------------------------------------------
  // ヒント表示・カードの強調
  // ------------------------------------------------------------------

  private clearActiveHint(): void {
    this.activeHint = null;
    this.hintCandidateKey = "";
    this.hintRotationIndex = -1;
  }

  private isHintSource(sourceType: SlotType, sourceIndex: number, sourceCardIndex = -1): boolean {
    const hint = this.activeHint;
    if (!hint || hint.source.type !== sourceType || hint.source.index !== sourceIndex) {
      return false;
    }
    if (sourceType !== "lane") {
      return true;
    }
    const startIndex = hint.source.card_index ?? -1;
    const movingCount = hint.moving_count ?? 1;
    return sourceCardIndex >= startIndex && sourceCardIndex < startIndex + movingCount;
  }

  private isHintTarget(type: SlotType, index: number): boolean {
    return this.activeHint !== null && this.activeHint.target.type === type && this.activeHint.target.index === index;
  }

  private getCardHighlightKind(card: Card, isHintSource: boolean): HighlightKind {
    if (isHintSource) {
      return "hint";
    }
    if (canMoveToFoundation(this.run, card, card.suit) && isSafeAutoFoundationMove(this.run, this.settings, card)) {
      return "safe_foundation";
    }
    if (isReachCard(this.run, card)) {
      return "reach";
    }
    return "";
  }

  // ------------------------------------------------------------------
  // レイアウト
  // ------------------------------------------------------------------

  private counts(): M.BoardCounts {
    return {
      laneCount: this.settings.lane_count,
      freeCellCount: this.settings.free_cell_count,
      suitCount: this.settings.suit_count,
    };
  }

  private getViewportSize(): M.Vec2 {
    return { x: Math.max(this.viewport.clientWidth, 1), y: Math.max(this.viewport.clientHeight, 1) };
  }

  private queueLayoutRefresh(): void {
    if (this.layoutFrame) {
      return;
    }
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.refreshBoardLayout();
    });
  }

  private refreshBoardLayout(): void {
    if (this.drag) {
      // ドラッグ中に盤面を組み直すと操作が途切れるので、終了後に反映する
      this.layoutPendingAfterDrag = true;
      return;
    }
    const viewport = this.getViewportSize();
    const counts = this.counts();
    // Godot 版は幅 1180 未満で上段を縦積みにしていた。ブラウザでは画面比が様々なので、
    // 横並び・縦積みのうちカードが大きく表示できる方を選ぶ（同じなら横並び）。
    const horizontalScale = M.calculateLayoutScale(viewport, counts, false, METRICS);
    const verticalScale = M.calculateLayoutScale(viewport, counts, true, METRICS);
    this.topRowVertical = verticalScale > horizontalScale + 0.001;
    const minZoom = M.getMinBoardZoom(viewport, counts, this.topRowVertical, METRICS);
    const maxZoom = M.getMaxBoardZoom(viewport, METRICS);
    this.boardZoom = M.resolveBoardZoom(
      this.boardZoom,
      M.calculateLayoutScale(viewport, counts, this.topRowVertical, METRICS),
      minZoom,
      maxZoom,
      this.boardZoomUserControlled,
    );
    this.layoutScale = this.boardZoom;
    this.renderBoard();
    this.setBoardScroll(this.viewport.scrollLeft, this.viewport.scrollTop);
  }

  private computeGeometry(): BoardGeometry {
    const scale = this.layoutScale;
    const viewport = this.getViewportSize();
    const slot = M.getSlotSize(scale, METRICS);
    const card = M.getCardSize(scale, METRICS);
    const lane = M.getLaneSize(scale, viewport, this.topRowVertical, METRICS);
    const titleHeight = M.sectionTitleHeight(scale);
    const sectionGap = M.slotSectionGap(scale, METRICS);
    const slotGap = M.slotGap(scale, METRICS);
    const laneGap = M.laneGap(scale, METRICS);
    const topRowGap = M.topRowGap(scale, METRICS);
    const boardGap = M.boardSectionGap(scale, METRICS);
    // 見出しは盤面の倍率に合わせて縮め、セクション幅はスロット列と見出し（5 文字）の広い方にする
    const titleFont = sectionTitleFont(scale);
    const titleWidth = titleFont * 5;
    const freeCellsWidth = Math.max(M.requiredWidth(this.settings.free_cell_count, slot.x, slotGap), titleWidth);
    const foundationsWidth = Math.max(M.requiredWidth(this.settings.suit_count, slot.x, slotGap), titleWidth);
    const lanesWidth = M.requiredWidth(this.settings.lane_count, lane.x, laneGap);
    const sectionHeight = titleHeight + sectionGap + slot.y;

    let foundationsAt: M.Vec2;
    let topRowHeight: number;
    let width: number;
    if (this.topRowVertical) {
      foundationsAt = { x: 0, y: sectionHeight + topRowGap };
      topRowHeight = sectionHeight * 2 + topRowGap;
      width = Math.max(lanesWidth, freeCellsWidth, foundationsWidth);
    } else {
      const spacer = Math.max(0, lanesWidth - (freeCellsWidth + foundationsWidth + topRowGap * 2));
      foundationsAt = { x: freeCellsWidth + topRowGap * 2 + spacer, y: 0 };
      topRowHeight = sectionHeight;
      width = Math.max(lanesWidth, freeCellsWidth + foundationsWidth + topRowGap * 2);
    }
    const lanesAt = { x: 0, y: topRowHeight + boardGap };
    const height = lanesAt.y + titleHeight + sectionGap + lane.y;
    return {
      scale,
      titleFont,
      slot,
      card,
      lane,
      titleHeight,
      sectionGap,
      slotGap,
      laneGap,
      freeCellsAt: { x: 0, y: 0 },
      foundationsAt,
      lanesAt,
      width,
      height,
    };
  }

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------

  private renderBoard(skipDragSource = false): void {
    this.hideHoverPreview();
    const g = this.computeGeometry();
    this.geometry = g;
    const scale = g.scale;
    const dragSource = skipDragSource && this.drag ? this.drag.source : null;
    const isDragSource = (type: SlotType, index: number) => dragSource !== null && dragSource.type === type && dragSource.index === index;
    const html: string[] = [];
    const titleStyle = `height:${px(g.titleHeight)};font-size:${g.titleFont}px;line-height:${px(g.titleHeight)}`;

    const sectionTitle = (text: string, at: M.Vec2) =>
      `<div class="board-section-title" style="left:${px(at.x)};top:${px(at.y)};${titleStyle}">${text}</div>`;

    // フリーセル
    html.push(sectionTitle("フリーセル", g.freeCellsAt));
    this.run.free_cells.forEach((card, index) => {
      const x = g.freeCellsAt.x + index * (g.slot.x + g.slotGap);
      const y = g.freeCellsAt.y + g.titleHeight + g.sectionGap;
      const hidden = isDragSource("free_cell", index);
      const showCard = card !== null && !hidden;
      let cardHtml = "";
      if (card && showCard) {
        const kind = this.getCardHighlightKind(card, this.isHintSource("free_cell", index));
        cardHtml = this.cardHtml(card, "free_cell", index, -1, true, false, kind, 0, 0, g);
      }
      html.push(this.slotHtml("free_cell", index, `FC ${index + 1}`, FREE_CELL_ACCENT, x, y, g, !showCard, cardHtml));
    });

    // 完成置き場
    html.push(sectionTitle("完成置き場", g.foundationsAt));
    this.run.foundations.forEach((stack, index) => {
      const x = g.foundationsAt.x + index * (g.slot.x + g.slotGap);
      const y = g.foundationsAt.y + g.titleHeight + g.sectionGap;
      const suit = getSuitInfo(index, this.settings.marks_per_color);
      const topCard = stack.length > 0 ? stack[stack.length - 1] : null;
      const hidden = isDragSource("foundation", index);
      const showCard = topCard !== null && !hidden;
      const cardHtml = topCard && showCard ? this.cardHtml(topCard, "foundation", index, -1, true, false, "", 0, 0, g) : "";
      html.push(this.slotHtml("foundation", index, suit.short, suit.accent, x, y, g, !showCard, cardHtml));
    });

    // レーン
    html.push(sectionTitle("レーン", g.lanesAt));
    const visibleCounts = this.run.tableau.map((lane, laneIndex) =>
      dragSource && dragSource.type === "lane" && dragSource.index === laneIndex ? dragSource.card_index ?? lane.length - 1 : lane.length,
    );
    const layoutCardCount = Math.max(this.tableauLayoutCardCountFloor, 1, ...visibleCounts);
    const laneBodyTop = M.getLaneBodyTop(scale, METRICS);
    const offset = M.getTableauOffset(layoutCardCount, M.getLaneBodyHeight(g.lane, scale, METRICS), scale, METRICS);
    const supportsBulk = this.supports("bulk_move");
    this.run.tableau.forEach((stack, laneIndex) => {
      const x = g.lanesAt.x + laneIndex * (g.lane.x + g.laneGap);
      const y = g.lanesAt.y + g.titleHeight + g.sectionGap;
      const visibleCount = visibleCounts[laneIndex];
      const cards: string[] = [];
      for (let cardIndex = 0; cardIndex < visibleCount; cardIndex++) {
        const card = stack[cardIndex];
        const canDrag =
          cardIndex === visibleCount - 1 ||
          (supportsBulk && isValidLaneSequence(stack, cardIndex, this.settings.color_count, this.settings.marks_per_color));
        const inactive = !isActiveTableauCard(stack, cardIndex, this.settings.color_count, this.settings.marks_per_color);
        const kind = this.getCardHighlightKind(card, this.isHintSource("lane", laneIndex, cardIndex));
        const left = (g.lane.x - g.card.x) * 0.5;
        const top = laneBodyTop + cardIndex * offset;
        cards.push(this.cardHtml(card, "lane", laneIndex, cardIndex, canDrag, inactive, kind, left, top, g));
      }
      html.push(this.laneHtml(laneIndex, x, y, g, visibleCount === 0, cards.join("")));
    });

    this.content.style.width = px(g.width);
    this.content.style.height = px(g.height);
    this.content.innerHTML = html.join("");
  }

  private slotHtml(
    type: SlotType,
    index: number,
    placeholder: string,
    accent: Color,
    x: number,
    y: number,
    g: BoardGeometry,
    placeholderVisible: boolean,
    cardHtml: string,
  ): string {
    const radius = Math.max(10, Math.round(18 * g.scale));
    const fontSize = Math.max(12, Math.round(22 * g.scale));
    const style =
      `left:${px(x)};top:${px(y)};width:${px(g.slot.x)};height:${px(g.slot.y)};border-radius:${radius}px;` +
      `border-color:${css(darkened(accent, 0.1))}`;
    const label = placeholderVisible
      ? `<span class="slot-placeholder" style="font-size:${fontSize}px;color:${css(lightened(accent, 0.32))}">${escapeHtml(textPresentation(placeholder))}</span>`
      : "";
    return `<div class="slot" data-slot-type="${type}" data-slot-index="${index}" style="${style}">${label}${cardHtml}</div>`;
  }

  private laneHtml(index: number, x: number, y: number, g: BoardGeometry, empty: boolean, cardsHtml: string): string {
    const highlighted = this.isHintTarget("lane", index);
    const radius = Math.max(10, Math.round(16 * g.scale));
    const border = highlighted ? Math.max(3, Math.round(4 * g.scale)) : 1;
    const headerHeight = M.getLaneHeaderHeight(g.scale, METRICS);
    const style =
      `left:${px(x)};top:${px(y)};width:${px(g.lane.x)};height:${px(g.lane.y)};border-radius:${radius}px;` +
      `border-width:${border}px`;
    const headerStyle = `top:${px(6 * g.scale)};height:${px(headerHeight - 6 * g.scale)};font-size:${Math.max(12, Math.round(20 * g.scale))}px`;
    const emptyLabel = empty
      ? `<span class="lane-empty" style="top:${px(headerHeight + 12 * g.scale)};font-size:${Math.max(11, Math.round(18 * g.scale))}px">${g.lane.x < COMPACT_LANE_WIDTH ? "空き" : "ここへカードを置く"}</span>`
      : "";
    return (
      `<div class="slot lane${highlighted ? " is-hint-target" : ""}" data-slot-type="lane" data-slot-index="${index}" style="${style}">` +
      `<span class="lane-header" style="${headerStyle}">${g.lane.x < COMPACT_LANE_WIDTH ? "" : "レーン "}${index + 1}</span>${emptyLabel}${cardsHtml}</div>`
    );
  }

  private cardHtml(
    card: Card,
    sourceType: SlotType,
    sourceIndex: number,
    sourceCardIndex: number,
    draggable: boolean,
    inactive: boolean,
    highlightKind: HighlightKind,
    left: number,
    top: number,
    g: BoardGeometry,
  ): string {
    const svg = renderCardSvg({
      card,
      marksPerColor: this.settings.marks_per_color,
      displayScale: g.scale,
      cornerCycleIndex: sourceType === "lane" ? sourceCardIndex : 0,
      inactive,
      highlightKind,
    });
    const attrs =
      `data-src="${sourceType}" data-index="${sourceIndex}" data-card-index="${sourceCardIndex}" data-id="${card.id}"` +
      (draggable && !this.won ? ` data-drag="1"` : "") +
      (sourceType === "lane" ? ` data-hover="1"` : "");
    const style = `left:${px(left)};top:${px(top)};width:${px(g.card.x)};height:${px(g.card.y)}`;
    const label = escapeHtml(this.describeCard(card));
    return `<div class="card${draggable && !this.won ? " is-draggable" : ""}" ${attrs} style="${style}" role="img" aria-label="${label}">${svg}</div>`;
  }

  private renderCardStack(cards: Card[], scale: number, offset: number, withState: boolean): HTMLElement {
    const cardSize = M.getCardSize(scale, METRICS);
    const wrapper = el("div", { className: "card-stack" });
    wrapper.style.width = px(cardSize.x);
    wrapper.style.height = px(cardSize.y + Math.max(0, cards.length - 1) * offset);
    wrapper.innerHTML = cards
      .map((card, index) => {
        const svg = renderCardSvg({
          card,
          marksPerColor: this.settings.marks_per_color,
          displayScale: scale,
          highlightKind: withState ? this.getCardHighlightKind(card, false) : "",
        });
        return `<div class="card" style="left:0;top:${px(index * offset)};width:${px(cardSize.x)};height:${px(cardSize.y)}">${svg}</div>`;
      })
      .join("");
    return wrapper;
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------

  private bindBoardEvents(): void {
    this.content.addEventListener("pointerdown", (event) => {
      const cardElement = (event.target as HTMLElement).closest<HTMLElement>(".card[data-drag]");
      if (cardElement && event.button === 0) {
        this.onCardPointerDown(event, cardElement);
      }
    });
    this.viewport.addEventListener("pointerdown", (event) => this.onViewportPointerDown(event));
    this.viewport.addEventListener(
      "wheel",
      (event) => {
        if (this.drag) {
          return;
        }
        event.preventDefault();
        // マウスホイール 1 ノッチで 1 段、トラックパッドは移動量を貯めて 1 段ずつ拡大縮小する
        const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 600 : 1;
        this.wheelAccumulator += event.deltaY * unit;
        if (Math.abs(this.wheelAccumulator) >= 80) {
          this.zoomBoard(this.wheelAccumulator < 0, event.clientX, event.clientY);
          this.wheelAccumulator = 0;
        }
      },
      { passive: false },
    );
    this.content.addEventListener("pointerover", (event) => this.onCardHover(event));
    this.content.addEventListener("pointerout", (event) => {
      const cardElement = (event.target as HTMLElement).closest<HTMLElement>(".card[data-hover]");
      const related = event.relatedTarget as HTMLElement | null;
      if (cardElement && !(related && cardElement.contains(related))) {
        if (Number(cardElement.dataset.id) === this.hoverCardId) {
          this.hideHoverPreview();
        }
      }
    });

    const onPointerMove = (event: PointerEvent) => this.onWindowPointerMove(event);
    const onPointerUp = (event: PointerEvent) => this.onWindowPointerUp(event);
    const onPointerCancel = (event: PointerEvent) => {
      if (this.drag && event.pointerId === this.drag.pointerId) {
        this.cancelDrag();
        this.renderBoard();
      }
      this.pan = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    this.cleanup.push(() => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    });
  }

  private readCardElement(element: HTMLElement): { card: Card; type: SlotType; index: number; cardIndex: number } | null {
    const type = element.dataset.src as SlotType;
    const index = Number(element.dataset.index);
    const cardIndex = Number(element.dataset.cardIndex);
    let card: Card | null | undefined = null;
    if (type === "free_cell") {
      card = this.run.free_cells[index];
    } else if (type === "foundation") {
      const stack = this.run.foundations[index];
      card = stack[stack.length - 1];
    } else if (type === "lane") {
      card = this.run.tableau[index]?.[cardIndex];
    }
    return card ? { card, type, index, cardIndex } : null;
  }

  private onCardPointerDown(event: PointerEvent, cardElement: HTMLElement): void {
    if (this.drag || this.won) {
      return;
    }
    const info = this.readCardElement(cardElement);
    if (!info) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const now = performance.now();
    if (this.lastCardPress.id === info.card.id && now - this.lastCardPress.time < DOUBLE_CLICK_MS) {
      this.lastCardPress = { id: -1, time: 0 };
      this.onCardDoubleClicked(info.card, info.type, info.index, info.cardIndex);
      return;
    }
    this.lastCardPress = { id: info.card.id, time: now };
    this.startDrag(event, info.card, info.type, info.index, info.cardIndex);
  }

  private getLaneDragCards(laneIndex: number, startIndex: number): Card[] {
    const stack = this.run.tableau[laneIndex];
    if (!isValidLaneSequence(stack, startIndex, this.settings.color_count, this.settings.marks_per_color)) {
      return [];
    }
    return stack.slice(startIndex).map(cloneCard);
  }

  private startDrag(event: PointerEvent, card: Card, type: SlotType, index: number, cardIndex: number): void {
    let movingCards: Card[];
    if (type === "lane") {
      const startIndex = cardIndex >= 0 ? cardIndex : this.run.tableau[index].length - 1;
      movingCards = this.getLaneDragCards(index, startIndex);
      if (movingCards.length === 0) {
        return;
      }
    } else {
      movingCards = [cloneCard(card)];
    }

    this.clearActiveHint();
    this.hideHoverPreview();
    const cardSize = M.getCardSize(this.layoutScale, METRICS);
    const offset = Math.min(
      M.getTableauOffset(movingCards.length, M.getLaneBodyHeight(this.geometry?.lane ?? cardSize, this.layoutScale, METRICS), this.layoutScale, METRICS),
      22 * this.layoutScale,
    );
    const preview = this.renderCardStack(movingCards, this.layoutScale, offset, false);
    preview.classList.add("drag-preview");
    this.drag = {
      cards: movingCards,
      source: { type, index, card_index: cardIndex },
      preview,
      offsetX: cardSize.x * 0.5,
      offsetY: cardSize.y * 0.35,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      previousStatus: this.statusLabel.textContent ?? "",
    };
    this.renderBoard(true);
    this.capturePointer(event.pointerId);
    document.body.append(preview);
    this.positionDragPreview();
    this.element.classList.add("is-dragging");
    this.setStatus(`${this.describePayload(movingCards)} を移動中です。`);
    this.autoScrollTime = performance.now();
    this.autoScrollFrame = requestAnimationFrame((time) => this.autoScrollStep(time));
  }

  /** 押したカード要素は再描画で消えるため、ポインターはビューポートで捕捉する */
  private capturePointer(pointerId: number): void {
    try {
      this.viewport.setPointerCapture(pointerId);
    } catch {
      // 既に離されたポインターなどは無視する
    }
  }

  private positionDragPreview(): void {
    if (!this.drag) {
      return;
    }
    const { preview, lastX, lastY, offsetX, offsetY } = this.drag;
    preview.style.transform = `translate(${px(lastX - offsetX)}, ${px(lastY - offsetY)})`;
  }

  private onWindowPointerMove(event: PointerEvent): void {
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > CLICK_MOVE_TOLERANCE) {
        this.drag.moved = true;
      }
      this.positionDragPreview();
      return;
    }
    if (this.pan && event.pointerId === this.pan.pointerId) {
      const dx = event.clientX - this.pan.lastX;
      const dy = event.clientY - this.pan.lastY;
      this.pan.lastX = event.clientX;
      this.pan.lastY = event.clientY;
      this.setBoardScroll(this.viewport.scrollLeft - dx, this.viewport.scrollTop - dy);
      return;
    }
    if (this.hoverPreview) {
      this.positionHoverPreview(event.clientX, event.clientY);
    }
  }

  private onWindowPointerUp(event: PointerEvent): void {
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.finishDrag(event.clientX, event.clientY);
      return;
    }
    if (this.pan && event.pointerId === this.pan.pointerId) {
      this.pan = null;
      this.viewport.classList.remove("is-panning");
    }
  }

  private finishDrag(clientX: number, clientY: number): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    const target = this.findDropTarget(clientX, clientY);
    const valid =
      target !== null && isValidMove(this.run, this.settings, drag.source, target, drag.cards, this.supports("bulk_move"));
    if (drag.moved) {
      // 実際に動かした後のクリックはダブルクリックとして扱わない
      this.lastCardPress = { id: -1, time: 0 };
    }
    if (!target || !valid) {
      this.cancelDrag();
      // その場でのクリック（ダブルクリックの 1 回目など）は失敗扱いにせず、表示も元に戻す
      this.setStatus(drag.moved ? "そこには置けません。" : drag.previousStatus);
      this.afterDragLayout();
      return;
    }

    let movedCards: Card[] = [];
    let autoCompleted = 0;
    this.performAction(() => {
      movedCards = this.moveCardsFromSourceToTarget(drag.source, target, drag.cards.length);
      autoCompleted = this.runAutoCompleteChain();
      return movedCards.length > 0;
    });
    this.cancelDrag();
    this.afterDragLayout();
    this.updatePointsLabel();
    this.refreshUi();
    if (movedCards.length > 0) {
      this.setStatus(
        this.withAutoCompleteMessage(`${this.describePayload(movedCards)} を ${this.describeTarget(target)} へ移動しました。`, autoCompleted),
      );
    }
    this.checkForVictory();
  }

  private afterDragLayout(): void {
    if (this.layoutPendingAfterDrag) {
      this.layoutPendingAfterDrag = false;
      this.refreshBoardLayout();
    } else {
      this.renderBoard();
    }
  }

  private findDropTarget(clientX: number, clientY: number): MoveTarget | null {
    const slots = this.content.querySelectorAll<HTMLElement>(".slot[data-slot-type]");
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { type: slot.dataset.slotType as SlotType, index: Number(slot.dataset.slotIndex) };
      }
    }
    return null;
  }

  private cancelDrag(): void {
    if (!this.drag) {
      return;
    }
    this.drag.preview.remove();
    this.drag = null;
    cancelAnimationFrame(this.autoScrollFrame);
    this.autoScrollFrame = 0;
    this.element.classList.remove("is-dragging");
    this.hideHoverPreview();
  }

  /** ドラッグ中、盤面の端に近づくと自動でスクロールする */
  private autoScrollStep(time: number): void {
    if (!this.drag) {
      return;
    }
    const delta = Math.min(0.05, Math.max(0, (time - this.autoScrollTime) / 1000));
    this.autoScrollTime = time;
    const rect = this.viewport.getBoundingClientRect();
    const { lastX, lastY } = this.drag;
    const margin = BOARD_EDGE_SCROLL_MARGIN;
    const inside =
      lastX >= rect.left - margin && lastX <= rect.right + margin && lastY >= rect.top - margin && lastY <= rect.bottom + margin;
    if (inside) {
      const vx = this.edgeVelocity(lastX, rect.left, rect.right);
      const vy = this.edgeVelocity(lastY, rect.top, rect.bottom);
      if (vx !== 0 || vy !== 0) {
        this.setBoardScroll(this.viewport.scrollLeft + vx * delta, this.viewport.scrollTop + vy * delta);
      }
    }
    this.autoScrollFrame = requestAnimationFrame((next) => this.autoScrollStep(next));
  }

  private edgeVelocity(pointer: number, min: number, max: number): number {
    const margin = BOARD_EDGE_SCROLL_MARGIN;
    if (pointer < min + margin) {
      return -BOARD_EDGE_SCROLL_SPEED * (1 - Math.max(pointer - min, 0) / margin);
    }
    if (pointer > max - margin) {
      return BOARD_EDGE_SCROLL_SPEED * (1 - Math.max(max - pointer, 0) / margin);
    }
    return 0;
  }

  private onViewportPointerDown(event: PointerEvent): void {
    if (this.drag || event.button !== 0) {
      return;
    }
    // スクロールバー上の操作はブラウザに任せる
    const rect = this.viewport.getBoundingClientRect();
    if (event.clientX - rect.left > this.viewport.clientWidth || event.clientY - rect.top > this.viewport.clientHeight) {
      return;
    }
    if ((event.target as HTMLElement).closest(".card[data-drag]")) {
      return;
    }
    event.preventDefault();
    this.hideHoverPreview();
    this.pan = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    this.capturePointer(event.pointerId);
    this.viewport.classList.add("is-panning");
  }

  private zoomBoard(zoomIn: boolean, clientX: number, clientY: number): void {
    if (this.drag) {
      return;
    }
    const viewport = this.getViewportSize();
    const counts = this.counts();
    const minZoom = M.getMinBoardZoom(viewport, counts, this.topRowVertical, METRICS);
    const maxZoom = M.getMaxBoardZoom(viewport, METRICS);
    const multiplier = zoomIn ? BOARD_ZOOM_STEP : 1 / BOARD_ZOOM_STEP;
    const newZoom = Math.min(Math.max(this.boardZoom * multiplier, minZoom), maxZoom);
    if (Math.abs(newZoom - this.boardZoom) < 0.0001) {
      return;
    }

    // 盤面が狭いときは中央寄せになるため、その余白も考慮して基準点を保つ
    const rect = this.viewport.getBoundingClientRect();
    const anchorX = clientX - rect.left;
    const anchorY = clientY - rect.top;
    const baseX = (this.viewport.scrollLeft + anchorX - this.content.offsetLeft) / Math.max(this.boardZoom, 0.001);
    const baseY = (this.viewport.scrollTop + anchorY - this.content.offsetTop) / Math.max(this.boardZoom, 0.001);
    this.boardZoom = newZoom;
    this.boardZoomUserControlled = true;
    this.refreshBoardLayout();
    this.setBoardScroll(
      baseX * this.boardZoom + this.content.offsetLeft - anchorX,
      baseY * this.boardZoom + this.content.offsetTop - anchorY,
    );
  }

  private zoomFromCenter(zoomIn: boolean): void {
    const rect = this.viewport.getBoundingClientRect();
    this.zoomBoard(zoomIn, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  private resetZoom(): void {
    this.boardZoomUserControlled = false;
    this.refreshBoardLayout();
    this.setBoardScroll(0, 0);
  }

  private setBoardScroll(x: number, y: number): void {
    const maxX = Math.max(this.content.offsetWidth - this.viewport.clientWidth, 0);
    const maxY = Math.max(this.content.offsetHeight - this.viewport.clientHeight, 0);
    this.viewport.scrollLeft = Math.round(Math.min(Math.max(x, 0), maxX));
    this.viewport.scrollTop = Math.round(Math.min(Math.max(y, 0), maxY));
  }

  // ------------------------------------------------------------------
  // ホバー拡大表示
  // ------------------------------------------------------------------

  private onCardHover(event: PointerEvent): void {
    if (event.pointerType !== "mouse" || this.drag || this.pan || this.won) {
      return;
    }
    const cardElement = (event.target as HTMLElement).closest<HTMLElement>(".card[data-hover]");
    if (!cardElement) {
      return;
    }
    const info = this.readCardElement(cardElement);
    if (!info || info.card.id === this.hoverCardId) {
      return;
    }
    this.hideHoverPreview();
    const stack = this.run.tableau[info.index];
    const scale = Math.max(1, this.layoutScale + 0.22);
    const cardSize = M.getCardSize(scale, METRICS);
    const preview = el("div", { className: "hover-preview" });
    preview.style.width = px(cardSize.x);
    preview.style.height = px(cardSize.y);
    preview.innerHTML = renderCardSvg({
      card: info.card,
      marksPerColor: this.settings.marks_per_color,
      displayScale: scale,
      cornerCycleIndex: info.cardIndex,
      inactive: !isActiveTableauCard(stack, info.cardIndex, this.settings.color_count, this.settings.marks_per_color),
      highlightKind: this.getCardHighlightKind(info.card, false),
    });
    document.body.append(preview);
    this.hoverPreview = preview;
    this.hoverCardId = info.card.id;
    this.positionHoverPreview(event.clientX, event.clientY);
  }

  private positionHoverPreview(clientX: number, clientY: number): void {
    if (!this.hoverPreview) {
      return;
    }
    const width = this.hoverPreview.offsetWidth;
    const height = this.hoverPreview.offsetHeight;
    const x = Math.min(Math.max(clientX + 16, 8), window.innerWidth - width - 8);
    const y = Math.min(Math.max(clientY - height * 0.45, 8), window.innerHeight - height - 8);
    this.hoverPreview.style.transform = `translate(${px(x)}, ${px(y)})`;
  }

  private hideHoverPreview(): void {
    this.hoverCardId = -1;
    this.hoverPreview?.remove();
    this.hoverPreview = null;
  }

  // ------------------------------------------------------------------
  // ダブルクリック移動
  // ------------------------------------------------------------------

  private onCardDoubleClicked(card: Card, sourceType: SlotType, sourceIndex: number, sourceCardIndex: number): void {
    if (this.drag || this.won) {
      return;
    }
    const move = this.getDoubleClickMove(card, sourceType, sourceIndex, sourceCardIndex);
    if (!move) {
      return;
    }

    let movedCards: Card[] = [];
    let autoCompleted = 0;
    const acted = this.performAction(() => {
      movedCards = this.moveCardsFromSourceToTarget(move.source, move.target, move.moving_count);
      if (movedCards.length === 0) {
        return false;
      }
      autoCompleted = this.runAutoCompleteChain();
      return true;
    });
    if (!acted) {
      return;
    }
    this.refreshAll();
    this.setStatus(
      this.withAutoCompleteMessage(`${this.describePayload(movedCards)} を ${this.describeTarget(move.target)} へ移動しました。`, autoCompleted),
    );
    this.checkForVictory();
  }

  private isDraggableLaneStart(stack: Card[], startIndex: number): boolean {
    return isDraggableLaneStart(stack, startIndex, this.settings, this.supports("bulk_move"));
  }

  private getDoubleClickMove(card: Card, sourceType: SlotType, sourceIndex: number, sourceCardIndex: number): PlannedMove | null {
    const sourceInfo = this.getDoubleClickSourceInfo(card, sourceType, sourceIndex, sourceCardIndex);
    if (!sourceInfo) {
      return null;
    }

    const foundationMove = this.getDoubleClickFoundationMove(sourceInfo.card, sourceType, sourceIndex, sourceCardIndex);
    if (foundationMove) {
      return foundationMove;
    }

    if (sourceType === "free_cell") {
      for (const emptyOnly of [false, true]) {
        const laneTarget = this.findBestDoubleClickLaneTarget(sourceInfo.card, -1, 1, emptyOnly);
        if (laneTarget) {
          return { card: cloneCard(sourceInfo.card), source: sourceInfo.source, target: laneTarget, moving_count: 1 };
        }
      }
    } else if (sourceType === "lane") {
      const laneTarget = this.findBestDoubleClickLaneTarget(sourceInfo.card, sourceIndex, sourceInfo.moving_count, false);
      if (laneTarget) {
        return { card: cloneCard(sourceInfo.card), source: sourceInfo.source, target: laneTarget, moving_count: sourceInfo.moving_count };
      }
      return (
        this.findBestDoubleClickLaneMove(sourceIndex, sourceCardIndex + 1, false) ??
        this.findBestDoubleClickLaneMove(sourceIndex, sourceCardIndex, true) ??
        this.findDoubleClickFreeCellMove(sourceIndex)
      );
    }
    return null;
  }

  private getDoubleClickSourceInfo(
    card: Card,
    sourceType: SlotType,
    sourceIndex: number,
    sourceCardIndex: number,
  ): { card: Card; source: MoveSource; moving_count: number } | null {
    if (sourceType === "free_cell") {
      const current = this.run.free_cells[sourceIndex];
      if (!current || current.id !== card.id) {
        return null;
      }
      return { card: cloneCard(current), source: { type: "free_cell", index: sourceIndex, card_index: -1 }, moving_count: 1 };
    }
    if (sourceType === "lane") {
      const stack = this.run.tableau[sourceIndex];
      if (!stack || sourceCardIndex < 0 || sourceCardIndex >= stack.length) {
        return null;
      }
      if (!this.isDraggableLaneStart(stack, sourceCardIndex)) {
        return null;
      }
      const current = stack[sourceCardIndex];
      if (current.id !== card.id) {
        return null;
      }
      return {
        card: cloneCard(current),
        source: { type: "lane", index: sourceIndex, card_index: sourceCardIndex },
        moving_count: stack.length - sourceCardIndex,
      };
    }
    return null;
  }

  private getDoubleClickFoundationMove(card: Card, sourceType: SlotType, sourceIndex: number, sourceCardIndex: number): PlannedMove | null {
    if (!isReachCard(this.run, card) || !canMoveToFoundation(this.run, card, card.suit)) {
      return null;
    }
    if (sourceType === "free_cell") {
      const current = this.run.free_cells[sourceIndex];
      if (!current || current.id !== card.id) {
        return null;
      }
    } else if (sourceType === "lane") {
      const stack = this.run.tableau[sourceIndex];
      if (!stack || stack.length === 0 || sourceCardIndex !== stack.length - 1 || stack[stack.length - 1].id !== card.id) {
        return null;
      }
    } else {
      return null;
    }
    return {
      card: cloneCard(card),
      source: { type: sourceType, index: sourceIndex, card_index: sourceCardIndex },
      target: { type: "foundation", index: card.suit },
      moving_count: 1,
    };
  }

  private findBestDoubleClickLaneTarget(card: Card, sourceLaneIndex: number, movingCount: number, emptyOnly: boolean): MoveTarget | null {
    let best: MoveTarget | null = null;
    let bestInactiveCount = 1 << 30;
    let bestLaneIndex = 1 << 30;
    this.run.tableau.forEach((targetLane, targetLaneIndex) => {
      if (targetLaneIndex === sourceLaneIndex || (targetLane.length === 0) !== emptyOnly) {
        return;
      }
      if (!canMoveToLane(this.run, this.settings, card, targetLaneIndex)) {
        return;
      }
      if (sourceLaneIndex >= 0 && movingCount > getMaxMovableCardCount(this.run, sourceLaneIndex, targetLaneIndex)) {
        return;
      }
      const inactiveCount = emptyOnly ? 0 : getInactiveCardCount(targetLane, this.settings);
      if (inactiveCount < bestInactiveCount || (inactiveCount === bestInactiveCount && targetLaneIndex < bestLaneIndex)) {
        bestInactiveCount = inactiveCount;
        bestLaneIndex = targetLaneIndex;
        best = { type: "lane", index: targetLaneIndex };
      }
    });
    return best;
  }

  /** 押したカードより上の部分列（または押したカードからの列）を移せるレーンを探す */
  private findBestDoubleClickLaneMove(sourceLaneIndex: number, fromIndex: number, emptyOnly: boolean): PlannedMove | null {
    const stack = this.run.tableau[sourceLaneIndex];
    if (!stack) {
      return null;
    }
    for (let startIndex = fromIndex; startIndex < stack.length; startIndex++) {
      if (!this.isDraggableLaneStart(stack, startIndex)) {
        continue;
      }
      const movingCount = stack.length - startIndex;
      const movingCard = stack[startIndex];
      const target = this.findBestDoubleClickLaneTarget(movingCard, sourceLaneIndex, movingCount, emptyOnly);
      if (target) {
        return {
          card: cloneCard(movingCard),
          source: { type: "lane", index: sourceLaneIndex, card_index: startIndex },
          target,
          moving_count: movingCount,
        };
      }
    }
    return null;
  }

  private findDoubleClickFreeCellMove(sourceLaneIndex: number): PlannedMove | null {
    const targetIndex = this.run.free_cells.findIndex((card) => card === null);
    const stack = this.run.tableau[sourceLaneIndex];
    if (targetIndex < 0 || !stack || stack.length === 0) {
      return null;
    }
    const topIndex = stack.length - 1;
    return {
      card: cloneCard(stack[topIndex]),
      source: { type: "lane", index: sourceLaneIndex, card_index: topIndex },
      target: { type: "free_cell", index: targetIndex },
      moving_count: 1,
    };
  }
}
