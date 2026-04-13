/** match_label から数値部分を抽出してソート用の数値を返す */
export function matchLabelNum(label: string | null): number {
  if (!label) return Infinity;
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/** match_label を短縮形式に変換する（例: 「A第1試合」→「A-1」） */
export function matchLabelToShort(label: string | null): string {
  if (!label) return "";
  const m = label.match(/^(.+?)第(\d+)試合$/);
  if (m) return `${m[1]}-${m[2]}`;
  return label;
}
