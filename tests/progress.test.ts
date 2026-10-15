// Godot 版 tests/test_*.gd（進行・得点・セーブ）を移植したもの
import { beforeEach, describe, expect, it } from "vitest";
import { buildAchievementDefinitions } from "../src/progress/achievementCatalog";
import * as AchievementService from "../src/progress/achievementService";
import { BASE_SETTINGS, GameState } from "../src/progress/gameState";
import * as IntegerText from "../src/progress/integerText";
import * as Transaction from "../src/progress/progressionTransactionService";
import { sanitizeDefinedIds, sanitizeSettings } from "../src/progress/progressStateSanitizer";
import { buildRebirthDefinitions } from "../src/progress/rebirthCatalog";
import { createMemoryStorage, parseGodotConfig, SaveRepository } from "../src/progress/saveRepository";
import * as ScoreCalculator from "../src/progress/scoreCalculator";
import { buildUpgradeDefinitions } from "../src/progress/upgradeCatalog";
import type { UpgradeDefinition } from "../src/progress/definitions";

describe("IntegerText", () => {
  it("数字以外と先頭の 0 を除く", () => {
    expect(IntegerText.normalize("  001,234 P ")).toBe("1234");
    expect(IntegerText.normalize("no digits")).toBe("0");
  });

  it("3 桁区切り", () => {
    expect(IntegerText.formatInteger("1234567890")).toBe("1,234,567,890");
  });

  it("大きい値は指数表記", () => {
    expect(IntegerText.formatIconCost("1234567")).toBe("1.23e6");
    expect(IntegerText.formatIconCost("999500")).toBe("999,500");
    expect(IntegerText.formatIconCost("9995000")).toBe("1.00e7");
  });

  it("巨大整数の加減算", () => {
    expect(IntegerText.add("999999999999999999", "2")).toBe("1000000000000000001");
    expect(IntegerText.subtract("1000000000000000001", "2")).toBe("999999999999999999");
    expect(IntegerText.subtract("2", "100")).toBe("0");
  });

  it("比較と購入可否", () => {
    expect(IntegerText.compare("1000000000000000000", "999999999999999999")).toBe(1);
    expect(IntegerText.compare("42", "42")).toBe(0);
    expect(IntegerText.canAfford("999999999999999999", "1000000000000000000")).toBe(true);
    expect(IntegerText.canAfford("1000000000000000000", "999999999999999999")).toBe(false);
  });

  it("整数倍", () => {
    expect(IntegerText.multiplyByInt("999999999999999999", 9)).toBe("8999999999999999991");
    expect(IntegerText.multiplyByInt("123", 0)).toBe("0");
  });
});

describe("ScoreCalculator", () => {
  it("補正なしは基本式", () => {
    expect(ScoreCalculator.calculateClearScore({ rank_count: 5, color_count: 2, marks_per_color: 2 })).toBe("800000");
  });

  it("補正ありは整数文字列", () => {
    expect(ScoreCalculator.calculateClearScore({ rank_count: 13, color_count: 2, marks_per_color: 2 }, 1.5, 1, 1, 0)).toBe(
      "18536380004",
    );
  });

  it("転生ポイントの閾値", () => {
    expect(ScoreCalculator.calculateRebirthGain("199999999", 200000000, 10)).toBe(0);
    expect(ScoreCalculator.calculateRebirthGain("200000000", 200000000, 10)).toBe(1);
    expect(ScoreCalculator.calculateRebirthGain("2000000000", 200000000, 10)).toBe(2);
  });

  it("実績倍率の表示", () => {
    expect(ScoreCalculator.getAchievementPointMultiplierText(0)).toBe("1.00");
    expect(ScoreCalculator.getAchievementPointMultiplierText(10)).toBe("2.00");
  });
});

describe("Catalogs", () => {
  it("通常アップグレードのコスト", () => {
    const upgrades = buildUpgradeDefinitions("rebirth_1", 10);
    const cost = (id: string) => upgrades.find((u) => u.id === id)?.cost;
    expect(cost("rank_14")).toBe("8388608");
    expect(cost("lane_9")).toBe("43046721");
    expect(cost("mark_4")).toBe("125000");
    expect(cost("color_4")).toBe("8000000000000");
    expect(cost("free_cell_10")).toBe("100000000000000000000000000000000");
    expect(cost("shuffle_10")).toBe((700n ** 10n).toString());
    expect(upgrades).toHaveLength(23 + 12 + 16 + 2 + 2 + 6 + 10);
  });

  it("転生ノード", () => {
    const upgrades = buildRebirthDefinitions("clear_marks_2_colors_2_rank_13");
    expect(upgrades.map((u) => u.title)).toContain("RA1");
    expect(upgrades.find((u) => u.id === "rebirth_score_rc5")?.cost).toBe("25");
  });

  it("実績の ID は重複しない", () => {
    const ids = buildAchievementDefinitions().map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ProgressionTransactionService", () => {
  const definitions = [
    { id: "rank_3", cost: "4", prerequisites: [], effect: { rank_count: 1 } },
    { id: "lane_2", cost: "8", prerequisites: ["rank_3"], effect: { lane_count: 1 } },
  ] as unknown as UpgradeDefinition[];

  it("購入済みアップグレードの効果を適用する", () => {
    const settings = Transaction.getUnlockedSettings(BASE_SETTINGS, definitions, ["rank_3", "lane_2"]);
    expect(settings.rank_count).toBe(3);
    expect(settings.lane_count).toBe(2);
    expect(settings.suit_count).toBe(1);
  });

  it("購入可否は表示・前提・ポイントで決まる", () => {
    expect(Transaction.canPurchaseUpgrade(definitions[0], true, [], 4)).toBe(true);
    expect(Transaction.canPurchaseUpgrade(definitions[0], false, [], 4)).toBe(false);
    expect(Transaction.canPurchaseUpgrade(definitions[0], true, [], 3)).toBe(false);
    expect(Transaction.canPurchaseUpgrade(definitions[1], true, [], 99)).toBe(false);
  });

  it("購入でポイントを引き、選択設定を新しい上限に合わせる", () => {
    const result = Transaction.applyUpgradePurchase(10, [], 0, { ...BASE_SETTINGS }, definitions[0], BASE_SETTINGS, definitions);
    expect(result.current_points).toBe("6");
    expect(result.purchased_upgrades).toEqual(["rank_3"]);
    expect(result.total_upgrade_purchases).toBe(1);
    expect(result.selected_settings.rank_count).toBe(3);
  });

  it("転生ノード購入で転生ポイントを引く", () => {
    const result = Transaction.applyRebirthUpgradePurchase(5, [], { id: "rebirth_re1", cost: "2" });
    expect(result.rebirth_points).toBe(3);
    expect(result.purchased_rebirth_upgrades).toEqual(["rebirth_re1"]);
  });

  it("転生は通常進行をリセットする", () => {
    const result = Transaction.applyRebirth(3, 5, 2, BASE_SETTINGS);
    expect(result.current_points).toBe("0");
    expect(result.rebirth_points).toBe(8);
    expect(result.rebirth_count).toBe(3);
    expect(result.purchased_upgrades).toEqual([]);
    expect(result.selected_settings).toEqual({ ...BASE_SETTINGS, suit_count: 1, total_mark_count: 1 });
  });
});

describe("ProgressStateSanitizer", () => {
  it("設定は基本値と解放値の範囲に収める", () => {
    const sanitized = sanitizeSettings({ rank_count: 99, lane_count: 0 }, BASE_SETTINGS, { ...BASE_SETTINGS, rank_count: 5 });
    expect(sanitized.rank_count).toBe(5);
    expect(sanitized.lane_count).toBe(1);
  });

  it("未定義 ID と重複を除く", () => {
    expect(sanitizeDefinedIds(["a", "b", "a", "x"], ["a", "b"])).toEqual(["a", "b"]);
    expect(sanitizeDefinedIds("a", ["a"])).toEqual([]);
  });
});

describe("GameState", () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = new GameState(new SaveRepository(createMemoryStorage()));
  });

  it("初期ソート本数は購入数とレーン数の半分で制限される", () => {
    gameState.purchasedUpgrades = ["shuffle_1", "shuffle_2", "shuffle_3"];
    expect(gameState.getInitialSortLaneCount(5)).toBe(2);
    expect(gameState.getInitialSortLaneCount(8)).toBe(3);
  });

  it("転生ポイント", () => {
    expect(gameState.calculateRebirthGain("199999999")).toBe(0);
    expect(gameState.calculateRebirthGain("200000000")).toBe(1);
    expect(gameState.calculateRebirthGain("2000000000")).toBe(2);
  });

  it("クリア実績は解放済みの範囲に丸めた構成で判定する", () => {
    // 未解放の構成は基本値に丸められる（Godot 版 register_clear と同じ）
    expect(gameState.registerClear({ color_count: 2, marks_per_color: 2, rank_count: 13 })).toEqual(["clear_1"]);

    const achievements: string[] = [];
    AchievementService.collectClearAchievements(
      { color_count: 2, marks_per_color: 2, rank_count: 13 },
      1,
      [],
      buildAchievementDefinitions().map((a) => a.id),
      achievements,
    );
    expect(achievements).toEqual(
      expect.arrayContaining([
        "clear_1",
        "clear_rank_7",
        "clear_marks_2",
        "clear_marks_2_colors_2",
        "clear_marks_2_colors_2_rank_13",
      ]),
    );
  });

  it("購入で選択設定も更新される", () => {
    gameState.currentPoints = "10";
    expect(gameState.purchaseUpgrade("node_1")).toBe(true);
    expect(gameState.currentPoints).toBe("9");
    expect(gameState.isUpgradePurchased("node_1")).toBe(true);
    expect(gameState.getCurrentSettings().free_cell_count).toBe(2);
    expect(gameState.isAchievementUnlocked("unlock_f2")).toBe(true);
    expect(gameState.isAchievementUnlocked("upgrades_1")).toBe(true);
  });

  it("転生で通常進行をリセットする", () => {
    gameState.unlockedAchievements = ["clear_marks_2_colors_2_rank_13"];
    gameState.currentPoints = "200000000";
    gameState.purchasedUpgrades = ["node_2"];
    const result = gameState.performRebirth();
    expect(result.success).toBe(true);
    expect(result.new_achievements).toContain("rebirth_1");
    expect(gameState.rebirthPoints).toBe(1);
    expect(gameState.rebirthCount).toBe(1);
    expect(gameState.currentPoints).toBe("0");
    expect(gameState.purchasedUpgrades).toEqual([]);
    expect(gameState.getCurrentSettings().rank_count).toBe(2);
  });

  it("RA1 は高いものから買えるだけ買う", () => {
    gameState.currentPoints = "11";
    const purchased = gameState.purchaseAvailableUpgradesByDescendingCost();
    expect(purchased).toEqual(["node_1", "node_3"]);
    expect(gameState.currentPoints).toBe("1");
  });

  it("保存と読み込みで状態が戻る", () => {
    const storage = createMemoryStorage();
    const first = new GameState(new SaveRepository(storage));
    first.currentPoints = "123456789012345678901234567890";
    first.purchasedUpgrades = ["node_1"];
    first.saveGame();

    const second = new GameState(new SaveRepository(storage));
    expect(second.hasSaveData()).toBe(true);
    expect(second.loadGame()).toBe(true);
    expect(second.currentPoints).toBe("123456789012345678901234567890");
    expect(second.purchasedUpgrades).toEqual(["node_1"]);
  });
});

describe("Godot save.cfg import", () => {
  const godotSave = `[progress]

current_points="0"
rebirth_points=4
rebirth_count=13
purchased_upgrades=Array[String]([])
purchased_rebirth_upgrades=Array[String](["rebirth_re1", "rebirth_rs1", "unknown_id"])
total_clears=86
total_upgrade_purchases=692
unlocked_achievements=Array[String](["clear_marks_2_colors_2_rank_13", "rebirth_1", "clear_1"])
auto_complete_enabled=false
window_width=1280
window_height=720
selected_settings={
"color_count": 1,
"free_cell_count": 1,
"lane_count": 1,
"marks_per_color": 1,
"rank_count": 2,
"suit_count": 1,
"total_mark_count": 1
}
`;

  it("ConfigFile 形式を読める", () => {
    const data = parseGodotConfig(godotSave);
    expect(data?.rebirth_count).toBe(13);
    expect(data?.purchased_upgrades).toEqual([]);
    expect(data?.selected_settings).toMatchObject({ rank_count: 2 });
    expect(data?.auto_complete_enabled).toBe(false);
  });

  it("GameState に取り込める", () => {
    const gameState = new GameState(new SaveRepository(createMemoryStorage()));
    expect(gameState.importSaveText(godotSave)).toBe(true);
    expect(gameState.rebirthPoints).toBe(4);
    expect(gameState.rebirthCount).toBe(13);
    expect(gameState.totalClears).toBe(86);
    expect(gameState.purchasedRebirthUpgrades).toEqual(["rebirth_re1", "rebirth_rs1"]);
    expect(gameState.isRebirthUnlocked()).toBe(true);
    expect(gameState.isAutoCompleteEnabled()).toBe(false);
    expect(gameState.hasSaveData()).toBe(true);
  });

  it("エクスポートした JSON を再度取り込める", () => {
    const source = new GameState(new SaveRepository(createMemoryStorage()));
    source.currentPoints = "999";
    source.totalClears = 5;
    const target = new GameState(new SaveRepository(createMemoryStorage()));
    expect(target.importSaveText(source.exportSaveText())).toBe(true);
    expect(target.currentPoints).toBe("999");
    expect(target.totalClears).toBe(5);
  });

  it("無関係なテキストは拒否する", () => {
    const gameState = new GameState(new SaveRepository(createMemoryStorage()));
    expect(gameState.importSaveText("hello")).toBe(false);
    expect(gameState.importSaveText('{"foo": 1}')).toBe(false);
  });
});
