import type { NextRequest } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { expireRecord } from "@/lib/soft-delete";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  return expireRecord("bracket_rules", id);
}
