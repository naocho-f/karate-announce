/**
 * API テスト: /api/public/announce-settings
 *
 * 認証不要の公開エンドポイント。
 * settings テーブルから announce_templates を返す。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, mockResult, resetAll } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));

describe("/api/public/announce-settings", () => {
  beforeEach(() => {
    resetAll();
    vi.resetModules();
  });

  it("GET: announce_templates を返す", async () => {
    const templates = { matchStart: "カスタム開始", winner: "カスタム勝者" };
    mockResult("settings", "select", {
      data: [{ key: "announce_templates", value: templates }],
    });
    const { GET } = await import("@/app/api/public/announce-settings/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.announce_templates).toEqual(templates);
  });

  it("GET: DB にテンプレートが未設定の場合は空オブジェクトを返す", async () => {
    mockResult("settings", "select", { data: [] });
    const { GET } = await import("@/app/api/public/announce-settings/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.announce_templates).toBeUndefined();
  });

  it("GET: admin認証なしでもアクセスできる（認証不要）", async () => {
    mockResult("settings", "select", {
      data: [{ key: "announce_templates", value: { matchStart: "test", winner: "test" } }],
    });
    const { GET } = await import("@/app/api/public/announce-settings/route");
    // admin_auth cookie なしのリクエスト
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("GET: DBエラー時は500を返す", async () => {
    mockResult("settings", "select", {
      data: null,
      error: { message: "DB error" },
    });
    const { GET } = await import("@/app/api/public/announce-settings/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
