import { makeUpgrade, type UpgradeDefinition } from "./definitions";

function costFromMultiplier(baseCost: number, multiplier: number, exponent: number): string {
  return (BigInt(baseCost) * BigInt(multiplier) ** BigInt(Math.max(0, exponent))).toString();
}

function sortUpgradeDescription(shuffleValue: number): string {
  return `初期盤面で悪い順に最大 ${shuffleValue} 本のレーンを、UIで下側ほど数字が小さくなるようソートする。ソート本数は現在の全レーン数の半分（端数切り捨て）が上限。`;
}

export function buildUpgradeDefinitions(rebirthFirstAchievementId: string, sortUpgradeMaxLevel: number): UpgradeDefinition[] {
  const upgrades: UpgradeDefinition[] = [
    makeUpgrade("node_1", "F2", 1, { free_cell_count: 1 }, "フリーセル上限を 2 にする。", "free_cell", 2, [0, 1]),
    makeUpgrade("node_2", "N3", 2, { rank_count: 1 }, "数字上限を 3 にする。", "rank", 3, [1, 0], ["node_1"]),
    makeUpgrade("node_3", "L2", 9, { lane_count: 1 }, "レーン数を 2 にする。", "lane", 2, [1, 1], ["node_1"]),
    makeUpgrade("node_4", "N4", 8, { rank_count: 1 }, "数字上限を 4 にする。", "rank", 4, [2, 0], ["node_2"]),
    makeUpgrade("node_5", "N5", 32, { rank_count: 1 }, "数字上限を 5 にする。", "rank", 5, [3, 0], ["node_4"]),
    makeUpgrade("node_6", "N6", 128, { rank_count: 1 }, "数字上限を 6 にする。", "rank", 6, [4, 0], ["node_5"]),
    makeUpgrade("node_15", "N7", 512, { rank_count: 1 }, "数字上限を 7 にする。", "rank", 7, [5, 0], ["node_6"]),
    makeUpgrade("node_16", "N8", 2048, { rank_count: 1 }, "数字上限を 8 にする。", "rank", 8, [6, 0], ["node_15"]),
    makeUpgrade("node_17", "N9", 8192, { rank_count: 1 }, "数字上限を 9 にする。", "rank", 9, [7, 0], ["node_16"]),
    makeUpgrade("node_18", "N10", 32768, { rank_count: 1 }, "数字上限を 10 にする。", "rank", 10, [8, 0], ["node_17"]),
    makeUpgrade("node_19", "N11", 131072, { rank_count: 1 }, "数字上限を 11 にする。", "rank", 11, [9, 0], ["node_18"]),
    makeUpgrade("node_20", "N12", 524288, { rank_count: 1 }, "数字上限を 12 にする。", "rank", 12, [10, 0], ["node_19"]),
    makeUpgrade("node_21", "N13", 2097152, { rank_count: 1 }, "数字上限を 13 にする。", "rank", 13, [11, 0], ["node_20"]),

    makeUpgrade("node_7", "M2", 50, { marks_per_color: 1 }, "1 色あたりのマーク数を 2 にする。", "mark", 2, [1, 2], ["node_1"]),
    makeUpgrade("node_22", "C2", 20000, { color_count: 1 }, "色数を 2 にする。", "color", 2, [1, 3], ["node_1"]),
    makeUpgrade("node_9", "F3", 10000, { free_cell_count: 1 }, "フリーセル上限を 3 にする。", "free_cell", 3, [1, 4], ["node_1"]),
    makeUpgrade("node_23", "F4", 100000000, { free_cell_count: 1 }, "フリーセル上限を 4 にする。", "free_cell", 4, [2, 4], ["node_9"]),

    makeUpgrade("node_8", "L3", 81, { lane_count: 1 }, "レーン数を 3 にする。", "lane", 3, [2, 1], ["node_3"]),
    makeUpgrade("node_10", "L4", 729, { lane_count: 1 }, "レーン数を 4 にする。", "lane", 4, [3, 1], ["node_8"]),
    makeUpgrade("node_11", "L5", 6561, { lane_count: 1 }, "レーン数を 5 にする。", "lane", 5, [4, 1], ["node_10"]),
    makeUpgrade("node_12", "L6", 59049, { lane_count: 1 }, "レーン数を 6 にする。", "lane", 6, [5, 1], ["node_11"]),
    makeUpgrade("node_13", "L7", 531441, { lane_count: 1 }, "レーン数を 7 にする。", "lane", 7, [6, 1], ["node_12"]),
    makeUpgrade("node_14", "L8", 4782969, { lane_count: 1 }, "レーン数を 8 にする。", "lane", 8, [7, 1], ["node_13"]),
  ];

  const gated = rebirthFirstAchievementId;
  for (let rank = 14; rank <= 25; rank++) {
    const previousId = rank - 1 === 13 ? "node_21" : `rank_${rank - 1}`;
    upgrades.push(
      makeUpgrade(
        `rank_${rank}`,
        `N${rank}`,
        costFromMultiplier(2097152, 4, rank - 13),
        { rank_count: 1 },
        `数字上限を ${rank} にする。`,
        "rank",
        rank,
        [rank - 2, 0],
        [previousId],
        gated,
      ),
    );
  }

  for (let lane = 9; lane <= 24; lane++) {
    const previousId = lane - 1 === 8 ? "node_14" : `lane_${lane - 1}`;
    upgrades.push(
      makeUpgrade(
        `lane_${lane}`,
        `L${lane}`,
        costFromMultiplier(4782969, 9, lane - 8),
        { lane_count: 1 },
        `レーン数を ${lane} にする。`,
        "lane",
        lane,
        [lane - 1, 1],
        [previousId],
        gated,
      ),
    );
  }

  for (let mark = 3; mark <= 4; mark++) {
    const previousId = mark - 1 === 2 ? "node_7" : `mark_${mark - 1}`;
    upgrades.push(
      makeUpgrade(
        `mark_${mark}`,
        `M${mark}`,
        costFromMultiplier(50, 50, mark - 2),
        { marks_per_color: 1 },
        `1 色あたりのマーク数を ${mark} にする。`,
        "mark",
        mark,
        [mark - 1, 2],
        [previousId],
        gated,
      ),
    );
  }

  for (let color = 3; color <= 4; color++) {
    const previousId = color - 1 === 2 ? "node_22" : `color_${color - 1}`;
    upgrades.push(
      makeUpgrade(
        `color_${color}`,
        `C${color}`,
        costFromMultiplier(1, 20000, color - 1),
        { color_count: 1 },
        `色数を ${color} にする。`,
        "color",
        color,
        [color - 1, 3],
        [previousId],
        gated,
      ),
    );
  }

  for (let freeCell = 5; freeCell <= 10; freeCell++) {
    const previousId = freeCell - 1 === 4 ? "node_23" : `free_cell_${freeCell - 1}`;
    upgrades.push(
      makeUpgrade(
        `free_cell_${freeCell}`,
        `F${freeCell}`,
        costFromMultiplier(100000000, 10000, freeCell - 4),
        { free_cell_count: 1 },
        `フリーセル上限を ${freeCell} にする。`,
        "free_cell",
        freeCell,
        [freeCell - 2, 4],
        [previousId],
        gated,
      ),
    );
  }

  for (let shuffle = 1; shuffle <= sortUpgradeMaxLevel; shuffle++) {
    const previousId = shuffle === 1 ? "node_1" : `shuffle_${shuffle - 1}`;
    upgrades.push(
      makeUpgrade(
        `shuffle_${shuffle}`,
        `S${shuffle}`,
        costFromMultiplier(700, 700, shuffle - 1),
        {},
        sortUpgradeDescription(shuffle),
        "sort",
        shuffle,
        [shuffle, 5],
        [previousId],
        gated,
      ),
    );
  }

  return upgrades;
}
