import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Validate file content by checking magic number bytes */
function validateMagicNumber(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "image/png";
  // WebP: RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
  return null;
}

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

  // Server-side magic number validation (client-provided file.type can be spoofed)
  const detectedType = validateMagicNumber(buffer);
  if (!detectedType || !ALLOWED_TYPES.includes(detectedType)) {
    return NextResponse.json(
      { error: "ファイルの内容が許可された画像形式（JPEG, PNG, WebP）と一致しません" },
      { status: 400 }
    );
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from("form-notice-images")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return dbError(uploadError);
  }

  const { data, error } = await supabaseAdmin
    .from("form_notice_images")
    .insert({ notice_id: noticeId, storage_path: storagePath, sort_order: sortOrder })
    .select()
    .single();

  if (error) return dbError(error);

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
