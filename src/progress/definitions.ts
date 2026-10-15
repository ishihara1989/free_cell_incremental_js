export type SettingKey = "color_count" | "marks_per_color" | "rank_count" | "lane_count" | "free_cell_count";

export type IconKind =
  | "free_cell"
  | "rank"
  | "lane"
  | "mark"
  | "color"
  | "sort"
  | "rebirth_energy"
  | "rebirth_skill"
  | "rebirth_scale"
  | "rebirth_auto";

export interface UpgradeDefinition {
  id: string;
  title: string;
  /** 10 進数文字列（巨大値に対応） */
  cost: string;
  effect: Partial<Record<SettingKey, number>>;
  description: string;
  icon_kind: IconKind;
  target_value: number;
  tree_position: { x: number; y: number };
  prerequisites: string[];
  required_achievement: string;
}

export type AchievementKind =
  | "clear_count"
  | "clear_condition"
  | "rebirth_count"
  | "rebirth_upgrade"
  | "rebirth_upgrade_count"
  | "upgrade_count"
  | "setting_unlock"
  | "sort_unlock";

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  kind: AchievementKind;
  target?: number;
  reward?: string;
  upgrade_id?: string;
  setting_key?: SettingKey;
}

export function makeUpgrade(
  id: string,
  title: string,
  cost: string | number,
  effect: Partial<Record<SettingKey, number>>,
  description: string,
  iconKind: IconKind,
  targetValue: number,
  treePosition: [number, number],
  prerequisites: string[] = [],
  requiredAchievement = "",
): UpgradeDefinition {
  return {
    id,
    title,
    cost: String(cost),
    effect: { ...effect },
    description,
    icon_kind: iconKind,
    target_value: targetValue,
    tree_position: { x: treePosition[0], y: treePosition[1] },
    prerequisites: [...prerequisites],
    required_achievement: requiredAchievement,
  };
}
