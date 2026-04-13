/**
 * soft-delete.ts ユニットテスト
 * restoreRecord / expireRecord のロジック検証
 * （API統合テストは __tests__/api/soft-delete.test.ts で実施）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase モック
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function mockChain(selectData: unknown, updateError: unknown = null) {
  const updateChain = {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({ error: updateError }),
      }),
    }),
  };
  const selectChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: selectData, error: null }),
        }),
      }),
    }),
    ...updateChain,
  };
  mockFrom.mockReturnValue(selectChain);
  return selectChain;
}

describe("soft-delete", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
  });

  describe("restoreRecord", () => {
    it("deleted_atが未来のレコードを復元できる（200）", async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      mockChain({ id: "test-1", deleted_at: futureDate });
      const { restoreRecord } = await import("@/lib/soft-delete");
      const res = await restoreRecord("dojos", "test-1");
      expect(res.status).toBe(200);
    });

    it("deleted_atが過去のレコードは復元できない（404）", async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      mockChain({ id: "test-1", deleted_at: pastDate });
      const { restoreRecord } = await import("@/lib/soft-delete");
      const res = await restoreRecord("dojos", "test-1");
      expect(res.status).toBe(404);
    });

    it("存在しないレコードは404", async () => {
      mockChain(null);
      const { restoreRecord } = await import("@/lib/soft-delete");
      const res = await restoreRecord("dojos", "not-exist");
      expect(res.status).toBe(404);
    });
  });

  describe("expireRecord", () => {
    it("deleted_atを現在時刻に更新して200を返す", async () => {
      mockChain(null);
      const { expireRecord } = await import("@/lib/soft-delete");
      const res = await expireRecord("dojos", "test-1");
      expect(res.status).toBe(200);
    });
  });
});
