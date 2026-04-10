import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

const ALLOWED_VOICES = ["alloy", "echo", "fable", "nova", "onyx", "shimmer"];

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return unauthorized();
  const { text, voice, speed } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const safeVoice = ALLOWED_VOICES.includes(voice) ? voice : "nova";
  const safeSpeed = typeof speed === "number" && speed >= 0.25 && speed <= 4.0 ? speed : 1.0;

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", voice: safeVoice, input: text, speed: safeSpeed }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
}
