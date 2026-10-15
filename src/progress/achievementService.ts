import type { SettingKey } from "./definitions";

type ClearSettings = { color_count: number; marks_per_color: number; rank_count: number };
type UnlockedSettings = Partial<Record<SettingKey, number>>;

export function unlockAchievement(
  achievementId: string,
  unlockedAchievements: string[],
  validIds: readonly string[],
  newAchievements: string[],
): void {
  if (achievementId.length === 0 || unlockedAchievements.includes(achievementId)) {
    return;
  }
  if (!validIds.includes(achievementId)) {
    return;
  }
  unlockedAchievements.push(achievementId);
  newAchievements.push(achievementId);
}

export function collectClearAchievements(
  settings: ClearSettings,
  totalClears: number,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  const before = newAchievements.length;
  const marksPerColor = settings.marks_per_color ?? 1;
  const colorCount = settings.color_count ?? 1;
  const rankCount = settings.rank_count ?? 2;

  refreshClearCountAchievements(totalClears, unlocked, validIds, newAchievements);
  if (rankCount >= 7) {
    unlockAchievement("clear_rank_7", unlocked, validIds, newAchievements);
  }
  if (marksPerColor >= 2) {
    unlockAchievement("clear_marks_2", unlocked, validIds, newAchievements);
  }
  if (marksPerColor >= 2 && colorCount >= 2) {
    unlockAchievement("clear_marks_2_colors_2", unlocked, validIds, newAchievements);
  }
  if (marksPerColor >= 2 && colorCount >= 2 && rankCount >= 13) {
    unlockAchievement("clear_marks_2_colors_2_rank_13", unlocked, validIds, newAchievements);
  }
  if (marksPerColor >= 4 && colorCount >= 4 && rankCount >= 25) {
    unlockAchievement("clear_rank_25_marks_4_colors_4", unlocked, validIds, newAchievements);
  }
  return newAchievements.length - before;
}

const SETTING_ACHIEVEMENTS: [string, SettingKey, number][] = [
  ["unlock_l2", "lane_count", 2],
  ["unlock_l4", "lane_count", 4],
  ["unlock_l8", "lane_count", 8],
  ["unlock_l24", "lane_count", 24],
  ["unlock_n5", "rank_count", 5],
  ["unlock_n10", "rank_count", 10],
  ["unlock_n13", "rank_count", 13],
  ["unlock_n25", "rank_count", 25],
  ["unlock_m4", "marks_per_color", 4],
  ["unlock_c4", "color_count", 4],
  ["unlock_f2", "free_cell_count", 2],
  ["unlock_f3", "free_cell_count", 3],
  ["unlock_f4", "free_cell_count", 4],
  ["unlock_f10", "free_cell_count", 10],
];

const SORT_ACHIEVEMENTS: [string, number][] = [
  ["unlock_s1", 1],
  ["unlock_s5", 5],
  ["unlock_s10", 10],
];

export function refreshAchievementsFromUpgrades(
  unlockedSettings: UnlockedSettings,
  sortUpgradePurchaseCount: number,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  const before = newAchievements.length;
  for (const [achievementId, settingKey, target] of SETTING_ACHIEVEMENTS) {
    if ((unlockedSettings[settingKey] ?? 0) >= target) {
      unlockAchievement(achievementId, unlocked, validIds, newAchievements);
    }
  }
  for (const [achievementId, target] of SORT_ACHIEVEMENTS) {
    if (sortUpgradePurchaseCount >= target) {
      unlockAchievement(achievementId, unlocked, validIds, newAchievements);
    }
  }
  return newAchievements.length - before;
}

function refreshThresholdAchievements(
  value: number,
  targets: readonly number[],
  idFor: (target: number) => string,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  const before = newAchievements.length;
  for (const target of targets) {
    if (value >= target) {
      unlockAchievement(idFor(target), unlocked, validIds, newAchievements);
    }
  }
  return newAchievements.length - before;
}

export function refreshClearCountAchievements(
  totalClears: number,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  return refreshThresholdAchievements(totalClears, [1, 10, 100], (t) => `clear_${t}`, unlocked, validIds, newAchievements);
}

export function refreshRebirthCountAchievements(
  rebirthCount: number,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  return refreshThresholdAchievements(rebirthCount, [1, 2, 3, 5, 10], (t) => `rebirth_${t}`, unlocked, validIds, newAchievements);
}

export function refreshUpgradeCountAchievements(
  purchasedCount: number,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  return refreshThresholdAchievements(
    purchasedCount,
    [1, 5, 10, 20, 30, 40, 50],
    (t) => `upgrades_${t}`,
    unlocked,
    validIds,
    newAchievements,
  );
}

export function refreshRebirthUpgradeCountAchievements(
  purchasedCount: number,
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  return refreshThresholdAchievements(
    purchasedCount,
    [1, 5, 10, 15, 20],
    (t) => `rebirth_upgrades_${t}`,
    unlocked,
    validIds,
    newAchievements,
  );
}

export function refreshSpecificRebirthUpgradeAchievements(
  purchasedRebirthUpgrades: readonly string[],
  unlocked: string[],
  validIds: readonly string[],
  newAchievements: string[],
): number {
  const before = newAchievements.length;
  if (purchasedRebirthUpgrades.includes("rebirth_re4")) {
    unlockAchievement("rebirth_re4_acquired", unlocked, validIds, newAchievements);
  }
  if (purchasedRebirthUpgrades.includes("rebirth_rs3")) {
    unlockAchievement("rebirth_rs3_acquired", unlocked, validIds, newAchievements);
  }
  return newAchievements.length - before;
}
