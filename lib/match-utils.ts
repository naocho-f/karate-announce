/** match_label から数値部分を抽出してソート用の数値を返す */
export function matchLabelNum(label: string | null): number {
  if (!label) return Infinity;
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}
