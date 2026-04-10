/**
 * API テスト: /api/admin/matches 系 + /api/admin/tournaments
 *
 * 対象:
 * - /api/admin/matches/[id] (PATCH)
 * - /api/admin/matches/swap (POST)
 * - /api/admin/matches/batch (POST)
 * - /api/admin/matches/[id]/replace (POST)
 * - /api/admin/tournaments/[id] (PUT, PATCH, DELETE)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createAdminRequest,
  createParams,
  resetAll,
  getCalls,
} from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});
vi.mock("@/lib/ensure-fighter", () => ({
  ensureFighterFromEntry: vi.fn().mockResolvedValue("fighter-new"),
}));

describe("/api/admin/matches/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: 試合を更新できる", async () => {
    const { PATCH } = await import("@/app/api/admin/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/matches/m1", {
      body: { match_label: "第5試合" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/matches/swap", () => {
  beforeEach(() => resetAll());

  it("POST: 試合を入れ替えできる", async () => {
    const { POST } = await import("@/app/api/admin/matches/swap/route");
    const req = createAdminRequest("POST", "/api/admin/matches/swap", {
      body: { match1_id: "m1", match2_id: "m2" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST: ID 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/matches/swap/route");
    const req = createAdminRequest("POST", "/api/admin/matches/swap", {
      body: { match1_id: "m1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/matches/batch", () => {
  beforeEach(() => resetAll());

  it("POST: 一括更新できる", async () => {
    const { POST } = await import("@/app/api/admin/matches/batch/route");
    const req = createAdminRequest("POST", "/api/admin/matches/batch", {
      body: {
        updates: [
          { id: "m1", match_label: "第1試合" },
          { id: "m2", match_label: "第2試合" },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST: 空配列でも OK", async () => {
    const { POST } = await import("@/app/api/admin/matches/batch/route");
    const req = createAdminRequest("POST", "/api/admin/matches/batch", {
      body: { updates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/matches/[id]/replace", () => {
  beforeEach(() => resetAll());

  it("POST: 選手を差し替えできる", async () => {
    mockResult("entries", "select", {
      data: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
    });
    mockResult("matches", "select", {
      data: { fighter1_id: "f1", fighter2_id: "f2" },
    });
    const { POST } = await import("@/app/api/admin/matches/[id]/replace/route");
    const req = createAdminRequest("POST", "/api/admin/matches/m1/replace", {
      body: { slot: "fighter1", entry_id: "e1" },
    });
    const res = await POST(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("POST: slot/entry_id 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/matches/[id]/replace/route");
    const req = createAdminRequest("POST", "/api/admin/matches/m1/replace", {
      body: {},
    });
    const res = await POST(req, createParams({ id: "m1" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/tournaments", () => {
  beforeEach(() => resetAll());

  it("トーナメント作成（2ペア）", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-new", name: "コートA" },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "コートA",
        courtNum: "A",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", given_name: "次郎", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "佐藤", given_name: "三郎", event_id: "ev1" },
            e2: { id: "e4", family_name: "高橋", given_name: "四郎", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
        eventId: "ev1",
        sortOrder: 1,
        maxWeightDiff: 5,
        maxHeightDiff: 10,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("t-new");
  });

  it("one_match タイプのトーナメント作成", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-one", name: "個別試合" },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "個別試合",
        courtNum: "B",
        type: "one_match",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", given_name: "次郎", event_id: "ev1" },
            matchLabel: "第1試合",
            ruleName: "フルコンタクト",
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("t-one");
  });

  it("不戦勝ペアの処理（bye: e2 が null）", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-bye", name: "コートB" },
    });
    // advanceWinner が次ラウンドの match を select する際の返却値
    mockResult("matches", "select", {
      data: { id: "m-r2", fighter1_id: null, fighter2_id: null },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "コートB",
        courtNum: "B",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: null,
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "佐藤", given_name: "三郎", event_id: "ev1" },
            e2: { id: "e4", family_name: "高橋", given_name: "四郎", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
        eventId: "ev1",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("t-bye");

    // 呼び出し記録を検証
    const calls = getCalls();

    // 不戦勝の試合が done + winner_id 設定されていること
    const byeUpdate = calls.find(
      (c) =>
        c.table === "matches" &&
        c.method === "update" &&
        Array.isArray(c.args) &&
        c.args.length > 0 &&
        typeof c.args[0] === "object" &&
        c.args[0] !== null &&
        "winner_id" in (c.args[0] as Record<string, unknown>) &&
        (c.args[0] as Record<string, unknown>)["status"] === "done",
    );
    expect(byeUpdate).toBeTruthy();

    // 次ラウンドへの advance で otherFilled チェックが行われていること
    // nextMatch の fighter2_id が null なので status は "waiting" になるはず
    const advanceUpdate = calls.find(
      (c) =>
        c.table === "matches" &&
        c.method === "update" &&
        Array.isArray(c.args) &&
        c.args.length > 0 &&
        typeof c.args[0] === "object" &&
        c.args[0] !== null &&
        "fighter1_id" in (c.args[0] as Record<string, unknown>) &&
        (c.args[0] as Record<string, unknown>)["status"] === "waiting",
    );
    expect(advanceUpdate).toBeTruthy();
  });

  it("不戦勝で相手スロットが埋まっている場合は ready になる", async () => {
    mockResult("tournaments", "insert", {
      data: { id: "t-bye2", name: "コートC" },
    });
    // 次ラウンドの match で fighter2_id が既に埋まっている
    mockResult("matches", "select", {
      data: { id: "m-r2", fighter1_id: null, fighter2_id: "fighter-existing" },
    });
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "コートC",
        courtNum: "C",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: null,
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "佐藤", given_name: "三郎", event_id: "ev1" },
            e2: null,
            matchLabel: null,
            ruleName: null,
          },
        ],
        eventId: "ev1",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calls = getCalls();

    // 次ラウンドへの advance で otherFilled=true なので status は "ready" になるはず
    const advanceUpdate = calls.find(
      (c) =>
        c.table === "matches" &&
        c.method === "update" &&
        Array.isArray(c.args) &&
        c.args.length > 0 &&
        typeof c.args[0] === "object" &&
        c.args[0] !== null &&
        "fighter1_id" in (c.args[0] as Record<string, unknown>) &&
        (c.args[0] as Record<string, unknown>)["status"] === "ready",
    );
    expect(advanceUpdate).toBeTruthy();
  });

  it("pairs が空の場合 400", async () => {
    const { POST } = await import("@/app/api/admin/tournaments/route");
    const req = createAdminRequest("POST", "/api/admin/tournaments", {
      body: {
        courtName: "コートA",
        courtNum: "A",
        pairs: [],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/tournaments/[id]", () => {
  beforeEach(() => resetAll());

  it("PUT: トーナメントを更新（matches 再作成）", async () => {
    const { PUT } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PUT", "/api/admin/tournaments/t1", {
      body: {
        courtName: "コートA更新",
        courtNum: "A",
        pairs: [
          {
            e1: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
            e2: { id: "e2", family_name: "鈴木", given_name: "次郎", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
          {
            e1: { id: "e3", family_name: "佐藤", given_name: "三郎", event_id: "ev1" },
            e2: { id: "e4", family_name: "高橋", given_name: "四郎", event_id: "ev1" },
            matchLabel: null,
            ruleName: null,
          },
        ],
        maxWeightDiff: 5,
      },
    });
    const res = await PUT(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("t1");

    // matches が先に削除されていること
    const calls = getCalls();
    const matchDelete = calls.find((c) => c.table === "matches" && c.method === "delete");
    expect(matchDelete).toBeTruthy();

    // tournaments が update されていること（insert ではない）
    const tUpdate = calls.find((c) => c.table === "tournaments" && c.method === "update");
    expect(tUpdate).toBeTruthy();
  });

  it("PUT: pairs が空の場合 400", async () => {
    const { PUT } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PUT", "/api/admin/tournaments/t1", {
      body: {
        courtName: "コートA",
        courtNum: "A",
        pairs: [],
      },
    });
    const res = await PUT(req, createParams({ id: "t1" }));
    expect(res.status).toBe(400);
  });

  it("PATCH: トーナメント更新", async () => {
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { max_weight_diff: 10, max_height_diff: 20 },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });

  it("DELETE: トーナメント削除（matches 先削除）", async () => {
    const { DELETE } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/tournaments/t1");
    const res = await DELETE(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });
});
