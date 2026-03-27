/**
 * API テスト: /api/admin/form-config 系
 *
 * 対象:
 * - /api/admin/form-config (GET, PUT, PATCH)
 * - /api/admin/form-config/copy (POST)
 * - /api/admin/form-config/notices (POST)
 * - /api/admin/form-config/notices/[id] (PATCH, DELETE)
 * - /api/admin/form-config/custom-fields (POST, DELETE)
 * - /api/admin/form-config/custom-fields/duplicate (POST)
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

// ── /api/admin/form-config ──

describe("/api/admin/form-config GET", () => {
  beforeEach(() => resetAll());

  it("event_id 未指定で 400", async () => {
    const { GET } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("GET", "/api/admin/form-config");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("既存の form_config がある場合に設定を返す", async () => {
    mockResult("form_configs", "select", {
      data: { id: "fc1", event_id: "ev1", version: 1 },
    });
    mockResult("form_field_configs", "select", {
      data: [{ id: "ff1", field_key: "full_name", visible: true }],
    });
    mockResult("form_notices", "select", { data: [] });
    mockResult("custom_field_defs", "select", { data: [] });
    const { GET } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("GET", "/api/admin/form-config?event_id=ev1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config).toBeTruthy();
    expect(json.fields).toBeInstanceOf(Array);
  });

  it("form_config がない場合に初期化して返す", async () => {
    // maybeSingle → null（未存在）
    mockResult("form_configs", "select", { data: null });
    // 初期化 insert
    mockResult("form_configs", "insert", {
      data: { id: "fc-new", event_id: "ev1", version: 0, is_ready: false },
    });
    mockResult("form_field_configs", "select", { data: [] });
    mockResult("form_notices", "select", { data: [] });
    mockResult("custom_field_defs", "select", { data: [] });
    const { GET } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("GET", "/api/admin/form-config?event_id=ev1");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/form-config PUT", () => {
  beforeEach(() => resetAll());

  it("config_id 未指定で 400", async () => {
    const { PUT } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("PUT", "/api/admin/form-config", {
      body: {},
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("フォーム設定を一括更新できる", async () => {
    const { PUT } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("PUT", "/api/admin/form-config", {
      body: {
        config_id: "fc1",
        is_ready: true,
        fields: [
          { id: "ff1", visible: true, required: true, sort_order: 0, has_other_option: false, custom_choices: null },
        ],
      },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

describe("/api/admin/form-config PATCH", () => {
  beforeEach(() => resetAll());

  it("フォーム公開（version インクリメント）", async () => {
    mockResult("form_configs", "select", { data: { version: 2 } });
    const { PATCH } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("PATCH", "/api/admin/form-config", {
      body: { config_id: "fc1" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe(3);
  });

  it("存在しない config_id で 404", async () => {
    mockResult("form_configs", "select", { data: null });
    const { PATCH } = await import("@/app/api/admin/form-config/route");
    const req = createAdminRequest("PATCH", "/api/admin/form-config", {
      body: { config_id: "nonexist" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });
});

// ── /api/admin/form-config/copy ──

describe("/api/admin/form-config/copy", () => {
  beforeEach(() => resetAll());

  it("POST: パラメータ不足で 400", async () => {
    const { POST } = await import("@/app/api/admin/form-config/copy/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/copy", {
      body: { source_event_id: "ev1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: ソースが見つからない場合 404", async () => {
    mockResult("form_configs", "select", { data: null });
    const { POST } = await import("@/app/api/admin/form-config/copy/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/copy", {
      body: { source_event_id: "ev1", target_config_id: "fc2" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("POST: フォーム設定をコピーできる", async () => {
    mockResult("form_configs", "select", { data: { id: "fc-src" } });
    mockResult("form_field_configs", "select", { data: [] });
    mockResult("form_notices", "select", { data: [] });
    const { POST } = await import("@/app/api/admin/form-config/copy/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/copy", {
      body: { source_event_id: "ev1", target_config_id: "fc2" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ── /api/admin/form-config/notices ──

describe("/api/admin/form-config/notices", () => {
  beforeEach(() => resetAll());

  it("POST: 注意書きを追加できる", async () => {
    mockResult("form_notices", "insert", {
      data: { id: "n1", form_config_id: "fc1", text_content: "テスト注意" },
    });
    const { POST } = await import("@/app/api/admin/form-config/notices/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/notices", {
      body: { form_config_id: "fc1", text_content: "テスト注意" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/form-config/notices/[id] ──

describe("/api/admin/form-config/notices/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: 注意書きを更新できる", async () => {
    mockResult("form_notices", "update", {
      data: { id: "n1", text_content: "更新後" },
    });
    const { PATCH } = await import("@/app/api/admin/form-config/notices/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/form-config/notices/n1", {
      body: { text_content: "更新後" },
    });
    const res = await PATCH(req, createParams({ id: "n1" }));
    expect(res.status).toBe(200);
  });

  it("DELETE: 注意書きを削除できる（画像なし）", async () => {
    mockResult("form_notice_images", "select", { data: [] });
    const { DELETE } = await import("@/app/api/admin/form-config/notices/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/form-config/notices/n1");
    const res = await DELETE(req, createParams({ id: "n1" }));
    expect(res.status).toBe(200);
  });

  it("DELETE: 注意書きを削除（画像あり）", async () => {
    mockResult("form_notice_images", "select", {
      data: [{ storage_path: "path/to/img.jpg" }],
    });
    const { DELETE } = await import("@/app/api/admin/form-config/notices/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/form-config/notices/n1");
    const res = await DELETE(req, createParams({ id: "n1" }));
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/form-config/custom-fields ──

describe("/api/admin/form-config/custom-fields", () => {
  beforeEach(() => resetAll());

  it("POST: パラメータ不足で 400", async () => {
    const { POST } = await import("@/app/api/admin/form-config/custom-fields/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/custom-fields", {
      body: { form_config_id: "fc1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: カスタムフィールドを追加できる", async () => {
    mockResult("form_field_configs", "select", { data: { sort_order: 5 } });
    mockResult("custom_field_defs", "insert", {
      data: { id: "cfd1", field_key: "custom_abc", label: "テスト項目" },
    });
    mockResult("form_field_configs", "insert", {
      data: { id: "ffc1", field_key: "custom_abc" },
    });
    const { POST } = await import("@/app/api/admin/form-config/custom-fields/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/custom-fields", {
      body: { form_config_id: "fc1", label: "テスト項目", field_type: "text" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("DELETE: パラメータ不足で 400", async () => {
    const { DELETE } = await import("@/app/api/admin/form-config/custom-fields/route");
    const req = createAdminRequest("DELETE", "/api/admin/form-config/custom-fields", {
      body: { form_config_id: "fc1" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("DELETE: カスタムフィールドを削除できる", async () => {
    const { DELETE } = await import("@/app/api/admin/form-config/custom-fields/route");
    const req = createAdminRequest("DELETE", "/api/admin/form-config/custom-fields", {
      body: { form_config_id: "fc1", field_key: "custom_abc" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/form-config/custom-fields/duplicate ──

describe("/api/admin/form-config/custom-fields/duplicate", () => {
  beforeEach(() => resetAll());

  it("POST: パラメータ不足で 400", async () => {
    const { POST } = await import("@/app/api/admin/form-config/custom-fields/duplicate/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/custom-fields/duplicate", {
      body: { form_config_id: "fc1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: ソースが見つからない場合 404", async () => {
    mockResult("custom_field_defs", "select", { data: null });
    const { POST } = await import("@/app/api/admin/form-config/custom-fields/duplicate/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/custom-fields/duplicate", {
      body: { form_config_id: "fc1", source_field_key: "custom_xyz" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("POST: カスタムフィールドを複製できる", async () => {
    mockResult("custom_field_defs", "select", {
      data: { id: "cfd1", field_key: "custom_abc", label: "テスト", field_type: "text", choices: null },
    });
    mockResult("form_field_configs", "select", {
      data: { visible: true, required: false, has_other_option: false, custom_choices: null, sort_order: 5 },
    });
    mockResult("custom_field_defs", "insert", {
      data: { id: "cfd2", field_key: "custom_new", label: "テスト（コピー）" },
    });
    mockResult("form_field_configs", "insert", {
      data: { id: "ffc2", field_key: "custom_new" },
    });
    const { POST } = await import("@/app/api/admin/form-config/custom-fields/duplicate/route");
    const req = createAdminRequest("POST", "/api/admin/form-config/custom-fields/duplicate", {
      body: { form_config_id: "fc1", source_field_key: "custom_abc" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ── /api/admin/form-config/image-upload ──

describe("/api/admin/form-config/image-upload", () => {
  beforeEach(() => resetAll());

  it("DELETE: 画像を削除できる", async () => {
    mockResult("form_notice_images", "select", {
      data: { storage_path: "path/to/img.jpg" },
    });
    const { DELETE } = await import("@/app/api/admin/form-config/image-upload/route");
    const req = createAdminRequest("DELETE", "/api/admin/form-config/image-upload", {
      body: { image_id: "img1" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});
