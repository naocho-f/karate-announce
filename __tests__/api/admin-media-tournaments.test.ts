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
  getCallsFor,
} from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});
vi.mock("@/lib/ensure-fighter", () => ({
  ensureFighterFromEntry: vi.fn().mockResolvedValue("fighter-new"),
}));

/** FormData 付きの管理者リクエストを生成 */
function createAdminFormDataRequest(method: string, url: string, formData: FormData) {
  const { NextRequest } = require("next/server");
  const crypto = require("crypto");
  const token = crypto
    .createHash("sha256")
    .update("test-password" + "karate-announce-v1")
    .digest("hex");
  const req = new NextRequest(new URL(url, "http://localhost:3000"), { method, body: formData });
  req.cookies.set("admin_auth", token);
  return req;
}

/** 画像形式ごとのマジックバイト */
const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
};

/** テスト用の File オブジェクトを生成（画像形式にはマジックバイトを付与） */
function createMockFile(name: string, type: string, sizeBytes: number = 100): File {
  const buffer = new Uint8Array(sizeBytes);
  const magic = MAGIC_BYTES[type];
  if (magic) {
    for (let i = 0; i < magic.length && i < sizeBytes; i++) {
      buffer[i] = magic[i];
    }
  }
  return new File([buffer], name, { type });
}

// ── /api/admin/events/[id]/banner ──

describe("/api/admin/events/[id]/banner", () => {
  beforeEach(() => resetAll());

  it("POST: バナー画像をアップロードできる", async () => {
    mockResult("events", "select", { data: { banner_image_path: null } });
    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const formData = new FormData();
    formData.append("file", createMockFile("banner.jpg", "image/jpeg"));
    const req = createAdminFormDataRequest("POST", "/api/admin/events/ev1/banner", formData);
    const res = await POST(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toContain("event-banners/ev1/");
    expect(json.public_url).toContain("mock.supabase.co");
  });

  it("POST: ファイル未指定で400", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const formData = new FormData();
    const req = createAdminFormDataRequest("POST", "/api/admin/events/ev1/banner", formData);
    const res = await POST(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(400);
  });

  it("POST: 許可されていないファイル形式で400", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const formData = new FormData();
    formData.append("file", createMockFile("banner.gif", "image/gif"));
    const req = createAdminFormDataRequest("POST", "/api/admin/events/ev1/banner", formData);
    const res = await POST(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("JPEG");
  });

  it("POST: 5MB超過で400", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const formData = new FormData();
    formData.append("file", createMockFile("big.jpg", "image/jpeg", 6 * 1024 * 1024));
    const req = createAdminFormDataRequest("POST", "/api/admin/events/ev1/banner", formData);
    const res = await POST(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("5MB");
  });

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

  it("POST: OGP画像をアップロードできる", async () => {
    mockResult("events", "select", { data: { ogp_image_path: null } });
    const { POST } = await import("@/app/api/admin/events/[id]/ogp/route");
    const formData = new FormData();
    formData.append("file", createMockFile("ogp.png", "image/png"));
    const req = createAdminFormDataRequest("POST", "/api/admin/events/ev1/ogp", formData);
    const res = await POST(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toContain("event-ogp/ev1/");
    expect(json.public_url).toContain("mock.supabase.co");
  });

  it("POST: 許可されていないファイル形式で400", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/ogp/route");
    const formData = new FormData();
    formData.append("file", createMockFile("ogp.bmp", "image/bmp"));
    const req = createAdminFormDataRequest("POST", "/api/admin/events/ev1/ogp", formData);
    const res = await POST(req, createParams({ id: "ev1" }));
    expect(res.status).toBe(400);
  });

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

  it("POST: カスタムブザー音源をアップロードできる", async () => {
    mockResult("tenants", "select", { data: { id: "tenant-1" } });
    const { POST } = await import("@/app/api/admin/timer-presets/[id]/buzzer/route");
    const formData = new FormData();
    formData.append("file", createMockFile("buzzer.mp3", "audio/mpeg"));
    const req = createAdminFormDataRequest("POST", "/api/admin/timer-presets/p1/buzzer", formData);
    const res = await POST(req, createParams({ id: "p1" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.url).toContain("mock.supabase.co");
  });

  it("POST: 許可されていないファイル形式で400", async () => {
    const { POST } = await import("@/app/api/admin/timer-presets/[id]/buzzer/route");
    const formData = new FormData();
    formData.append("file", createMockFile("buzzer.flac", "audio/flac"));
    const req = createAdminFormDataRequest("POST", "/api/admin/timer-presets/p1/buzzer", formData);
    const res = await POST(req, createParams({ id: "p1" }));
    expect(res.status).toBe(400);
  });

  it("POST: 2MB超過で400", async () => {
    const { POST } = await import("@/app/api/admin/timer-presets/[id]/buzzer/route");
    const formData = new FormData();
    formData.append("file", createMockFile("big.mp3", "audio/mpeg", 3 * 1024 * 1024));
    const req = createAdminFormDataRequest("POST", "/api/admin/timer-presets/p1/buzzer", formData);
    const res = await POST(req, createParams({ id: "p1" }));
    expect(res.status).toBe(400);
  });

  it("DELETE: カスタムブザー音源を削除できる", async () => {
    mockResult("timer_presets", "select", {
      data: {
        buzzer_custom_path:
          "https://mock.supabase.co/storage/v1/object/public/form-notice-images/timer-buzzer/p1/buzz.mp3",
      },
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

// ── /api/admin/form-config/image-upload ──

describe("/api/admin/form-config/image-upload", () => {
  beforeEach(() => resetAll());

  it("POST: 注意書き画像をアップロードできる", async () => {
    mockResult("form_notice_images", "insert", {
      data: { id: "img-1", notice_id: "n1", storage_path: "n1/123.jpg", sort_order: 0 },
    });
    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const formData = new FormData();
    formData.append("file", createMockFile("notice.jpg", "image/jpeg"));
    formData.append("notice_id", "n1");
    const req = createAdminFormDataRequest("POST", "/api/admin/form-config/image-upload", formData);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.public_url).toContain("mock.supabase.co");
  });

  it("POST: ファイルまたはnotice_id未指定で400", async () => {
    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const formData = new FormData();
    formData.append("file", createMockFile("notice.jpg", "image/jpeg"));
    // notice_id なし
    const req = createAdminFormDataRequest("POST", "/api/admin/form-config/image-upload", formData);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: 許可されていないファイル形式で400", async () => {
    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const formData = new FormData();
    formData.append("file", createMockFile("notice.svg", "image/svg+xml"));
    formData.append("notice_id", "n1");
    const req = createAdminFormDataRequest("POST", "/api/admin/form-config/image-upload", formData);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: 5MB超過で400", async () => {
    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const formData = new FormData();
    formData.append("file", createMockFile("big.jpg", "image/jpeg", 6 * 1024 * 1024));
    formData.append("notice_id", "n1");
    const req = createAdminFormDataRequest("POST", "/api/admin/form-config/image-upload", formData);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("DELETE: 注意書き画像を削除できる", async () => {
    mockResult("form_notice_images", "select", {
      data: { id: "img-1", storage_path: "n1/123.jpg" },
    });
    const { DELETE } = await import("@/app/api/admin/form-config/image-upload/route");
    const req = createAdminRequest("DELETE", "/api/admin/form-config/image-upload", {
      body: { image_id: "img-1" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
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
    mockFn.mockImplementation((entry: { id: string }) => {
      return entry.id === "e1" ? "fighter-1" : "fighter-2";
    });
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

  it("matchLabel・rulesがペアごとに正しく設定される", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-label", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "Aコート",
        courtNum: "1",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", event_id: "ev1" },
            matchLabel: "第1試合",
            ruleName: "本戦2分",
          },
          {
            e1: { id: "e3", family_name: "佐藤", event_id: "ev1" },
            e2: { id: "e4", family_name: "山田", event_id: "ev1" },
            matchLabel: "第2試合",
            ruleName: "延長1分",
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertCalls = getCallsFor("matches", "insert");
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound[0]).toMatchObject({ match_label: "第1試合", rules: "本戦2分" });
    expect(firstRound[1]).toMatchObject({ match_label: "第2試合", rules: "延長1分" });
  });

  it("2ラウンド目以降の空枠が正しく生成される（4ペア→round2=2, round3=1）", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-rounds", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const pairs = Array.from({ length: 4 }, (_, i) => ({
      e1: { id: `e${i * 2}`, family_name: `F${i * 2}`, event_id: "ev1" },
      e2: { id: `e${i * 2 + 1}`, family_name: `F${i * 2 + 1}`, event_id: "ev1" },
      matchLabel: null,
      ruleName: null,
    }));
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: { courtName: "A", courtNum: "1", pairs },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertCalls = getCallsFor("matches", "insert");
    // round1: 4試合
    const round1 = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(round1).toHaveLength(4);
    // round2+round3 は一括 insert（allRoundMatches）
    // 4ペア → roundsFromPairCount(4)=3 → round2=2, round3=1 → 合計3試合
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
    const laterRounds = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(laterRounds).toHaveLength(3); // round2(2) + round3(1)
    const round2Matches = laterRounds.filter((m) => m.round === 2);
    const round3Matches = laterRounds.filter((m) => m.round === 3);
    expect(round2Matches).toHaveLength(2);
    expect(round3Matches).toHaveLength(1);
  });

  it("ready/waitingステータスが正しく設定される", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-status", name: "A", court: "1", status: "preparing" },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "A",
        courtNum: "1",
        pairs: [
          {
            e1: { id: "e1", family_name: "A", event_id: "ev1" },
            e2: { id: "e2", family_name: "B", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "C", event_id: "ev1" },
            e2: null,
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    // 両選手あり → ready
    expect(firstRound[0].status).toBe("ready");
    // 片方のみ（不戦勝）→ waiting
    expect(firstRound[1].status).toBe("waiting");
  });

  it("positionが0始まりの連番になる", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-pos", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const pairs = Array.from({ length: 3 }, (_, i) => ({
      e1: { id: `e${i * 2}`, family_name: `F${i * 2}`, event_id: "ev1" },
      e2: { id: `e${i * 2 + 1}`, family_name: `F${i * 2 + 1}`, event_id: "ev1" },
      matchLabel: null,
      ruleName: null,
    }));
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: { courtName: "A", courtNum: "1", pairs },
    });
    await POST(req);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound[0].position).toBe(0);
    expect(firstRound[1].position).toBe(1);
    expect(firstRound[2].position).toBe(2);
  });

  it("tournaments insert失敗で500エラー", async () => {
    mockResult("tournaments", "insert", { data: null, error: { message: "DB error" } });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "A",
        courtNum: "1",
        pairs: [
          {
            e1: { id: "e1", family_name: "A", event_id: "ev1" },
            e2: { id: "e2", family_name: "B", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
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

  it("1ペアで2ラウンド目が生成されない", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-1pair", name: "A", court: "1", status: "preparing" },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "A",
        courtNum: "1",
        pairs: [
          {
            e1: { id: "e1", family_name: "A", event_id: "ev1" },
            e2: { id: "e2", family_name: "B", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertCalls = getCallsFor("matches", "insert");
    // round1 の 1試合のみ。roundsFromPairCount(1)=1 なので追加ラウンドなし
    expect(insertCalls).toHaveLength(1);
    const round1 = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(round1).toHaveLength(1);
    expect(round1[0]).toMatchObject({ round: 1, position: 0, status: "ready" });
  });

  it("3ペアで3ラウンド（round2=2, round3=1）", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-3pair", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const pairs = Array.from({ length: 3 }, (_, i) => ({
      e1: { id: `e${i * 2}`, family_name: `F${i * 2}`, event_id: "ev1" },
      e2: { id: `e${i * 2 + 1}`, family_name: `F${i * 2 + 1}`, event_id: "ev1" },
      matchLabel: null,
      ruleName: null,
    }));
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: { courtName: "A", courtNum: "1", pairs },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertCalls = getCallsFor("matches", "insert");
    const round1 = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(round1).toHaveLength(3);
    // 3ペア → roundsFromPairCount(3)=3 → round2=2, round3=1 → 合計3試合
    const laterRounds = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(laterRounds).toHaveLength(3);
    expect(laterRounds.filter((m) => m.round === 2)).toHaveLength(2);
    expect(laterRounds.filter((m) => m.round === 3)).toHaveLength(1);
  });

  it("8ペアで4ラウンド（round2=4, round3=2, round4=1）", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-8pair", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const pairs = Array.from({ length: 8 }, (_, i) => ({
      e1: { id: `e${i * 2}`, family_name: `F${i * 2}`, event_id: "ev1" },
      e2: { id: `e${i * 2 + 1}`, family_name: `F${i * 2 + 1}`, event_id: "ev1" },
      matchLabel: null,
      ruleName: null,
    }));
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: { courtName: "A", courtNum: "1", pairs },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insertCalls = getCallsFor("matches", "insert");
    const round1 = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(round1).toHaveLength(8);
    // 8ペア → roundsFromPairCount(8)=4 → round2=4, round3=2, round4=1 → 合計7試合
    const laterRounds = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(laterRounds).toHaveLength(7);
    expect(laterRounds.filter((m) => m.round === 2)).toHaveLength(4);
    expect(laterRounds.filter((m) => m.round === 3)).toHaveLength(2);
    expect(laterRounds.filter((m) => m.round === 4)).toHaveLength(1);
  });

  it("不戦勝のfighterが次ラウンドに進出しdoneになる", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-bye-adv", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "A",
        courtNum: "1",
        pairs: [
          {
            e1: { id: "e1", family_name: "A", event_id: "ev1" },
            e2: { id: "e2", family_name: "B", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "C", event_id: "ev1" },
            e2: null, // 不戦勝
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e5", family_name: "E", event_id: "ev1" },
            e2: { id: "e6", family_name: "F", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updateCalls = getCallsFor("matches", "update");
    // 不戦勝の試合が done + winner_id 設定される
    const doneUpdates = updateCalls.filter(
      (c) => c.args[0] && typeof c.args[0] === "object" && (c.args[0] as Record<string, unknown>).status === "done",
    );
    expect(doneUpdates.length).toBeGreaterThanOrEqual(1);
    const winnerUpdates = updateCalls.filter(
      (c) => c.args[0] && typeof c.args[0] === "object" && "winner_id" in (c.args[0] as Record<string, unknown>),
    );
    expect(winnerUpdates.length).toBeGreaterThanOrEqual(1);
    // 次ラウンドへの配置（fighter1_id or fighter2_id の設定）
    const advanceCalls = updateCalls.filter(
      (c) =>
        c.args[0] &&
        typeof c.args[0] === "object" &&
        ("fighter1_id" in (c.args[0] as Record<string, unknown>) ||
          "fighter2_id" in (c.args[0] as Record<string, unknown>)),
    );
    expect(advanceCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("複数不戦勝が独立して次ラウンドに進出する", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-multi-bye", name: "A", court: "1", status: "preparing" },
    });
    mockResult("matches", "select", {
      data: { id: "next-m", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "A",
        courtNum: "1",
        pairs: [
          {
            e1: { id: "e1", family_name: "A", event_id: "ev1" },
            e2: null, // 不戦勝1
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "C", event_id: "ev1" },
            e2: null, // 不戦勝2
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e5", family_name: "E", event_id: "ev1" },
            e2: { id: "e6", family_name: "F", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e7", family_name: "G", event_id: "ev1" },
            e2: { id: "e8", family_name: "H", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updateCalls = getCallsFor("matches", "update");
    // 2つの不戦勝試合がそれぞれ done になる
    const doneUpdates = updateCalls.filter(
      (c) => c.args[0] && typeof c.args[0] === "object" && (c.args[0] as Record<string, unknown>).status === "done",
    );
    expect(doneUpdates).toHaveLength(2);
  });
});
