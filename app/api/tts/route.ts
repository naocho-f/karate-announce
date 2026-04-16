import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

const ALLOWED_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
const ALLOWED_MODELS = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"];
const ALLOWED_FORMATS = ["mp3", "opus", "aac"];
const FORMAT_CONTENT_TYPE: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  aac: "audio/aac",
};

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return unauthorized();
  const { text, voice, speed, model, format, instructions } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const safeVoice = ALLOWED_VOICES.includes(voice) ? voice : "nova";
  const safeSpeed = typeof speed === "number" && speed >= 0.25 && speed <= 4.0 ? speed : 1.0;
  const safeModel = ALLOWED_MODELS.includes(model) ? model : "tts-1";
  const safeFormat = ALLOWED_FORMATS.includes(format) ? format : "mp3";

  const body: Record<string, unknown> = {
    model: safeModel,
    voice: safeVoice,
    input: text,
    speed: safeSpeed,
    response_format: safeFormat,
  };
  // instructions は gpt-4o-mini-tts のみ対応
  if (safeModel === "gpt-4o-mini-tts" && typeof instructions === "string" && instructions.trim()) {
    body.instructions = instructions.trim();
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, { headers: { "Content-Type": FORMAT_CONTENT_TYPE[safeFormat] ?? "audio/mpeg" } });
}
