import type { BoardSettings } from "../../core/types";
import type { AchievementDefinition, SettingKey, UpgradeDefinition } from "../../progress/definitions";
import { BASE_SETTINGS, REBIRTH_POINT_THRESHOLD, type FeatureId, type GameState } from "../../progress/gameState";
import { formatIconCost, formatInteger } from "../../progress/integerText";
import { confirmDialog, openModal, type ModalHandle } from "../dialog";
import { button, el } from "../dom";
import type { AppContext, Screen } from "../screen";
import type { NodeStateName } from "../upgradeNodeSvg";
import { UpgradeTreeView, type TreeItem } from "../upgradeTreeView";

type TabName = "game" | "upgrades" | "rebirth" | "achievements";
type TreeKind = "upgrade" | "rebirth";

interface TreeState {
  name: NodeStateName;
  message: string;
  buttonText: string;
  disabled: boolean;
}

const TABS: { name: TabName; label: string }[] = [
  { name: "game", label: "ゲーム" },
  { name: "upgrades", label: "アップグレード" },
  { name: "rebirth", label: "転生" },
  { name: "achievements", label: "実績" },
];

const FEATURE_LABELS: { id: FeatureId; label: string }[] = [
  { id: "bulk_move", label: "まとめて移動" },
  { id: "auto_complete", label: "自動完成" },
  { id: "hint", label: "ヒント" },
  { id: "auto_hint_move", label: "自動移動" },
  { id: "chain_energy", label: "チェーンエネルギー" },
  { id: "inactive_activation_energy", label: "活性化EN" },
  { id: "teleport_skill", label: "テレポート" },
  { id: "auto_upgrade_purchase", label: "アップグレード自動取得" },
];

interface Stepper {
  key: SettingKey;
  root: HTMLElement;
  input: HTMLInputElement;
  minus: HTMLButtonElement;
  plus: HTMLButtonElement;
  max: HTMLElement;
}

/** メインメニュー（Godot 版 game_screen.gd の移植） */
export class MenuScreen implements Screen {
  readonly element: HTMLElement;
  private readonly gameState: GameState;
  private selectedUpgradeId = "";
  private selectedRebirthUpgradeId = "";
  private detail: { modal: ModalHandle; kind: TreeKind; refresh: () => void } | null = null;

  private readonly pointsValue: HTMLElement;
  private readonly rebirthPointsValue: HTMLElement;
  private readonly tabButtons = new Map<TabName, HTMLButtonElement>();
  private readonly tabPanels = new Map<TabName, HTMLElement>();
  private readonly steppers: Stepper[] = [];
  private readonly totalMarkValue: HTMLElement;
  private readonly clearScoreValue: HTMLElement;
  private readonly upgradeStatus: HTMLElement;
  private readonly upgradeTree: UpgradeTreeView;
  private readonly rebirthStatus: HTMLElement;
  private readonly rebirthPointStatus: HTMLElement;
  private readonly rebirthButton: HTMLButtonElement;
  private readonly rebirthDescription: HTMLElement;
  private readonly rebirthTree: UpgradeTreeView;
  private readonly achievementStatus: HTMLElement;
  private readonly featureList: HTMLElement;
  private readonly clearStatus: HTMLElement;
  private readonly achievementList: HTMLElement;
  private readonly unsubscribe: () => void;

  constructor(private readonly ctx: AppContext) {
    this.gameState = ctx.gameState;

    // ---- サイドバー ----
    this.pointsValue = el("strong", { className: "points-value", text: "0 P" });
    this.rebirthPointsValue = el("span", { className: "rebirth-points", text: "転生ポイント 0 R" });
    const tabList = el("nav", { className: "tabs", attrs: { role: "tablist", "aria-label": "メニュー" } });
    for (const tab of TABS) {
      const tabButton = el("button", {
        className: "tab-btn",
        text: tab.label,
        attrs: { type: "button", role: "tab", id: `tab-${tab.name}`, "aria-controls": `panel-${tab.name}` },
        on: { click: () => this.setCurrentTab(tab.name) },
      });
      this.tabButtons.set(tab.name, tabButton);
      tabList.append(tabButton);
    }
    const sidebar = el("aside", { className: "panel sidebar" }, [
      el("div", { className: "panel-card points-panel" }, [
        el("div", { className: "points-row" }, [el("span", { className: "points-header", text: "得点" }), this.pointsValue]),
        this.rebirthPointsValue,
      ]),
      tabList,
      el("div", { className: "sidebar-spacer" }),
      button("タイトルへ戻る", () => this.ctx.navigate("title"), "btn btn-back"),
    ]);

    // ---- ゲームタブ ----
    this.totalMarkValue = el("span", { className: "setting-value", text: "1" });
    this.clearScoreValue = el("span", { className: "setting-value setting-score", text: "4" });
    const settingRow = (label: string, control: HTMLElement) => [el("span", { className: "setting-label", text: label }), control];
    const gamePanel = el("section", { className: "tab-panel" }, [
      el("header", { className: "section-header" }, [
        el("h1", { className: "section-title", text: "ゲーム設定" }),
        el("p", { className: "section-lead", text: "解放済みの上限まで、今回の挑戦に使う構成を上下できます。アップグレードを買うと上限が広がります。" }),
      ]),
      el("div", { className: "panel-card config-card" }, [
        el("h2", { className: "card-title", text: "現在の構成" }),
        el("p", { className: "card-description", text: "色数、マーク数、数字数、レーン数、フリーセル数は、解放済みの範囲で自由に調整できます。" }),
        el("div", { className: "settings-grid" }, [
          ...settingRow("色数", this.createStepper("color_count", "色数")),
          ...settingRow("色あたりのマーク数", this.createStepper("marks_per_color", "色あたりのマーク数")),
          ...settingRow("合計マーク数", this.totalMarkValue),
          ...settingRow("数字数", this.createStepper("rank_count", "数字数")),
          ...settingRow("レーン数", this.createStepper("lane_count", "レーン数")),
          ...settingRow("フリーセル数", this.createStepper("free_cell_count", "フリーセル数")),
          ...settingRow("クリア得点", this.clearScoreValue),
        ]),
        el("div", { className: "config-actions" }, [
          button("現在の構成で開始", () => this.startGame(), "btn btn-primary btn-start"),
          el("p", { className: "note", text: "合計マーク数とクリア得点は、選択した構成から自動で計算されます。" }),
        ]),
      ]),
    ]);

    // ---- アップグレードタブ ----
    this.upgradeStatus = el("p", { className: "card-status", text: "購入済み 0 / 0" });
    this.upgradeTree = new UpgradeTreeView(
      {
        onSelect: (id) => {
          this.selectedUpgradeId = id;
          this.openDetail("upgrade");
        },
        onActivate: (id) => {
          this.selectedUpgradeId = id;
          if (this.gameState.purchaseUpgrade(id)) {
            this.refreshScreen();
          } else {
            this.openDetail("upgrade");
          }
        },
      },
      "アップグレードツリー",
    );
    const upgradesPanel = el("section", { className: "tab-panel tab-panel-fill" }, [
      el("header", { className: "section-header" }, [
        el("h1", { className: "section-title", text: "アップグレード" }),
        el("p", { className: "section-lead", text: "クリアで得た得点を使って、構成と緩和要素を段階的に広げていきます。" }),
      ]),
      el("div", { className: "panel-card tree-card" }, [
        this.upgradeStatus,
        el("p", { className: "tree-hint", text: "ホイールで拡大縮小 / 空白ドラッグで移動 / クリックで詳細表示 / ダブルクリックで取得" }),
        this.upgradeTree.element,
      ]),
    ]);

    // ---- 転生タブ ----
    this.rebirthStatus = el("p", { className: "card-status" });
    this.rebirthPointStatus = el("p", { className: "card-description" });
    this.rebirthButton = button("転生する", () => void this.onRebirthPressed(), "btn btn-primary btn-rebirth");
    this.rebirthDescription = el("p", { className: "card-description" });
    this.rebirthTree = new UpgradeTreeView(
      {
        onSelect: (id) => {
          this.selectedRebirthUpgradeId = id;
          this.openDetail("rebirth");
        },
        onActivate: (id) => {
          this.selectedRebirthUpgradeId = id;
          if (this.gameState.purchaseRebirthUpgrade(id)) {
            this.refreshScreen();
          } else {
            this.openDetail("rebirth");
          }
        },
      },
      "転生ツリー",
    );
    const rebirthPanel = el("section", { className: "tab-panel tab-panel-fill" }, [
      el("header", { className: "section-header" }, [
        el("h1", { className: "section-title", text: "転生" }),
        el("p", { className: "section-lead", text: "高得点帯に到達すると転生ポイントを獲得し、転生スキルを購入できます。" }),
      ]),
      el("div", { className: "panel-card rebirth-summary" }, [
        this.rebirthStatus,
        this.rebirthPointStatus,
        this.rebirthButton,
        this.rebirthDescription,
      ]),
      el("div", { className: "panel-card tree-card" }, [
        el("p", { className: "tree-hint", text: "ホイールで拡大縮小 / 空白ドラッグで移動 / クリックで詳細表示 / ダブルクリックで取得" }),
        this.rebirthTree.element,
      ]),
    ]);

    // ---- 実績タブ ----
    this.achievementStatus = el("p", { className: "card-status" });
    this.featureList = el("ul", { className: "feature-list", attrs: { "aria-label": "機能解禁" } });
    this.clearStatus = el("p", { className: "card-description" });
    this.achievementList = el("div", { className: "achievement-list" });
    const achievementsPanel = el("section", { className: "tab-panel" }, [
      el("header", { className: "section-header" }, [
        el("h1", { className: "section-title", text: "実績" }),
        el("p", {
          className: "section-lead",
          text: "構成ごとの到達点と補助機能の解禁状況を確認できます。達成済みの実績は進行データとして保存されます。",
        }),
      ]),
      el("div", { className: "panel-card" }, [
        this.achievementStatus,
        el("p", { className: "feature-heading", text: "機能解禁" }),
        this.featureList,
        this.clearStatus,
      ]),
      el("div", { className: "panel-card" }, [
        el("p", { className: "card-description", text: "クリア条件と取得条件を一覧表示します。" }),
        this.achievementList,
      ]),
    ]);

    const panels: [TabName, HTMLElement][] = [
      ["game", gamePanel],
      ["upgrades", upgradesPanel],
      ["rebirth", rebirthPanel],
      ["achievements", achievementsPanel],
    ];
    const main = el("main", { className: "panel main-panel menu-main" });
    for (const [name, panel] of panels) {
      panel.id = `panel-${name}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `tab-${name}`);
      this.tabPanels.set(name, panel);
      main.append(panel);
    }

    this.element = el("div", { className: "screen menu-screen" }, [sidebar, main]);
    this.selectedUpgradeId = this.gameState.getUpgradeDefinitions()[0]?.id ?? "";
    this.selectedRebirthUpgradeId = this.gameState.getRebirthUpgradeDefinitions()[0]?.id ?? "";
    this.refreshScreen();
    this.setCurrentTab("game");
    this.unsubscribe = this.gameState.subscribe(() => this.updatePointsLabel());
  }

  mount(): void {
    this.element.querySelector<HTMLElement>(".btn-start")?.focus({ preventScroll: true });
  }

  destroy(): void {
    this.unsubscribe();
    this.detail?.modal.close();
    this.upgradeTree.destroy();
    this.rebirthTree.destroy();
  }

  private setCurrentTab(tab: TabName): void {
    for (const [name, panel] of this.tabPanels) {
      panel.hidden = name !== tab;
    }
    for (const [name, tabButton] of this.tabButtons) {
      const selected = name === tab;
      tabButton.classList.toggle("is-active", selected);
      tabButton.setAttribute("aria-selected", String(selected));
      tabButton.tabIndex = selected ? 0 : -1;
    }
  }

  private refreshScreen(): void {
    this.updatePointsLabel();
    this.syncSettingControls();
    this.refreshUpgradeTree();
    this.updateRebirthSummary();
    this.refreshRebirthTree();
    this.updateAchievementSummary();
    this.refreshAchievementList();
    this.detail?.refresh();
  }

  private updatePointsLabel(): void {
    this.pointsValue.textContent = `${formatIconCost(this.gameState.currentPoints)} P`;
    this.rebirthPointsValue.textContent = `転生ポイント ${this.gameState.getRebirthPointText()} R`;
  }

  // ---- 構成設定 ----

  private createStepper(key: SettingKey, label: string): HTMLElement {
    const input = el("input", {
      className: "stepper-input",
      attrs: { type: "number", inputmode: "numeric", step: 1, "aria-label": label },
    });
    const minus = el("button", { className: "stepper-btn", text: "−", attrs: { type: "button", "aria-label": "減らす" } });
    const plus = el("button", { className: "stepper-btn", text: "+", attrs: { type: "button", "aria-label": "増やす" } });
    const max = el("span", { className: "stepper-max" });
    const root = el("div", { className: "stepper" }, [minus, input, plus, max]);
    const stepper: Stepper = { key, root, input, minus, plus, max };
    const change = (delta: number) => {
      const value = Number(input.value) + delta;
      input.value = String(Math.min(Math.max(value, Number(input.min)), Number(input.max)));
      this.onSettingChanged();
    };
    minus.addEventListener("click", () => change(-1));
    plus.addEventListener("click", () => change(1));
    input.addEventListener("change", () => change(0));
    this.steppers.push(stepper);
    return root;
  }

  private syncSettingControls(): void {
    const unlocked = this.gameState.getUnlockedSettings();
    const selected = this.gameState.getCurrentSettings();
    for (const stepper of this.steppers) {
      const min = BASE_SETTINGS[stepper.key];
      const max = unlocked[stepper.key];
      stepper.input.min = String(min);
      stepper.input.max = String(max);
      stepper.input.value = String(selected[stepper.key]);
      stepper.max.textContent = `上限 ${max}`;
      this.updateStepperButtons(stepper);
    }
    this.updateConfigurationLabels();
  }

  private updateStepperButtons(stepper: Stepper): void {
    const value = Number(stepper.input.value);
    const min = Number(stepper.input.min);
    const max = Number(stepper.input.max);
    stepper.input.disabled = max <= min;
    stepper.minus.disabled = value <= min;
    stepper.plus.disabled = value >= max;
  }

  private readSettingsFromControls(): BoardSettings {
    const values = Object.fromEntries(this.steppers.map((stepper) => [stepper.key, Number(stepper.input.value)])) as Record<
      SettingKey,
      number
    >;
    const suitCount = values.color_count * values.marks_per_color;
    return { ...values, suit_count: suitCount, total_mark_count: suitCount };
  }

  private onSettingChanged(): void {
    this.gameState.setCurrentSettings(this.readSettingsFromControls());
    for (const stepper of this.steppers) {
      this.updateStepperButtons(stepper);
    }
    this.updateConfigurationLabels();
  }

  private updateConfigurationLabels(): void {
    const settings = this.readSettingsFromControls();
    this.totalMarkValue.textContent = String(settings.total_mark_count);
    this.clearScoreValue.textContent = `${formatIconCost(this.gameState.getClearScore(settings))} P`;
  }

  private startGame(): void {
    this.gameState.setCurrentSettings(this.readSettingsFromControls());
    this.ctx.navigate("board");
  }

  // ---- ツリー ----

  private getUpgradeState(upgrade: UpgradeDefinition): TreeState {
    const gs = this.gameState;
    if (gs.isUpgradePurchased(upgrade.id)) {
      return { name: "purchased", message: "取得済み", buttonText: "取得済み", disabled: true };
    }
    if (gs.getMissingPrerequisites(upgrade.id).length > 0) {
      return { name: "locked", message: "前提不足", buttonText: "鍵が掛かっています", disabled: true };
    }
    const cost = gs.getUpgradeCostText(upgrade.id);
    if (!gs.canPurchaseUpgrade(upgrade.id)) {
      return { name: "insufficient", message: "ポイント不足", buttonText: `${cost} P 必要`, disabled: true };
    }
    return { name: "available", message: "取得可能", buttonText: `${cost} P で取得`, disabled: false };
  }

  private getRebirthUpgradeState(upgrade: UpgradeDefinition): TreeState {
    const gs = this.gameState;
    if (gs.isRebirthUpgradePurchased(upgrade.id)) {
      return { name: "purchased", message: "取得済み", buttonText: "取得済み", disabled: true };
    }
    if (gs.getMissingRebirthPrerequisites(upgrade.id).length > 0) {
      return { name: "locked", message: "前提不足", buttonText: "鍵が掛かっています", disabled: true };
    }
    const cost = gs.getRebirthUpgradeCostText(upgrade.id);
    if (!gs.canPurchaseRebirthUpgrade(upgrade.id)) {
      return { name: "insufficient", message: "転生ポイント不足", buttonText: `${cost} R 必要`, disabled: true };
    }
    return { name: "available", message: "取得可能", buttonText: `${cost} R で取得`, disabled: false };
  }

  private refreshUpgradeTree(): void {
    const upgrades = this.gameState.getUpgradeDefinitions();
    const items: TreeItem[] = upgrades.map((upgrade) => ({ upgrade, state: this.getUpgradeState(upgrade).name }));
    const purchasedCount = upgrades.filter((upgrade) => this.gameState.isUpgradePurchased(upgrade.id)).length;
    this.upgradeStatus.textContent = `購入済み ${purchasedCount} / ${upgrades.length}`;
    if (!upgrades.some((upgrade) => upgrade.id === this.selectedUpgradeId)) {
      this.selectedUpgradeId = upgrades[0]?.id ?? "";
    }
    this.upgradeTree.setTreeData(items, this.selectedUpgradeId, this.gameState.purchasedUpgrades);
  }

  private refreshRebirthTree(): void {
    const upgrades = this.gameState.getRebirthUpgradeDefinitions();
    const items: TreeItem[] = upgrades.map((upgrade) => ({ upgrade, state: this.getRebirthUpgradeState(upgrade).name }));
    if (!upgrades.some((upgrade) => upgrade.id === this.selectedRebirthUpgradeId)) {
      this.selectedRebirthUpgradeId = upgrades[0]?.id ?? "";
    }
    this.rebirthTree.setTreeData(items, this.selectedRebirthUpgradeId, this.gameState.purchasedRebirthUpgrades);
  }

  private formatEffect(upgrade: UpgradeDefinition): string {
    switch (upgrade.icon_kind) {
      case "free_cell":
        return `フリーセル上限 ${upgrade.target_value}`;
      case "rank":
        return `数字上限 ${upgrade.target_value}`;
      case "lane":
        return `レーン数 ${upgrade.target_value}`;
      case "mark":
        return `色あたりのマーク数 ${upgrade.target_value}`;
      case "color":
        return `色数 ${upgrade.target_value}`;
      case "sort":
        return `初期ソート 最大 ${upgrade.target_value} レーン`;
      default:
        return upgrade.description;
    }
  }

  private openDetail(kind: TreeKind): void {
    if (this.detail) {
      this.detail.kind = kind;
      this.detail.refresh();
      return;
    }

    const title = el("h2", { className: "modal-title", attrs: { id: "detail-title" } });
    const state = el("p", { className: "detail-state" });
    const description = el("p", { className: "modal-message" });
    const meta = el("dl", { className: "detail-meta" });
    const actionButton = el("button", { className: "btn btn-primary", attrs: { type: "button", "data-autofocus": true } });

    const refresh = () => {
      const detailKind = this.detail?.kind ?? kind;
      const isRebirth = detailKind === "rebirth";
      const id = isRebirth ? this.selectedRebirthUpgradeId : this.selectedUpgradeId;
      const definition = isRebirth ? this.gameState.getRebirthUpgrade(id) : this.gameState.getUpgrade(id);
      if (!definition) {
        title.textContent = "ノードなし";
        state.textContent = "";
        description.textContent = "";
        meta.replaceChildren();
        actionButton.textContent = "取得不可";
        actionButton.disabled = true;
        return;
      }
      const treeState = isRebirth ? this.getRebirthUpgradeState(definition) : this.getUpgradeState(definition);
      title.textContent = definition.title;
      state.textContent = treeState.message;
      state.className = `detail-state state-${treeState.name}`;
      description.textContent = definition.description;
      const cost = isRebirth
        ? `${this.gameState.getRebirthUpgradeCostText(definition.id)} R`
        : `${this.gameState.getUpgradeCostText(definition.id)} P`;
      const prerequisites =
        definition.prerequisites.length === 0
          ? "なし"
          : definition.prerequisites
              .map((prerequisiteId) =>
                (isRebirth ? this.gameState.getRebirthUpgrade(prerequisiteId) : this.gameState.getUpgrade(prerequisiteId))?.title ?? prerequisiteId,
              )
              .join(", ");
      meta.replaceChildren(
        el("dt", { text: "必要ポイント" }),
        el("dd", { text: cost }),
        el("dt", { text: "前提" }),
        el("dd", { text: prerequisites }),
        el("dt", { text: "効果" }),
        el("dd", { text: this.formatEffect(definition) }),
      );
      actionButton.textContent = treeState.buttonText;
      actionButton.disabled = treeState.disabled;
    };

    actionButton.addEventListener("click", () => {
      const isRebirth = this.detail?.kind === "rebirth";
      const success = isRebirth
        ? this.gameState.purchaseRebirthUpgrade(this.selectedRebirthUpgradeId)
        : this.gameState.purchaseUpgrade(this.selectedUpgradeId);
      if (success) {
        this.refreshScreen();
      }
    });

    const modal = openModal({
      className: "detail-dialog",
      labelledBy: "detail-title",
      onClose: () => {
        this.detail = null;
      },
      content: (close) => [
        title,
        state,
        description,
        meta,
        el("div", { className: "modal-actions" }, [
          el("button", { className: "btn", text: "閉じる", attrs: { type: "button" }, on: { click: () => close() } }),
          actionButton,
        ]),
      ],
    });
    this.detail = { modal, kind, refresh };
    refresh();
    actionButton.focus();
  }

  // ---- 転生 ----

  private updateRebirthSummary(): void {
    const gs = this.gameState;
    if (!gs.isRebirthUnlocked()) {
      this.rebirthStatus.textContent = "転生は未解放です";
      this.rebirthPointStatus.textContent = "解放条件: 実績「通常プレイ」（M2 / C2 / N13 でクリア）";
      this.rebirthButton.textContent = "転生未解放";
      this.rebirthButton.disabled = true;
      this.rebirthDescription.textContent = `解放後は R = FLOOR(log10(P / ${formatInteger(REBIRTH_POINT_THRESHOLD)})) + 1 で転生ポイントを得ます。`;
      return;
    }
    const gain = gs.calculateRebirthGain();
    this.rebirthStatus.textContent = `転生回数 ${gs.getRebirthCount()} / 所持 ${gs.getRebirthPointText()} R`;
    this.rebirthPointStatus.textContent = `現在の所持ポイント ${gs.getRegularPointText()} P から ${gain} R を獲得できます。`;
    this.rebirthButton.textContent = gain > 0 ? `${gain} R を得て転生` : `${formatInteger(REBIRTH_POINT_THRESHOLD)} P 以上で転生可能`;
    this.rebirthButton.disabled = gain <= 0;
    this.rebirthDescription.textContent =
      "転生すると通常ポイント、通常アップグレード、開始設定をリセットし、転生ポイントと転生スキルを保持します。";
  }

  private async onRebirthPressed(): Promise<void> {
    const gain = this.gameState.calculateRebirthGain();
    if (gain <= 0) {
      return;
    }
    const confirmed = await confirmDialog({
      title: "転生",
      message: `${gain} R を獲得して転生します。通常ポイント・通常アップグレード・開始設定はリセットされます。よろしいですか？`,
      okLabel: "転生する",
    });
    if (!confirmed) {
      return;
    }
    const result = this.gameState.performRebirth();
    if (!result.success) {
      return;
    }
    this.refreshScreen();
    this.setCurrentTab("rebirth");
  }

  // ---- 実績 ----

  private updateAchievementSummary(): void {
    const gs = this.gameState;
    const definitions = gs.getAchievementDefinitions();
    const unlockedCount = definitions.filter((achievement) => gs.isAchievementUnlocked(achievement.id)).length;
    this.achievementStatus.textContent = `達成済み ${unlockedCount} / ${definitions.length} / ポイント倍率 x${gs.getAchievementPointMultiplierText()}`;
    this.featureList.replaceChildren(
      ...FEATURE_LABELS.map(({ id, label }) => {
        const on = gs.isFeatureUnlocked(id);
        return el("li", { className: `feature-chip${on ? " is-on" : ""}` }, [
          el("span", { text: label }),
          el("strong", { text: on ? "ON" : "OFF" }),
        ]);
      }),
    );
    this.clearStatus.textContent = `累計クリア回数: ${gs.getTotalClearCount()} / 転生回数: ${gs.getRebirthCount()}`;
  }

  private refreshAchievementList(): void {
    this.achievementList.replaceChildren(
      ...this.gameState.getAchievementDefinitions().map((achievement) => this.createAchievementEntry(achievement)),
    );
  }

  private createAchievementEntry(achievement: AchievementDefinition): HTMLElement {
    const unlocked = this.gameState.isAchievementUnlocked(achievement.id);
    return el("article", { className: `achievement-entry${unlocked ? " is-unlocked" : ""}` }, [
      el("h3", { className: "achievement-title", text: achievement.title }),
      el("p", { className: "achievement-state", text: this.getAchievementStatusText(achievement) }),
      el("p", { className: "achievement-description", text: achievement.description }),
      achievement.reward ? el("p", { className: "achievement-reward", text: `報酬: ${achievement.reward}` }) : null,
    ]);
  }

  private getAchievementStatusText(achievement: AchievementDefinition): string {
    const gs = this.gameState;
    if (gs.isAchievementUnlocked(achievement.id)) {
      return "達成済み";
    }
    const target = achievement.target ?? 0;
    switch (achievement.kind) {
      case "clear_count":
        return `進捗: ${gs.getTotalClearCount()} / ${target}`;
      case "rebirth_count":
        return `進捗: ${gs.getRebirthCount()} / ${target}`;
      case "rebirth_upgrade_count":
        return `進捗: ${gs.getPurchasedRebirthUpgradeCount()} / ${target}`;
      case "rebirth_upgrade":
        return `進捗: ${gs.isRebirthUpgradePurchased(achievement.upgrade_id ?? "") ? 1 : 0} / 1`;
      case "upgrade_count":
        return `進捗: ${gs.getTotalUpgradePurchaseCount()} / ${target}`;
      case "setting_unlock":
        return `現在値: ${gs.getUnlockedSettings()[achievement.setting_key ?? "rank_count"]} / ${target}`;
      case "sort_unlock":
        return `現在値: ${gs.getSortUpgradePurchaseCount()} / ${target}`;
      default:
        return "未達成";
    }
  }
}
