import type { Card } from "../core/types";
import { css, darkened, lerpColor, lightened, rgba, type Color } from "./color";
import { escapeHtml } from "./dom";
import { getSuitInfo, textPresentation } from "./suitInfo";

/** Godot 版 CardView と同じ基準サイズ */
export const CARD_SIZE = { x: 112, y: 156 };
const CORNER_LABEL_X_OFFSETS = [0, 12, 24, 36];
/** Noto Sans JP の行の高さ（ascent + descent）。Godot の文字配置を再現するために使う */
const FONT_HEIGHT_RATIO = 1.448;

export type HighlightKind = "" | "hint" | "safe_foundation" | "reach";

export interface CardRenderOptions {
  card: Pick<Card, "suit" | "rank">;
  marksPerColor: number;
  /** 表示倍率。枠線などピクセル単位の値の補正に使う */
  displayScale: number;
  cornerCycleIndex?: number;
  inactive?: boolean;
  highlightKind?: HighlightKind;
}

const HIGHLIGHT_COLORS: Record<Exclude<HighlightKind, "">, { border: Color; cardBorder: Color; bg: Color; glow: Color }> = {
  hint: {
    border: rgba(1, 0.85098, 0.321569, 0.95),
    cardBorder: rgba(1, 0.8, 0.243137, 1),
    bg: rgba(1, 0.956863, 0.784314, 0.16),
    glow: rgba(0.996078, 0.862745, 0.388235, 0.22),
  },
  safe_foundation: {
    border: rgba(1, 0.313725, 0.0352941, 1),
    cardBorder: rgba(1, 0.25098, 0, 1),
    bg: rgba(1, 0.478431, 0.0784314, 0.28),
    glow: rgba(1, 0.301961, 0, 0.34),
  },
  reach: {
    border: rgba(1, 0.8, 0.109804, 0.96),
    cardBorder: rgba(1, 0.690196, 0.0392157, 1),
    bg: rgba(1, 0.854902, 0.25098, 0.18),
    glow: rgba(1, 0.741176, 0.0823529, 0.24),
  },
};

const CARD_FILL = rgba(0.976471, 0.964706, 0.92549, 1);

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function outlinedText(
  text: string,
  x: number,
  baselineY: number,
  fontSize: number,
  anchor: "start" | "middle" | "end",
  fill: Color,
  outline: Color,
  displayScale: number,
): string {
  const outlinePx = Math.max(1, Math.round((fontSize * displayScale) / 18));
  const strokeWidth = (outlinePx * 2) / Math.max(displayScale, 0.01);
  return (
    `<text x="${n(x)}" y="${n(baselineY)}" font-size="${n(fontSize)}" text-anchor="${anchor}" ` +
    `fill="${css(fill)}" stroke="${css(outline)}" stroke-width="${n(strokeWidth)}" paint-order="stroke" ` +
    `stroke-linejoin="round">${escapeHtml(textPresentation(text))}</text>`
  );
}

/** カード 1 枚の SVG。座標は Godot 版 CardView._draw をそのまま写している */
export function renderCardSvg(options: CardRenderOptions): string {
  const { card, marksPerColor, displayScale } = options;
  const s = Math.max(displayScale, 0.01);
  const suit = getSuitInfo(card.suit, marksPerColor);
  const accent = suit.accent;
  const cornerText = `${suit.short}${card.rank}`;
  const rankText = String(card.rank);
  const inactive = Boolean(options.inactive);
  const highlightKind = options.highlightKind ?? "";
  const highlighted = highlightKind !== "";
  const cornerShift = CORNER_LABEL_X_OFFSETS[(options.cornerCycleIndex ?? 0) % CORNER_LABEL_X_OFFSETS.length];

  let cardFill = CARD_FILL;
  let shadowColor = rgba(0, 0, 0, 0.18);
  let borderColor = darkened(accent, 0.15);
  let bandColor = lightened(accent, 0.45);
  let badgeColor = accent;
  let textColor = suit.textColor;
  let outlineColor = rgba(1, 1, 1, 0.92);
  if (inactive) {
    cardFill = lerpColor(CARD_FILL, darkened(accent, 0.62), 0.24);
    shadowColor = rgba(0, 0, 0, 0.08);
    borderColor = darkened(accent, 0.38);
    bandColor = darkened(accent, 0.08);
    badgeColor = darkened(accent, 0.18);
    textColor = darkened(suit.textColor, 0.18);
    outlineColor = rgba(0.94, 0.92, 0.88, 0.48);
  }

  const faceW = CARD_SIZE.x - 4;
  const faceH = CARD_SIZE.y - 6;
  const parts: string[] = [];
  const colors = highlighted ? HIGHLIGHT_COLORS[highlightKind] : null;

  if (colors) {
    const bw = Math.max(3, Math.round(5 * s)) / s;
    parts.push(`<rect x="0" y="0" width="${CARD_SIZE.x}" height="${CARD_SIZE.y}" rx="20" fill="${css(colors.glow)}"/>`);
    parts.push(
      `<rect x="${n(bw / 2)}" y="${n(bw / 2)}" width="${n(CARD_SIZE.x - bw)}" height="${n(CARD_SIZE.y - bw)}" ` +
        `rx="${n(20 - bw / 2)}" fill="${css(colors.bg)}" stroke="${css(colors.border)}" stroke-width="${n(bw)}"/>`,
    );
  }

  parts.push(`<rect x="4" y="6" width="${faceW}" height="${faceH}" rx="18" fill="${css(shadowColor)}"/>`);
  const faceBorder = (highlighted ? 3 : 2) / s;
  parts.push(
    `<rect x="${n(faceBorder / 2)}" y="${n(faceBorder / 2)}" width="${n(faceW - faceBorder)}" height="${n(faceH - faceBorder)}" ` +
      `rx="${n(18 - faceBorder / 2)}" fill="${css(cardFill)}" stroke="${css(colors ? colors.cardBorder : borderColor)}" ` +
      `stroke-width="${n(faceBorder)}"/>`,
  );

  if (inactive) {
    parts.push(`<rect x="0" y="0" width="${faceW}" height="${faceH}" rx="18" fill="rgba(14,20,31,0.24)"/>`);
  }

  if (colors) {
    const iw = Math.max(3, Math.round(4 * s)) / s;
    parts.push(
      `<rect x="${n(5 + iw / 2)}" y="${n(5 + iw / 2)}" width="${n(CARD_SIZE.x - 14 - iw)}" height="${n(CARD_SIZE.y - 20 - iw)}" ` +
        `rx="${n(16 - iw / 2)}" fill="none" stroke="${css(colors.cardBorder)}" stroke-width="${n(iw)}"/>`,
    );
  }

  parts.push(`<rect x="10" y="10" width="${CARD_SIZE.x - 24}" height="18" fill="${css(bandColor)}"/>`);
  const badgeX = CARD_SIZE.x * 0.5 - 2;
  const badgeY = CARD_SIZE.y * 0.56 - 4;
  parts.push(`<circle cx="${n(badgeX)}" cy="${n(badgeY)}" r="26" fill="${css(badgeColor)}"/>`);

  const cornerSize = cornerText.length >= 3 ? 13 : 14;
  parts.push(outlinedText(cornerText, 12 + cornerShift, 28, cornerSize, "start", textColor, outlineColor, s));
  parts.push(
    `<text x="${n(badgeX)}" y="${n(badgeY + 10 - (22 * FONT_HEIGHT_RATIO) / 2)}" font-size="22" text-anchor="middle" ` +
      `fill="#fff">${escapeHtml(textPresentation(suit.short))}</text>`,
  );
  parts.push(
    outlinedText(rankText, badgeX, CARD_SIZE.y * 0.74 - (24 * FONT_HEIGHT_RATIO) / 2, 24, "middle", textColor, outlineColor, s),
  );
  const bottomSize = cornerText.length >= 3 ? 18 : 24;
  parts.push(outlinedText(cornerText, CARD_SIZE.x - 14, CARD_SIZE.y - 20, bottomSize, "end", textColor, outlineColor, s));

  return `<svg class="card-svg" viewBox="0 0 ${CARD_SIZE.x} ${CARD_SIZE.y}" preserveAspectRatio="none" aria-hidden="true">${parts.join("")}</svg>`;
}
