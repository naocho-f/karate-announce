import type { NextRequest } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { restoreRecord } from "@/lib/soft-delete";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  return restoreRecord("events", id);
}
