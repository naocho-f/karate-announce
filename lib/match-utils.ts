/** match_label から数値部分を抽出してソート用の数値を返す */
export function matchLabelNum(label: string | null): number {
  if (!label) return Infinity;
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/** 英数字と日本語の間にスペースを挿入（古いAndroid端末で「Aコート」が「アコート」に見える対策） */
export function spaceBetweenScripts(text: string): string {
  return text
    .replace(/([A-Za-z0-9])([^\x00-\x7F])/g, "$1 $2")
    .replace(/([^\x00-\x7F])([A-Za-z0-9])/g, "$1 $2");
}
