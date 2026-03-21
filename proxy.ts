import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SALT = "karate-announce-v1";
const COOKIE_NAME = "admin_auth";

async function computeToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ログインページ自体はスルー
  if (pathname === "/admin/login") return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD;
  // env 未設定なら保護しない（ローカル開発時）
  if (!password) return NextResponse.next();

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const expectedToken = await computeToken(password);

  if (cookie === expectedToken) return NextResponse.next();

  // 未認証 → ログインページへ
  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
