import { describe, it, expect } from "vitest";
import {
  RESTORE_WINDOW_MS,
  isDeletePending,
  isDeleted,
  softDeleteCutoff,
  deletedAtFuture,
  deletedAtNow,
  formatDeleteTime,
} from "@/lib/soft-delete-shared";

describe("soft-delete-shared", () => {
  describe("isDeletePending", () => {
    it("deleted_atがnullなら false", () => {
      expect(isDeletePending({ deleted_at: null })).toBe(false);
    });

    it("deleted_atが未来なら true（削除予定）", () => {
      const future = new Date(Date.now() + 60000).toISOString();
      expect(isDeletePending({ deleted_at: future })).toBe(true);
    });

    it("deleted_atが過去なら false（既に非表示）", () => {
      const past = new Date(Date.now() - 60000).toISOString();
      expect(isDeletePending({ deleted_at: past })).toBe(false);
    });
  });

  describe("isDeleted", () => {
    it("deleted_atがnullなら false", () => {
      expect(isDeleted({ deleted_at: null })).toBe(false);
    });

    it("deleted_atが過去なら true（非表示）", () => {
      const past = new Date(Date.now() - 60000).toISOString();
      expect(isDeleted({ deleted_at: past })).toBe(true);
    });

    it("deleted_atが未来なら false（まだ表示中）", () => {
      const future = new Date(Date.now() + 60000).toISOString();
      expect(isDeleted({ deleted_at: future })).toBe(false);
    });
  });

  describe("softDeleteCutoff", () => {
    it("現在時刻に近いISO文字列を返す", () => {
      const cutoff = softDeleteCutoff();
      const diff = Math.abs(new Date(cutoff).getTime() - Date.now());
      expect(diff).toBeLessThan(1000);
    });
  });

  describe("deletedAtFuture", () => {
    it("現在時刻 + 24時間のISO文字列を返す", () => {
      const future = deletedAtFuture();
      const diff = new Date(future).getTime() - Date.now();
      expect(Math.abs(diff - RESTORE_WINDOW_MS)).toBeLessThan(1000);
    });
  });

  describe("deletedAtNow", () => {
    it("現在時刻に近いISO文字列を返す", () => {
      const now = deletedAtNow();
      const diff = Math.abs(new Date(now).getTime() - Date.now());
      expect(diff).toBeLessThan(1000);
    });
  });

  describe("formatDeleteTime", () => {
    it("日時を「○月○日 ○時○○分」形式でフォーマットする", () => {
      const d = new Date(2026, 3, 13, 15, 5); // 4月13日 15:05
      const result = formatDeleteTime(d.toISOString());
      expect(result).toBe("4月13日 15時05分");
    });
  });
});
