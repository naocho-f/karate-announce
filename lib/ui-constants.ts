/**
 * UIスタイル定数
 * ボタン・入力・バッジの標準スタイルを定義し、全ファイルで使用する。
 */

export const BTN = {
  primary:
    "px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50",
  secondary:
    "px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition disabled:opacity-50",
  danger: "px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm transition disabled:opacity-50",
  micro: "px-2 py-1 rounded text-xs transition disabled:opacity-50",
};

export const INPUT =
  "bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 outline-none focus:border-blue-500";

export const BADGE = {
  active: "bg-green-900 text-green-300",
  warning: "bg-yellow-900 text-yellow-300",
  error: "bg-red-900 text-red-300",
  info: "bg-blue-900 text-blue-300",
  neutral: "bg-gray-700 text-gray-400",
};
