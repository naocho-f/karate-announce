import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
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
  const { id } = await params;
  const body = await request.json() as {
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

  switch (body.action) {
    case "start":
      return handleStart(id, body, supabaseAdmin);
    case "set_winner":
      return handleSetWinner(id, body, supabaseAdmin);
    case "replace":
      return handleReplace(id, body, supabaseAdmin);
    case "edit":
      return handleEdit(id, body, supabaseAdmin);
    case "correct_winner":
      return handleCorrectWinner(id, body, supabaseAdmin);
    case "finish_timer":
      return handleFinishTimer(id, body, supabaseAdmin);
    case "swap_with":
      return handleSwapWith(id, body, supabaseAdmin);
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
