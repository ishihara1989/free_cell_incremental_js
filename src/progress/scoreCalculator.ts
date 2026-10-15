import { getLog10, makeFromLog10, normalize } from "./integerText";
import type { BoardSettings } from "../core/types";

type ScoreSettings = Pick<BoardSettings, "rank_count" | "color_count" | "marks_per_color">;

export function getAchievementPointMultiplierText(achievementCount: number): string {
  const multiplier = 2 ** (Math.max(0, achievementCount) / 10);
  return multiplier < 100 ? multiplier.toFixed(2) : multiplier.toFixed(1);
}

function isEqualApprox(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.00001;
}

/** クリア得点。基本式は 2^N * 1000^(C-1) * 25^(M-1) */
export function calculateClearScore(
  settings: ScoreSettings,
  rankMultiplier = 1,
  colorMultiplier = 1,
  markMultiplier = 1,
  achievementMultiplierLog10 = 0,
): string {
  const rankCount = settings.rank_count ?? 2;
  const colorCount = settings.color_count ?? 1;
  const marksPerColor = settings.marks_per_color ?? 1;

  if (
    isEqualApprox(rankMultiplier, 1) &&
    isEqualApprox(colorMultiplier, 1) &&
    isEqualApprox(markMultiplier, 1) &&
    achievementMultiplierLog10 === 0
  ) {
    const score =
      2n ** BigInt(Math.max(0, rankCount)) *
      1000n ** BigInt(Math.max(0, colorCount - 1)) *
      25n ** BigInt(Math.max(0, marksPerColor - 1));
    return score.toString();
  }

  const rankExponent = rankCount * rankMultiplier;
  const colorExponent = (colorCount - 1) * colorMultiplier;
  const markExponent = (marksPerColor - 1) * markMultiplier;
  const scoreLog10 =
    (rankExponent * Math.log(2)) / Math.log(10) +
    colorExponent * 3 +
    (markExponent * Math.log(25)) / Math.log(10) +
    achievementMultiplierLog10;
  return makeFromLog10(scoreLog10);
}

/** R = max(1 + FLOOR(log_base(P / threshold)), 0) */
export function calculateRebirthGain(pointBalance: string | number, threshold: number, base: number): number {
  const pointText = normalize(pointBalance);
  if (pointText === "0") {
    return 0;
  }
  const normalizedLog = getLog10(pointText) - Math.log(threshold) / Math.log(10);
  return Math.max(0, 1 + Math.floor(normalizedLog / (Math.log(base) / Math.log(10))));
}

export function achievementMultiplierLog10(achievementCount: number): number {
  return (Math.max(0, achievementCount) * Math.log(2)) / Math.log(10) / 10;
}

export function exponentMultiplier(rebirthScoreLevel: number): number {
  return 1 + Math.max(0, rebirthScoreLevel) * 0.1;
}
