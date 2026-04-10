/**
 * アプリモード判定ヘルパー
 *
 * NEXT_PUBLIC_APP_MODE=development → 開発モード（FAB、テストボタン、仕様書リンク表示）
 * それ以外（production or 未設定） → 本番モード
 */
export function isDev(): boolean {
  return process.env.NEXT_PUBLIC_APP_MODE === "development";
}

/**
 * アプリバージョン（コミットSHA先頭7文字）
 * Vercel 上: VERCEL_GIT_COMMIT_SHA から取得
 * ローカル: "local"
 */
export function getAppVersion(): string {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : "local";
}
