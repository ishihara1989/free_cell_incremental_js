import type { Card } from "../core/types";
import { rgba, type Color } from "./color";

interface ColorDefinition {
  name: string;
  accent: Color;
  textColor: Color;
  marks: string[];
}

export const CARD_COLOR_DEFS: ColorDefinition[] = [
  {
    name: "黒",
    accent: rgba(0.219608, 0.290196, 0.392157),
    textColor: rgba(0.168627, 0.196078, 0.258824),
    marks: ["♠", "♣", "✚", "✘"],
  },
  {
    name: "赤",
    accent: rgba(0.772549, 0.25098, 0.231373),
    textColor: rgba(0.780392, 0.247059, 0.223529),
    marks: ["♦", "♥", "⬮", "❥"],
  },
  {
    name: "青",
    accent: rgba(0.188235, 0.482353, 0.839216),
    textColor: rgba(0.188235, 0.482353, 0.839216),
    marks: ["▼", "■", "⬢", "✱"],
  },
  {
    name: "黄",
    accent: rgba(0.862745, 0.701961, 0.219608),
    textColor: rgba(0.611765, 0.439216, 0.0509804),
    marks: ["▲", "★", "⬟", "⧗"],
  },
];

export interface SuitInfo {
  name: string;
  short: string;
  accent: Color;
  textColor: Color;
  colorName: string;
}

export function getSuitInfo(suitIndex: number, marksPerColor: number): SuitInfo {
  const safeMarks = Math.max(1, marksPerColor);
  const colorDef = CARD_COLOR_DEFS[Math.trunc(suitIndex / safeMarks) % CARD_COLOR_DEFS.length];
  const markIndex = suitIndex % safeMarks;
  const mark = colorDef.marks[markIndex % colorDef.marks.length] ?? "";
  return {
    name: `${colorDef.name}${mark}`,
    short: mark,
    accent: colorDef.accent,
    textColor: colorDef.textColor,
    colorName: colorDef.name,
  };
}

/** ♠13 のようなカード表記 */
export function cardLabel(card: Pick<Card, "suit" | "rank">, marksPerColor: number): string {
  return `${getSuitInfo(card.suit, marksPerColor).short}${card.rank}`;
}

/** ♠♥♦♣ が絵文字で表示される環境向けに、テキスト表示の異体字セレクタを付ける */
export function textPresentation(text: string): string {
  return text.replace(/([♠-♧])(?!︎)/g, "$1︎");
}
