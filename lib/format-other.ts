/**
 * "other:xxx" 形式で保存された「その他」値を表示用に変換する
 */
export function formatOtherValue(value: string): string {
  if (value.startsWith("other:")) {
    return `その他: ${value.slice(6)}`;
  }
  return value;
}
