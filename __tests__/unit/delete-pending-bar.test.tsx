/**
 * DeletePendingBar コンポーネントテスト
 * レンダリングロジックの検証（DOM操作はE2Eで確認）
 */
import { describe, it, expect } from "vitest";
import { formatDeleteTime } from "@/lib/soft-delete-shared";

// DeletePendingBar はReactコンポーネントのため、ここでは
// 依存する formatDeleteTime のロジックを検証する。
// コンポーネント自体の表示確認は手動 + E2Eテストで代替。

describe("delete-pending-bar", () => {
  it("formatDeleteTimeが正しい形式を返す（DeletePendingBarで使用）", () => {
    const d = new Date(2026, 3, 15, 9, 30);
    expect(formatDeleteTime(d.toISOString())).toBe("4月15日 9時30分");
  });

  it("深夜0時のフォーマット", () => {
    const d = new Date(2026, 0, 1, 0, 0);
    expect(formatDeleteTime(d.toISOString())).toBe("1月1日 0時00分");
  });
});
