/**
 * API テスト: /api/tts
 */
import { createHash } from "crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// OpenAI API をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("OPENAI_API_KEY", "test-key");
process.env.ADMIN_PASSWORD = "test-password";

const SALT = "karate-announce-v1";
const adminToken = createHash("sha256").update("test-password" + SALT).digest("hex");

/** 管理者認証Cookie付きのリクエストを生成 */
function createAdminTtsRequest(body: unknown) {
  const req = new NextRequest(new URL("http://localhost:3000/api/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  req.cookies.set("admin_auth", adminToken);
  return req;
}

describe("/api/tts", () => {
  let POST: typeof import("@/app/api/tts/route").POST;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    const mod = await import("@/app/api/tts/route");
    POST = mod.POST;
  });

  it("POST: text 未指定で 400 エラー", async () => {
    const req = createAdminTtsRequest({});
    const res = await POST(req as NextRequest);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("text required");
  });

  it("POST: 不正な voice は nova にフォールバック", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    const req = createAdminTtsRequest({ text: "テスト", voice: "invalid-voice", speed: 1.0 });
    await POST(req as NextRequest);

    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.voice).toBe("nova");
  });

  it("POST: speed が範囲外の場合 1.0 にフォールバック", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    const req = createAdminTtsRequest({ text: "テスト", voice: "nova", speed: 999 });
    await POST(req as NextRequest);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.speed).toBe(1.0);
  });

  it("POST: speed が NaN の場合 1.0 にフォールバック", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    const req = createAdminTtsRequest({ text: "テスト", voice: "nova", speed: "not-a-number" });
    await POST(req as NextRequest);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.speed).toBe(1.0);
  });

  it("POST: OpenAI API がエラーを返した場合はそのステータスを返す", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limit exceeded"),
    });

    const req = createAdminTtsRequest({ text: "テスト", voice: "nova", speed: 1.0 });
    const res = await POST(req as NextRequest);

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("Rate limit exceeded");
  });

  it("POST: 正常なリクエストで audio/mpeg を返す", async () => {
    const audioData = new ArrayBuffer(16);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData),
    });

    const req = createAdminTtsRequest({ text: "テスト", voice: "echo", speed: 1.2 });
    const res = await POST(req as NextRequest);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.model).toBe("tts-1");
    expect(fetchBody.voice).toBe("echo");
    expect(fetchBody.speed).toBe(1.2);
    expect(fetchBody.input).toBe("テスト");
  });
});
