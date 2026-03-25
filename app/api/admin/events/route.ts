import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { FIELD_POOL } from "@/lib/form-fields";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { name, event_date, court_count, court_names, rule_ids, copy_from_event_id, copy_entries } = await request.json();

  // ── 通常の新規作成 ──
  if (!copy_from_event_id) {
    const { data: e, error } = await supabaseAdmin
      .from("events")
      .insert({ name, event_date: event_date ?? null, court_count, court_names: court_names ?? null, status: "preparing" })
      .select()
      .single();
    if (error || !e) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

    if (rule_ids && rule_ids.length > 0) {
      await supabaseAdmin.from("event_rules").insert(
        rule_ids.map((rid: string) => ({ event_id: e.id, rule_id: rid }))
      );
    }

    return NextResponse.json({ id: e.id });
  }

  // ── 過去の大会から複製 ──
  const { data: source } = await supabaseAdmin
    .from("events")
    .select("*")
    .eq("id", copy_from_event_id)
    .single();
  if (!source) return NextResponse.json({ error: "コピー元の大会が見つかりません" }, { status: 404 });

  // 1. イベント作成（大会名はリクエストから、それ以外はソースから引き継ぎ）
  const { data: newEvent, error: evErr } = await supabaseAdmin
    .from("events")
    .insert({
      name: name || `${source.name}（コピー）`,
      event_date: event_date ?? null,
      court_count: source.court_count,
      court_names: source.court_names,
      max_weight_diff: source.max_weight_diff,
      max_height_diff: source.max_height_diff,
      status: "preparing",
    })
    .select()
    .single();
  if (evErr || !newEvent) return NextResponse.json({ error: evErr?.message ?? "Failed" }, { status: 500 });

  // 2. ルール紐づけをコピー
  const { data: sourceRules } = await supabaseAdmin
    .from("event_rules")
    .select("rule_id")
    .eq("event_id", source.id);
  if (sourceRules?.length) {
    await supabaseAdmin.from("event_rules").insert(
      sourceRules.map((r) => ({ event_id: newEvent.id, rule_id: r.rule_id }))
    );
  }

  // 3. フォーム設定をコピー
  const { data: sourceConfig } = await supabaseAdmin
    .from("form_configs")
    .select("id")
    .eq("event_id", source.id)
    .maybeSingle();

  if (sourceConfig) {
    // 新イベント用の form_config を作成
    const { data: newConfig } = await supabaseAdmin
      .from("form_configs")
      .insert({ event_id: newEvent.id })
      .select()
      .single();

    if (newConfig) {
      // フィールド設定をコピー
      const { data: sourceFields } = await supabaseAdmin
        .from("form_field_configs")
        .select("*")
        .eq("form_config_id", sourceConfig.id)
        .order("sort_order");

      if (sourceFields?.length) {
        await supabaseAdmin.from("form_field_configs").insert(
          sourceFields.map((f) => ({
            form_config_id: newConfig.id,
            field_key: f.field_key,
            visible: f.visible,
            required: f.required,
            sort_order: f.sort_order,
            has_other_option: f.has_other_option,
            custom_choices: f.custom_choices,
            custom_label: f.custom_label,
          }))
        );
      } else {
        // ソースにフィールド設定がない場合はデフォルトで初期化
        await supabaseAdmin.from("form_field_configs").insert(
          FIELD_POOL.map((f, i) => ({
            form_config_id: newConfig.id,
            field_key: f.key,
            visible: true,
            required: f.defaultRequired,
            sort_order: i,
            has_other_option: f.defaultHasOther ?? false,
            custom_choices: f.defaultChoices ?? null,
            custom_label: f.label,
          }))
        );
      }

      // 注意書きをコピー（画像参照も含む）
      const { data: sourceNotices } = await supabaseAdmin
        .from("form_notices")
        .select("*, images:form_notice_images(*)")
        .eq("form_config_id", sourceConfig.id)
        .order("sort_order");

      if (sourceNotices?.length) {
        for (const notice of sourceNotices) {
          const { data: newNotice } = await supabaseAdmin
            .from("form_notices")
            .insert({
              form_config_id: newConfig.id,
              anchor_type: notice.anchor_type,
              anchor_field_key: notice.anchor_field_key,
              sort_order: notice.sort_order,
              text_content: notice.text_content,
              scrollable_text: notice.scrollable_text,
              link_url: notice.link_url,
              link_label: notice.link_label,
              require_consent: notice.require_consent,
              consent_label: notice.consent_label,
            })
            .select()
            .single();

          if (newNotice && notice.images?.length) {
            await supabaseAdmin.from("form_notice_images").insert(
              notice.images.map((img: { storage_path: string; sort_order: number }) => ({
                notice_id: newNotice.id,
                storage_path: img.storage_path,
                sort_order: img.sort_order,
              }))
            );
          }
        }
      }
    }
  }

  // 4. エントリーをコピー（オプション）
  if (copy_entries) {
    const { data: sourceEntries } = await supabaseAdmin
      .from("entries")
      .select("*")
      .eq("event_id", source.id);

    if (sourceEntries?.length) {
      for (const entry of sourceEntries) {
        const { data: newEntry } = await supabaseAdmin
          .from("entries")
          .insert({
            event_id: newEvent.id,
            family_name: entry.family_name,
            given_name: entry.given_name,
            family_name_reading: entry.family_name_reading,
            given_name_reading: entry.given_name_reading,
            school_name: entry.school_name,
            school_name_reading: entry.school_name_reading,
            dojo_name: entry.dojo_name,
            dojo_name_reading: entry.dojo_name_reading,
            sex: entry.sex,
            weight: entry.weight,
            height: entry.height,
            birth_date: entry.birth_date,
            age: entry.age,
            grade: entry.grade,
            experience: entry.experience,
            memo: entry.memo,
            admin_memo: null,
            is_withdrawn: false,
            is_test: entry.is_test,
            fighter_id: null,
            extra_fields: entry.extra_fields,
            form_version: null,
          })
          .select("id")
          .single();

        // entry_rules もコピー
        if (newEntry) {
          const { data: entryRules } = await supabaseAdmin
            .from("entry_rules")
            .select("rule_id")
            .eq("entry_id", entry.id);
          if (entryRules?.length) {
            await supabaseAdmin.from("entry_rules").insert(
              entryRules.map((r) => ({ entry_id: newEntry.id, rule_id: r.rule_id }))
            );
          }
        }
      }
    }
  }

  return NextResponse.json({ id: newEvent.id });
}
