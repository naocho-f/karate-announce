import { describe, it, expect, vi } from "vitest";
import { dbError } from "@/lib/api-utils";

describe("dbError", () => {
  it("デフォルトの汎用メッセージを返す", async () => {
    const res = dbError({ message: "duplicate key violation" });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("サーバーエラーが発生しました");
  });

  it("カスタムフォールバックメッセージを返す", async () => {
    const res = dbError({ message: "some db error" }, "アップロードに失敗しました");
    const json = await res.json();
    expect(json.error).toBe("アップロードに失敗しました");
  });

  it("カスタムステータスコードを返す", async () => {
    const res = dbError(null, "見つかりません", 404);
    expect(res.status).toBe(404);
  });

  it("エラーメッセージをコンソールにログ出力する", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    dbError({ message: "constraint violation" });
    expect(spy).toHaveBeenCalledWith("[API Error]", "constraint violation");
    spy.mockRestore();
  });

  it("null エラーでもクラッシュしない", async () => {
    const res = dbError(null);
    expect(res.status).toBe(500);
  });
});
