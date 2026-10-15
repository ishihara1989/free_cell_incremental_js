import { makeUpgrade, type UpgradeDefinition } from "./definitions";

export function buildRebirthDefinitions(rebirthUnlockAchievementId: string): UpgradeDefinition[] {
  const gated = rebirthUnlockAchievementId;
  const upgrades: UpgradeDefinition[] = [
    makeUpgrade(
      "rebirth_re1",
      "RE1",
      0,
      {},
      "チェーンエネルギーを解放する。最大チェーン更新時にエネルギーを得る。",
      "rebirth_energy",
      1,
      [0, 3],
      [],
      gated,
    ),
    makeUpgrade(
      "rebirth_re2",
      "RE2",
      3,
      {},
      "各レーンを初めて空にしたとき、そのレーンごとに 3 エネルギーを得る。",
      "rebirth_energy",
      2,
      [1, 3],
      ["rebirth_re1"],
      gated,
    ),
    makeUpgrade(
      "rebirth_re3",
      "RE3",
      5,
      {},
      "活性カードのみのレーンにあるカード合計の最大値に応じて追加エネルギーを得る。",
      "rebirth_energy",
      3,
      [2, 3],
      ["rebirth_re2"],
      gated,
    ),
    makeUpgrade(
      "rebirth_re4",
      "RE4",
      10,
      {},
      "不活性カードが累計 3 回活性状態になるたびに 1 エネルギーを得る。",
      "rebirth_energy",
      4,
      [3, 3],
      ["rebirth_re3"],
      gated,
    ),
    makeUpgrade(
      "rebirth_rs1",
      "RS1",
      1,
      {},
      "2 エネルギーで、不活性カードのうち安全に完成置き場へ送れる一番悪いカードを直接送るテレポートを解放する。",
      "rebirth_skill",
      1,
      [0, 4],
      ["rebirth_re1"],
      gated,
    ),
    makeUpgrade(
      "rebirth_rs2",
      "RS2",
      2,
      {},
      "1 エネルギーで、フリーセルの最大数字カードを不活性カード合計が最大のレーン奥へ送るアンロードを解放する。",
      "rebirth_skill",
      2,
      [1, 4],
      ["rebirth_rs1"],
      gated,
    ),
    makeUpgrade(
      "rebirth_rs3",
      "RS3",
      10,
      {},
      "3 エネルギーで、不活性カードから最も評価値が高い合法な列を作り、空レーンへ置くアセンブルを解放する。",
      "rebirth_skill",
      3,
      [2, 4],
      ["rebirth_rs2"],
      gated,
    ),
  ];

  const scaleSpecs = [
    { prefix: "rn", title: "RN", baseCost: 1, positionY: 0 },
    { prefix: "rm", title: "RM", baseCost: 3, positionY: 1 },
    { prefix: "rc", title: "RC", baseCost: 5, positionY: 2 },
  ];
  for (const spec of scaleSpecs) {
    let previousId = "rebirth_re1";
    for (let level = 1; level <= 5; level++) {
      const upgradeId = `rebirth_score_${spec.prefix}${level}`;
      const percent = level * 10;
      upgrades.push(
        makeUpgrade(
          upgradeId,
          `${spec.title}${level}`,
          spec.baseCost * level,
          {},
          `ポイント計算の ${spec.title} 系指数補正を ${percent}% にする。`,
          "rebirth_scale",
          percent,
          [level - 1, spec.positionY],
          [previousId],
          gated,
        ),
      );
      previousId = upgradeId;
    }
  }

  upgrades.push(
    makeUpgrade(
      "rebirth_ra1",
      "RA1",
      5,
      {},
      "クリア時、取得可能な通常アップグレードを必要ポイントが高いものから順番に自動取得する。",
      "rebirth_auto",
      1,
      [0, 5],
      ["rebirth_re1"],
      gated,
    ),
  );

  return upgrades;
}
