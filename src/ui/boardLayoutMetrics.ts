/** Godot 版 board_layout_metrics.gd の移植。盤面のサイズ計算を担う。 */
export interface Vec2 {
  x: number;
  y: number;
}

export interface BoardMetrics {
  slotSize: Vec2;
  laneSize: Vec2;
  cardSize: Vec2;
  laneHeaderHeight: number;
  topRowSeparation: number;
  boardSectionSeparation: number;
  slotSectionSeparation: number;
  slotGap: number;
  laneGap: number;
  laneBodyTopPadding: number;
  laneBodyBottomPadding: number;
  boardFitPadding: number;
  boardWidthFitCorrection: number;
}

export const DEFAULT_BOARD_METRICS: BoardMetrics = {
  slotSize: { x: 112, y: 156 },
  laneSize: { x: 140, y: 520 },
  cardSize: { x: 112, y: 156 },
  laneHeaderHeight: 34,
  topRowSeparation: 14,
  boardSectionSeparation: 16,
  slotSectionSeparation: 10,
  slotGap: 10,
  laneGap: 14,
  laneBodyTopPadding: 8,
  laneBodyBottomPadding: 10,
  boardFitPadding: 12,
  boardWidthFitCorrection: 8,
};

export interface BoardCounts {
  laneCount: number;
  freeCellCount: number;
  suitCount: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function requiredWidth(itemCount: number, itemWidth: number, gap: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  return itemCount * itemWidth + Math.max(0, (itemCount - 1) * gap);
}

export const topRowGap = (scale: number, m: BoardMetrics) => Math.max(8, Math.round(m.topRowSeparation * scale));
export const slotGap = (scale: number, m: BoardMetrics) => Math.max(6, Math.round(m.slotGap * scale));
export const laneGap = (scale: number, m: BoardMetrics) => Math.max(0, Math.floor(m.laneGap * scale));
export const boardSectionGap = (scale: number, m: BoardMetrics) => Math.max(10, Math.round(m.boardSectionSeparation * scale));
export const slotSectionGap = (scale: number, m: BoardMetrics) => Math.max(6, Math.round(m.slotSectionSeparation * scale));
export const sectionTitleHeight = (scale: number) => Math.max(24, 28 * scale);

export const getSlotSize = (scale: number, m: BoardMetrics): Vec2 => ({ x: m.slotSize.x * scale, y: m.slotSize.y * scale });
export const getCardSize = (scale: number, m: BoardMetrics): Vec2 => ({ x: m.cardSize.x * scale, y: m.cardSize.y * scale });
export const getLaneHeaderHeight = (scale: number, m: BoardMetrics) => m.laneHeaderHeight * scale;

export function getLaneMinHeight(scale: number, m: BoardMetrics): number {
  return getLaneHeaderHeight(scale, m) + (m.laneBodyTopPadding + m.laneBodyBottomPadding) * scale + getCardSize(scale, m).y;
}

function topRowHeight(scale: number, topRowVertical: boolean, m: BoardMetrics): number {
  const sectionHeight = sectionTitleHeight(scale) + slotSectionGap(scale, m) + getSlotSize(scale, m).y;
  return topRowVertical ? sectionHeight * 2 + topRowGap(scale, m) : sectionHeight;
}

export function getAvailableLaneHeight(scale: number, viewport: Vec2, topRowVertical: boolean, m: BoardMetrics): number {
  const viewportHeight = Math.max(viewport.y - m.boardFitPadding, 1);
  return (
    viewportHeight -
    topRowHeight(scale, topRowVertical, m) -
    boardSectionGap(scale, m) -
    slotSectionGap(scale, m) -
    sectionTitleHeight(scale)
  );
}

export function getLaneHeight(scale: number, viewport: Vec2, topRowVertical: boolean, m: BoardMetrics): number {
  return Math.max(getLaneMinHeight(scale, m), getAvailableLaneHeight(scale, viewport, topRowVertical, m));
}

export function getLaneSize(scale: number, viewport: Vec2, topRowVertical: boolean, m: BoardMetrics): Vec2 {
  return { x: m.laneSize.x * scale, y: getLaneHeight(scale, viewport, topRowVertical, m) };
}

export function getBoardRequiredWidth(scale: number, counts: BoardCounts, topRowVertical: boolean, m: BoardMetrics): number {
  const slotWidth = getSlotSize(scale, m).x;
  const lanesWidth = requiredWidth(counts.laneCount, m.laneSize.x * scale, laneGap(scale, m));
  const freeCellsWidth = requiredWidth(counts.freeCellCount, slotWidth, slotGap(scale, m));
  const foundationsWidth = requiredWidth(counts.suitCount, slotWidth, slotGap(scale, m));
  if (topRowVertical) {
    return Math.max(lanesWidth, freeCellsWidth, foundationsWidth);
  }
  return Math.max(lanesWidth, freeCellsWidth + foundationsWidth + topRowGap(scale, m) * 2);
}

export function getBoardRequiredHeight(scale: number, laneHeight: number, topRowVertical: boolean, m: BoardMetrics): number {
  const lanesSectionHeight = sectionTitleHeight(scale) + slotSectionGap(scale, m) + laneHeight;
  return topRowHeight(scale, topRowVertical, m) + boardSectionGap(scale, m) + lanesSectionHeight;
}

export function getWidthFitScale(availableWidth: number, counts: BoardCounts, topRowVertical: boolean, m: BoardMetrics): number {
  const targetWidth = Math.max(availableWidth - m.boardWidthFitCorrection, 1);
  let low = 0.25;
  let high = 1;
  for (let index = 0; index < 20; index++) {
    const mid = (low + high) * 0.5;
    if (getBoardRequiredWidth(mid, counts, topRowVertical, m) <= targetWidth) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/** 盤面の既定サイズ（レーン高 520）が縦に収まる倍率 */
export function getHeightFitScale(viewport: Vec2, topRowVertical: boolean, m: BoardMetrics): number {
  const boardHeight = Math.max(viewport.y - m.boardFitPadding, 1);
  const slotSectionHeight = 28 + m.slotSectionSeparation + m.slotSize.y;
  const rowHeight = topRowVertical ? slotSectionHeight * 2 + m.topRowSeparation : slotSectionHeight;
  const requiredHeight = rowHeight + m.boardSectionSeparation + 28 + m.slotSectionSeparation + m.laneSize.y;
  return Math.min(1, boardHeight / requiredHeight);
}

export function getMinBoardZoom(viewport: Vec2, counts: BoardCounts, topRowVertical: boolean, m: BoardMetrics): number {
  const viewportWidth = Math.max(viewport.x - m.boardFitPadding, 1);
  if (viewportWidth <= 1) {
    return 0.25;
  }
  // Godot 版は「幅に合わせる倍率」を下限にしていた。ブラウザでは縦が狭くなりやすく、
  // そのままだとレーンのカードが詰まりすぎるため、高さに合わせた倍率まで縮小を許す。
  return Math.max(
    0.25,
    Math.min(1, getWidthFitScale(viewportWidth, counts, topRowVertical, m), getHeightFitScale(viewport, topRowVertical, m)),
  );
}

export function getMaxBoardZoom(viewport: Vec2, m: BoardMetrics): number {
  if (viewport.y <= 1) {
    return 1;
  }
  return Math.max(1, viewport.y / getCardSize(1, m).y);
}

export function calculateLayoutScale(viewport: Vec2, counts: BoardCounts, topRowVertical: boolean, m: BoardMetrics): number {
  const boardWidth = Math.max(viewport.x - m.boardFitPadding, 1);
  const boardHeight = Math.max(viewport.y - m.boardFitPadding, 1);
  const minZoom = getMinBoardZoom(viewport, counts, topRowVertical, m);
  const maxZoom = getMaxBoardZoom(viewport, m);
  if (boardWidth <= 1 || boardHeight <= 1) {
    return Math.max(minZoom, 0.01);
  }

  const widthScale = getWidthFitScale(boardWidth, counts, topRowVertical, m);
  const heightScale = getHeightFitScale(viewport, topRowVertical, m);
  return clamp(Math.min(widthScale, heightScale), minZoom, maxZoom);
}

export function resolveBoardZoom(
  currentZoom: number,
  autoFitZoom: number,
  minZoom: number,
  maxZoom: number,
  userControlled: boolean,
): number {
  if (!userControlled || currentZoom <= 0) {
    return clamp(autoFitZoom, minZoom, maxZoom);
  }
  return clamp(currentZoom, minZoom, maxZoom);
}

export function getLaneBodyTop(scale: number, m: BoardMetrics): number {
  return getLaneHeaderHeight(scale, m) + m.laneBodyTopPadding * scale;
}

export function getLaneBodyHeight(laneSize: Vec2, scale: number, m: BoardMetrics): number {
  return Math.max(getCardSize(scale, m).y, laneSize.y - getLaneBodyTop(scale, m) - m.laneBodyBottomPadding * scale);
}

export function getTableauOffset(cardCount: number, laneBodyHeight: number, scale: number, m: BoardMetrics): number {
  const cardSize = getCardSize(scale, m);
  if (cardCount <= 1) {
    return 18 * scale;
  }
  const availableHeight = Math.max(laneBodyHeight - cardSize.y, 0);
  const preferredOffset = clamp(cardSize.y * 0.28, 10 * scale, 44 * scale);
  return clamp(Math.floor(availableHeight / (cardCount - 1)), 4 * scale, preferredOffset);
}
