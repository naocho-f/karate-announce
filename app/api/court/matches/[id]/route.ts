import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { checkIdempotencyKey, saveIdempotencyKey } from "@/lib/idempotency";
import {
  handleStart,
  handleSetWinner,
  handleReplace,
  handleEdit,
  handleCorrectWinner,
  handleFinishTimer,
  handleSwapWith,
} from "./_handlers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();

  // 冪等性キーチェック: 既に処理済みなら前回のレスポンスを返す
  const cached = await checkIdempotencyKey(request);
  if (cached) return cached;

  const { id } = await params;
  const body = (await request.json()) as {
    action: "start" | "set_winner" | "replace" | "edit" | "swap_with" | "correct_winner" | "finish_timer";
    tournamentId?: string;
    winnerId?: string;
    round?: number;
    rounds?: number;
    position?: number;
    slot?: "f1" | "f2";
    newFighterId?: string;
    matchLabel?: string | null;
    rules?: string | null;
    otherMatchId?: string;
    resultMethod?: string | null;
    resultDetail?: Record<string, unknown> | null;
    matchUpdatedAt?: string;
  };

  let response: NextResponse;
  switch (body.action) {
    case "start":
      response = await handleStart(id, body, supabaseAdmin);
      break;
    case "set_winner":
      response = await handleSetWinner(id, body, supabaseAdmin);
      break;
    case "replace":
      response = await handleReplace(id, body, supabaseAdmin);
      break;
    case "edit":
      response = await handleEdit(id, body, supabaseAdmin);
      break;
    case "correct_winner":
      response = await handleCorrectWinner(id, body, supabaseAdmin);
      break;
    case "finish_timer":
      response = await handleFinishTimer(id, body, supabaseAdmin);
      break;
    case "swap_with":
      response = await handleSwapWith(id, body, supabaseAdmin);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // 冪等性キーを保存（成功・失敗を問わず記録）
  const responseBody = await response
    .clone()
    .json()
    .catch(() => null);
  await saveIdempotencyKey(request, response.status, responseBody);

  return response;
}
