import type { AchievementDefinition, SettingKey } from "./definitions";

export function buildAchievementDefinitions(): AchievementDefinition[] {
  const achievements: AchievementDefinition[] = [
    { id: "clear_1", title: "最初の一歩", description: "どの構成でも 1 回クリアする。", kind: "clear_count", target: 1 },
    { id: "clear_10", title: "ベテランプレイヤー", description: "累計 10 回クリアする。", kind: "clear_count", target: 10 },
    { id: "clear_100", title: "マシンソルバー", description: "累計 100 回クリアする。", kind: "clear_count", target: 100 },
    {
      id: "clear_rank_7",
      title: "道半ば",
      description: "N = 7 以上でクリアする。",
      kind: "clear_condition",
      reward: "まとめて移動を解禁",
    },
    {
      id: "clear_marks_2",
      title: "アナザーマーク",
      description: "M = 2 以上でクリアする。",
      kind: "clear_condition",
      reward: "自動完成を解禁",
    },
    {
      id: "clear_marks_2_colors_2",
      title: "4スート",
      description: "M = 2 かつ C = 2 以上でクリアする。",
      kind: "clear_condition",
      reward: "ヒントを解禁",
    },
    {
      id: "clear_marks_2_colors_2_rank_13",
      title: "通常プレイ",
      description: "M = 2、C = 2、N = 13 以上でクリアする。",
      kind: "clear_condition",
      reward: "転生を解禁",
    },
    {
      id: "clear_rank_25_marks_4_colors_4",
      title: "真・クリア",
      description: "N = 25、M = 4、C = 4 でクリアする。",
      kind: "clear_condition",
    },
    {
      id: "rebirth_1",
      title: "終わりの始まり",
      description: "転生を 1 回行う。",
      kind: "rebirth_count",
      target: 1,
      reward: "N14-N25、L9-L24、M3-M4、C3-C4、F5-F10、S1-S10 を解放",
    },
    {
      id: "rebirth_re4_acquired",
      title: "無限のエネルギー",
      description: "転生ツリーで RE4 を取得する。",
      kind: "rebirth_upgrade",
      upgrade_id: "rebirth_re4",
      reward: "自動移動ボタン解禁（RE4 / RS3 の両方取得で有効）",
    },
    {
      id: "rebirth_rs3_acquired",
      title: "一撃必殺",
      description: "転生ツリーで RS3 を取得する。",
      kind: "rebirth_upgrade",
      upgrade_id: "rebirth_rs3",
      reward: "自動移動ボタン解禁（RE4 / RS3 の両方取得で有効）",
    },
  ];

  const rebirthCountTitles: Record<number, string> = {
    2: "二周目の景色",
    3: "三度目の正直",
    5: "輪廻常連",
    10: "転生マスター",
  };
  for (const target of [2, 3, 5, 10]) {
    achievements.push({
      id: `rebirth_${target}`,
      title: rebirthCountTitles[target] ?? `転生回数 ${target}`,
      description: `転生を累計 ${target} 回行う。`,
      kind: "rebirth_count",
      target,
    });
  }

  const rebirthUpgradeTitles: Record<number, string> = {
    1: "覚醒",
    5: "改造開始",
    10: "加速中",
    15: "やりすぎ",
    20: "オーバーキル",
  };
  for (const target of [1, 5, 10, 15, 20]) {
    achievements.push({
      id: `rebirth_upgrades_${target}`,
      title: rebirthUpgradeTitles[target] ?? `転生スキル取得 ${target}`,
      description: `転生ツリーのノードを累計 ${target} 個取得する。`,
      kind: "rebirth_upgrade_count",
      target,
    });
  }

  const upgradeCountTitles: Record<number, string> = {
    1: "初投資",
    5: "買い揃え",
    10: "拡張工事",
    20: "盤面設計士",
    30: "ビルド職人",
    40: "積み上げ名人",
    50: "フルビルド",
  };
  for (const target of [1, 5, 10, 20, 30, 40, 50]) {
    achievements.push({
      id: `upgrades_${target}`,
      title: upgradeCountTitles[target] ?? `アップグレード取得 ${target}`,
      description: `通常アップグレードを累計 ${target} 個取得する。`,
      kind: "upgrade_count",
      target,
    });
  }

  const settingUnlock = (id: string, title: string, label: string, settingKey: SettingKey, target: number): AchievementDefinition => ({
    id,
    title,
    description: `${label} を取得する。`,
    kind: "setting_unlock",
    setting_key: settingKey,
    target,
  });
  achievements.push(
    settingUnlock("unlock_l2", "クオーター", "L2", "lane_count", 2),
    settingUnlock("unlock_l4", "半分サイズ", "L4", "lane_count", 4),
    settingUnlock("unlock_l8", "フルサイズ", "L8", "lane_count", 8),
    settingUnlock("unlock_l24", "真・フルサイズ", "L24", "lane_count", 24),
    settingUnlock("unlock_n5", "5人目", "N5", "rank_count", 5),
    settingUnlock("unlock_n10", "オールナンバー", "N10", "rank_count", 10),
    settingUnlock("unlock_n13", "全員集合", "N13", "rank_count", 13),
    settingUnlock("unlock_n25", "真・フルメンバー", "N25", "rank_count", 25),
    settingUnlock("unlock_m4", "カルテット", "M4", "marks_per_color", 4),
    settingUnlock("unlock_c4", "4色問題", "C4", "color_count", 4),
    settingUnlock("unlock_f2", "自由への第一歩", "F2", "free_cell_count", 2),
    settingUnlock("unlock_f3", "強い味方", "F3", "free_cell_count", 3),
    settingUnlock("unlock_f4", "ラストピース", "F4", "free_cell_count", 4),
    settingUnlock("unlock_f10", "真の自由", "F10", "free_cell_count", 10),
    { id: "unlock_s1", title: "小吉", description: "S1 を取得する。", kind: "sort_unlock", target: 1 },
    { id: "unlock_s5", title: "中吉", description: "S5 を取得する。", kind: "sort_unlock", target: 5 },
    { id: "unlock_s10", title: "大吉", description: "S10 を取得する。", kind: "sort_unlock", target: 10 },
  );
  return achievements;
}
