import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** POST — 注意書き画像アップロード */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const noticeId = formData.get("notice_id") as string | null;
  const sortOrder = parseInt(formData.get("sort_order") as string || "0", 10);

  if (!file || !noticeId) {
    return NextResponse.json({ error: "file and notice_id required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "JPEG, PNG, WebP のみアップロード可能です" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "ファイルサイズは5MB以下にしてください" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `${noticeId}/${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("form-notice-images")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("form_notice_images")
    .insert({ notice_id: noticeId, storage_path: storagePath, sort_order: sortOrder })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 公開URLを付与
  const { data: urlData } = supabaseAdmin.storage
    .from("form-notice-images")
    .getPublicUrl(storagePath);

  return NextResponse.json({ ...data, public_url: urlData.publicUrl });
}

/** DELETE — 画像削除 */
export async function DELETE(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { image_id } = await request.json();

  const { data: img } = await supabaseAdmin
    .from("form_notice_images")
    .select("storage_path")
    .eq("id", image_id)
    .single();

  if (img) {
    await supabaseAdmin.storage.from("form-notice-images").remove([img.storage_path]);
    await supabaseAdmin.from("form_notice_images").delete().eq("id", image_id);
  }

  return NextResponse.json({ ok: true });
}
