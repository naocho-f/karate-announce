import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/** GET — テナントのカスタム音源一覧 */
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const { data: tenant } = await supabaseAdmin.from("tenants").select("id").limit(1).single();
  if (!tenant) return dbError(null, "テナントが見つかりません", 500);

  const { data, error } = await supabaseAdmin
    .from("tenant_custom_sounds")
    .select("id, name, file_url, file_size, mime_type, created_at")
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return dbError(error);
  return NextResponse.json(data);
}

/** POST — カスタム音源アップロード */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || null;
  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Use mp3, wav, or ogg." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 2MB." }, { status: 400 });
  }

  const { data: tenant } = await supabaseAdmin.from("tenants").select("id").limit(1).single();
  if (!tenant) return dbError(null, "テナントが見つかりません", 500);

  const ext = file.name.split(".").pop() || "mp3";
  const displayName = name || file.name.replace(/\.[^.]+$/, "");
  const storagePath = `custom-sounds/${tenant.id}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("form-notice-images")
    .upload(storagePath, buf, { contentType: file.type, upsert: true });
  if (uploadErr) return dbError(uploadErr);

  const { data: urlData } = supabaseAdmin.storage.from("form-notice-images").getPublicUrl(storagePath);

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("tenant_custom_sounds")
    .insert({
      tenant_id: tenant.id,
      name: displayName,
      file_url: urlData.publicUrl,
      file_size: file.size,
      mime_type: file.type,
    })
    .select("id, name, file_url, file_size, mime_type, created_at")
    .single();
  if (insertErr) return dbError(insertErr);

  return NextResponse.json(inserted, { status: 201 });
}
