import type { BoardSettings } from "../core/types";
import { buildAchievementDefinitions } from "./achievementCatalog";
import * as AchievementService from "./achievementService";
import type { AchievementDefinition, UpgradeDefinition } from "./definitions";
import * as IntegerText from "./integerText";
import * as Transaction from "./progressionTransactionService";
import { sanitizeDefinedIds, sanitizeSettings, type BaseSettings } from "./progressStateSanitizer";
import { buildRebirthDefinitions } from "./rebirthCatalog";
import {
  createDefaultStorage,
  parseSaveText,
  SaveRepository,
  serializeSaveData,
  type RawSaveData,
  type SaveData,
} from "./saveRepository";
import * as ScoreCalculator from "./scoreCalculator";
import { buildUpgradeDefinitions } from "./upgradeCatalog";

export const BASE_SETTINGS: BaseSettings = {
  color_count: 1,
  marks_per_color: 1,
  rank_count: 2,
  lane_count: 1,
  free_cell_count: 1,
};

const FEATURE_ACHIEVEMENT_IDS: Record<string, string> = {
  bulk_move: "clear_rank_7",
  auto_complete: "clear_marks_2",
  hint: "clear_marks_2_colors_2",
};

const FEATURE_REBIRTH_UPGRADE_IDS: Record<string, string> = {
  chain_energy: "rebirth_re1",
  teleport_skill: "rebirth_rs1",
  empty_lane_energy: "rebirth_re2",
  free_cell_deep_skill: "rebirth_rs2",
  active_lane_energy: "rebirth_re3",
  inactive_column_skill: "rebirth_rs3",
  auto_upgrade_purchase: "rebirth_ra1",
  inactive_activation_energy: "rebirth_re4",
};

export type FeatureId =
  | "bulk_move"
  | "auto_complete"
  | "hint"
  | "auto_hint_move"
  | "chain_energy"
  | "teleport_skill"
  | "empty_lane_energy"
  | "free_cell_deep_skill"
  | "active_lane_energy"
  | "inactive_column_skill"
  | "auto_upgrade_purchase"
  | "inactive_activation_energy";

export const REBIRTH_UNLOCK_ACHIEVEMENT_ID = "clear_marks_2_colors_2_rank_13";
export const REBIRTH_FIRST_ACHIEVEMENT_ID = "rebirth_1";
export const REBIRTH_POINT_THRESHOLD = 200000000;
const REBIRTH_POINT_BASE = 10;
const SORT_UPGRADE_MAX_LEVEL = 10;

export interface RebirthResult {
  success: boolean;
  granted_points: number;
  new_achievements: string[];
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export class GameState {
  currentPoints = "0";
  rebirthPoints = 0;
  rebirthCount = 0;
  purchasedUpgrades: string[] = [];
  purchasedRebirthUpgrades: string[] = [];
  selectedSettings: BoardSettings = sanitizeSettings(BASE_SETTINGS, BASE_SETTINGS, BASE_SETTINGS);
  totalClears = 0;
  totalUpgradePurchases = 0;
  unlockedAchievements: string[] = [];
  autoCompleteEnabled = true;

  private readonly upgradeDefinitions: UpgradeDefinition[];
  private readonly rebirthUpgradeDefinitions: UpgradeDefinition[];
  private readonly achievementDefinitions: AchievementDefinition[];
  private readonly upgradeIds: string[];
  private readonly rebirthUpgradeIds: string[];
  private readonly achievementIds: string[];
  private readonly upgradeDepthCache = new Map<string, number>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly repository: SaveRepository = new SaveRepository(createDefaultStorage())) {
    this.upgradeDefinitions = buildUpgradeDefinitions(REBIRTH_FIRST_ACHIEVEMENT_ID, SORT_UPGRADE_MAX_LEVEL);
    this.rebirthUpgradeDefinitions = buildRebirthDefinitions(REBIRTH_UNLOCK_ACHIEVEMENT_ID);
    this.achievementDefinitions = buildAchievementDefinitions();
    this.upgradeIds = this.upgradeDefinitions.map((upgrade) => upgrade.id);
    this.rebirthUpgradeIds = this.rebirthUpgradeDefinitions.map((upgrade) => upgrade.id);
    this.achievementIds = this.achievementDefinitions.map((achievement) => achievement.id);
  }

  /** 進行状況が変わったときに呼ばれるコールバックを登録する */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- 設定 ----

  getCurrentSettings(): BoardSettings {
    this.selectedSettings = this.sanitizeSettings(this.selectedSettings);
    return { ...this.selectedSettings };
  }

  getUnlockedSettings(): BoardSettings {
    return Transaction.getUnlockedSettings(BASE_SETTINGS, this.upgradeDefinitions, this.purchasedUpgrades);
  }

  setCurrentSettings(settings: Partial<BoardSettings>): void {
    this.selectedSettings = this.sanitizeSettings(settings);
    this.saveGame();
  }

  isAutoCompleteEnabled(): boolean {
    return this.autoCompleteEnabled;
  }

  setAutoCompleteEnabled(enabled: boolean): void {
    this.autoCompleteEnabled = enabled;
    this.saveGame();
  }

  // ---- 定義 ----

  getUpgradeDefinitions(): UpgradeDefinition[] {
    return this.upgradeDefinitions.filter((upgrade) => this.isUpgradeVisible(upgrade));
  }

  getRebirthUpgradeDefinitions(): UpgradeDefinition[] {
    return this.rebirthUpgradeDefinitions.filter((upgrade) => this.isRebirthUpgradeVisible(upgrade));
  }

  getAchievementDefinitions(): AchievementDefinition[] {
    return [...this.achievementDefinitions];
  }

  getUpgrade(upgradeId: string): UpgradeDefinition | null {
    return this.upgradeDefinitions.find((upgrade) => upgrade.id === upgradeId) ?? null;
  }

  getRebirthUpgrade(upgradeId: string): UpgradeDefinition | null {
    return this.rebirthUpgradeDefinitions.find((upgrade) => upgrade.id === upgradeId) ?? null;
  }

  getAchievement(achievementId: string): AchievementDefinition | null {
    return this.achievementDefinitions.find((achievement) => achievement.id === achievementId) ?? null;
  }

  isUpgradePurchased(upgradeId: string): boolean {
    return this.purchasedUpgrades.includes(upgradeId);
  }

  isRebirthUpgradePurchased(upgradeId: string): boolean {
    return this.purchasedRebirthUpgrades.includes(upgradeId);
  }

  isAchievementUnlocked(achievementId: string): boolean {
    return this.unlockedAchievements.includes(achievementId);
  }

  isFeatureUnlocked(featureId: FeatureId): boolean {
    if (featureId === "auto_hint_move") {
      return this.isAchievementUnlocked("rebirth_re4_acquired") && this.isAchievementUnlocked("rebirth_rs3_acquired");
    }
    const achievementId = FEATURE_ACHIEVEMENT_IDS[featureId];
    if (achievementId && this.isAchievementUnlocked(achievementId)) {
      return true;
    }
    const rebirthUpgradeId = FEATURE_REBIRTH_UPGRADE_IDS[featureId];
    return Boolean(rebirthUpgradeId) && this.isRebirthUpgradePurchased(rebirthUpgradeId);
  }

  // ---- 集計 ----

  getTotalClearCount(): number {
    return this.totalClears;
  }

  getAchievementCount(): number {
    return this.unlockedAchievements.length;
  }

  getTotalUpgradePurchaseCount(): number {
    return this.totalUpgradePurchases;
  }

  getPurchasedRebirthUpgradeCount(): number {
    return this.purchasedRebirthUpgrades.length;
  }

  getAchievementPointMultiplierText(): string {
    return ScoreCalculator.getAchievementPointMultiplierText(this.getAchievementCount());
  }

  isRebirthUnlocked(): boolean {
    return this.isAchievementUnlocked(REBIRTH_UNLOCK_ACHIEVEMENT_ID);
  }

  getRebirthCount(): number {
    return this.rebirthCount;
  }

  getRebirthPoints(): number {
    return this.rebirthPoints;
  }

  // ---- 表示用テキスト ----

  getRegularPointText(): string {
    return IntegerText.formatInteger(this.currentPoints);
  }

  getRegularPointDisplayText(): string {
    const digits = IntegerText.normalize(this.currentPoints);
    return digits.length <= 6 ? IntegerText.formatInteger(digits) : IntegerText.formatIconCost(digits);
  }

  getRebirthPointText(): string {
    return IntegerText.formatInteger(this.rebirthPoints);
  }

  getUpgradeCostText(upgradeId: string): string {
    return IntegerText.formatInteger(this.getUpgrade(upgradeId)?.cost ?? "0");
  }

  getRebirthUpgradeCostText(upgradeId: string): string {
    return IntegerText.formatInteger(this.getRebirthUpgrade(upgradeId)?.cost ?? "0");
  }

  // ---- 購入 ----

  canPurchaseUpgrade(upgradeId: string): boolean {
    const upgrade = this.getUpgrade(upgradeId);
    return Transaction.canPurchaseUpgrade(
      upgrade,
      upgrade !== null && this.isUpgradeVisible(upgrade),
      this.purchasedUpgrades,
      this.currentPoints,
    );
  }

  canPurchaseRebirthUpgrade(upgradeId: string): boolean {
    const upgrade = this.getRebirthUpgrade(upgradeId);
    return Transaction.canPurchaseRebirthUpgrade(
      upgrade,
      upgrade !== null && this.isRebirthUpgradeVisible(upgrade),
      this.purchasedRebirthUpgrades,
      this.rebirthPoints,
    );
  }

  purchaseUpgrade(upgradeId: string): boolean {
    const upgrade = this.getUpgrade(upgradeId);
    if (!upgrade || !this.canPurchaseUpgrade(upgradeId)) {
      return false;
    }
    const result = Transaction.applyUpgradePurchase(
      this.currentPoints,
      this.purchasedUpgrades,
      this.totalUpgradePurchases,
      this.selectedSettings,
      upgrade,
      BASE_SETTINGS,
      this.upgradeDefinitions,
    );
    this.currentPoints = result.current_points;
    this.purchasedUpgrades = result.purchased_upgrades;
    this.totalUpgradePurchases = result.total_upgrade_purchases;
    this.selectedSettings = result.selected_settings;
    this.refreshAchievementsFromUpgrades();
    AchievementService.refreshUpgradeCountAchievements(
      this.totalUpgradePurchases,
      this.unlockedAchievements,
      this.achievementIds,
      [],
    );
    this.saveGame();
    return true;
  }

  purchaseRebirthUpgrade(upgradeId: string): boolean {
    const upgrade = this.getRebirthUpgrade(upgradeId);
    if (!upgrade || !this.canPurchaseRebirthUpgrade(upgradeId)) {
      return false;
    }
    const result = Transaction.applyRebirthUpgradePurchase(this.rebirthPoints, this.purchasedRebirthUpgrades, upgrade);
    this.rebirthPoints = result.rebirth_points;
    this.purchasedRebirthUpgrades = result.purchased_rebirth_upgrades;
    AchievementService.refreshRebirthUpgradeCountAchievements(
      this.purchasedRebirthUpgrades.length,
      this.unlockedAchievements,
      this.achievementIds,
      [],
    );
    AchievementService.refreshSpecificRebirthUpgradeAchievements(
      this.purchasedRebirthUpgrades,
      this.unlockedAchievements,
      this.achievementIds,
      [],
    );
    this.saveGame();
    return true;
  }

  /** RA1: 取得可能な通常アップグレードを必要ポイントが高い順に買えるだけ買う */
  purchaseAvailableUpgradesByDescendingCost(): string[] {
    const purchasedIds: string[] = [];
    for (;;) {
      const upgrade = this.getMostExpensivePurchasableUpgrade();
      if (!upgrade || !this.purchaseUpgrade(upgrade.id)) {
        break;
      }
      purchasedIds.push(upgrade.id);
    }
    return purchasedIds;
  }

  addPoints(points: IntegerText.IntegerLike): void {
    if (IntegerText.normalize(points) === "0") {
      return;
    }
    this.currentPoints = IntegerText.add(this.currentPoints, points);
    this.saveGame();
  }

  getMissingPrerequisites(upgradeId: string): string[] {
    return (this.getUpgrade(upgradeId)?.prerequisites ?? []).filter((id) => !this.isUpgradePurchased(id));
  }

  getMissingRebirthPrerequisites(upgradeId: string): string[] {
    return (this.getRebirthUpgrade(upgradeId)?.prerequisites ?? []).filter((id) => !this.isRebirthUpgradePurchased(id));
  }

  // ---- 得点・クリア ----

  getClearScore(settings?: Pick<BoardSettings, "rank_count" | "color_count" | "marks_per_color">): string {
    const appliedSettings = settings ?? this.getCurrentSettings();
    return ScoreCalculator.calculateClearScore(
      appliedSettings,
      ScoreCalculator.exponentMultiplier(this.getRebirthScoreLevel("rn")),
      ScoreCalculator.exponentMultiplier(this.getRebirthScoreLevel("rc")),
      ScoreCalculator.exponentMultiplier(this.getRebirthScoreLevel("rm")),
      ScoreCalculator.achievementMultiplierLog10(this.getAchievementCount()),
    );
  }

  getUpgradeDepth(upgradeId: string): number {
    const cached = this.upgradeDepthCache.get(upgradeId);
    if (cached !== undefined) {
      return cached;
    }
    const upgrade = this.getUpgrade(upgradeId);
    let depth = 0;
    for (const prerequisiteId of upgrade?.prerequisites ?? []) {
      depth = Math.max(depth, this.getUpgradeDepth(prerequisiteId) + 1);
    }
    this.upgradeDepthCache.set(upgradeId, depth);
    return depth;
  }

  getSortUpgradePurchaseCount(): number {
    let count = 0;
    for (let level = 1; level <= SORT_UPGRADE_MAX_LEVEL; level++) {
      if (this.isUpgradePurchased(`shuffle_${level}`)) {
        count += 1;
      }
    }
    return count;
  }

  getInitialSortLaneCount(laneCount: number): number {
    const laneLimit = Math.floor(Math.max(0, laneCount) / 2);
    return Math.min(this.getSortUpgradePurchaseCount(), laneLimit);
  }

  registerClear(settings: Partial<BoardSettings>): string[] {
    this.totalClears += 1;
    const appliedSettings = this.sanitizeSettings(settings);
    const newAchievements: string[] = [];
    AchievementService.collectClearAchievements(
      appliedSettings,
      this.totalClears,
      this.unlockedAchievements,
      this.achievementIds,
      newAchievements,
    );
    this.saveGame();
    return newAchievements;
  }

  // ---- 転生 ----

  calculateRebirthGain(pointBalance: string | number = this.currentPoints): number {
    return ScoreCalculator.calculateRebirthGain(pointBalance, REBIRTH_POINT_THRESHOLD, REBIRTH_POINT_BASE);
  }

  canRebirth(): boolean {
    return this.isRebirthUnlocked() && this.calculateRebirthGain() > 0;
  }

  performRebirth(): RebirthResult {
    const grantedPoints = this.isRebirthUnlocked() ? this.calculateRebirthGain() : 0;
    if (grantedPoints <= 0) {
      return { success: false, granted_points: 0, new_achievements: [] };
    }
    const result = Transaction.applyRebirth(grantedPoints, this.rebirthPoints, this.rebirthCount, BASE_SETTINGS);
    this.currentPoints = result.current_points;
    this.rebirthPoints = result.rebirth_points;
    this.rebirthCount = result.rebirth_count;
    this.purchasedUpgrades = result.purchased_upgrades;
    this.selectedSettings = result.selected_settings;
    const newAchievements: string[] = [];
    AchievementService.refreshRebirthCountAchievements(
      this.rebirthCount,
      this.unlockedAchievements,
      this.achievementIds,
      newAchievements,
    );
    this.saveGame();
    return { success: true, granted_points: grantedPoints, new_achievements: newAchievements };
  }

  // ---- セーブ / ロード ----

  hasSaveData(): boolean {
    return this.repository.hasSaveData();
  }

  loadGame(): boolean {
    const data = this.repository.load();
    if (!data) {
      this.restoreDefaultState();
      this.notify();
      return false;
    }
    this.applySaveData(data);
    this.notify();
    return true;
  }

  saveGame(): boolean {
    const ok = this.repository.save(this.getSaveData());
    this.notify();
    return ok;
  }

  resetProgress(): void {
    this.restoreDefaultState();
    this.saveGame();
  }

  exportSaveText(): string {
    return serializeSaveData(this.getSaveData());
  }

  /** エクスポートした JSON または Godot 版 save.cfg を取り込んで保存する */
  importSaveText(text: string): boolean {
    const data = parseSaveText(text);
    if (!data || !this.looksLikeSaveData(data)) {
      return false;
    }
    this.applySaveData(data);
    return this.saveGame();
  }

  getSaveData(): SaveData {
    const settings = this.sanitizeSettings(this.selectedSettings);
    return {
      current_points: this.currentPoints,
      rebirth_points: this.rebirthPoints,
      rebirth_count: this.rebirthCount,
      purchased_upgrades: [...this.purchasedUpgrades],
      purchased_rebirth_upgrades: [...this.purchasedRebirthUpgrades],
      total_clears: this.totalClears,
      total_upgrade_purchases: this.totalUpgradePurchases,
      unlocked_achievements: [...this.unlockedAchievements],
      auto_complete_enabled: this.autoCompleteEnabled,
      selected_settings: { ...settings },
    };
  }

  // ---- 内部処理 ----

  private looksLikeSaveData(data: RawSaveData): boolean {
    return ["current_points", "purchased_upgrades", "unlocked_achievements", "total_clears"].some((key) => key in data);
  }

  private applySaveData(data: RawSaveData): void {
    this.currentPoints = IntegerText.normalize(
      typeof data.current_points === "number" || typeof data.current_points === "string" ? data.current_points : 0,
    );
    this.rebirthPoints = toNonNegativeInt(data.rebirth_points);
    this.rebirthCount = toNonNegativeInt(data.rebirth_count);
    this.purchasedUpgrades = sanitizeDefinedIds(data.purchased_upgrades, this.upgradeIds);
    this.purchasedRebirthUpgrades = sanitizeDefinedIds(data.purchased_rebirth_upgrades, this.rebirthUpgradeIds);
    this.totalClears = toNonNegativeInt(data.total_clears);
    this.totalUpgradePurchases = Math.max(
      this.purchasedUpgrades.length,
      toNonNegativeInt(data.total_upgrade_purchases, this.purchasedUpgrades.length),
    );
    this.unlockedAchievements = sanitizeDefinedIds(data.unlocked_achievements, this.achievementIds);
    this.autoCompleteEnabled = typeof data.auto_complete_enabled === "boolean" ? data.auto_complete_enabled : true;
    const storedSettings =
      data.selected_settings && typeof data.selected_settings === "object"
        ? (data.selected_settings as Record<string, unknown>)
        : { ...BASE_SETTINGS };
    this.selectedSettings = this.sanitizeSettings(storedSettings);
  }

  private restoreDefaultState(): void {
    this.currentPoints = "0";
    this.rebirthPoints = 0;
    this.rebirthCount = 0;
    this.purchasedUpgrades = [];
    this.purchasedRebirthUpgrades = [];
    this.totalClears = 0;
    this.totalUpgradePurchases = 0;
    this.unlockedAchievements = [];
    this.autoCompleteEnabled = true;
    this.selectedSettings = this.sanitizeSettings({ ...BASE_SETTINGS });
  }

  private sanitizeSettings(settings: object): BoardSettings {
    return sanitizeSettings(settings, BASE_SETTINGS, this.getUnlockedSettings());
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private isUpgradeVisible(upgrade: UpgradeDefinition): boolean {
    return upgrade.required_achievement.length === 0 || this.isAchievementUnlocked(upgrade.required_achievement);
  }

  private isRebirthUpgradeVisible(upgrade: UpgradeDefinition): boolean {
    const required = upgrade.required_achievement || REBIRTH_UNLOCK_ACHIEVEMENT_ID;
    return this.isAchievementUnlocked(required);
  }

  private getRebirthScoreLevel(prefix: "rn" | "rm" | "rc"): number {
    let level = 0;
    for (let upgradeLevel = 1; upgradeLevel <= 5; upgradeLevel++) {
      if (this.isRebirthUpgradePurchased(`rebirth_score_${prefix}${upgradeLevel}`)) {
        level = upgradeLevel;
      }
    }
    return level;
  }

  private refreshAchievementsFromUpgrades(): void {
    AchievementService.refreshAchievementsFromUpgrades(
      this.getUnlockedSettings(),
      this.getSortUpgradePurchaseCount(),
      this.unlockedAchievements,
      this.achievementIds,
      [],
    );
  }

  private getMostExpensivePurchasableUpgrade(): UpgradeDefinition | null {
    let best: UpgradeDefinition | null = null;
    for (const upgrade of this.upgradeDefinitions) {
      if (!this.canPurchaseUpgrade(upgrade.id)) {
        continue;
      }
      if (!best || this.compareAutoPurchasePriority(upgrade, best) > 0) {
        best = upgrade;
      }
    }
    return best;
  }

  private compareAutoPurchasePriority(left: UpgradeDefinition, right: UpgradeDefinition): number {
    const costCompare = IntegerText.compare(left.cost, right.cost);
    if (costCompare !== 0) {
      return costCompare;
    }
    const depthCompare = this.getUpgradeDepth(left.id) - this.getUpgradeDepth(right.id);
    if (depthCompare !== 0) {
      return depthCompare;
    }
    if (left.title < right.title) {
      return 1;
    }
    if (left.title > right.title) {
      return -1;
    }
    return 0;
  }
}
