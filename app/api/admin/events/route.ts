import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { FIELD_POOL } from "@/lib/form-fields";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { name, event_date, court_count, court_names, rule_ids, copy_from_event_id, copy_entries } = await request.json();

  // 過去日付のバリデーション（新規作成時のみ）
  if (event_date && !copy_from_event_id) {
    const today = new Date().toISOString().slice(0, 10);
    if (event_date < today) {
      return NextResponse.json({ error: "過去の日付では作成できません" }, { status: 400 });
    }
  }

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

  // 失敗時に作成済みイベントと関連データを削除するクリーンアップ関数
  async function cleanupNewEvent() {
    // 関連テーブルを子→親の順で削除
    const { data: configs } = await supabaseAdmin.from("form_configs").select("id").eq("event_id", newEvent.id);
    if (configs?.length) {
      const configIds = configs.map((c) => c.id);
      const { data: notices } = await supabaseAdmin.from("form_notices").select("id").in("form_config_id", configIds);
      if (notices?.length) {
        await supabaseAdmin.from("form_notice_images").delete().in("notice_id", notices.map((n) => n.id));
        await supabaseAdmin.from("form_notices").delete().in("form_config_id", configIds);
      }
      await supabaseAdmin.from("form_field_configs").delete().in("form_config_id", configIds);
      await supabaseAdmin.from("form_configs").delete().eq("event_id", newEvent.id);
    }
    const { data: entries } = await supabaseAdmin.from("entries").select("id").eq("event_id", newEvent.id);
    if (entries?.length) {
      await supabaseAdmin.from("entry_rules").delete().in("entry_id", entries.map((e) => e.id));
      await supabaseAdmin.from("entries").delete().eq("event_id", newEvent.id);
    }
    await supabaseAdmin.from("event_rules").delete().eq("event_id", newEvent.id);
    await supabaseAdmin.from("events").delete().eq("id", newEvent.id);
  }

  try {
    // 2. ルール紐づけをコピー
    const { data: sourceRules } = await supabaseAdmin
      .from("event_rules")
      .select("rule_id")
      .eq("event_id", source.id);
    if (sourceRules?.length) {
      const { error } = await supabaseAdmin.from("event_rules").insert(
        sourceRules.map((r) => ({ event_id: newEvent.id, rule_id: r.rule_id }))
      );
      if (error) throw new Error(`ルール紐づけのコピーに失敗: ${error.message}`);
    }

    // 3. フォーム設定をコピー
    const { data: sourceConfig } = await supabaseAdmin
      .from("form_configs")
      .select("id")
      .eq("event_id", source.id)
      .maybeSingle();

    if (sourceConfig) {
      const { data: newConfig, error: cfgErr } = await supabaseAdmin
        .from("form_configs")
        .insert({ event_id: newEvent.id })
        .select()
        .single();
      if (cfgErr || !newConfig) throw new Error(`フォーム設定の作成に失敗: ${cfgErr?.message}`);

      // フィールド設定をコピー
      const { data: sourceFields } = await supabaseAdmin
        .from("form_field_configs")
        .select("*")
        .eq("form_config_id", sourceConfig.id)
        .order("sort_order");

      if (sourceFields?.length) {
        const { error } = await supabaseAdmin.from("form_field_configs").insert(
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
        if (error) throw new Error(`フィールド設定のコピーに失敗: ${error.message}`);
      } else {
        // ソースにフィールド設定がない場合はデフォルトで初期化
        const { error } = await supabaseAdmin.from("form_field_configs").insert(
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
        if (error) throw new Error(`デフォルトフィールド設定の作成に失敗: ${error.message}`);
      }

      // 注意書きをコピー（画像参照も含む）
      const { data: sourceNotices } = await supabaseAdmin
        .from("form_notices")
        .select("*, images:form_notice_images(*)")
        .eq("form_config_id", sourceConfig.id)
        .order("sort_order");

      if (sourceNotices?.length) {
        for (const notice of sourceNotices) {
          const { data: newNotice, error: noticeErr } = await supabaseAdmin
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
          if (noticeErr) throw new Error(`注意書きのコピーに失敗: ${noticeErr.message}`);

          if (newNotice && notice.images?.length) {
            const { error } = await supabaseAdmin.from("form_notice_images").insert(
              notice.images.map((img: { storage_path: string; sort_order: number }) => ({
                notice_id: newNotice.id,
                storage_path: img.storage_path,
                sort_order: img.sort_order,
              }))
            );
            if (error) throw new Error(`注意書き画像のコピーに失敗: ${error.message}`);
          }
        }
      }
    }

    // 3.5. カスタムフィールド定義をコピー
    if (sourceConfig) {
      const { data: sourceCustomFields } = await supabaseAdmin
        .from("custom_field_defs")
        .select("*")
        .eq("form_config_id", sourceConfig.id);
      if (sourceCustomFields?.length) {
        const newConfigId = (await supabaseAdmin.from("form_configs").select("id").eq("event_id", newEvent.id).single()).data?.id;
        if (newConfigId) {
          const { error } = await supabaseAdmin.from("custom_field_defs").insert(
            sourceCustomFields.map((cf) => ({
              form_config_id: newConfigId,
              field_key: cf.field_key,
              label: cf.label,
              field_type: cf.field_type,
              choices: cf.choices,
              sort_order: cf.sort_order,
            }))
          );
          if (error) throw new Error(`カスタムフィールド定義のコピーに失敗: ${error.message}`);
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
          const { data: newEntry, error: entryErr } = await supabaseAdmin
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
          if (entryErr) throw new Error(`エントリーのコピーに失敗: ${entryErr.message}`);

          // entry_rules もコピー
          if (newEntry) {
            const { data: entryRules } = await supabaseAdmin
              .from("entry_rules")
              .select("rule_id")
              .eq("entry_id", entry.id);
            if (entryRules?.length) {
              const { error } = await supabaseAdmin.from("entry_rules").insert(
                entryRules.map((r) => ({ entry_id: newEntry.id, rule_id: r.rule_id }))
              );
              if (error) throw new Error(`エントリールールのコピーに失敗: ${error.message}`);
            }
          }
        }
      }
    }
  } catch (err) {
    await cleanupNewEvent();
    const message = err instanceof Error ? err.message : "複製中に予期しないエラーが発生しました";
    return NextResponse.json({ error: `複製に失敗しました: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ id: newEvent.id });
}
