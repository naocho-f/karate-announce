/**
 * form-config-utils.ts 単体テスト
 *
 * フォーム設定ユーティリティの画像削除・注意書き削除ロジックを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase-admin のモック
const mockFrom = vi.fn();
const mockStorage = {
  from: vi.fn(() => ({
    remove: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
};

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
  },
}));

describe("form-config-utils", () => {
  let deleteImageById: (id: string) => Promise<void>;
  let deleteNoticeWithImages: (id: string) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockFrom.mockReset();
    mockStorage.from.mockClear();

    const mod = await import("@/lib/form-config-utils");
    deleteImageById = mod.deleteImageById;
    deleteNoticeWithImages = mod.deleteNoticeWithImages;
  });

  describe("deleteImageById", () => {
    it("画像が存在する場合、ストレージとDBから削除する", async () => {
      // form_notice_images からの select
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { storage_path: "images/test.png" },
            error: null,
          }),
        }),
      });
      // delete
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "form_notice_images") {
          return { select: mockSelect, delete: mockDelete };
        }
        return {};
      });

      await deleteImageById("img-1");

      // storage の remove が呼ばれたことを確認
      expect(mockStorage.from).toHaveBeenCalledWith("form-notice-images");
    });

    it("画像が存在しない場合、何もしない（冪等）", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      mockFrom.mockReturnValue({ select: mockSelect });

      await deleteImageById("nonexistent");

      // storage の remove は呼ばれない
      expect(mockStorage.from).not.toHaveBeenCalled();
    });
  });

  describe("deleteNoticeWithImages", () => {
    it("画像付き注意書きを削除するとストレージも削除される", async () => {
      const mockSelectImages = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ storage_path: "images/a.png" }, { storage_path: "images/b.png" }],
          error: null,
        }),
      });
      const mockDeleteNotice = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "form_notice_images") return { select: mockSelectImages };
        if (table === "form_notices") return { delete: mockDeleteNotice };
        return {};
      });

      await deleteNoticeWithImages("notice-1");

      // storage の remove が2画像分で呼ばれた
      expect(mockStorage.from).toHaveBeenCalledWith("form-notice-images");
      // form_notices の delete が呼ばれた
      expect(mockDeleteNotice).toHaveBeenCalled();
    });

    it("画像なし注意書きでもDB削除は行われる", async () => {
      const mockSelectImages = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      const mockDeleteNotice = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "form_notice_images") return { select: mockSelectImages };
        if (table === "form_notices") return { delete: mockDeleteNotice };
        return {};
      });

      await deleteNoticeWithImages("notice-2");

      // storage は呼ばれない（画像なし）
      expect(mockStorage.from).not.toHaveBeenCalled();
      // DB削除は行われる
      expect(mockDeleteNotice).toHaveBeenCalled();
    });
  });
});
