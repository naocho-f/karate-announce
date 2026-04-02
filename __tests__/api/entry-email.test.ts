/**
 * 確認メール送信テスト
 *
 * エントリー送信時に Resend 経由で確認メールが送信されることを検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createRequest,
  resetAll,
} from "../helpers/supabase-mock";

const mockSend = vi.fn().mockResolvedValue({ data: { id: "msg-1" }, error: null });
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

describe("確認メール送信", () => {
  beforeEach(() => {
    resetAll();
    mockSend.mockClear();
  });

  it("エントリー送信時に確認メールが送信される", async () => {
    // 受付チェック
    mockResult("events", "select", {
      data: { entry_closed: false, entry_close_at: null },
    });
    // エントリー挿入
    mockResult("entries", "insert", { data: { id: "new-entry" } });
    // sendConfirmationEmail 内のクエリ
    mockResult("events", "select", {
      data: {
        name: "テスト大会",
        event_date: "2026-04-10",
        venue_info: "テスト会場",
        email_subject_template: null,
        email_body_template: null,
        notification_emails: ["admin@example.com"],
      },
    });
    mockResult("rules", "select", { data: [] });
    mockResult("form_field_configs", "select", { data: [] });
    mockResult("custom_field_defs", "select", { data: [] });

    const { POST } = await import("@/app/api/public/entry/route");
    const req = createRequest("POST", "/api/public/entry", {
      body: {
        entry: {
          event_id: "ev1",
          family_name: "田中",
          given_name: "太郎",
          extra_fields: { email: "test@example.com" },
        },
        school_name: null,
        rule_ids: [],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // 非同期メール送信を待つ
    await new Promise((r) => setTimeout(r, 100));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: "test@example.com",
      bcc: ["admin@example.com"],
    }));
  });
});
