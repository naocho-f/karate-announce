import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SALT = "karate-announce-v1";
const COOKIE_NAME = "admin_auth";

let devPasswordWarningLogged = false;

export function verifyAdminAuth(request: NextRequest): boolean {
  let password = process.env.ADMIN_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      console.error("[admin-auth] ADMIN_PASSWORD is not set in production. Rejecting all requests.");
      return false;
    }
    // Development mode: use default dev password
    if (!devPasswordWarningLogged) {
      console.warn(
        "[admin-auth] ADMIN_PASSWORD is not set. Using default dev password 'dev'. Do NOT use in production.",
      );
      devPasswordWarningLogged = true;
    }
    password = "dev";
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return false;

  const expected = createHash("sha256")
    .update(password + SALT)
    .digest("hex");
  return cookie === expected;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
