/**
 * アプリケーション共通エラー型。
 * API route の withTenantAuth 等で catch し、statusCode に応じた HTTP レスポンスに変換する。
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "認証が必要です") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "権限がありません") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "見つかりません") {
    super(404, message);
    this.name = "NotFoundError";
  }
}
