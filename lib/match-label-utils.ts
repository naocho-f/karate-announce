/**
 * 試合番号の自動割り当てロジック（match-label-editor から抽出）
 */

export type AutoAssignMatch = {
  id: string;
  round: number;
  position: number;
  fighter1_id: string | null;
  fighter2_id: string | null;
};

export type AutoAssignTournament = {
  court: string;
  sortOrder: number;
  matches: AutoAssignMatch[];
};

/**
 * コートごとに独立してソートし、不戦勝（bye）を除外した試合IDの順序を返す。
 * ソート順: ラウンド → トーナメント sortOrder → ポジション
 */
export function autoAssignOrder(tournaments: AutoAssignTournament[], courtCount: number): string[] {
  const result: string[] = [];
  for (let courtNum = 1; courtNum <= courtCount; courtNum++) {
    const courtTournaments = tournaments.filter((t) => t.court === String(courtNum));
    const courtMatches = courtTournaments.flatMap((t, tIdx) =>
      t.matches
        .filter((m) => !(m.round === 1 && !!m.fighter1_id && !m.fighter2_id)) // bye 除外
        .map((m) => ({ id: m.id, round: m.round, sortOrder: t.sortOrder, tIdx, position: m.position })),
    );
    courtMatches.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.tIdx !== b.tIdx) return a.tIdx - b.tIdx;
      return a.position - b.position;
    });
    result.push(...courtMatches.map((m) => m.id));
  }
  return result;
}
