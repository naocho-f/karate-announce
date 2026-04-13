/**
 * API テスト: /api/admin/timer-presets 系
 *
 * 対象:
 * - /api/admin/timer-presets (GET, POST)
 * - /api/admin/timer-presets/[id] (PATCH, DELETE)
 * - /api/admin/timer-presets/[id]/duplicate (POST)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, mockResult, createAdminRequest, createParams, resetAll } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("/api/admin/timer-presets", () => {
  beforeEach(() => resetAll());

  it("GET: プリセット一覧を取得できる", async () => {
    mockResult("timer_presets", "select", {
      data: [{ id: "p1", name: "デフォルト" }],
    });
    const { GET } = await import("@/app/api/admin/timer-presets/route");
    const req = createAdminRequest("GET", "/api/admin/timer-presets");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([{ id: "p1", name: "デフォルト" }]);
  });

  it("GET: event_id フィルタ付き", async () => {
    mockResult("timer_presets", "select", { data: [] });
    const { GET } = await import("@/app/api/admin/timer-presets/route");
    const req = createAdminRequest("GET", "/api/admin/timer-presets?event_id=00000000-0000-0000-0000-000000000001");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("GET: 不正な event_id は 400 を返す", async () => {
    const { GET } = await import("@/app/api/admin/timer-presets/route");
    const req = createAdminRequest("GET", "/api/admin/timer-presets?event_id=xxx),event_id.is.not.null,(1=1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("POST: プリセットを作成できる", async () => {
    mockResult("timer_presets", "insert", {
      data: { id: "p-new", name: "新規プリセット" },
    });
    const { POST } = await import("@/app/api/admin/timer-presets/route");
    const req = createAdminRequest("POST", "/api/admin/timer-presets", {
      body: { name: "新規プリセット", match_duration: 120 },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});

describe("/api/admin/timer-presets/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: プリセットを更新できる", async () => {
    mockResult("timer_presets", "update", {
      data: { id: "p1", name: "変更後" },
    });
    const { PATCH } = await import("@/app/api/admin/timer-presets/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/timer-presets/p1", {
      body: { name: "変更後" },
    });
    const res = await PATCH(req, createParams({ id: "p1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: カラーフィールドを更新できる", async () => {
    mockResult("timer_presets", "update", {
      data: {
        id: "p1",
        color_left: "#FF0000",
        theme_bg_color: "#111111",
        theme_timer_color: "#00FF00",
        theme_timer_warn_color: "#FFAA00",
        theme_divider_color: "#444444",
        color_right: "#0000FF",
      },
    });
    const { PATCH } = await import("@/app/api/admin/timer-presets/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/timer-presets/p1", {
      body: {
        color_left: "#FF0000",
        color_right: "#0000FF",
        theme_bg_color: "#111111",
        theme_timer_color: "#00FF00",
        theme_timer_warn_color: "#FFAA00",
        theme_divider_color: "#444444",
      },
    });
    const res = await PATCH(req, createParams({ id: "p1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: 開始ブザー設定を更新できる", async () => {
    mockResult("timer_presets", "update", {
      data: {
        id: "p1",
        buzzer_on_start: "auto",
        buzzer_sound_start: "high-sine-single",
        buzzer_duration_start: 2.0,
        buzzer_repeat_start: 2,
      },
    });
    const { PATCH } = await import("@/app/api/admin/timer-presets/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/timer-presets/p1", {
      body: {
        buzzer_on_start: "auto",
        buzzer_sound_start: "high-sine-single",
        buzzer_duration_start: 2.0,
        buzzer_repeat_start: 2,
      },
    });
    const res = await PATCH(req, createParams({ id: "p1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.buzzer_on_start).toBe("auto");
  });

  it("DELETE: プリセットを削除できる", async () => {
    const { DELETE } = await import("@/app/api/admin/timer-presets/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/timer-presets/p1");
    const res = await DELETE(req, createParams({ id: "p1" }));
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/timer-presets/[id]/duplicate", () => {
  beforeEach(() => resetAll());

  it("POST: プリセットを複製できる", async () => {
    mockResult("timer_presets", "select", {
      data: { id: "p1", name: "オリジナル", match_duration: 120, created_at: "", updated_at: "" },
    });
    mockResult("timer_presets", "insert", {
      data: { id: "p-dup", name: "オリジナル (コピー)" },
    });
    const { POST } = await import("@/app/api/admin/timer-presets/[id]/duplicate/route");
    const req = createAdminRequest("POST", "/api/admin/timer-presets/p1/duplicate");
    const res = await POST(req, createParams({ id: "p1" }));
    expect(res.status).toBe(201);
  });

  it("POST: 存在しないプリセットで 404", async () => {
    // select がエラーを返す
    mockResult("timer_presets", "select", { data: null, error: { message: "not found" } });
    const { POST } = await import("@/app/api/admin/timer-presets/[id]/duplicate/route");
    const req = createAdminRequest("POST", "/api/admin/timer-presets/nonexist/duplicate");
    const res = await POST(req, createParams({ id: "nonexist" }));
    expect(res.status).toBe(404);
  });
});
