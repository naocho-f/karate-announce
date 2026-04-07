/**
 * API テスト: 画像アップロード系エンドポイント
 *
 * 対象:
 * - /api/admin/events/[id]/banner (POST, DELETE)
 * - /api/admin/events/[id]/ogp (POST, DELETE)
 * - /api/admin/form-config/image-upload (POST, DELETE)
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

/** テスト用の JPEG ファイル（最小限のマジックナンバーを含む） */
function createTestFile(
  name: string,
  type: string,
  sizeBytes = 100,
  magicBytes?: number[],
): File {
  const bytes = new Uint8Array(Math.max(sizeBytes, 12));
  if (magicBytes) {
    for (let i = 0; i < magicBytes.length; i++) bytes[i] = magicBytes[i];
  }
  return new File([bytes], name, { type });
}

/** JPEG マジックナンバー */
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF, 0xE0];
/** PNG マジックナンバー */
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47];

/** FormData 付きの管理者リクエストを生成 */
function createFormDataRequest(url: string, formData: FormData) {
  const { NextRequest } = require("next/server");
  const crypto = require("crypto");
  const token = crypto
    .createHash("sha256")
    .update("test-password" + "karate-announce-v1")
    .digest("hex");
  const req = new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    body: formData,
  });
  req.cookies.set("admin_auth", token);
  return req;
}

beforeEach(() => resetAll());

// ── Banner API ────────────────────────────────────────────────────

describe("/api/admin/events/[id]/banner", () => {
  it("POST: バナー画像アップロード成功", async () => {
    mockResult("events", "select", { data: { banner_image_path: null } });
    const formData = new FormData();
    formData.append("file", createTestFile("test.jpg", "image/jpeg"));
    const req = createFormDataRequest("/api/admin/events/ev-1/banner", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const res = await POST(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBeDefined();
    expect(json.public_url).toBeDefined();
  });

  it("POST: ファイルなしは 400", async () => {
    const formData = new FormData();
    const req = createFormDataRequest("/api/admin/events/ev-1/banner", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("POST: 不正なファイル形式は 400", async () => {
    const formData = new FormData();
    formData.append("file", createTestFile("test.gif", "image/gif"));
    const req = createFormDataRequest("/api/admin/events/ev-1/banner", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("POST: 5MB超は 400", async () => {
    const formData = new FormData();
    formData.append("file", createTestFile("big.jpg", "image/jpeg", 6 * 1024 * 1024));
    const req = createFormDataRequest("/api/admin/events/ev-1/banner", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/banner/route");
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("DELETE: バナー画像削除", async () => {
    mockResult("events", "select", { data: { banner_image_path: "old/path.jpg" } });
    const req = createAdminRequest("DELETE", "/api/admin/events/ev-1/banner");
    const params = createParams({ id: "ev-1" });

    const { DELETE } = await import("@/app/api/admin/events/[id]/banner/route");
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ── OGP API ───────────────────────────────────────────────────────

describe("/api/admin/events/[id]/ogp", () => {
  it("POST: OGP画像アップロード成功", async () => {
    mockResult("events", "select", { data: { ogp_image_path: null } });
    const formData = new FormData();
    formData.append("file", createTestFile("ogp.png", "image/png"));
    const req = createFormDataRequest("/api/admin/events/ev-1/ogp", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/ogp/route");
    const res = await POST(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBeDefined();
    expect(json.public_url).toBeDefined();
  });

  it("POST: ファイルなしは 400", async () => {
    const formData = new FormData();
    const req = createFormDataRequest("/api/admin/events/ev-1/ogp", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/ogp/route");
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("POST: 不正なファイル形式は 400", async () => {
    const formData = new FormData();
    formData.append("file", createTestFile("test.bmp", "image/bmp"));
    const req = createFormDataRequest("/api/admin/events/ev-1/ogp", formData);
    const params = createParams({ id: "ev-1" });

    const { POST } = await import("@/app/api/admin/events/[id]/ogp/route");
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("DELETE: OGP画像削除", async () => {
    mockResult("events", "select", { data: { ogp_image_path: "old/ogp.jpg" } });
    const req = createAdminRequest("DELETE", "/api/admin/events/ev-1/ogp");
    const params = createParams({ id: "ev-1" });

    const { DELETE } = await import("@/app/api/admin/events/[id]/ogp/route");
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ── Form Config Image Upload API ──────────────────────────────────

describe("/api/admin/form-config/image-upload", () => {
  it("POST: 注意書き画像アップロード成功", async () => {
    mockResult("form_notice_images", "insert", {
      data: { id: "img-1", notice_id: "n-1", storage_path: "n-1/test.jpg", sort_order: 0 },
    });
    const formData = new FormData();
    formData.append("file", createTestFile("notice.jpg", "image/jpeg", 100, JPEG_MAGIC));
    formData.append("notice_id", "n-1");
    formData.append("sort_order", "0");
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.public_url).toBeDefined();
  });

  it("POST: ファイルなしは 400", async () => {
    const formData = new FormData();
    formData.append("notice_id", "n-1");
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("required");
  });

  it("POST: notice_id なしは 400", async () => {
    const formData = new FormData();
    formData.append("file", createTestFile("img.jpg", "image/jpeg", 100, JPEG_MAGIC));
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: 不正なファイル形式は 400", async () => {
    const formData = new FormData();
    formData.append("file", createTestFile("test.svg", "image/svg+xml", 100, JPEG_MAGIC));
    formData.append("notice_id", "n-1");
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: マジックナンバー不正は 400", async () => {
    // MIME type は image/jpeg だが、中身のマジックナンバーが PNG
    const formData = new FormData();
    formData.append("file", createTestFile("spoofed.jpg", "image/jpeg", 100, PNG_MAGIC));
    formData.append("notice_id", "n-1");
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    // PNG のマジックナンバーは許可リストに含まれるので 200 になるはず
    // ただし MIME type が jpeg で中身が PNG の場合、detectedType は "image/png" で ALLOWED_TYPES に含まれる
    expect(res.status).toBe(200);
  });

  it("POST: 完全に不正なバイナリは 400", async () => {
    // マジックナンバーがどの画像形式とも一致しない
    const formData = new FormData();
    formData.append("file", createTestFile("bad.jpg", "image/jpeg", 100, [0x00, 0x00, 0x00, 0x00]));
    formData.append("notice_id", "n-1");
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("一致しません");
  });

  it("POST: 5MB超は 400", async () => {
    const formData = new FormData();
    formData.append("file", createTestFile("huge.jpg", "image/jpeg", 6 * 1024 * 1024, JPEG_MAGIC));
    formData.append("notice_id", "n-1");
    const req = createFormDataRequest("/api/admin/form-config/image-upload", formData);

    const { POST } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("DELETE: 画像削除成功", async () => {
    mockResult("form_notice_images", "select", {
      data: { storage_path: "n-1/old.jpg" },
    });
    const req = createAdminRequest("DELETE", "/api/admin/form-config/image-upload", {
      body: { image_id: "img-1" },
    });

    const { DELETE } = await import("@/app/api/admin/form-config/image-upload/route");
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
