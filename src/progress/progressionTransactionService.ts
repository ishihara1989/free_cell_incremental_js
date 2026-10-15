import type { BoardSettings } from "../core/types";
import type { SettingKey, UpgradeDefinition } from "./definitions";
import { canAfford, costToInt, subtract, type IntegerLike } from "./integerText";
import { sanitizeSettings, type BaseSettings } from "./progressStateSanitizer";

export function getUnlockedSettings(
  baseSettings: BaseSettings,
  upgradeDefinitions: readonly UpgradeDefinition[],
  purchasedUpgrades: readonly string[],
): BoardSettings {
  const settings: Record<string, number> = { ...baseSettings };
  for (const upgrade of upgradeDefinitions) {
    if (!purchasedUpgrades.includes(upgrade.id)) {
      continue;
    }
    for (const [key, amount] of Object.entries(upgrade.effect)) {
      settings[key] = (settings[key] ?? 0) + (amount ?? 0);
    }
  }
  const suitCount = (settings.color_count ?? 1) * (settings.marks_per_color ?? 1);
  return { ...(settings as unknown as BaseSettings), suit_count: suitCount, total_mark_count: suitCount };
}

export function canPurchaseUpgrade(
  upgrade: UpgradeDefinition | null,
  isVisible: boolean,
  purchasedUpgrades: readonly string[],
  pointBalance: IntegerLike,
): boolean {
  if (!upgrade || !isVisible || purchasedUpgrades.includes(upgrade.id)) {
    return false;
  }
  if (!upgrade.prerequisites.every((id) => purchasedUpgrades.includes(id))) {
    return false;
  }
  return canAfford(upgrade.cost, pointBalance);
}

export function canPurchaseRebirthUpgrade(
  upgrade: UpgradeDefinition | null,
  isVisible: boolean,
  purchasedRebirthUpgrades: readonly string[],
  rebirthPoints: number,
): boolean {
  return canPurchaseUpgrade(upgrade, isVisible, purchasedRebirthUpgrades, rebirthPoints);
}

export function applyUpgradePurchase(
  currentPoints: IntegerLike,
  purchasedUpgrades: readonly string[],
  totalUpgradePurchases: number,
  selectedSettings: Partial<BoardSettings>,
  upgrade: UpgradeDefinition,
  baseSettings: BaseSettings,
  upgradeDefinitions: readonly UpgradeDefinition[],
) {
  const nextPurchased = [...purchasedUpgrades];
  if (upgrade.id.length > 0 && !nextPurchased.includes(upgrade.id)) {
    nextPurchased.push(upgrade.id);
  }

  const unlockedSettings = getUnlockedSettings(baseSettings, upgradeDefinitions, nextPurchased);
  const nextSelectedSettings: Partial<BoardSettings> = { ...selectedSettings };
  // 購入した項目は新しい上限値へ自動で合わせる
  for (const key of Object.keys(upgrade.effect) as SettingKey[]) {
    nextSelectedSettings[key] = unlockedSettings[key] ?? baseSettings[key] ?? 0;
  }

  return {
    current_points: subtract(currentPoints, upgrade.cost),
    purchased_upgrades: nextPurchased,
    total_upgrade_purchases: totalUpgradePurchases + 1,
    selected_settings: sanitizeSettings(nextSelectedSettings, baseSettings, unlockedSettings),
  };
}

export function applyRebirthUpgradePurchase(
  rebirthPoints: number,
  purchasedRebirthUpgrades: readonly string[],
  upgrade: Pick<UpgradeDefinition, "id" | "cost">,
) {
  const nextPurchased = [...purchasedRebirthUpgrades];
  if (upgrade.id.length > 0 && !nextPurchased.includes(upgrade.id)) {
    nextPurchased.push(upgrade.id);
  }
  return {
    rebirth_points: Math.max(0, rebirthPoints - costToInt(upgrade.cost)),
    purchased_rebirth_upgrades: nextPurchased,
  };
}

export function applyRebirth(grantedPoints: number, rebirthPoints: number, rebirthCount: number, baseSettings: BaseSettings) {
  return {
    current_points: "0",
    rebirth_points: rebirthPoints + grantedPoints,
    rebirth_count: rebirthCount + 1,
    purchased_upgrades: [] as string[],
    selected_settings: sanitizeSettings({ ...baseSettings }, baseSettings, baseSettings),
  };
}
