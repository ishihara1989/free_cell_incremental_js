import type { UpgradeDefinition } from "../progress/definitions";
import { formatIconCost } from "../progress/integerText";
import { css, lightened, rgba, type Color } from "./color";
import { escapeHtml } from "./dom";
import { textPresentation } from "./suitInfo";

export type NodeStateName = "purchased" | "available" | "insufficient" | "locked";

export const NODE_SIZE = 108;

interface NodeStyle {
  fill: Color;
  border: Color;
  text: Color;
  subtext: Color;
  accent: Color;
}

const STATE_STYLES: Record<NodeStateName, NodeStyle> = {
  purchased: {
    fill: rgba(0.0862745, 0.160784, 0.145098, 0.98),
    border: rgba(0.462745, 0.862745, 0.678431, 0.9),
    text: rgba(0.886275, 0.964706, 0.92549, 1),
    subtext: rgba(0.658824, 0.87451, 0.780392, 0.95),
    accent: rgba(0.556863, 0.862745, 0.686275, 1),
  },
  available: {
    fill: rgba(0.176471, 0.129412, 0.0705882, 0.98),
    border: rgba(0.996078, 0.760784, 0.443137, 0.95),
    text: rgba(0.992157, 0.94902, 0.878431, 1),
    subtext: rgba(0.972549, 0.792157, 0.560784, 0.95),
    accent: rgba(0.996078, 0.701961, 0.439216, 1),
  },
  insufficient: {
    fill: rgba(0.129412, 0.109804, 0.0941176, 0.98),
    border: rgba(0.862745, 0.576471, 0.333333, 0.55),
    text: rgba(0.921569, 0.898039, 0.858824, 1),
    subtext: rgba(0.847059, 0.733333, 0.639216, 0.92),
    accent: rgba(0.921569, 0.678431, 0.466667, 1),
  },
  locked: {
    fill: rgba(0.0784314, 0.113725, 0.184314, 0.98),
    border: rgba(0.462745, 0.529412, 0.65098, 0.38),
    text: rgba(0.815686, 0.854902, 0.917647, 1),
    subtext: rgba(0.654902, 0.713725, 0.819608, 0.92),
    accent: rgba(0.760784, 0.835294, 0.921569, 0.92),
  },
};

const PAPER = rgba(0.972549, 0.956863, 0.921569, 1);
const INK = rgba(0.145098, 0.184314, 0.282353, 1);
const MARK_PREVIEW = ["♠", "♣", "✚", "✘"];
const COLOR_PREVIEW: { short: string; accent: Color }[] = [
  { short: "♠", accent: rgba(0.188235, 0.25098, 0.360784, 1) },
  { short: "♦", accent: rgba(0.745098, 0.219608, 0.235294, 1) },
  { short: "▼", accent: rgba(0.14902, 0.501961, 0.772549, 1) },
  { short: "▲", accent: rgba(0.862745, 0.701961, 0.219608, 1) },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 矩形の中央に文字を置く（Godot 版 _draw_centered_text 相当） */
function centeredText(text: string, rect: Rect, fontSize: number, color: Color, weight = 400): string {
  return (
    `<text x="${n(rect.x + rect.w / 2)}" y="${n(rect.y + rect.h / 2)}" font-size="${fontSize}" font-weight="${weight}" ` +
    `text-anchor="middle" dominant-baseline="central" fill="${css(color)}">${escapeHtml(textPresentation(text))}</text>`
  );
}

function box(rect: Rect, fill: Color | null, stroke: Color | null, radius: number, strokeWidth = 1): string {
  const inset = stroke ? strokeWidth / 2 : 0;
  return (
    `<rect x="${n(rect.x + inset)}" y="${n(rect.y + inset)}" width="${n(rect.w - inset * 2)}" height="${n(rect.h - inset * 2)}" ` +
    `rx="${n(Math.max(0, radius - inset))}" fill="${fill ? css(fill) : "none"}"` +
    (stroke ? ` stroke="${css(stroke)}" stroke-width="${strokeWidth}"` : "") +
    "/>"
  );
}

function previewCard(rect: Rect, mark: string, border: Color): string {
  return box(rect, PAPER, border, 7) + centeredText(mark, rect, 11, INK);
}

function iconSvg(upgrade: UpgradeDefinition, style: NodeStyle, r: Rect): string {
  const parts: string[] = [];
  switch (upgrade.icon_kind) {
    case "free_cell": {
      const cardRect = { x: r.x + 18, y: r.y + 2, w: 34, h: 46 };
      parts.push(box(cardRect, PAPER, style.border, 10), centeredText("FC", cardRect, 16, INK));
      const badge = { x: r.x + 44, y: r.y + 34, w: 26, h: 18 };
      parts.push(box(badge, style.accent, null, 9), centeredText("+1", badge, 12, rgba(1, 1, 1, 1)));
      break;
    }
    case "rank":
      parts.push(centeredText("N", { x: r.x, y: r.y, w: r.w, h: 14 }, 13, style.subtext));
      parts.push(centeredText(String(upgrade.target_value), { x: r.x, y: r.y + 8, w: r.w, h: r.h - 8 }, 34, style.accent, 700));
      break;
    case "lane": {
      const count = Math.min(Math.max(upgrade.target_value, 1), 4);
      const width = 12;
      const gap = 7;
      const startX = r.x + (r.w - (count * width + (count - 1) * gap)) / 2;
      for (let index = 0; index < count; index++) {
        parts.push(box({ x: startX + index * (width + gap), y: r.y + 10, w: width, h: 34 }, lightened(style.accent, 0.12), style.border, 5));
      }
      parts.push(centeredText("LANE", { x: r.x, y: r.y + 44, w: r.w, h: 12 }, 11, style.subtext));
      break;
    }
    case "mark": {
      const count = Math.min(Math.max(upgrade.target_value, 1), MARK_PREVIEW.length);
      const startX = r.x + (r.w - (24 + Math.max(0, count - 1) * 8 + 8)) / 2;
      for (let index = 0; index < count; index++) {
        parts.push(previewCard({ x: startX + index * 8, y: r.y + 10 + index * 2, w: 24, h: 32 }, MARK_PREVIEW[index], COLOR_PREVIEW[0].accent));
      }
      break;
    }
    case "color": {
      const count = Math.min(Math.max(upgrade.target_value, 1), COLOR_PREVIEW.length);
      const startX = r.x + (r.w - (count * 24 + Math.max(0, count - 1) * 6)) / 2;
      for (let index = 0; index < count; index++) {
        const preview = COLOR_PREVIEW[index];
        parts.push(previewCard({ x: startX + index * 30, y: r.y + 12, w: 24, h: 32 }, preview.short, preview.accent));
      }
      break;
    }
    case "sort": {
      const startX = r.x + (r.w - (18 * 3 + 7 * 2)) / 2;
      ["1", "2", "3"].forEach((rank, index) => {
        const cardRect = { x: startX + index * 25, y: r.y + 12 + (2 - index) * 2, w: 18, h: 24 };
        parts.push(box(cardRect, PAPER, style.accent, 6), centeredText(rank, cardRect, 11, style.accent));
      });
      parts.push(centeredText("SORT", { x: r.x, y: r.y + 40, w: r.w, h: 14 }, 11, style.subtext));
      break;
    }
    case "rebirth_energy": {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const bolt = [
        [-6, -18],
        [2, -18],
        [-4, -2],
        [8, -2],
        [-2, 18],
        [0, 4],
        [-10, 4],
      ]
        .map(([dx, dy]) => `${n(cx + dx)},${n(cy + dy)}`)
        .join(" ");
      parts.push(`<polygon points="${bolt}" fill="${css(style.accent)}"/>`);
      parts.push(centeredText("EN", { x: r.x, y: r.y + 38, w: r.w, h: 14 }, 11, style.subtext));
      break;
    }
    case "rebirth_skill": {
      const sx = r.x + 18;
      const sy = r.y + 18;
      const fx = r.x + r.w - 18;
      const fy = r.y + r.h - 14;
      parts.push(`<line x1="${sx}" y1="${sy}" x2="${fx}" y2="${fy}" stroke="${css(style.accent)}" stroke-width="3"/>`);
      parts.push(
        `<line x1="${sx + 20}" y1="${sy}" x2="${fx}" y2="${fy}" stroke="${css(lightened(style.accent, 0.12))}" stroke-width="3"/>`,
      );
      parts.push(box({ x: r.x + r.w - 30, y: r.y + 12, w: 18, h: 18 }, style.accent, null, 5));
      parts.push(centeredText("SK", { x: r.x, y: r.y + 40, w: r.w, h: 14 }, 11, style.subtext));
      break;
    }
    case "rebirth_scale":
      parts.push(centeredText(upgrade.title.slice(0, 2), { x: r.x, y: r.y + 4, w: r.w, h: 16 }, 14, style.subtext));
      parts.push(centeredText(`+${upgrade.target_value}%`, { x: r.x, y: r.y + 16, w: r.w, h: 28 }, 23, style.accent, 700));
      parts.push(centeredText("EXP", { x: r.x, y: r.y + 42, w: r.w, h: 12 }, 11, style.subtext));
      break;
    case "rebirth_auto": {
      const cardRect = { x: r.x + 14, y: r.y + 12, w: 22, h: 30 };
      parts.push(box(cardRect, PAPER, style.accent, 6), centeredText("P", cardRect, 13, style.accent));
      const ax = r.x + 42;
      const ex = r.x + r.w - 16;
      const y = r.y + 27;
      const stroke = `stroke="${css(style.accent)}" stroke-width="3" stroke-linecap="round"`;
      parts.push(`<line x1="${ax}" y1="${y}" x2="${ex}" y2="${y}" ${stroke}/>`);
      parts.push(`<polyline points="${ex - 8},${y - 7} ${ex},${y} ${ex - 8},${y + 7}" fill="none" ${stroke}/>`);
      parts.push(centeredText("AUTO", { x: r.x, y: r.y + 42, w: r.w, h: 12 }, 11, style.subtext));
      break;
    }
  }
  return parts.join("");
}

function lockIcon(style: NodeStyle): string {
  const x = NODE_SIZE - 28;
  const y = 10;
  const w = 18;
  const h = 22;
  const cx = x + w / 2;
  return (
    `<path d="M ${cx - 5} ${y + 7} A 5 5 0 0 1 ${cx + 5} ${y + 7}" fill="none" stroke="${css(style.accent)}" stroke-width="2"/>` +
    box({ x: x + 2, y: y + 7, w: w - 4, h: h - 9 }, style.accent, null, 4) +
    `<circle cx="${cx}" cy="${y + 15}" r="1.6" fill="rgb(21,31,51)"/>`
  );
}

/** ツリーのノード 1 つ分の SVG（Godot 版 upgrade_node_button.gd の _draw を写したもの） */
export function renderUpgradeNodeSvg(upgrade: UpgradeDefinition, state: NodeStateName, selected: boolean): string {
  const style = STATE_STYLES[state];
  const parts: string[] = [box({ x: 0, y: 0, w: NODE_SIZE, h: NODE_SIZE }, style.fill, style.border, 24, 2)];
  if (selected) {
    parts.push(box({ x: 2, y: 2, w: NODE_SIZE - 4, h: NODE_SIZE - 4 }, null, rgba(0.992157, 0.941176, 0.85098, 0.95), 26, 3));
  }
  parts.push(iconSvg(upgrade, style, { x: 16, y: 14, w: NODE_SIZE - 32, h: 58 }));
  if (state === "locked") {
    parts.push(lockIcon(style));
  }
  parts.push(centeredText(upgrade.title, { x: 8, y: 74, w: NODE_SIZE - 16, h: 18 }, 19, style.text, 700));
  const unit = upgrade.id.startsWith("rebirth_") ? "R" : "P";
  parts.push(centeredText(`${formatIconCost(upgrade.cost)} ${unit}`, { x: 8, y: 90, w: NODE_SIZE - 16, h: 14 }, 14, style.subtext));
  return `<svg viewBox="0 0 ${NODE_SIZE} ${NODE_SIZE}" width="${NODE_SIZE}" height="${NODE_SIZE}" aria-hidden="true">${parts.join("")}</svg>`;
}
