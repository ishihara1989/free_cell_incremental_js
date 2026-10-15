export interface Card {
  id: number;
  suit: number;
  rank: number;
}

/** 盤面の構成。GameState が返す設定には suit_count / total_mark_count も含まれる。 */
export interface BoardSettings {
  color_count: number;
  marks_per_color: number;
  rank_count: number;
  lane_count: number;
  free_cell_count: number;
  suit_count: number;
  total_mark_count: number;
}

export interface RunState {
  tableau: Card[][];
  free_cells: (Card | null)[];
  foundations: Card[][];
  energy: number;
  max_chain: number;
  emptied_lanes: number[];
  max_active_lane_energy_score: number;
  inactive_activation_count: number;
}

export type SlotType = "free_cell" | "foundation" | "lane";

export interface MoveSource {
  type: SlotType;
  index: number;
  card_index?: number;
  /** true のときレーン途中の 1 枚だけを抜き取る（テレポート用） */
  exact_card_index?: boolean;
}

export interface MoveTarget {
  type: SlotType;
  index: number;
}

export interface MoveCandidate {
  card: Card;
  source: MoveSource;
  target: MoveTarget;
}

export interface EnergySupportFlags {
  chain_energy: boolean;
  empty_lane_energy: boolean;
  active_lane_energy: boolean;
  inactive_activation_energy: boolean;
}

/** カード比較で必要な最小限の設定 */
export type RuleSettings = Pick<BoardSettings, "color_count" | "marks_per_color">;
