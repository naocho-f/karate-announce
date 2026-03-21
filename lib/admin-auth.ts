import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SALT = "karate-announce-v1";
const COOKIE_NAME = "admin_auth";

export function verifyAdminAuth(request: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return true; // ローカル開発: env 未設定なら許可

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return false;

  const expected = createHash("sha256").update(password + SALT).digest("hex");
  return cookie === expected;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
