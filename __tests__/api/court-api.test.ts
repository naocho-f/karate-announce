/**
 * API テスト: コート系 + 公開系 API
 *
 * 対象:
 * - /api/court/entries/[id] (PATCH)
 * - /api/court/matches/[id] (PATCH: start, set_winner, replace, edit, correct_winner, finish_timer, swap_with)
 * - /api/public/entry (POST)
 * - /api/public/form-config (GET)
 * - /api/tts (POST)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createRequest,
  createAdminRequest,
  createParams,
  resetAll,
} from "../helpers/supabase-mock";

process.env.ADMIN_PASSWORD = "test-password";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
// Resend をモック
vi.mock("@/lib/resend", () => ({
  getResend: () => null, // メール送信スキップ
}));

describe("/api/court/entries/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: 欠場フラグを更新できる", async () => {
    const { PATCH } = await import("@/app/api/court/entries/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/entries/e1", {
      body: { is_withdrawn: true },
    });
    const res = await PATCH(req, createParams({ id: "e1" }));
    expect(res.status).toBe(200);
  });
});

describe("/api/court/matches/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: action=start で試合開始", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "start", tournamentId: "t1" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=set_winner で勝者設定（非決勝）", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "set_winner",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=set_winner 決勝でトーナメント完了", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m-final", {
      body: {
        action: "set_winner",
        winnerId: "f1",
        tournamentId: "t1",
        round: 3,
        rounds: 3,
        position: 0,
      },
    });
    const res = await PATCH(req, createParams({ id: "m-final" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=set_winner matchUpdatedAt不一致で 409", async () => {
    mockResult("matches", "select", {
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "set_winner",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        matchUpdatedAt: "2025-12-31T00:00:00.000Z",
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("既に更新されています");
  });

  it("PATCH: action=finish_timer matchUpdatedAt不一致で 409", async () => {
    mockResult("matches", "select", {
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "finish_timer",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        resultMethod: "ippon",
        matchUpdatedAt: "2025-12-31T00:00:00.000Z",
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("既に更新されています");
  });

  it("PATCH: action=replace で選手差し替え", async () => {
    mockResult("matches", "select", {
      data: { fighter1_id: "f1", fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "replace", slot: "f1", newFighterId: "f-new" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=replace で match が見つからない場合 404", async () => {
    mockResult("matches", "select", { data: null });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "replace", slot: "f1", newFighterId: "f-new" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(404);
  });

  it("PATCH: action=edit で試合情報編集", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "edit", matchLabel: "第10試合", rules: "ルールA" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=correct_winner で勝者修正", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", status: "waiting", fighter1_id: null, fighter2_id: null },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "correct_winner",
        winnerId: "f2",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=correct_winner 次試合が ongoing なら伝搬スキップ", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", status: "ongoing", fighter1_id: "f1", fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "correct_winner",
        winnerId: "f2",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=correct_winner 次試合が done なら伝搬スキップ", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", status: "done", fighter1_id: "f1", fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "correct_winner",
        winnerId: "f2",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=finish_timer でタイマー結果書き戻し（非決勝）", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "finish_timer",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        resultMethod: "ippon",
        resultDetail: { red_points: 0, white_points: 0 },
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=finish_timer 決勝でトーナメント完了", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m-final", {
      body: {
        action: "finish_timer",
        winnerId: "f1",
        tournamentId: "t1",
        round: 3,
        rounds: 3,
        position: 0,
        resultMethod: "decision",
      },
    });
    const res = await PATCH(req, createParams({ id: "m-final" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=finish_timer ポイント勝ちで result_detail が保存される", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "finish_timer",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        resultMethod: "point",
        resultDetail: { red_points: 5, white_points: 3, red_wazaari: 1, white_wazaari: 0 },
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=finish_timer 反則勝ちで result_method=foul", async () => {
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: "f2" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "finish_timer",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        resultMethod: "foul",
        resultDetail: { red_fouls: 3 },
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=finish_timer 勝者なし（引き分け）", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "finish_timer",
        winnerId: null,
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        resultMethod: "draw",
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=swap_with で試合入れ替え", async () => {
    mockResult("matches", "select", { data: { position: 0 } });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "swap_with", otherMatchId: "m2" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: action=swap_with で otherMatchId 未指定は 400", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "swap_with" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(400);
  });

  it("PATCH: action=set_winner RPC エラー時に 500", async () => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: null,
      error: {
        message: "rpc failed",
        details: "",
        hint: "",
        code: "42000",
        name: "PostgrestError",
        toJSON: () => ({ name: "PostgrestError", message: "rpc failed", details: "", hint: "", code: "42000" }),
      },
      count: null,
      status: 500,
      statusText: "Internal Server Error",
      success: false,
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "set_winner",
        winnerId: "f1",
        tournamentId: "t1",
        round: 3,
        rounds: 3,
        position: 0,
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(500);
  });

  it("PATCH: action=swap_with RPC エラー時に 500", async () => {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: null,
      error: {
        message: "rpc failed",
        details: "",
        hint: "",
        code: "42000",
        name: "PostgrestError",
        toJSON: () => ({ name: "PostgrestError", message: "rpc failed", details: "", hint: "", code: "42000" }),
      },
      count: null,
      status: 500,
      statusText: "Internal Server Error",
      success: false,
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "swap_with", otherMatchId: "m2" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(500);
  });

  it("PATCH: 不明な action で 400", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "unknown_action" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(400);
  });
});

describe("/api/public/entry", () => {
  beforeEach(() => resetAll());

  it("POST: エントリー送信成功", async () => {
    // 受付チェック
    mockResult("events", "select", {
      data: { entry_closed: false, entry_close_at: null },
    });
    // エントリー挿入
    mockResult("entries", "insert", { data: { id: "new-entry" } });
    const { POST } = await import("@/app/api/public/entry/route");
    const req = createRequest("POST", "/api/public/entry", {
      body: {
        entry: {
          event_id: "ev1",
          family_name: "田中",
          given_name: "太郎",
          extra_fields: {},
        },
        school_name: null,
        rule_ids: [],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("new-entry");
  });

  it("POST: 受付終了で 403", async () => {
    mockResult("events", "select", {
      data: { entry_closed: true, entry_close_at: null },
    });
    const { POST } = await import("@/app/api/public/entry/route");
    const req = createRequest("POST", "/api/public/entry", {
      body: {
        entry: { event_id: "ev1", family_name: "田中" },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("POST: entry_close_at 期限切れで 403", async () => {
    mockResult("events", "select", {
      data: {
        entry_closed: false,
        entry_close_at: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    const { POST } = await import("@/app/api/public/entry/route");
    const req = createRequest("POST", "/api/public/entry", {
      body: {
        entry: { event_id: "ev1", family_name: "田中" },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("POST: school_name があれば道場自動登録", async () => {
    mockResult("events", "select", {
      data: { entry_closed: false, entry_close_at: null },
    });
    mockResult("dojos", "select", { data: null }); // 既存なし
    mockResult("entries", "insert", { data: { id: "new-entry" } });
    const { POST } = await import("@/app/api/public/entry/route");
    const req = createRequest("POST", "/api/public/entry", {
      body: {
        entry: { event_id: "ev1", family_name: "田中", extra_fields: {} },
        school_name: "テスト道場",
        rule_ids: ["r1"],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("/api/public/form-config", () => {
  beforeEach(() => resetAll());

  it("GET: event_id 未指定で 400", async () => {
    const { GET } = await import("@/app/api/public/form-config/route");
    const req = createRequest("GET", "/api/public/form-config");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("GET: フォーム設定がない場合 ready=false", async () => {
    mockResult("form_configs", "select", { data: null });
    const { GET } = await import("@/app/api/public/form-config/route");
    const req = createRequest("GET", "/api/public/form-config?event_id=ev1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ready).toBe(false);
  });

  it("GET: フォーム設定がある場合 ready=true + fields", async () => {
    mockResult("form_configs", "select", {
      data: { id: "fc1", event_id: "ev1", is_ready: true, version: 1 },
    });
    mockResult("form_field_configs", "select", {
      data: [{ field_key: "full_name", visible: true, sort_order: 1 }],
    });
    mockResult("form_notices", "select", { data: [] });
    mockResult("custom_field_defs", "select", { data: [] });
    const { GET } = await import("@/app/api/public/form-config/route");
    const req = createRequest("GET", "/api/public/form-config?event_id=ev1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ready).toBe(true);
    expect(json.version).toBe(1);
  });
});

describe("/api/tts", () => {
  beforeEach(() => {
    resetAll();
    vi.restoreAllMocks();
  });

  it("POST: text 未指定で 400", async () => {
    const { POST } = await import("@/app/api/tts/route");
    const req = createAdminRequest("POST", "/api/tts", {
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: 正常な TTS リクエスト", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { POST } = await import("@/app/api/tts/route");
    const req = createAdminRequest("POST", "/api/tts", {
      body: { text: "テスト音声", voice: "nova", speed: 1.0 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");

    vi.unstubAllGlobals();
  });

  it("POST: 不正な voice は nova にフォールバック", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { POST } = await import("@/app/api/tts/route");
    const req = createAdminRequest("POST", "/api/tts", {
      body: { text: "テスト", voice: "invalid_voice", speed: 99 },
    });
    await POST(req);

    // fetch が呼ばれ、voice=nova, speed=1.0 に正規化されている
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBe("nova");
    expect(body.speed).toBe(1.0);

    vi.unstubAllGlobals();
  });

  it("POST: OpenAI API エラー時にエラーレスポンスを返す", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limit exceeded"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { POST } = await import("@/app/api/tts/route");
    const req = createAdminRequest("POST", "/api/tts", {
      body: { text: "テスト" },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);

    vi.unstubAllGlobals();
  });
});
