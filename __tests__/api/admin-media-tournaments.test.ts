/**
 * API テスト: バナー・OGP・ブザー・トーナメント作成
 *
 * 対象:
 * - /api/admin/events/[id]/banner (POST, DELETE)
 * - /api/admin/events/[id]/ogp (POST, DELETE)
 * - /api/admin/timer-presets/[id]/buzzer (POST, DELETE)
 * - /api/admin/tournaments (POST)
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
vi.mock("@/lib/ensure-fighter", () => ({
  ensureFighterFromEntry: vi.fn().mockResolvedValue("fighter-new"),
}));

// ── /api/admin/events/[id]/banner ──

describe("/api/admin/events/[id]/banner", () => {
  beforeEach(() => resetAll());

  it("DELETE: バナーを削除できる", async () => {
    mockResult("events", "select", { data: { banner_image_path: "event-banners/ev1/123.jpg" } });
    const { DELETE } = await import("@/app/api/admin/events/[id]/banner/route");
    const req = createAdminRequest("DELETE", "/api/admin/events/ev1/banner");
    const res = await DELETE(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("DELETE: バナーがない場合でも正常終了", async () => {
    mockResult("events", "select", { data: { banner_image_path: null } });
    const { DELETE } = await import("@/app/api/admin/events/[id]/banner/route");
    const req = createAdminRequest("DELETE", "/api/admin/events/ev1/banner");
    const res = await DELETE(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/events/[id]/ogp ──

describe("/api/admin/events/[id]/ogp", () => {
  beforeEach(() => resetAll());

  it("DELETE: OGP画像を削除できる", async () => {
    mockResult("events", "select", { data: { ogp_image_path: "event-ogp/ev1/123.jpg" } });
    const { DELETE } = await import("@/app/api/admin/events/[id]/ogp/route");
    const req = createAdminRequest("DELETE", "/api/admin/events/ev1/ogp");
    const res = await DELETE(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("DELETE: OGP画像がない場合でも正常終了", async () => {
    mockResult("events", "select", { data: { ogp_image_path: null } });
    const { DELETE } = await import("@/app/api/admin/events/[id]/ogp/route");
    const req = createAdminRequest("DELETE", "/api/admin/events/ev1/ogp");
    const res = await DELETE(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/timer-presets/[id]/buzzer ──

describe("/api/admin/timer-presets/[id]/buzzer", () => {
  beforeEach(() => resetAll());

  it("DELETE: カスタムブザー音源を削除できる", async () => {
    mockResult("timer_presets", "select", {
      data: { buzzer_custom_path: "https://mock.supabase.co/storage/v1/object/public/form-notice-images/timer-buzzer/p1/buzz.mp3" },
    });
    const { DELETE } = await import("@/app/api/admin/timer-presets/[id]/buzzer/route");
    const req = createAdminRequest("DELETE", "/api/admin/timer-presets/p1/buzzer");
    const res = await DELETE(req, createParams({ id: "p1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("DELETE: パスがない場合でも正常終了", async () => {
    mockResult("timer_presets", "select", { data: { buzzer_custom_path: null } });
    const { DELETE } = await import("@/app/api/admin/timer-presets/[id]/buzzer/route");
    const req = createAdminRequest("DELETE", "/api/admin/timer-presets/p1/buzzer");
    const res = await DELETE(req, createParams({ id: "p1" }));
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/tournaments ──

describe("/api/admin/tournaments POST", () => {
  beforeEach(() => resetAll());

  it("pairs 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: { courtName: "A", courtNum: "1", pairs: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("トーナメントを作成できる（2ペア）", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-new", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "Aコート",
        courtNum: "1",
        eventId: "ev1",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", given_name: "花子", event_id: "ev1" },
            matchLabel: "第1試合",
            ruleName: "フルコン",
          },
          {
            e1: { id: "e3", family_name: "佐藤", given_name: "一郎", event_id: "ev1" },
            e2: { id: "e4", family_name: "山田", given_name: "二郎", event_id: "ev1" },
            matchLabel: "第2試合",
            ruleName: "フルコン",
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("t-new");
  });

  it("ワンマッチを作成できる", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-one", name: "エキシビション", court: "1", status: "preparing" },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "エキシビション",
        courtNum: "1",
        type: "one_match",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", given_name: "花子", event_id: "ev1" },
            matchLabel: "エキシビション",
            ruleName: null,
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("t-one");
  });

  it("同じルール内で同じ対戦相手の重複ワンマッチは409で拒否される", async () => {
    // ensureFighterFromEntry が entry ごとに異なる fighter_id を返すようにモック
    const { ensureFighterFromEntry } = await import("@/lib/ensure-fighter");
    const mockFn = ensureFighterFromEntry as ReturnType<typeof vi.fn>;
    mockFn.mockImplementation((entry: { id: string }) =>
      Promise.resolve(entry.id === "e1" ? "fighter-1" : "fighter-2")
    );
    // 既存のワンマッチトーナメントがある状態をモック
    mockResult("tournaments", "select", {
      data: [{ id: "t-existing" }],
    });
    // 既存の試合に同じ組み合わせ・同じルールが存在
    mockResult("matches", "select", {
      data: [{ id: "m1", fighter1_id: "fighter-1", fighter2_id: "fighter-2", rules: "フルコン" }],
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "ワンマッチ1",
        courtNum: "1",
        type: "one_match",
        eventId: "ev1",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", given_name: "花子", event_id: "ev1" },
            matchLabel: null,
            ruleName: "フルコン",
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("同じルール");
    // モックを元に戻す
    mockFn.mockResolvedValue("fighter-new");
  });

  it("不戦勝ありのトーナメントを作成できる", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-bye", name: "B", court: "2", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "Bコート",
        courtNum: "2",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: null,
            matchLabel: "第1試合",
            ruleName: "ポイント",
          },
          {
            e1: { id: "e3", family_name: "佐藤", given_name: "一郎", event_id: "ev1" },
            e2: { id: "e4", family_name: "山田", given_name: "二郎", event_id: "ev1" },
            matchLabel: "第2試合",
            ruleName: "ポイント",
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
