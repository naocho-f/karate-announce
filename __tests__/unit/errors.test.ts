import { describe, it, expect } from "vitest";
import { AppError, UnauthorizedError, ForbiddenError, NotFoundError } from "@/lib/errors";

describe("AppError", () => {
  it("statusCode とメッセージを保持する", () => {
    const err = new AppError(500, "サーバーエラー");
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("サーバーエラー");
    expect(err.name).toBe("AppError");
  });

  it("Error を継承している", () => {
    const err = new AppError(400, "bad");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("UnauthorizedError", () => {
  it("デフォルトメッセージで 401 を返す", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("認証が必要です");
    expect(err.name).toBe("UnauthorizedError");
  });

  it("カスタムメッセージを受け取れる", () => {
    const err = new UnauthorizedError("トークン期限切れ");
    expect(err.message).toBe("トークン期限切れ");
    expect(err.statusCode).toBe(401);
  });
});

describe("ForbiddenError", () => {
  it("デフォルトメッセージで 403 を返す", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("権限がありません");
    expect(err.name).toBe("ForbiddenError");
  });
});

describe("NotFoundError", () => {
  it("デフォルトメッセージで 404 を返す", () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("見つかりません");
    expect(err.name).toBe("NotFoundError");
  });
});
