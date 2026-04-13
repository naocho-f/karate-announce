/**
 * API テスト: /api/admin/custom-sounds 系
 *
 * 対象:
 * - /api/admin/custom-sounds (GET, POST)
 * - /api/admin/custom-sounds/[id] (DELETE)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, mockResult, createAdminRequest, createParams, resetAll } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("/api/admin/custom-sounds", () => {
  beforeEach(() => resetAll());

  it("GET: テナントのカスタム音源一覧を取得できる", async () => {
    mockResult("tenants", "select", { data: { id: "tenant-1" } });
    mockResult("tenant_custom_sounds", "select", {
      data: [
        { id: "s1", name: "大会用ブザー", file_url: "https://example.com/sound1.mp3" },
        { id: "s2", name: "練習用", file_url: "https://example.com/sound2.wav" },
      ],
    });
    const { GET } = await import("@/app/api/admin/custom-sounds/route");
    const req = createAdminRequest("GET", "/api/admin/custom-sounds");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].name).toBe("大会用ブザー");
  });

  it("POST: カスタム音源をアップロードできる", async () => {
    mockResult("tenants", "select", {
      data: { id: "tenant-1" },
    });
    mockResult("tenant_custom_sounds", "insert", {
      data: {
        id: "s-new",
        name: "新規音源",
        file_url: "https://mock.supabase.co/storage/v1/object/public/form-notice-images/custom-sounds/tenant-1/123.mp3",
      },
    });
    const { POST } = await import("@/app/api/admin/custom-sounds/route");

    const formData = new FormData();
    const file = new File([new ArrayBuffer(100)], "test.mp3", { type: "audio/mpeg" });
    formData.append("file", file);
    formData.append("name", "新規音源");

    const req = createAdminRequest("POST", "/api/admin/custom-sounds");
    // FormData を使うリクエストは直接構築
    const formReq = new Request("http://localhost:3000/api/admin/custom-sounds", {
      method: "POST",
      body: formData,
    });
    // admin cookie を引き継ぐ
    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(formReq);
    nextReq.cookies.set("admin_auth", req.cookies.get("admin_auth")?.value ?? "");

    const res = await POST(nextReq);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeTruthy();
    expect(json.file_url).toBeTruthy();
  });
});

describe("/api/admin/custom-sounds/[id]", () => {
  beforeEach(() => resetAll());

  it("DELETE: カスタム音源を削除できる", async () => {
    mockResult("tenant_custom_sounds", "select", {
      data: {
        id: "s1",
        file_url: "https://mock.supabase.co/storage/v1/object/public/form-notice-images/custom-sounds/tenant-1/123.mp3",
      },
    });
    mockResult("tenant_custom_sounds", "delete", { data: null });
    const { DELETE } = await import("@/app/api/admin/custom-sounds/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/custom-sounds/s1");
    const res = await DELETE(req, createParams({ id: "s1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
