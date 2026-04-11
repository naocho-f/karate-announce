import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { FIELD_POOL } from "@/lib/form-fields";
import { dbError } from "@/lib/api-utils";

// ── ヘルパー: DB操作の共通パターン ──

async function insertOrThrow(table: string, rows: Record<string, unknown>[], errorMsg: string) {
  const { error } = await supabaseAdmin.from(table).insert(rows);
  if (error) {
    console.error("[API Error]", error.message);
    throw new Error(errorMsg);
  }
}

// ── 新規作成（コピーなし） ──

async function createNewEvent(name: string, event_date: string | null, court_count: number, court_names: string[] | null, rule_ids: string[] | null) {
  const { data: e, error } = await supabaseAdmin
    .from("events")
    .insert({ name, event_date: event_date ?? null, court_count, court_names: court_names ?? null, status: "preparing", entry_closed: true })
    .select()
    .single();
  if (error || !e) return dbError(error, "イベントの作成に失敗しました");

  if (rule_ids && rule_ids.length > 0) {
    await supabaseAdmin.from("event_rules").insert(rule_ids.map((rid: string) => ({ event_id: e.id, rule_id: rid })));
  }
  return NextResponse.json({ id: e.id });
}

// ── 複製: ルール紐づけ ──

async function copyEventRules(sourceId: string, newEventId: string) {
  const { data: sourceRules } = await supabaseAdmin.from("event_rules").select("rule_id").eq("event_id", sourceId);
  if (!sourceRules?.length) return;
  await insertOrThrow("event_rules", sourceRules.map((r) => ({ event_id: newEventId, rule_id: r.rule_id })), "ルール紐づけのコピーに失敗しました");
}

// ── 複製: フィールド設定 ──

async function copyFieldConfigs(sourceConfigId: string, newConfigId: string) {
  const { data: sourceFields } = await supabaseAdmin
    .from("form_field_configs").select("*").eq("form_config_id", sourceConfigId).order("sort_order");

  if (sourceFields?.length) {
    await insertOrThrow("form_field_configs", sourceFields.map((f) => ({
      form_config_id: newConfigId, field_key: f.field_key, visible: f.visible, required: f.required,
      sort_order: f.sort_order, has_other_option: f.has_other_option, custom_choices: f.custom_choices, custom_label: f.custom_label,
    })), "フィールド設定のコピーに失敗しました");
  } else {
    await insertOrThrow("form_field_configs", FIELD_POOL.map((f, i) => ({
      form_config_id: newConfigId, field_key: f.key, visible: true, required: f.defaultRequired,
      sort_order: i, has_other_option: f.defaultHasOther ?? false, custom_choices: f.defaultChoices ?? null, custom_label: f.label,
    })), "デフォルトフィールド設定の作成に失敗しました");
  }
}

// ── 複製: 注意書き ──

async function copyNotices(sourceConfigId: string, newConfigId: string) {
  const { data: sourceNotices } = await supabaseAdmin
    .from("form_notices").select("*, images:form_notice_images(*)").eq("form_config_id", sourceConfigId).order("sort_order");
  if (!sourceNotices?.length) return;

  for (const notice of sourceNotices) {
    const { data: newNotice, error: noticeErr } = await supabaseAdmin
      .from("form_notices")
      .insert({
        form_config_id: newConfigId, anchor_type: notice.anchor_type, anchor_field_key: notice.anchor_field_key,
        sort_order: notice.sort_order, text_content: notice.text_content, scrollable_text: notice.scrollable_text,
        link_url: notice.link_url, link_label: notice.link_label, require_consent: notice.require_consent, consent_label: notice.consent_label,
      })
      .select().single();
    if (noticeErr) throw new Error("注意書きのコピーに失敗しました");

    if (newNotice && notice.images?.length) {
      await insertOrThrow("form_notice_images",
        notice.images.map((img: { storage_path: string; sort_order: number }) => ({ notice_id: newNotice.id, storage_path: img.storage_path, sort_order: img.sort_order })),
        "注意書き画像のコピーに失敗しました");
    }
  }
}

// ── 複製: フォーム設定 ──

async function copyFormConfig(sourceId: string, newEventId: string) {
  const { data: sourceConfig } = await supabaseAdmin.from("form_configs").select("id").eq("event_id", sourceId).maybeSingle();
  if (!sourceConfig) return;

  const { data: newConfig, error: cfgErr } = await supabaseAdmin
    .from("form_configs").insert({ event_id: newEventId }).select().single();
  if (cfgErr || !newConfig) throw new Error(`フォーム設定の作成に失敗: ${cfgErr?.message}`);

  await copyFieldConfigs(sourceConfig.id, newConfig.id);
  await copyNotices(sourceConfig.id, newConfig.id);

  // カスタムフィールド定義をコピー
  const { data: sourceCustomFields } = await supabaseAdmin.from("custom_field_defs").select("*").eq("form_config_id", sourceConfig.id);
  if (sourceCustomFields?.length) {
    await insertOrThrow("custom_field_defs", sourceCustomFields.map((cf) => ({
      form_config_id: newConfig.id, field_key: cf.field_key, label: cf.label, field_type: cf.field_type, choices: cf.choices, sort_order: cf.sort_order,
    })), "カスタムフィールド定義のコピーに失敗しました");
  }
}

// ── 複製: エントリー ──

async function copyEntries(sourceId: string, newEventId: string) {
  const { data: sourceEntries } = await supabaseAdmin.from("entries").select("*").eq("event_id", sourceId);
  if (!sourceEntries?.length) return;

  const sourceEntryIds = sourceEntries.map((e) => e.id);
  const { data: allEntryRules } = await supabaseAdmin.from("entry_rules").select("entry_id, rule_id").in("entry_id", sourceEntryIds);
  const entryRulesMap = new Map<string, { rule_id: string }[]>();
  for (const r of allEntryRules ?? []) {
    const list = entryRulesMap.get(r.entry_id) ?? [];
    list.push({ rule_id: r.rule_id });
    entryRulesMap.set(r.entry_id, list);
  }

  for (const entry of sourceEntries) {
    const { data: newEntry, error: entryErr } = await supabaseAdmin.from("entries")
      .insert({
        event_id: newEventId, family_name: entry.family_name, given_name: entry.given_name,
        family_name_reading: entry.family_name_reading, given_name_reading: entry.given_name_reading,
        school_name: entry.school_name, school_name_reading: entry.school_name_reading,
        dojo_name: entry.dojo_name, dojo_name_reading: entry.dojo_name_reading,
        sex: entry.sex, weight: entry.weight, height: entry.height, birth_date: entry.birth_date,
        age: entry.age, grade: entry.grade, experience: entry.experience, memo: entry.memo,
        admin_memo: null, is_withdrawn: false, is_test: entry.is_test, fighter_id: null,
        extra_fields: entry.extra_fields, form_version: null,
      })
      .select("id").single();
    if (entryErr) throw new Error("エントリーのコピーに失敗しました");

    const entryRules = newEntry ? entryRulesMap.get(entry.id) : null;
    if (newEntry && entryRules?.length) {
      await insertOrThrow("entry_rules", entryRules.map((r) => ({ entry_id: newEntry.id, rule_id: r.rule_id })), "エントリールールのコピーに失敗しました");
    }
  }
}

// ── 複製: クリーンアップ ──

async function cleanupNewEvent(newEventId: string) {
  const { data: configs } = await supabaseAdmin.from("form_configs").select("id").eq("event_id", newEventId);
  if (configs?.length) {
    const configIds = configs.map((c) => c.id);
    const { data: notices } = await supabaseAdmin.from("form_notices").select("id").in("form_config_id", configIds);
    if (notices?.length) {
      await supabaseAdmin.from("form_notice_images").delete().in("notice_id", notices.map((n) => n.id));
      await supabaseAdmin.from("form_notices").delete().in("form_config_id", configIds);
    }
    await supabaseAdmin.from("form_field_configs").delete().in("form_config_id", configIds);
    await supabaseAdmin.from("form_configs").delete().eq("event_id", newEventId);
  }
  const { data: entries } = await supabaseAdmin.from("entries").select("id").eq("event_id", newEventId);
  if (entries?.length) {
    await supabaseAdmin.from("entry_rules").delete().in("entry_id", entries.map((e) => e.id));
    await supabaseAdmin.from("entries").delete().eq("event_id", newEventId);
  }
  await supabaseAdmin.from("event_rules").delete().eq("event_id", newEventId);
  await supabaseAdmin.from("events").delete().eq("id", newEventId);
}

// ── 複製メイン ──

async function duplicateEvent(name: string, event_date: string | null, copy_from_event_id: string, copy_entries: boolean) {
  const { data: source } = await supabaseAdmin.from("events").select("*").eq("id", copy_from_event_id).single();
  if (!source) return NextResponse.json({ error: "コピー元の大会が見つかりません" }, { status: 404 });

  const { data: newEvent, error: evErr } = await supabaseAdmin.from("events")
    .insert({
      name: name || `${source.name}（コピー）`, event_date: event_date ?? null,
      court_count: source.court_count, court_names: source.court_names,
      max_weight_diff: source.max_weight_diff, max_height_diff: source.max_height_diff, status: "preparing",
    })
    .select().single();
  if (evErr || !newEvent) return dbError(evErr, "イベントの複製に失敗しました");

  try {
    await copyEventRules(source.id, newEvent.id);
    await copyFormConfig(source.id, newEvent.id);
    if (copy_entries) await copyEntries(source.id, newEvent.id);
  } catch (err) {
    await cleanupNewEvent(newEvent.id);
    const message = err instanceof Error ? err.message : "複製中に予期しないエラーが発生しました";
    return NextResponse.json({ error: `複製に失敗しました: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ id: newEvent.id });
}

// ── メイン POST ──

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { name, event_date, court_count, court_names, rule_ids, copy_from_event_id, copy_entries } = await request.json();

  if (event_date && !copy_from_event_id) {
    const today = new Date().toISOString().slice(0, 10);
    if (event_date < today) {
      return NextResponse.json({ error: "過去の日付では作成できません" }, { status: 400 });
    }
  }

  if (!copy_from_event_id) {
    return createNewEvent(name, event_date, court_count, court_names, rule_ids);
  }

  return duplicateEvent(name, event_date, copy_from_event_id, copy_entries);
}
