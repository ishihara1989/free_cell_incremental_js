import type { BoardSettings } from "../core/types";
import type { SettingKey } from "./definitions";

export type BaseSettings = Record<SettingKey, number>;

export const SETTING_KEYS: readonly SettingKey[] = [
  "color_count",
  "marks_per_color",
  "rank_count",
  "lane_count",
  "free_cell_count",
];

function toInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function sanitizeSettings(
  settings: object,
  baseSettings: BaseSettings,
  unlockedSettings: Partial<Record<SettingKey, number>>,
): BoardSettings {
  const sanitized = { ...baseSettings } as Record<SettingKey, number>;
  for (const key of SETTING_KEYS) {
    const baseValue = baseSettings[key];
    const unlockedValue = toInt(unlockedSettings[key], baseValue);
    const value = toInt((settings as Record<string, unknown>)[key], baseValue);
    sanitized[key] = Math.min(Math.max(value, baseValue), Math.max(baseValue, unlockedValue));
  }
  const suitCount = sanitized.color_count * sanitized.marks_per_color;
  return { ...sanitized, suit_count: suitCount, total_mark_count: suitCount };
}

export function sanitizeDefinedIds(value: unknown, validIds: readonly string[]): string[] {
  const sanitized: string[] = [];
  if (!Array.isArray(value)) {
    return sanitized;
  }
  for (const item of value) {
    const itemId = String(item);
    if (!validIds.includes(itemId) || sanitized.includes(itemId)) {
      continue;
    }
    sanitized.push(itemId);
  }
  return sanitized;
}
