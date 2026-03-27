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

  it("POST: イベント複製", async () => {
    // ソースイベント取得
    mockResult("events", "select", {
      data: {
        id: "source-ev",
        name: "元大会",
        event_date: "2026-01-01",
        court_count: 3,
        court_names: null,
        status: "preparing",
        entry_closed: false,
        is_active: false,
        entry_close_at: null,
        banner_image_path: null,
        ogp_image_path: null,
        email_subject_template: null,
        email_body_template: null,
        venue_info: null,
        notification_emails: null,
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
