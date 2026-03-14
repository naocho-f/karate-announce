import type { Fighter } from "./types";

export type BracketSlot = {
  fighter: Fighter | null; // null = シード（不戦勝）
  isBye: boolean;
};

export type BracketMatch = {
  round: number;
  position: number;
  slot1: BracketSlot;
  slot2: BracketSlot;
};

/** 選手リストからトーナメントの初戦組み合わせを生成する */
export function generateFirstRound(fighters: Fighter[]): { fighter1_id: string | null; fighter2_id: string | null; round: number; position: number }[] {
  const n = fighters.length;
  if (n < 2) return [];

  const rounds = Math.ceil(Math.log2(n));
  const slots = Math.pow(2, rounds);

  // シャッフル
  const shuffled = [...fighters].sort(() => Math.random() - 0.5);

  // null でスロットを埋める（シード）
  const padded: (Fighter | null)[] = [...shuffled];
  while (padded.length < slots) padded.push(null);

  const matches: { fighter1_id: string | null; fighter2_id: string | null; round: number; position: number }[] = [];

  for (let i = 0; i < slots / 2; i++) {
    matches.push({
      round: 1,
      position: i,
      fighter1_id: padded[i * 2]?.id ?? null,
      fighter2_id: padded[i * 2 + 1]?.id ?? null,
    });
  }

  return matches;
}

/** 総ラウンド数を計算 */
export function totalRounds(fighterCount: number): number {
  if (fighterCount < 2) return 0;
  return Math.ceil(Math.log2(fighterCount));
}

/** ラウンド名 */
export function roundName(round: number, totalRound: number): string {
  const diff = totalRound - round;
  if (diff === 0) return "決勝";
  if (diff === 1) return "準決勝";
  if (diff === 2) return "準々決勝";
  return `第${round}回戦`;
}
