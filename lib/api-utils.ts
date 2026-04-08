import { NextResponse } from "next/server";

/**
 * DB エラーを安全なレスポンスに変換する。
 * 生のエラーメッセージはサーバーログに出力し、クライアントには汎用メッセージを返す。
 */
export function dbError(
  error: { message?: string } | null | undefined,
  fallback = "サーバーエラーが発生しました",
  status = 500,
): NextResponse {
  if (error?.message) {
    console.error("[API Error]", error.message);
  }
  return NextResponse.json({ error: fallback }, { status });
}
