import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const SALT = "karate-announce-v1";
const COOKIE_NAME = "admin_auth";

export async function POST(request: Request) {
  const body = await request.json();
  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "IDまたはパスワードが違います" }, { status: 401 });
  }

  const { username, password } = body as { username: string; password: string };

  // timingSafeEqual は Buffer 長不一致で例外をスローするため、長さチェックを先に行う
  const pwBuf = Buffer.from(password);
  const expectedBuf = Buffer.from(adminPassword);
  const passwordMatch = pwBuf.length === expectedBuf.length && timingSafeEqual(pwBuf, expectedBuf);

  if (!passwordMatch || username !== adminUsername) {
    return NextResponse.json({ error: "IDまたはパスワードが違います" }, { status: 401 });
  }

  const token = createHash("sha256")
    .update(password + SALT)
    .digest("hex");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8時間
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
