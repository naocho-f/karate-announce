/**
 * フォーム設定の共通ユーティリティ
 *
 * 注意書き・画像の削除ロジックを PUT route と DELETE /notices/[id] で共有する。
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * 画像を ID 指定で削除（ストレージ + DB）。冪等（存在しなくてもエラーにしない）。
 */
export async function deleteImageById(imageId: string): Promise<void> {
  const { data: img } = await supabaseAdmin.from("form_notice_images").select("storage_path").eq("id", imageId).maybeSingle();

  if (img) {
    await supabaseAdmin.storage.from("form-notice-images").remove([img.storage_path]);
    await supabaseAdmin.from("form_notice_images").delete().eq("id", imageId);
  }
}

/**
 * 注意書きを削除（紐づく画像のストレージ削除 + DB 削除をカスケード）。
 */
export async function deleteNoticeWithImages(noticeId: string): Promise<void> {
  const { data: images } = await supabaseAdmin.from("form_notice_images").select("storage_path").eq("notice_id", noticeId);

  if (images?.length) {
    await supabaseAdmin.storage.from("form-notice-images").remove(images.map((img) => img.storage_path));
  }

  await supabaseAdmin.from("form_notices").delete().eq("id", noticeId);
}
