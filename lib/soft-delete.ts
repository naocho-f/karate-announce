import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";
import { deletedAtNow } from "@/lib/soft-delete-shared";

/**
 * 論理削除されたレコードを復元する。
 * deleted_at が未来（= まだ削除予定状態）の場合のみ復元可能。
 */
export async function restoreRecord(table: string, id: string): Promise<NextResponse> {
  const { data, error: selectError } = await supabaseAdmin
    .from(table)
    .select("id, deleted_at")
    .eq("id", id)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (selectError) return dbError(selectError);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deletedAt = new Date(data.deleted_at).getTime();
  if (deletedAt <= Date.now()) {
    return NextResponse.json({ error: "Restore window expired" }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from(table).update({ deleted_at: null }).eq("id", id);
  if (error) return dbError(error);

  return NextResponse.json({ ok: true });
}

/**
 * 「今すぐ消す」: deleted_at を現在時刻に更新して即座に非表示にする。
 */
export async function expireRecord(table: string, id: string): Promise<NextResponse> {
  const { error } = await supabaseAdmin
    .from(table)
    .update({ deleted_at: deletedAtNow() })
    .eq("id", id)
    .not("deleted_at", "is", null);

  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
