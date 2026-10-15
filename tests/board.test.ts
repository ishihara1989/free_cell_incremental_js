// Godot 版 tests/test_*.gd（盤面ロジック）を移植したもの
import { describe, expect, it } from "vitest";
import * as AutoCompleteService from "../src/core/autoCompleteService";
import * as BoardGenerator from "../src/core/boardGenerator";
import * as CardRules from "../src/core/cardRules";
import * as EnergyService from "../src/core/energyService";
import * as HintService from "../src/core/hintService";
import * as MoveService from "../src/core/moveService";
import * as RebirthSkillService from "../src/core/rebirthSkillService";
import { createRng } from "../src/core/rng";
import type { Card, RunState } from "../src/core/types";

// テスト用に部分的なカード・盤面を許容する
const c = (fields: Partial<Card>): Card => fields as Card;
const state = (fields: Partial<Record<keyof RunState, unknown>>): RunState => fields as unknown as RunState;
const SETTINGS_2C = { color_count: 2, marks_per_color: 1, rank_count: 5 };

describe("CardRules", () => {
  it("単色は数字だけで重ねられる", () => {
    expect(CardRules.canStackOnTableauCard(c({ suit: 0, rank: 2 }), c({ suit: 0, rank: 3 }), 1, 1)).toBe(true);
  });

  it("複数色は次の色が必要", () => {
    const blackThree = c({ suit: 0, rank: 3 });
    expect(CardRules.canStackOnTableauCard(c({ suit: 1, rank: 2 }), blackThree, 2, 1)).toBe(true);
    expect(CardRules.canStackOnTableauCard(c({ suit: 0, rank: 2 }), blackThree, 2, 1)).toBe(false);
  });

  it("色グループは色あたりのマーク数で決まる", () => {
    expect(CardRules.cardColorGroup({ suit: 0 }, 2)).toBe(0);
    expect(CardRules.cardColorGroup({ suit: 1 }, 2)).toBe(0);
    expect(CardRules.cardColorGroup({ suit: 2 }, 2)).toBe(1);
  });

  it("正しい列はすべて活性", () => {
    const lane = [c({ suit: 0, rank: 4 }), c({ suit: 1, rank: 3 }), c({ suit: 0, rank: 2 })];
    expect(CardRules.isValidLaneSequence(lane, 0, 2, 1)).toBe(true);
    expect(CardRules.isActiveTableauCard(lane, 0, 2, 1)).toBe(true);
    expect(CardRules.isActiveTableauCard(lane, 2, 2, 1)).toBe(true);
    expect(CardRules.getLaneLongestChainLength(lane, 2, 1)).toBe(3);
  });

  it("崩れた列は末尾だけが活性", () => {
    const lane = [c({ suit: 0, rank: 4 }), c({ suit: 0, rank: 3 }), c({ suit: 1, rank: 2 })];
    expect(CardRules.isValidLaneSequence(lane, 0, 2, 1)).toBe(false);
    expect(CardRules.isActiveTableauCard(lane, 0, 2, 1)).toBe(false);
    expect(CardRules.isActiveTableauCard(lane, 1, 2, 1)).toBe(true);
    expect(CardRules.getLaneLongestChainLength(lane, 2, 1)).toBe(2);
  });
});

describe("MoveService", () => {
  it("完成置き場は同じマークの次の数字だけ", () => {
    const s = state({ foundations: [[c({ suit: 0, rank: 1 })], []] });
    expect(MoveService.canMoveToFoundation(s, { suit: 0, rank: 2 }, 0)).toBe(true);
    expect(MoveService.canMoveToFoundation(s, { suit: 1, rank: 2 }, 0)).toBe(false);
    expect(MoveService.canMoveToFoundation(s, { suit: 0, rank: 3 }, 0)).toBe(false);
  });

  it("レーンは空か、正しく重なる場合だけ置ける", () => {
    const s = state({ tableau: [[], [c({ suit: 0, rank: 3 })]] });
    expect(MoveService.canMoveToLane(s, SETTINGS_2C, { suit: 0, rank: 9 }, 0)).toBe(true);
    expect(MoveService.canMoveToLane(s, SETTINGS_2C, { suit: 1, rank: 2 }, 1)).toBe(true);
    expect(MoveService.canMoveToLane(s, SETTINGS_2C, { suit: 0, rank: 2 }, 1)).toBe(false);
  });

  it("フリーセルへは 1 枚かつ空きがある場合だけ", () => {
    const s = state({ free_cells: [null, c({ id: 9 })], foundations: [[], []], tableau: [[]] });
    const source = { type: "lane", index: 0, card_index: 0 } as const;
    expect(MoveService.isValidMove(s, SETTINGS_2C, source, { type: "free_cell", index: 0 }, [c({ id: 1 })], false)).toBe(true);
    expect(MoveService.isValidMove(s, SETTINGS_2C, source, { type: "free_cell", index: 1 }, [c({ id: 1 })], false)).toBe(false);
    expect(
      MoveService.isValidMove(s, SETTINGS_2C, source, { type: "free_cell", index: 0 }, [c({ id: 1 }), c({ id: 2 })], true),
    ).toBe(false);
  });

  it("まとめて移動は列の正しさと移動可能枚数を確認する", () => {
    const s = state({
      free_cells: [null],
      foundations: [[], []],
      tableau: [[c({ suit: 1, rank: 4 }), c({ suit: 0, rank: 3 })], [], [c({ suit: 0, rank: 5 })]],
    });
    const source = { type: "lane", index: 0, card_index: 0 } as const;
    const target = { type: "lane", index: 2 } as const;
    const cards = [c({ suit: 1, rank: 4 }), c({ suit: 0, rank: 3 })];
    expect(MoveService.isValidMove(s, SETTINGS_2C, source, target, cards, true)).toBe(true);
    expect(MoveService.isValidMove(s, SETTINGS_2C, source, target, cards, false)).toBe(false);
  });

  it("補助空レーン数は移動元と移動先を除く", () => {
    const s = state({ free_cells: [null, c({ id: 1 })], tableau: [[], [], [c({ id: 2 })], []] });
    expect(MoveService.countEmptyFreeCells(s)).toBe(1);
    expect(MoveService.countEmptyAuxiliaryLanes(s, 0, 1)).toBe(1);
    expect(MoveService.getMaxMovableCardCount(s, 0, 1)).toBe(4);
  });
});

describe("AutoCompleteService", () => {
  it("色ごとの完成置き場の最小進捗", () => {
    const s = state({ foundations: [[c({ suit: 0, rank: 1 }), c({ suit: 0, rank: 2 })], [c({ suit: 1, rank: 1 })]] });
    expect(AutoCompleteService.getColorFoundationMinimums(s, SETTINGS_2C)).toEqual([2, 1]);
  });

  it("小さい数字は安全", () => {
    const s = state({ foundations: [[], []] });
    expect(AutoCompleteService.isSafeAutoFoundationMove(s, SETTINGS_2C, { suit: 0, rank: 1 })).toBe(true);
    expect(AutoCompleteService.isSafeAutoFoundationMove(s, SETTINGS_2C, { suit: 1, rank: 2 })).toBe(true);
  });

  it("他の色が遅れていると安全ではない", () => {
    const s = state({ foundations: [[c({ suit: 0, rank: 1 }), c({ suit: 0, rank: 2 })], []] });
    expect(AutoCompleteService.isSafeAutoFoundationMove(s, SETTINGS_2C, { suit: 0, rank: 4 })).toBe(false);
  });

  it("フリーセルの最小数字をレーンより優先する", () => {
    const s = state({
      free_cells: [c({ suit: 1, rank: 1 })],
      foundations: [[], []],
      tableau: [[c({ suit: 0, rank: 1 })]],
    });
    const move = AutoCompleteService.findSafeAutoCompleteMove(s, SETTINGS_2C);
    expect(move?.source).toEqual({ type: "free_cell", index: 0 });
    expect(move?.target).toEqual({ type: "foundation", index: 1 });
  });

  it("候補がなければ null", () => {
    const s = state({ free_cells: [c({ suit: 0, rank: 2 })], foundations: [[], []], tableau: [[]] });
    expect(AutoCompleteService.findSafeAutoCompleteMove(s, SETTINGS_2C)).toBeNull();
  });
});

describe("HintService", () => {
  it("フリーセル→レーンのヒントは空でない合法な移動先のみ", () => {
    const s = state({
      free_cells: [c({ id: 1, suit: 1, rank: 2 })],
      tableau: [[c({ id: 2, suit: 0, rank: 3 })], []],
    });
    const candidates = HintService.findFreeCellToLaneHintCandidates(s, SETTINGS_2C);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].priority).toBe(1);
    expect(candidates[0].source).toEqual({ type: "free_cell", index: 0, card_index: -1 });
    expect(candidates[0].target).toEqual({ type: "lane", index: 0 });
  });

  it("不活性カードを露出させるヒント", () => {
    const s = state({
      free_cells: [null],
      tableau: [
        [c({ id: 1, suit: 0, rank: 5 }), c({ id: 2, suit: 0, rank: 4 }), c({ id: 3, suit: 1, rank: 3 })],
        [c({ id: 4, suit: 1, rank: 5 })],
      ],
    });
    const candidates = HintService.findInactiveExposureHintCandidates(s, SETTINGS_2C, true);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].exposed_card?.id).toBe(1);
    expect(candidates[0].moving_count).toBe(2);
  });

  it("ドラッグ開始可否はまとめて移動の解禁に従う", () => {
    const lane = [c({ suit: 0, rank: 4 }), c({ suit: 1, rank: 3 })];
    expect(HintService.isDraggableLaneStart(lane, 1, SETTINGS_2C, false)).toBe(true);
    expect(HintService.isDraggableLaneStart(lane, 0, SETTINGS_2C, false)).toBe(false);
    expect(HintService.isDraggableLaneStart(lane, 0, SETTINGS_2C, true)).toBe(true);
  });

  it("不活性カード数", () => {
    const lane = [c({ suit: 0, rank: 5 }), c({ suit: 0, rank: 4 }), c({ suit: 1, rank: 3 })];
    expect(HintService.getInactiveCardCount(lane, SETTINGS_2C)).toBe(1);
  });

  it("ヒントの並び順と署名", () => {
    const candidates: HintService.HintCandidate[] = [
      {
        priority: 2,
        card: c({ id: 10 }),
        source: { type: "lane", index: 1, card_index: 0 },
        target: { type: "lane", index: 0 },
        target_inactive_count: 0,
      },
      {
        priority: 1,
        card: c({ id: 2 }),
        source: { type: "free_cell", index: 0, card_index: -1 },
        target: { type: "lane", index: 1 },
        target_inactive_count: 3,
      },
    ];
    candidates.sort(HintService.compareHintCandidates);
    expect(candidates[0].priority).toBe(1);
    expect(HintService.makeHintCandidateKey(candidates)).toBe("1:free_cell:0:-1:2>lane:1|2:lane:1:0:10>lane:0");
  });
});

describe("EnergyService", () => {
  it("未解放でも最大チェーンは更新する", () => {
    const s = { energy: 0, max_chain: 1 };
    EnergyService.registerChainProgress(s, 4, false);
    expect(s).toEqual({ energy: 0, max_chain: 4 });
  });

  it("新規到達チェーン数ぶんエネルギーを得る", () => {
    const s = { energy: 0, max_chain: 1 };
    EnergyService.registerChainProgress(s, 4, true);
    expect(s).toEqual({ energy: 3, max_chain: 4 });
  });

  it("初めて空にしたレーンだけ +3", () => {
    const s = state({ energy: 0, emptied_lanes: [], tableau: [[], [c({ id: 2 })]] });
    const previous = [[c({ id: 1 })], [c({ id: 2 })]];
    EnergyService.grantFirstEmptyLaneEnergy(s, previous, true);
    expect(s.energy).toBe(3);
    expect(s.emptied_lanes).toEqual([0]);
    EnergyService.grantFirstEmptyLaneEnergy(s, previous, true);
    expect(s.energy).toBe(3);
  });

  it("活性レーンスコアは全体が正しい列のレーンだけ", () => {
    const tableau = [
      [c({ suit: 0, rank: 4 }), c({ suit: 1, rank: 3 }), c({ suit: 0, rank: 2 })],
      [c({ suit: 0, rank: 4 }), c({ suit: 0, rank: 3 })],
    ];
    expect(EnergyService.getActiveLaneEnergyScore(tableau, SETTINGS_2C)).toBe(9);
  });

  it("活性レーンスコアは平方根の差分だけエネルギーになる", () => {
    const s = state({
      energy: 0,
      max_active_lane_energy_score: 0,
      tableau: [[c({ suit: 0, rank: 4 }), c({ suit: 1, rank: 3 }), c({ suit: 0, rank: 2 })]],
    });
    EnergyService.syncActiveLaneEnergyProgress(s, SETTINGS_2C, true, true);
    expect(s.max_active_lane_energy_score).toBe(9);
    expect(s.energy).toBe(3);
  });

  it("不活性→活性になった回数 3 回ごとに +1", () => {
    const previous = [[c({ id: 1, suit: 0, rank: 4 }), c({ id: 2, suit: 0, rank: 3 }), c({ id: 3, suit: 1, rank: 2 })]];
    const s = state({
      energy: 0,
      inactive_activation_count: 2,
      tableau: [[c({ id: 1, suit: 1, rank: 4 }), c({ id: 2, suit: 0, rank: 3 }), c({ id: 3, suit: 1, rank: 2 })]],
    });
    EnergyService.grantInactiveActivationEnergy(s, SETTINGS_2C, previous, true);
    expect(s.inactive_activation_count).toBe(3);
    expect(s.energy).toBe(1);
  });

  it("盤面の複製は深いコピー", () => {
    const tableau = [[c({ id: 1, suit: 0, rank: 1 })]];
    const duplicated = EnergyService.duplicateTableau(tableau);
    duplicated[0][0].id = 99;
    expect(tableau[0][0].id).toBe(1);
  });
});

describe("RebirthSkillService", () => {
  it("悪さは下にある大きいカードの枚数", () => {
    const lane = [c({ rank: 2 }), c({ rank: 5 }), c({ rank: 4 })];
    expect(RebirthSkillService.getCardDisorderScore(lane, 0)).toBe(2);
    expect(RebirthSkillService.getLaneDisorderScore(lane)).toBe(2);
  });

  it("テレポートは安全な不活性カードのうち最も悪いもの", () => {
    const s = state({
      foundations: [[], []],
      tableau: [
        [c({ id: 1, suit: 0, rank: 1 }), c({ id: 2, suit: 0, rank: 4 }), c({ id: 3, suit: 1, rank: 3 })],
        [c({ id: 4, suit: 1, rank: 1 }), c({ id: 5, suit: 0, rank: 5 })],
      ],
    });
    const target = RebirthSkillService.findTeleportTarget(s, SETTINGS_2C);
    expect(target?.card.id).toBe(1);
    expect(target?.source).toEqual({ type: "lane", index: 0, card_index: 0, exact_card_index: true });
  });

  it("アンロードはフリーセル最大数字と不活性合計最大レーン", () => {
    const s = state({
      free_cells: [c({ id: 1, rank: 2 }), c({ id: 2, rank: 5 })],
      tableau: [
        [c({ id: 3, suit: 0, rank: 4 }), c({ id: 4, suit: 0, rank: 3 })],
        [c({ id: 5, suit: 1, rank: 5 }), c({ id: 6, suit: 1, rank: 4 })],
      ],
    });
    const target = RebirthSkillService.findFreeCellDeepTarget(s, SETTINGS_2C);
    expect(target?.source_index).toBe(1);
    expect(target?.target_index).toBe(1);
  });

  it("アセンブルは空レーンと列が必要", () => {
    const s = state({
      tableau: [[], [c({ id: 1, suit: 1, rank: 4 }), c({ id: 2, suit: 1, rank: 3 }), c({ id: 3, suit: 0, rank: 2 })]],
    });
    const target = RebirthSkillService.findInactiveColumnSkillTarget(s, SETTINGS_2C);
    expect(target?.target_lane_index).toBe(0);
    expect(target?.sequence.length).toBeGreaterThan(0);
  });

  it("アセンブルの抜き取りは後ろの添字から行う", () => {
    const s = state({ tableau: [[c({ id: 1 }), c({ id: 2 }), c({ id: 3 })]] });
    RebirthSkillService.removeInactiveColumnSequence(s, [
      { lane_index: 0, card_index: 0 },
      { lane_index: 0, card_index: 2 },
    ]);
    expect(s.tableau[0]).toHaveLength(1);
    expect(s.tableau[0][0].id).toBe(2);
  });
});

describe("BoardGenerator", () => {
  it("山札の ID はマーク→数字の順", () => {
    const deck = BoardGenerator.createDeck(2, 3);
    expect(deck).toHaveLength(6);
    expect(deck[0]).toEqual({ id: 0, suit: 0, rank: 1 });
    expect(deck[3]).toEqual({ id: 3, suit: 1, rank: 1 });
    expect(deck[5]).toEqual({ id: 5, suit: 1, rank: 3 });
  });

  it("配札は順番に均等配布し、元の山札を変更しない", () => {
    const deck = [c({ id: 1, rank: 1 }), c({ id: 2, rank: 2 }), c({ id: 3, rank: 3 }), c({ id: 4, rank: 4 })];
    const tableau = BoardGenerator.dealTableau(deck, 3);
    expect(tableau[0]).toHaveLength(2);
    expect(tableau[0][0].id).toBe(1);
    expect(tableau[0][1].id).toBe(4);
    tableau[0][0].rank = 99;
    expect(deck[0].rank).toBe(1);
  });

  it("最悪レーンは悪さ順、同点は左優先", () => {
    const tableau = [
      [c({ rank: 1 }), c({ rank: 3 })],
      [c({ rank: 1 }), c({ rank: 4 })],
      [c({ rank: 4 }), c({ rank: 1 })],
    ];
    expect(BoardGenerator.getWorstLaneIndices(tableau, 2)).toEqual([0, 1]);
  });

  it("ソートは UI で下側ほど小さい数字にする", () => {
    const sorted = BoardGenerator.sortLaneForInitialBonus([c({ id: 1, rank: 2 }), c({ id: 2, rank: 4 }), c({ id: 3, rank: 1 })]);
    expect(sorted.map((card) => card.rank)).toEqual([4, 2, 1]);
  });

  it("初期ソートは最悪レーンだけを変える", () => {
    const tableau = [
      [c({ id: 1, rank: 1 }), c({ id: 2, rank: 4 })],
      [c({ id: 3, rank: 4 }), c({ id: 4, rank: 1 })],
    ];
    BoardGenerator.applyInitialSortBonuses(tableau, 1);
    expect(tableau[0].map((card) => card.rank)).toEqual([4, 1]);
    expect(tableau[1].map((card) => card.rank)).toEqual([4, 1]);
  });

  it("初期盤面の形", () => {
    const s = BoardGenerator.createInitialRunState(
      { suit_count: 2, rank_count: 3, lane_count: 2, free_cell_count: 1, color_count: 2, marks_per_color: 1 },
      createRng(1),
      0,
    );
    expect(s.tableau).toHaveLength(2);
    expect(s.free_cells).toHaveLength(1);
    expect(s.foundations).toHaveLength(2);
    expect(s.energy).toBe(0);
    expect(s.tableau.flat()).toHaveLength(6);
  });
});
