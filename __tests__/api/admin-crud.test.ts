/**
 * API テスト: 管理系 CRUD ルート
 *
 * 対象:
 * - /api/admin/dojos (POST)
 * - /api/admin/dojos/[id] (PATCH, DELETE)
 * - /api/admin/fighters (POST)
 * - /api/admin/fighters/[id] (PATCH, DELETE)
 * - /api/admin/rules (POST)
 * - /api/admin/rules/[id] (PATCH, DELETE)
 * - /api/admin/entries (POST)
 * - /api/admin/entries/[id] (PATCH, DELETE)
 * - /api/admin/entry-rules (POST, DELETE)
 * - /api/admin/settings (GET, PUT)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createAdminRequest,
  createParams,
  resetAll,
} from "../helpers/supabase-mock";

// Supabase モック
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));

// admin-auth: verifyAdminAuth を常に true にモック
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("管理系 CRUD API", () => {
  beforeEach(() => {
    resetAll();
  });

  // ── 道場 ──

  describe("/api/admin/dojos", () => {
    it("POST: 道場を作成できる", async () => {
      mockResult("dojos", "insert", { data: { id: "dojo-new" } });
      const { POST } = await import("@/app/api/admin/dojos/route");
      const req = createAdminRequest("POST", "/api/admin/dojos", {
        body: { name: "テスト道場", name_reading: "てすとどうじょう" },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "dojo-new" });
    });

    // 認証テストは admin-login.test.ts と admin-auth.test.ts でカバー済み
  });

  describe("/api/admin/dojos/[id]", () => {
    it("PATCH: 道場を更新できる", async () => {
      const { PATCH } = await import("@/app/api/admin/dojos/[id]/route");
      const req = createAdminRequest("PATCH", "/api/admin/dojos/d1", {
        body: { name_reading: "しんどうじょう" },
      });
      const res = await PATCH(req, createParams({ id: "d1" }));
      expect(res.status).toBe(200);
    });

    it("DELETE: 道場を削除できる", async () => {
      const { DELETE } = await import("@/app/api/admin/dojos/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/dojos/d1");
      const res = await DELETE(req, createParams({ id: "d1" }));
      expect(res.status).toBe(200);
    });
  });

  // ── 選手 ──

  describe("/api/admin/fighters", () => {
    it("POST: 選手を作成できる", async () => {
      mockResult("fighters", "insert", { data: { id: "f-new" } });
      const { POST } = await import("@/app/api/admin/fighters/route");
      const req = createAdminRequest("POST", "/api/admin/fighters", {
        body: { name: "田中太郎", dojo_id: "d1" },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "f-new" });
    });
  });

  describe("/api/admin/fighters/[id]", () => {
    it("PATCH: 選手を更新できる", async () => {
      const { PATCH } = await import("@/app/api/admin/fighters/[id]/route");
      const req = createAdminRequest("PATCH", "/api/admin/fighters/f1", {
        body: { name: "田中次郎" },
      });
      const res = await PATCH(req, createParams({ id: "f1" }));
      expect(res.status).toBe(200);
    });

    it("DELETE: 選手を削除できる", async () => {
      const { DELETE } = await import("@/app/api/admin/fighters/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/fighters/f1");
      const res = await DELETE(req, createParams({ id: "f1" }));
      expect(res.status).toBe(200);
    });
  });

  // ── ルール ──

  describe("/api/admin/rules", () => {
    it("POST: ルールを作成できる", async () => {
      mockResult("rules", "insert", { data: { id: "r-new" } });
      const { POST } = await import("@/app/api/admin/rules/route");
      const req = createAdminRequest("POST", "/api/admin/rules", {
        body: { name: "テストルール" },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "r-new" });
    });
  });

  describe("/api/admin/rules/[id]", () => {
    it("PATCH: ルールを更新できる", async () => {
      const { PATCH } = await import("@/app/api/admin/rules/[id]/route");
      const req = createAdminRequest("PATCH", "/api/admin/rules/r1", {
        body: { description: "変更後説明" },
      });
      const res = await PATCH(req, createParams({ id: "r1" }));
      expect(res.status).toBe(200);
    });

    it("DELETE: ルールを削除できる", async () => {
      const { DELETE } = await import("@/app/api/admin/rules/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/rules/r1");
      const res = await DELETE(req, createParams({ id: "r1" }));
      expect(res.status).toBe(200);
    });
  });

  // ── エントリー ──

  describe("/api/admin/entries", () => {
    it("POST: エントリーを作成できる", async () => {
      mockResult("entries", "insert", {
        data: { id: "e1", family_name: "鈴木" },
      });
      const { POST } = await import("@/app/api/admin/entries/route");
      const req = createAdminRequest("POST", "/api/admin/entries", {
        body: {
          event_id: "ev1",
          family_name: "鈴木",
          given_name: "花子",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe("/api/admin/entries/[id]", () => {
    it("PATCH: エントリーを更新できる", async () => {
      const { PATCH } = await import("@/app/api/admin/entries/[id]/route");
      const req = createAdminRequest("PATCH", "/api/admin/entries/e1", {
        body: { family_name: "高橋" },
      });
      const res = await PATCH(req, createParams({ id: "e1" }));
      expect(res.status).toBe(200);
    });

    it("DELETE: エントリーを削除できる", async () => {
      const { DELETE } = await import("@/app/api/admin/entries/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/entries/e1");
      const res = await DELETE(req, createParams({ id: "e1" }));
      expect(res.status).toBe(200);
    });
  });

  // ── エントリールール ──

  describe("/api/admin/entry-rules", () => {
    it("POST: エントリールールを設定できる", async () => {
      const { POST } = await import("@/app/api/admin/entry-rules/route");
      const req = createAdminRequest("POST", "/api/admin/entry-rules", {
        body: { entry_id: "e1", rule_ids: ["r1", "r2"] },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it("DELETE: エントリールールを削除できる", async () => {
      const { DELETE } = await import("@/app/api/admin/entry-rules/route");
      const req = createAdminRequest("DELETE", "/api/admin/entry-rules", {
        body: { entry_id: "e1" },
      });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
    });
  });

  // ── 設定 ──

  describe("/api/admin/settings", () => {
    it("GET: 設定を取得できる", async () => {
      mockResult("settings", "select", {
        data: [{ key: "announce_templates", value: { test: true } }],
      });
      const { GET } = await import("@/app/api/admin/settings/route");
      const req = createAdminRequest("GET", "/api/admin/settings");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.announce_templates).toEqual({ test: true });
    });

    it("PUT: 設定を更新できる", async () => {
      const { PUT } = await import("@/app/api/admin/settings/route");
      const req = createAdminRequest("PUT", "/api/admin/settings", {
        body: { key: "announce_templates", value: { test: true } },
      });
      const res = await PUT(req);
      expect(res.status).toBe(200);
    });

    it("PUT: key 未指定で 400", async () => {
      const { PUT } = await import("@/app/api/admin/settings/route");
      const req = createAdminRequest("PUT", "/api/admin/settings", {
        body: { value: {} },
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
    });
  });
});
