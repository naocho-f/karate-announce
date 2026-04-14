/**
 * API テスト: 論理削除（ソフトデリート）
 *
 * 対象:
 * - 9テーブルのDELETE APIが物理削除ではなくdeleted_atをセットすること
 * - 削除取消（restore）APIがdeleted_atをNULLに戻すこと
 * - 24時間超過のレコードはrestoreが404を返すこと
 * - SELECTクエリが削除済みレコードを適切にフィルタすること
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

// Supabase モック
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));

// admin-auth: verifyAdminAuth を常に true にモック
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("論理削除（ソフトデリート）", () => {
  beforeEach(() => {
    resetAll();
    vi.resetModules();
  });

  // ── 削除操作が物理削除ではなくUPDATE(deleted_at)であること ──

  describe("DELETE → UPDATE deleted_at", () => {
    it("道場の削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("dojos", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/dojos/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/dojos/d1");
      const res = await DELETE(req, createParams({ id: "d1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("dojos", "update");
      expect(updates.length).toBeGreaterThan(0);
      // deleteではなくupdateが呼ばれていること
      const deletes = getCallsFor("dojos", "delete");
      expect(deletes.length).toBe(0);
    });

    it("ルールの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("rules", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/rules/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/rules/r1");
      const res = await DELETE(req, createParams({ id: "r1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("rules", "update");
      expect(updates.length).toBeGreaterThan(0);
      const deletes = getCallsFor("rules", "delete");
      expect(deletes.length).toBe(0);
    });

    it("イベントの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("events", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/events/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/events/ev1");
      const res = await DELETE(req, createParams({ id: "ev1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("events", "update");
      expect(updates.length).toBeGreaterThan(0);
      const deletes = getCallsFor("events", "delete");
      expect(deletes.length).toBe(0);
    });

    it("トーナメントの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("tournaments", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/tournaments/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/tournaments/t1");
      const res = await DELETE(req, createParams({ id: "t1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("tournaments", "update");
      expect(updates.length).toBeGreaterThan(0);
      // matchesの物理削除も行わないこと
      const matchDeletes = getCallsFor("matches", "delete");
      expect(matchDeletes.length).toBe(0);
    });

    it("エントリーの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("entries", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/entries/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/entries/e1");
      const res = await DELETE(req, createParams({ id: "e1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("entries", "update");
      expect(updates.length).toBeGreaterThan(0);
      // entry_rulesの物理削除も行わないこと
      const entryRuleDeletes = getCallsFor("entry_rules", "delete");
      expect(entryRuleDeletes.length).toBe(0);
    });

    it("テスト参加者はhard=trueで物理削除される", async () => {
      mockResult("entries", "select", { data: { id: "e1", is_test: true } });
      mockResult("entries", "delete", { data: null });
      mockResult("entry_rules", "delete", { data: null });
      const { DELETE } = await import("@/app/api/admin/entries/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/entries/e1?hard=true");
      const res = await DELETE(req, createParams({ id: "e1" }));
      expect(res.status).toBe(200);
      const deletes = getCallsFor("entries", "delete");
      expect(deletes.length).toBeGreaterThan(0);
    });

    it("テスト参加者以外はhard=trueでも物理削除されない", async () => {
      mockResult("entries", "select", { data: { id: "e1", is_test: false } });
      const { DELETE } = await import("@/app/api/admin/entries/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/entries/e1?hard=true");
      const res = await DELETE(req, createParams({ id: "e1" }));
      expect(res.status).toBe(403);
    });

    it("タイマープリセットの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("timer_presets", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/timer-presets/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/timer-presets/p1");
      const res = await DELETE(req, createParams({ id: "p1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("timer_presets", "update");
      expect(updates.length).toBeGreaterThan(0);
      const deletes = getCallsFor("timer_presets", "delete");
      expect(deletes.length).toBe(0);
    });

    it("振り分けルールの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("bracket_rules", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/bracket-rules/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/bracket-rules/br1");
      const res = await DELETE(req, createParams({ id: "br1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("bracket_rules", "update");
      expect(updates.length).toBeGreaterThan(0);
      const deletes = getCallsFor("bracket_rules", "delete");
      expect(deletes.length).toBe(0);
    });

    it("注意書きの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("form_notices", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/form-config/notices/[id]/route");
      const req = createAdminRequest("DELETE", "/api/admin/form-config/notices/n1");
      const res = await DELETE(req, createParams({ id: "n1" }));
      expect(res.status).toBe(200);
      const updates = getCallsFor("form_notices", "update");
      expect(updates.length).toBeGreaterThan(0);
      const deletes = getCallsFor("form_notices", "delete");
      expect(deletes.length).toBe(0);
    });

    it("カスタムフィールドの削除がUPDATEでdeleted_atをセットする", async () => {
      mockResult("custom_field_defs", "update", { data: null });
      const { DELETE } = await import("@/app/api/admin/form-config/custom-fields/route");
      const req = createAdminRequest("DELETE", "/api/admin/form-config/custom-fields", {
        body: { form_config_id: "fc1", field_key: "custom_abc" },
      });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const updates = getCallsFor("custom_field_defs", "update");
      expect(updates.length).toBeGreaterThan(0);
      const deletes = getCallsFor("custom_field_defs", "delete");
      expect(deletes.length).toBe(0);
    });
  });

  // ── 削除取消（restore） ──

  describe("PATCH restore（削除取消）", () => {
    it("道場の削除取消ができる（deleted_atが未来）", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 23).toISOString();
      mockResult("dojos", "select", { data: { id: "d1", deleted_at: recentDelete } });
      mockResult("dojos", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/dojos/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/dojos/d1/restore");
      const res = await PATCH(req, createParams({ id: "d1" }));
      expect(res.status).toBe(200);
    });

    it("deleted_atが過去（期限切れ）の削除取消は404を返す", async () => {
      const oldDelete = new Date(Date.now() - 1000 * 60 * 60).toISOString();
      mockResult("dojos", "select", { data: { id: "d1", deleted_at: oldDelete } });
      const { PATCH } = await import("@/app/api/admin/dojos/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/dojos/d1/restore");
      const res = await PATCH(req, createParams({ id: "d1" }));
      expect(res.status).toBe(404);
    });

    it("イベントの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("events", "select", { data: { id: "ev1", deleted_at: recentDelete } });
      mockResult("events", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/events/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/events/ev1/restore");
      const res = await PATCH(req, createParams({ id: "ev1" }));
      expect(res.status).toBe(200);
    });

    it("トーナメントの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();
      mockResult("tournaments", "select", { data: { id: "t1", deleted_at: recentDelete } });
      mockResult("tournaments", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/tournaments/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1/restore");
      const res = await PATCH(req, createParams({ id: "t1" }));
      expect(res.status).toBe(200);
    });

    it("存在しないレコードのrestoreは404を返す", async () => {
      mockResult("dojos", "select", { data: null });
      const { PATCH } = await import("@/app/api/admin/dojos/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/dojos/not-exist/restore");
      const res = await PATCH(req, createParams({ id: "not-exist" }));
      expect(res.status).toBe(404);
    });

    it("ルールの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("rules", "select", { data: { id: "r1", deleted_at: recentDelete } });
      mockResult("rules", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/rules/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/rules/r1/restore");
      const res = await PATCH(req, createParams({ id: "r1" }));
      expect(res.status).toBe(200);
    });

    it("エントリーの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("entries", "select", { data: { id: "e1", deleted_at: recentDelete } });
      mockResult("entries", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/entries/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/entries/e1/restore");
      const res = await PATCH(req, createParams({ id: "e1" }));
      expect(res.status).toBe(200);
    });

    it("タイマープリセットの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("timer_presets", "select", { data: { id: "p1", deleted_at: recentDelete } });
      mockResult("timer_presets", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/timer-presets/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/timer-presets/p1/restore");
      const res = await PATCH(req, createParams({ id: "p1" }));
      expect(res.status).toBe(200);
    });

    it("振り分けルールの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("bracket_rules", "select", { data: { id: "br1", deleted_at: recentDelete } });
      mockResult("bracket_rules", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/bracket-rules/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/bracket-rules/br1/restore");
      const res = await PATCH(req, createParams({ id: "br1" }));
      expect(res.status).toBe(200);
    });

    it("注意書きの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("form_notices", "select", { data: { id: "n1", deleted_at: recentDelete } });
      mockResult("form_notices", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/form-config/notices/[id]/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/form-config/notices/n1/restore");
      const res = await PATCH(req, createParams({ id: "n1" }));
      expect(res.status).toBe(200);
    });

    it("カスタムフィールドの削除取消ができる", async () => {
      const recentDelete = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      mockResult("custom_field_defs", "select", { data: { id: "cf1", deleted_at: recentDelete } });
      mockResult("custom_field_defs", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/form-config/custom-fields/restore/route");
      const req = createAdminRequest("PATCH", "/api/admin/form-config/custom-fields/restore", {
        body: { form_config_id: "fc1", field_key: "custom_abc" },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
    });
  });

  // ── 即時削除（expire） ──

  describe("PATCH expire（今すぐ消す）", () => {
    it("道場のexpireができる", async () => {
      mockResult("dojos", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/dojos/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/dojos/d1/expire");
      const res = await PATCH(req, createParams({ id: "d1" }));
      expect(res.status).toBe(200);
    });

    it("ルールのexpireができる", async () => {
      mockResult("rules", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/rules/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/rules/r1/expire");
      const res = await PATCH(req, createParams({ id: "r1" }));
      expect(res.status).toBe(200);
    });

    it("イベントのexpireができる", async () => {
      mockResult("events", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/events/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/events/ev1/expire");
      const res = await PATCH(req, createParams({ id: "ev1" }));
      expect(res.status).toBe(200);
    });

    it("トーナメントのexpireができる", async () => {
      mockResult("tournaments", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/tournaments/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1/expire");
      const res = await PATCH(req, createParams({ id: "t1" }));
      expect(res.status).toBe(200);
    });

    it("エントリーのexpireができる", async () => {
      mockResult("entries", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/entries/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/entries/e1/expire");
      const res = await PATCH(req, createParams({ id: "e1" }));
      expect(res.status).toBe(200);
    });

    it("タイマープリセットのexpireができる", async () => {
      mockResult("timer_presets", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/timer-presets/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/timer-presets/p1/expire");
      const res = await PATCH(req, createParams({ id: "p1" }));
      expect(res.status).toBe(200);
    });

    it("振り分けルールのexpireができる", async () => {
      mockResult("bracket_rules", "update", { data: null });
      const { PATCH } = await import("@/app/api/admin/bracket-rules/[id]/expire/route");
      const req = createAdminRequest("PATCH", "/api/admin/bracket-rules/br1/expire");
      const res = await PATCH(req, createParams({ id: "br1" }));
      expect(res.status).toBe(200);
    });
  });
});
