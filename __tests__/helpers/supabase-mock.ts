/**
 * Supabase クライアントのモックヘルパー。
 * API ルートテストで supabaseAdmin をモックするために使用する。
 *
 * 使い方:
 *   vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
 *   const mock = getMockSupabase();
 *   mock.mockResult("events", "select", { data: [...], error: null });
 */
import { vi } from "vitest";

export type MockResult = { data: unknown; error: unknown; count?: number };

/** チェーン呼び出しの最終結果（再代入ではなく clear() で管理し参照を保つ） */
const results: Map<string, MockResult> = new Map();

/** 最後に呼ばれた from().xxx() の引数を記録 */
const lastCalls: Array<{ table: string; method: string; args: unknown[] }> = [];

function defaultResult(): MockResult {
  return { data: null, error: null };
}

/** メソッドチェーンを再帰的に返すビルダー */
function createChain(table: string, method: string): Record<string, unknown> {
  const key = `${table}:${method}`;

  const resolveResult = () => results.get(key) ?? defaultResult();

  const chain: Record<string, unknown> = {};
  const chainMethods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "in", "is", "not", "or", "and",
    "order", "limit", "range",
    "single", "maybeSingle",
    "filter", "match", "textSearch",
    "gte", "lte", "gt", "lt", "like", "ilike",
    "contains", "containedBy", "overlaps",
  ];

  for (const m of chainMethods) {
    chain[m] = (...args: unknown[]) => {
      lastCalls.push({ table, method: m, args });
      // single/maybeSingle は最終結果を返す
      if (m === "single" || m === "maybeSingle") {
        return Promise.resolve(resolveResult());
      }
      return chain;
    };
  }

  // then を実装して await 可能にする（for await on chain directly）
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    return Promise.resolve(resolveResult()).then(resolve, reject);
  };

  return chain;
}

/** storage モック */
function createStorageMock() {
  return {
    from: (_bucket: string) => ({
      upload: vi.fn().mockResolvedValue({ data: { path: "mock-path" }, error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/${path}` },
      }),
    }),
  };
}

/** Supabase モッククライアントを生成 */
export function createMockSupabase() {
  // 注意: results を clear しない。vi.mock ファクトリが動的 import 時に
  // 再呼び出しされると mockResult で設定済みのデータが消えるため。
  // 状態リセットは resetAll() で行う。

  return {
    from: (table: string) => {
      const methods = ["select", "insert", "update", "upsert", "delete"];
      const obj: Record<string, unknown> = {};
      for (const method of methods) {
        obj[method] = (...args: unknown[]) => {
          lastCalls.push({ table, method, args });
          return createChain(table, method);
        };
      }
      return obj;
    },
    storage: createStorageMock(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

/** モックの結果を設定 */
export function mockResult(table: string, method: string, result: Partial<MockResult>) {
  results.set(`${table}:${method}`, { data: null, error: null, ...result });
}

/** 記録された呼び出しを取得 */
export function getCalls() {
  return [...lastCalls];
}

/** 特定テーブル・メソッドの呼び出しをフィルタ */
export function getCallsFor(table: string, method?: string) {
  return lastCalls.filter(
    (c) => c.table === table && (!method || c.method === method)
  );
}

/** 呼び出し記録をリセット */
export function resetCalls() {
  lastCalls.length = 0;
}

/** 全状態をリセット */
export function resetAll() {
  results.clear();
  lastCalls.length = 0;
}

// ── NextRequest ヘルパー ──

/** テスト用 NextRequest を生成 */
export function createRequest(
  method: string,
  url: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  },
) {
  const { NextRequest } = require("next/server");
  const init: RequestInit = { method };
  const headers = new Headers(options?.headers ?? {});

  if (options?.body) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  // Cookie を設定
  if (options?.cookies) {
    headers.set(
      "Cookie",
      Object.entries(options.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    );
  }

  init.headers = headers;
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

/** 管理者認証済みのリクエストを生成 */
export function createAdminRequest(
  method: string,
  url: string,
  options?: { body?: unknown; headers?: Record<string, string> },
) {
  // admin-auth.ts の SALT = "karate-announce-v1"
  // テスト用パスワード "test-password" のハッシュ
  const crypto = require("crypto");
  const token = crypto
    .createHash("sha256")
    .update("test-password" + "karate-announce-v1")
    .digest("hex");
  return createRequest(method, url, {
    ...options,
    cookies: { admin_auth: token },
  });
}

/** params オブジェクトを生成（App Router の動的ルート用） */
export function createParams<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) } as { params: Promise<T> };
}
