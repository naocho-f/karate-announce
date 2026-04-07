/**
 * 冪等性キー管理
 *
 * Idempotency-Key ヘッダによる重複リクエスト防止を実装する。
 * インメモリ Map で即座にチェックし、DB にも永続化する（2重防御）。
 * Vercel のサーバーレス環境ではコールドスタートでメモリがリセットされるため、
 * DB を権威データとし、インメモリは同一インスタンス内の高速チェック用。
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface CachedResponse {
  status: number;
  body: unknown;
}

/** インメモリキャッシュ（同一インスタンス内での高速チェック） */
const memoryCache = new Map<string, CachedResponse>();

/**
 * 冪等性キーをチェックする。
 * キーが既に使われていれば、前回のレスポンスを返す。
 * ヘッダが未指定の場合は null を返す（後方互換）。
 */
export async function checkIdempotencyKey(
  request: NextRequest,
): Promise<NextResponse | null> {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return null;

  // 1. インメモリチェック（高速）
  const cached = memoryCache.get(key);
  if (cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  // 2. DB チェック（コールドスタート対策）
  try {
    const { data } = await supabaseAdmin
      .from("idempotency_keys")
      .select("response_status, response_body")
      .eq("key", key)
      .maybeSingle();

    if (data) {
      // インメモリにも載せる
      memoryCache.set(key, { status: data.response_status, body: data.response_body });
      return NextResponse.json(data.response_body, { status: data.response_status });
    }
  } catch {
    // DB エラーは無視（インメモリになければ通常処理を続行）
  }

  return null;
}

/**
 * 冪等性キーと共にレスポンスを記録する。
 * ヘッダにキーがない場合は何もしない。
 */
export async function saveIdempotencyKey(
  request: NextRequest,
  status: number,
  body: unknown,
): Promise<void> {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return;

  // インメモリに保存
  memoryCache.set(key, { status, body });

  // DB に永続化（fire-and-forget）
  try {
    await supabaseAdmin.from("idempotency_keys").upsert({
      key,
      response_status: status,
      response_body: body,
    });
  } catch {
    // DB エラーは無視（インメモリに保存済み）
  }
}
