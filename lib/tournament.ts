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
