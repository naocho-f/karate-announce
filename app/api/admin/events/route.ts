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

async function createNewEvent(
  name: string,
  event_date: string | null,
  court_count: number,
  court_names: string[] | null,
  rule_ids: string[] | null,
) {
  const { data: e, error } = await supabaseAdmin
    .from("events")
    .insert({
      name,
      event_date: event_date ?? null,
      court_count,
      court_names: court_names ?? null,
      status: "preparing",
      entry_closed: true,
    })
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
  await insertOrThrow(
    "event_rules",
    sourceRules.map((r) => ({ event_id: newEventId, rule_id: r.rule_id })),
    "ルール紐づけのコピーに失敗しました",
  );
}

// ── 複製: フィールド設定 ──

async function copyFieldConfigs(sourceConfigId: string, newConfigId: string) {
  const { data: sourceFields } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", sourceConfigId)
    .order("sort_order");

  if (sourceFields?.length) {
    await insertOrThrow(
      "form_field_configs",
      sourceFields.map((f) => ({
        form_config_id: newConfigId,
        field_key: f.field_key,
        visible: f.visible,
        required: f.required,
        sort_order: f.sort_order,
        has_other_option: f.has_other_option,
        custom_choices: f.custom_choices,
        custom_label: f.custom_label,
      })),
      "フィールド設定のコピーに失敗しました",
    );
  } else {
    await insertOrThrow(
      "form_field_configs",
      FIELD_POOL.map((f, i) => ({
        form_config_id: newConfigId,
        field_key: f.key,
        visible: true,
        required: f.defaultRequired,
        sort_order: i,
        has_other_option: f.defaultHasOther ?? false,
        custom_choices: f.defaultChoices ?? null,
        custom_label: f.label,
      })),
      "デフォルトフィールド設定の作成に失敗しました",
    );
  }
}

// ── 複製: 注意書き ──

async function copyNotices(sourceConfigId: string, newConfigId: string) {
  const { data: sourceNotices } = await supabaseAdmin
    .from("form_notices")
    .select("*, images:form_notice_images(*)")
    .eq("form_config_id", sourceConfigId)
    .order("sort_order");
  if (!sourceNotices?.length) return;

  for (const notice of sourceNotices) {
    const { data: newNotice, error: noticeErr } = await supabaseAdmin
      .from("form_notices")
      .insert({
        form_config_id: newConfigId,
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
    if (noticeErr) throw new Error("注意書きのコピーに失敗しました");

    if (newNotice && notice.images?.length) {
      await insertOrThrow(
        "form_notice_images",
        notice.images.map((img: { storage_path: string; sort_order: number }) => ({
          notice_id: newNotice.id,
          storage_path: img.storage_path,
          sort_order: img.sort_order,
        })),
        "注意書き画像のコピーに失敗しました",
      );
    }
  }
}

// ── 複製: フォーム設定 ──

async function copyFormConfig(sourceId: string, newEventId: string) {
  const { data: sourceConfig } = await supabaseAdmin.from("form_configs").select("id").eq("event_id", sourceId).maybeSingle();
  if (!sourceConfig) return;

  const { data: newConfig, error: cfgErr } = await supabaseAdmin.from("form_configs").insert({ event_id: newEventId }).select().single();
  if (cfgErr || !newConfig) throw new Error(`フォーム設定の作成に失敗: ${cfgErr?.message}`);

  await copyFieldConfigs(sourceConfig.id, newConfig.id);
  await copyNotices(sourceConfig.id, newConfig.id);

  // カスタムフィールド定義をコピー
  const { data: sourceCustomFields } = await supabaseAdmin.from("custom_field_defs").select("*").eq("form_config_id", sourceConfig.id);
  if (sourceCustomFields?.length) {
    await insertOrThrow(
      "custom_field_defs",
      sourceCustomFields.map((cf) => ({
        form_config_id: newConfig.id,
        field_key: cf.field_key,
        label: cf.label,
        field_type: cf.field_type,
        choices: cf.choices,
        sort_order: cf.sort_order,
      })),
      "カスタムフィールド定義のコピーに失敗しました",
    );
  }
}

// ── 複製: 振り分けルール ──

async function copyBracketRules(sourceId: string, newEventId: string) {
  const { data: sourceRules } = await supabaseAdmin.from("bracket_rules").select("*").eq("event_id", sourceId).order("sort_order");
  if (!sourceRules?.length) return;
  await insertOrThrow(
    "bracket_rules",
    sourceRules.map((r) => ({
      event_id: newEventId,
      name: r.name,
      rule_id: r.rule_id,
      min_age: r.min_age,
      max_age: r.max_age,
      min_weight: r.min_weight,
      max_weight: r.max_weight,
      min_height: r.min_height,
      max_height: r.max_height,
      min_grade: r.min_grade,
      max_grade: r.max_grade,
      max_grade_diff: r.max_grade_diff,
      max_weight_diff: r.max_weight_diff,
      max_height_diff: r.max_height_diff,
      sex_filter: r.sex_filter,
      court_num: r.court_num,
      sort_order: r.sort_order,
    })),
    "振り分けルールのコピーに失敗しました",
  );
}

// ── 複製: 対戦者（fighters） ──

async function copyFighters(sourceId: string, newEventId: string): Promise<Map<string, string>> {
  const fighterIdMap = new Map<string, string>();
  const { data: sourceEventFighters } = await supabaseAdmin
    .from("event_fighters")
    .select("fighter_id, seed_number")
    .eq("event_id", sourceId);
  if (!sourceEventFighters?.length) return fighterIdMap;

  const sourceFighterIds = sourceEventFighters.map((ef) => ef.fighter_id);
  const { data: sourceFighters } = await supabaseAdmin.from("fighters").select("*").in("id", sourceFighterIds);
  if (!sourceFighters?.length) return fighterIdMap;

  for (const f of sourceFighters) {
    const { data: newFighter, error: fErr } = await supabaseAdmin
      .from("fighters")
      .insert({
        name: f.name,
        name_reading: f.name_reading,
        dojo_id: f.dojo_id,
        weight: f.weight,
        height: f.height,
        age_info: f.age_info,
        experience: f.experience,
        family_name: f.family_name,
        given_name: f.given_name,
        family_name_reading: f.family_name_reading,
        given_name_reading: f.given_name_reading,
        affiliation: f.affiliation,
        affiliation_reading: f.affiliation_reading,
        extra_fields: f.extra_fields,
      })
      .select("id")
      .single();
    if (fErr || !newFighter) throw new Error("対戦者のコピーに失敗しました");
    fighterIdMap.set(f.id, newFighter.id);
  }

  await insertOrThrow(
    "event_fighters",
    sourceEventFighters.map((ef) => ({
      event_id: newEventId,
      fighter_id: fighterIdMap.get(ef.fighter_id),
      seed_number: ef.seed_number,
    })),
    "対戦者紐づけのコピーに失敗しました",
  );

  const { data: sourceEFRules } = await supabaseAdmin.from("event_fighter_rules").select("*").eq("event_id", sourceId);
  if (sourceEFRules?.length) {
    await insertOrThrow(
      "event_fighter_rules",
      sourceEFRules.map((r) => ({
        event_id: newEventId,
        fighter_id: fighterIdMap.get(r.fighter_id),
        rule_id: r.rule_id,
      })),
      "対戦者ルールのコピーに失敗しました",
    );
  }

  for (const [oldId, newId] of fighterIdMap) {
    await supabaseAdmin.from("entries").update({ fighter_id: newId }).eq("event_id", newEventId).eq("fighter_id", oldId);
  }

  return fighterIdMap;
}

// ── 複製: トーナメント・試合 ──

async function copyTournamentsAndMatches(sourceId: string, newEventId: string) {
  const fighterIdMap = await copyFighters(sourceId, newEventId);

  const { data: sourceTournaments } = await supabaseAdmin.from("tournaments").select("*").eq("event_id", sourceId).order("sort_order");
  if (!sourceTournaments?.length) return;

  for (const t of sourceTournaments) {
    const { data: newTournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .insert({
        event_id: newEventId,
        name: t.name,
        court: t.court,
        status: "preparing",
        default_rules: t.default_rules,
        max_weight_diff: t.max_weight_diff,
        max_height_diff: t.max_height_diff,
        sort_order: t.sort_order,
        type: t.type,
        filter_min_weight: t.filter_min_weight,
        filter_max_weight: t.filter_max_weight,
        filter_min_age: t.filter_min_age,
        filter_max_age: t.filter_max_age,
        filter_sex: t.filter_sex,
        filter_experience: t.filter_experience,
        filter_grade: t.filter_grade,
        filter_min_grade: t.filter_min_grade,
        filter_max_grade: t.filter_max_grade,
        filter_min_height: t.filter_min_height,
        filter_max_height: t.filter_max_height,
      })
      .select("id")
      .single();
    if (tErr || !newTournament) throw new Error("トーナメントのコピーに失敗しました");

    const { data: sourceMatches } = await supabaseAdmin.from("matches").select("*").eq("tournament_id", t.id);
    if (sourceMatches?.length) {
      await insertOrThrow(
        "matches",
        sourceMatches.map((m) => ({
          tournament_id: newTournament.id,
          round: m.round,
          position: m.position,
          fighter1_id: m.fighter1_id ? (fighterIdMap.get(m.fighter1_id) ?? null) : null,
          fighter2_id: m.fighter2_id ? (fighterIdMap.get(m.fighter2_id) ?? null) : null,
          winner_id: null,
          status: "waiting",
          match_label: m.match_label,
          rules: m.rules,
          result_method: null,
          result_detail: null,
        })),
        "試合のコピーに失敗しました",
      );
    }
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
    const { data: newEntry, error: entryErr } = await supabaseAdmin
      .from("entries")
      .insert({
        event_id: newEventId,
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
    if (entryErr) throw new Error("エントリーのコピーに失敗しました");

    const entryRules = newEntry ? entryRulesMap.get(entry.id) : null;
    if (newEntry && entryRules?.length) {
      await insertOrThrow(
        "entry_rules",
        entryRules.map((r) => ({ entry_id: newEntry.id, rule_id: r.rule_id })),
        "エントリールールのコピーに失敗しました",
      );
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
      await supabaseAdmin
        .from("form_notice_images")
        .delete()
        .in(
          "notice_id",
          notices.map((n) => n.id),
        );
      await supabaseAdmin.from("form_notices").delete().in("form_config_id", configIds);
    }
    await supabaseAdmin.from("form_field_configs").delete().in("form_config_id", configIds);
    await supabaseAdmin.from("form_configs").delete().eq("event_id", newEventId);
  }
  // トーナメント・試合の削除
  const { data: tournaments } = await supabaseAdmin.from("tournaments").select("id").eq("event_id", newEventId);
  if (tournaments?.length) {
    const tournamentIds = tournaments.map((t) => t.id);
    await supabaseAdmin.from("matches").delete().in("tournament_id", tournamentIds);
    await supabaseAdmin.from("tournaments").delete().eq("event_id", newEventId);
  }
  // 対戦者の削除
  const { data: eventFighters } = await supabaseAdmin.from("event_fighters").select("fighter_id").eq("event_id", newEventId);
  await supabaseAdmin.from("event_fighter_rules").delete().eq("event_id", newEventId);
  await supabaseAdmin.from("event_fighters").delete().eq("event_id", newEventId);
  if (eventFighters?.length) {
    await supabaseAdmin
      .from("fighters")
      .delete()
      .in(
        "id",
        eventFighters.map((ef) => ef.fighter_id),
      );
  }
  // エントリーの削除
  const { data: entries } = await supabaseAdmin.from("entries").select("id").eq("event_id", newEventId);
  if (entries?.length) {
    await supabaseAdmin
      .from("entry_rules")
      .delete()
      .in(
        "entry_id",
        entries.map((e) => e.id),
      );
    await supabaseAdmin.from("entries").delete().eq("event_id", newEventId);
  }
  await supabaseAdmin.from("bracket_rules").delete().eq("event_id", newEventId);
  await supabaseAdmin.from("event_rules").delete().eq("event_id", newEventId);
  await supabaseAdmin.from("events").delete().eq("id", newEventId);
}

// ── 複製メイン ──

async function duplicateEvent(name: string, event_date: string | null, copy_from_event_id: string, copy_entries: boolean) {
  const { data: source } = await supabaseAdmin.from("events").select("*").eq("id", copy_from_event_id).single();
  if (!source) return NextResponse.json({ error: "コピー元の大会が見つかりません" }, { status: 404 });

  const { data: newEvent, error: evErr } = await supabaseAdmin
    .from("events")
    .insert({
      name: name || `${source.name}（コピー）`,
      event_date: event_date ?? null,
      court_count: source.court_count,
      court_names: source.court_names,
      max_weight_diff: source.max_weight_diff,
      max_height_diff: source.max_height_diff,
      banner_image_path: source.banner_image_path,
      ogp_image_path: source.ogp_image_path,
      email_subject_template: source.email_subject_template,
      email_body_template: source.email_body_template,
      venue_info: source.venue_info,
      notification_emails: source.notification_emails,
      entry_close_at: source.entry_close_at,
      status: "preparing",
    })
    .select()
    .single();
  if (evErr || !newEvent) return dbError(evErr, "イベントの複製に失敗しました");

  try {
    await copyEventRules(source.id, newEvent.id);
    await copyBracketRules(source.id, newEvent.id);
    await copyFormConfig(source.id, newEvent.id);
    if (copy_entries) {
      await copyEntries(source.id, newEvent.id);
      await copyTournamentsAndMatches(source.id, newEvent.id);
    }
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
