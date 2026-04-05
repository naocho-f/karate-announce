import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/** POST — カスタムブザー音源アップロード */
export async function POST(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Use mp3, wav, or ogg." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 2MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "mp3";
  const storagePath = `timer-buzzer/${id}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("form-notice-images") // 既存バケットを再利用
    .upload(storagePath, buf, { contentType: file.type, upsert: true });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage
    .from("form-notice-images")
    .getPublicUrl(storagePath);

  const { error: updateErr } = await supabaseAdmin
    .from("timer_presets")
    .update({ buzzer_sound: "custom", buzzer_custom_path: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ url: urlData.publicUrl }, { status: 201 });
}

/** DELETE — カスタムブザー音源削除 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;

  // プリセットのパスを取得して Storage から削除
  const { data: preset } = await supabaseAdmin
    .from("timer_presets")
    .select("buzzer_custom_path")
    .eq("id", id)
    .single();

  if (preset?.buzzer_custom_path) {
    // URLからパスを抽出
    const url = new URL(preset.buzzer_custom_path);
    const pathMatch = url.pathname.match(/\/object\/public\/form-notice-images\/(.+)/);
    if (pathMatch) {
      await supabaseAdmin.storage.from("form-notice-images").remove([pathMatch[1]]);
    }
  }

  const { error } = await supabaseAdmin
    .from("timer_presets")
    .update({ buzzer_sound: "mid-square-single", buzzer_custom_path: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
