/**
 * API テスト: /api/admin/events 系
 *
 * 対象:
 * - /api/admin/events (POST: 新規作成、複製)
 * - /api/admin/events/[id] (PATCH, DELETE)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createAdminRequest,
  createParams,
  resetAll,
  getCallsFor,
} from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("/api/admin/events", () => {
  beforeEach(() => resetAll());

  it("POST: 新規イベント作成", async () => {
    mockResult("events", "insert", { data: { id: "ev-new" } });
    const { POST } = await import("@/app/api/admin/events/route");
    const req = createAdminRequest("POST", "/api/admin/events", {
      body: { name: "テスト大会", event_date: "2026-12-01", court_count: 2 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("ev-new");
  });

  it("POST: ルール付きイベント作成", async () => {
    mockResult("events", "insert", { data: { id: "ev-r" } });
    const { POST } = await import("@/app/api/admin/events/route");
    const req = createAdminRequest("POST", "/api/admin/events", {
      body: { name: "ルール付き", rule_ids: ["r1", "r2"] },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST: イベント複製（基本）", async () => {
    // ソースイベント取得
    mockResult("events", "select", {
      data: {
        id: "source-ev",
        name: "元大会",
        event_date: "2026-01-01",
        court_count: 3,
        court_names: ["A", "B", "C"],
        status: "active",
        entry_closed: false,
        is_active: true,
        entry_close_at: "2026-01-01T00:00:00Z",
        banner_image_path: "banners/test.png",
        ogp_image_path: "ogp/test.png",
        email_subject_template: "件名テンプレート",
        email_body_template: "本文テンプレート",
        venue_info: "東京体育館",
        notification_emails: ["a@example.com"],
        max_weight_diff: 10,
        max_height_diff: 15,
      },
    });
    // 新規イベント作成
    mockResult("events", "insert", { data: { id: "ev-copy" } });
    // form_configs 取得
    mockResult("form_configs", "select", { data: null });

    const { POST } = await import("@/app/api/admin/events/route");
    const req = createAdminRequest("POST", "/api/admin/events", {
      body: { name: "コピー大会", copy_from_event_id: "source-ev" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // events insert にバナー・テンプレート等が含まれていることを確認
    const insertCalls = getCallsFor("events", "insert");
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    const insertArg = insertCalls[0].args[0] as Record<string, unknown>;
    expect(insertArg.banner_image_path).toBe("banners/test.png");
    expect(insertArg.ogp_image_path).toBe("ogp/test.png");
    expect(insertArg.email_subject_template).toBe("件名テンプレート");
    expect(insertArg.email_body_template).toBe("本文テンプレート");
    expect(insertArg.venue_info).toBe("東京体育館");
    expect(insertArg.notification_emails).toEqual(["a@example.com"]);
    expect(insertArg.entry_close_at).toBe("2026-01-01T00:00:00Z");
    // ステータスはリセット
    expect(insertArg.status).toBe("preparing");

    // bracket_rules の select が呼ばれていることを確認
    const bracketCalls = getCallsFor("bracket_rules", "select");
    expect(bracketCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("POST: イベント複製（参加者あり → トーナメント・対戦者・試合もコピー）", async () => {
    mockResult("events", "select", {
      data: {
        id: "source-ev",
        name: "元大会",
        court_count: 2,
        court_names: null,
        max_weight_diff: null,
        max_height_diff: null,
        banner_image_path: null,
        ogp_image_path: null,
        email_subject_template: null,
        email_body_template: null,
        venue_info: null,
        notification_emails: null,
        entry_close_at: null,
      },
    });
    mockResult("events", "insert", { data: { id: "ev-copy2" } });
    mockResult("form_configs", "select", { data: null });
    mockResult("entries", "select", { data: [] });
    mockResult("tournaments", "select", { data: [] });

    const { POST } = await import("@/app/api/admin/events/route");
    const req = createAdminRequest("POST", "/api/admin/events", {
      body: { name: "コピー大会2", copy_from_event_id: "source-ev", copy_entries: true },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // tournaments の select が呼ばれていることを確認（参加者コピー時のみ）
    const tournamentCalls = getCallsFor("tournaments", "select");
    expect(tournamentCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("/api/admin/events/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: イベント更新", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/events/ev1", {
      body: { name: "変更後大会名" },
    });
    const res = await PATCH(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: entry_closed=false で form_configs.is_ready を自動で true にする", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/events/ev1", {
      body: { entry_closed: false },
    });
    const res = await PATCH(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
    // form_configs の update が呼ばれたことを確認
    const formConfigUpdates = getCallsFor("form_configs", "update");
    expect(formConfigUpdates.length).toBeGreaterThanOrEqual(1);
    const updateArg = formConfigUpdates[0].args[0] as Record<string, unknown>;
    expect(updateArg.is_ready).toBe(true);
  });

  it("PATCH: is_active=true で全イベント非アクティブ化後に更新", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/events/ev1", {
      body: { is_active: true },
    });
    const res = await PATCH(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
  });

  it("DELETE: イベント削除", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/events/ev1");
    const res = await DELETE(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
  });
});
