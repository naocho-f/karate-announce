import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "JPEG, PNG, WebP のみ" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "5MB以下にしてください" }, { status: 400 });

  // 既存バナー削除
  const { data: ev } = await supabaseAdmin.from("events").select("banner_image_path").eq("id", id).single();
  if (ev?.banner_image_path) {
    await supabaseAdmin.storage.from("form-notice-images").remove([ev.banner_image_path]);
  }

  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `event-banners/${id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("form-notice-images")
    .upload(storagePath, buffer, { contentType: file.type });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  await supabaseAdmin.from("events").update({ banner_image_path: storagePath }).eq("id", id);

  const { data: urlData } = supabaseAdmin.storage.from("form-notice-images").getPublicUrl(storagePath);
  return NextResponse.json({ path: storagePath, public_url: urlData.publicUrl });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  const { data: ev } = await supabaseAdmin.from("events").select("banner_image_path").eq("id", id).single();
  if (ev?.banner_image_path) {
    await supabaseAdmin.storage.from("form-notice-images").remove([ev.banner_image_path]);
  }
  await supabaseAdmin.from("events").update({ banner_image_path: null }).eq("id", id);
  return NextResponse.json({ ok: true });
}
