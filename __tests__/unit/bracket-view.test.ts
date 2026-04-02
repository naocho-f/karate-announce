import { describe, it, expect } from "vitest";

// bracket-view.tsx から抽出した定数・計算ロジック（コンポーネント内にインライン定義のため直接テスト）
const BRACKET_CARD_W = 172;
const BRACKET_FOOTER_H = 24;
const BRACKET_FIGHTER_H = 48;
const BRACKET_CARD_H = BRACKET_FIGHTER_H * 2 + BRACKET_FOOTER_H; // 120
const BRACKET_GAP_W = 40;
const BRACKET_COL_W = BRACKET_CARD_W + BRACKET_GAP_W;
const BRACKET_BASE_SLOT = 120;

const slotH = (round: number) => BRACKET_BASE_SLOT * Math.pow(2, round - 1);
const centerY = (round: number, pos: number) => pos * slotH(round) + slotH(round) / 2;
const cardTop = (round: number, pos: number) => pos * slotH(round) + (slotH(round) - BRACKET_CARD_H) / 2;
const cardLeft = (round: number) => (round - 1) * BRACKET_COL_W;

describe("BracketView レイアウト定数", () => {
  it("カードの高さは選手2人分+フッター", () => {
    expect(BRACKET_CARD_H).toBe(48 * 2 + 24);
    expect(BRACKET_CARD_H).toBe(120);
  });

  it("列幅はカード幅+ギャップ", () => {
    expect(BRACKET_COL_W).toBe(172 + 40);
    expect(BRACKET_COL_W).toBe(212);
  });
});

describe("BracketView レイアウト計算", () => {
  it("1回戦のスロット高はベース値", () => {
    expect(slotH(1)).toBe(120);
  });

  it("2回戦のスロット高は2倍", () => {
    expect(slotH(2)).toBe(240);
  });

  it("3回戦のスロット高は4倍", () => {
    expect(slotH(3)).toBe(480);
  });

  it("1回戦 position=0 のカード中央Y", () => {
    expect(centerY(1, 0)).toBe(60); // 120/2
  });

  it("1回戦 position=1 のカード中央Y", () => {
    expect(centerY(1, 1)).toBe(180); // 120 + 60
  });

  it("2回戦 position=0 のカード中央Y", () => {
    expect(centerY(2, 0)).toBe(120); // 240/2
  });

  it("カード上端Y（1回戦 position=0）", () => {
    expect(cardTop(1, 0)).toBe(0); // (120 - 120) / 2
  });

  it("カード上端Y（2回戦 position=0）", () => {
    expect(cardTop(2, 0)).toBe(60); // (240 - 120) / 2
  });

  it("カード左端X（1回戦）", () => {
    expect(cardLeft(1)).toBe(0);
  });

  it("カード左端X（2回戦）", () => {
    expect(cardLeft(2)).toBe(212);
  });

  it("カード左端X（3回戦）", () => {
    expect(cardLeft(3)).toBe(424);
  });

  it("SVG接続線の座標計算（1回戦→2回戦）", () => {
    const round = 1;
    const pos = 0;
    const nextPos = Math.floor(pos / 2);
    const x1 = cardLeft(round) + BRACKET_CARD_W; // 172
    const y1 = centerY(round, pos);              // 60
    const x2 = cardLeft(round + 1);              // 212
    const y2 = centerY(round + 1, nextPos);      // 120
    expect(x1).toBe(172);
    expect(y1).toBe(60);
    expect(x2).toBe(212);
    expect(y2).toBe(120);
  });

  it("全体コンテナのサイズ計算（4スロット・2ラウンド）", () => {
    const totalSlots = 4;
    const maxRound = 2;
    const totalHeight = totalSlots * BRACKET_BASE_SLOT;
    const totalWidth = maxRound * BRACKET_COL_W - BRACKET_GAP_W;
    expect(totalHeight).toBe(480);
    expect(totalWidth).toBe(384);
  });
});
