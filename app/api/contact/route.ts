import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { submitInquiry } from "@/lib/services/contact-service";

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  if (typeof payload.hp === "string" && payload.hp.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = request.headers.get("user-agent") || null;

  const result = await submitInquiry({
    name: typeof payload.name === "string" ? payload.name : null,
    email: typeof payload.email === "string" ? payload.email : null,
    subject: typeof payload.subject === "string" ? payload.subject : null,
    body: typeof payload.body === "string" ? payload.body : "",
    event_id: typeof payload.event_id === "string" ? payload.event_id : null,
    ip_address: ip,
    user_agent: ua,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
