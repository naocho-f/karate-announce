import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { FIELD_POOL, DEFAULT_CUSTOM_FIELDS } from "@/lib/form-fields";
import { deleteNoticeWithImages, deleteImageById } from "@/lib/form-config-utils";
import { dbError } from "@/lib/api-utils";

// ──────────────────────────────────────────────
// デフォルトフォーム設定（Google Forms の実績フォームを再現）
// ──────────────────────────────────────────────

/** デフォルトの表示順（key → sort_order）。ここにないものは非表示 */
/** デフォルトの表示順（FIELD_POOL由来の固定項目のみ） */
const DEFAULT_FIELD_ORDER: { key: string; visible: boolean }[] = [
  { key: "full_name", visible: true },
  { key: "kana", visible: true },
  { key: "age", visible: true },
  { key: "sex", visible: true },
  { key: "birthday", visible: true },
  { key: "prefecture", visible: true },
  { key: "phone", visible: true },
  { key: "email", visible: true },
  // ↑ ここに承諾書注意書き（form_start ではなく email フィールドに紐づけ）
  { key: "rule_preference", visible: true },
  { key: "height", visible: true },
  { key: "weight", visible: true },
  // ↑ ここに体重注意書き
  { key: "organization", visible: true },
  { key: "organization_kana", visible: true },
  { key: "branch", visible: true },
  { key: "branch_kana", visible: true },
  { key: "martial_arts_experience", visible: true },
  { key: "memo", visible: true },
];

/** デフォルトの自由設問 表示順・表示/非表示設定 */
const DEFAULT_CUSTOM_FIELD_ORDER: { key: string; visible: boolean; required: boolean }[] = [
  { key: "head_butt_preference", visible: true, required: true },
  { key: "match_experience", visible: true, required: true },
  { key: "equipment_owned", visible: true, required: true },
  { key: "shield_mask", visible: true, required: true },
  { key: "fist_guard", visible: true, required: true },
  { key: "leg_guard", visible: true, required: true },
  { key: "groin_guard", visible: true, required: true },
  { key: "gi", visible: true, required: true },
  { key: "belt", visible: false, required: true },
  { key: "desired_match_count", visible: true, required: true },
  { key: "guardian_name", visible: false, required: false },
];

const DEFAULT_SORT_MAP = new Map(DEFAULT_FIELD_ORDER.map((f, i) => [f.key, { sort: i, visible: f.visible }]));

type NoticeTemplate = {
  anchorType: string;
  anchorFieldKey: string | null;
  sortOrder: number;
  textContent: string | null;
  scrollableText: string | null;
  requireConsent: boolean;
  consentLabel: string | null;
};

const CONSENT_SCROLLABLE_TEXT =
  "柔空会　御中\n\n" +
  "私は、交流試合（以下「本会」といいます。）に参加申し込みを行うにあたり、下記の事項を表明し、承諾します。\n\n" +
  "第１、総論\n" +
  "私は、本大会の競技ルール、及び、同ルールによる試合には格闘技として競技者の生命身体に対する多少の危険が伴うことを十分理解し、承諾した上で自己責任により本会に参加申し込みを行います。\n" +
  "すなわち、本会においては、突き・蹴りによる打撃、投げ・及び絞め・関節技があることを理解し、本会の主催者においては一定の部位に対する打撃を禁止し、また頭部・頸椎に障害が生ずるような投げや不可逆的な作用が起こる絞め・関節技などを禁止するなど十分に安全性を図っており、また、進行などにおいて十分配慮をしていることは十分理解しつつも、格闘技の特性上、突発的な危険性が起こる可能性があることを承諾します。\n\n" +
  "第２、各論\n" +
  "１．私は、本会参加前に医師による健康チェックを受け、本会参加に支障がないことを確認します。既往症がある場合は、主催者に事前に申告します。\n" +
  "２．私は、本会中に負傷した場合、主催者の応急処置に従います。\n" +
  "３．私は、主催者の判断による試合の中止、失格等の決定に従います。\n" +
  "４．私は、本会の運営に協力し、他の参加者やスタッフに対して礼儀正しく接します。\n" +
  "５．私は、本会中の写真・動画の撮影および公開について、主催者の方針に従います。";

const WEIGHT_NOTICE_TEXT =
  "申告体重より当日計量でオーバーすると、下記ペナルティーが発生しますので、少し余裕をみて申告ください。\n" +
  "+2.0キロで相手に1P\n" +
  "+2.5キロで相手に2P\n" +
  "+3.0キロで失格\n\n" +
  "※ただし、対戦相手より体重が計量値が軽い場合はペナルティーは有りません。\n\n" +
  "体重をメインとして、年齢、性別、経歴、体格、段級により階級分けをします。\n" +
  "計量は試合に出場する服装（道着着用）にて行うので道着を着用した体重に少し余裕を持った数値で申告。\n" +
  "体重の申告については大会当日の体重を重めに見積もり申告すること。\n\n" +
  "※参加試費の返還はありませんのでくれぐれもご注意ください。";

const EQUIPMENT_NOTICE_TEXT =
  "※チェックのつかないものは当日レンタルもしくは事前購入となります。\n" +
  "試合よりも前に練習のためにレンタルを希望する方は、ご相談ください。\n" +
  "1週間500円単位で着払いにて指定のご住所までお送りいたします。\n" +
  "返却は大会開会時にお返しください。\n" +
  "※参加申込と参加費の納金を済ませて居ない場合は発送できません。\n" +
  "※当日不参加になってしまった場合もレンタル料は発生します。";

const RENTAL_SHORT = "※ないものは当日レンタルもしくは事前購入となります。";

const DEFAULT_NOTICE_TEMPLATES: NoticeTemplate[] = [
  {
    anchorType: "field",
    anchorFieldKey: "email",
    sortOrder: 0,
    textContent: null,
    scrollableText: CONSENT_SCROLLABLE_TEXT,
    requireConsent: true,
    consentLabel: "上記内容に表明・承諾いたします",
  },
  {
    anchorType: "form_start",
    anchorFieldKey: null,
    sortOrder: 1,
    textContent:
      "※ダブルエントリー大歓迎です。\n※一つしかチェックがない場合、参加される選手の偏りにより、試合が組めない場合もありますので、対応できるルールがあれば複数チェックにご協力下さい。",
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "weight",
    sortOrder: 0,
    textContent: WEIGHT_NOTICE_TEXT,
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "equipment_owned",
    sortOrder: 0,
    textContent: EQUIPMENT_NOTICE_TEXT,
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "shield_mask",
    sortOrder: 0,
    textContent: RENTAL_SHORT,
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "fist_guard",
    sortOrder: 0,
    textContent: RENTAL_SHORT + "\n手首より上まであるアームガードも可とします。",
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "leg_guard",
    sortOrder: 0,
    textContent: "※今回は交流試合なのですべてのルール階級において着用とします。\n" + RENTAL_SHORT,
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "groin_guard",
    sortOrder: 0,
    textContent: RENTAL_SHORT,
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
  {
    anchorType: "field",
    anchorFieldKey: "gi",
    sortOrder: 0,
    textContent:
      RENTAL_SHORT +
      "\n袖がない道着は不可。できれば肘が隠れている方が望ましい。\n破れた場合に当日急なレンタル品はありませんので、破れる恐れがある場合はレンタルがおすすめ。",
    scrollableText: null,
    requireConsent: false,
    consentLabel: null,
  },
];

function templateToNotice(configId: string, t: NoticeTemplate) {
  return {
    form_config_id: configId,
    anchor_type: t.anchorType,
    anchor_field_key: t.anchorFieldKey,
    sort_order: t.sortOrder,
    text_content: t.textContent,
    scrollable_text: t.scrollableText,
    link_url: null,
    link_label: null,
    require_consent: t.requireConsent,
    consent_label: t.consentLabel,
  };
}

function buildDefaultNotices(configId: string) {
  return DEFAULT_NOTICE_TEMPLATES.map((t) => templateToNotice(configId, t));
}

async function initializeDefaultFields(configId: string) {
  const fieldConfigs = FIELD_POOL.map((f) => {
    const def = DEFAULT_SORT_MAP.get(f.key);
    return {
      form_config_id: configId,
      field_key: f.key,
      visible: def?.visible ?? false,
      required: f.defaultRequired,
      sort_order: def?.sort ?? 99,
      has_other_option: f.defaultHasOther ?? false,
      custom_choices: f.defaultChoices ?? null,
      custom_label: null,
    };
  });
  await supabaseAdmin.from("form_field_configs").insert(fieldConfigs);
  return fieldConfigs.length;
}

async function initializeCustomFields(configId: string, baseSortOrder: number) {
  const customDefs = DEFAULT_CUSTOM_FIELDS.map((cf) => ({
    form_config_id: configId,
    field_key: cf.field_key,
    label: cf.label,
    field_type: cf.field_type,
    choices: cf.choices,
    sort_order: cf.sort_order,
  }));
  await supabaseAdmin.from("custom_field_defs").insert(customDefs);

  const customFieldConfigs = DEFAULT_CUSTOM_FIELDS.map((cf, i) => {
    const order = DEFAULT_CUSTOM_FIELD_ORDER.find((o) => o.key === cf.field_key);
    return {
      form_config_id: configId,
      field_key: cf.field_key,
      visible: order?.visible ?? true,
      required: order?.required ?? false,
      sort_order: baseSortOrder + i,
      has_other_option: cf.field_key === "match_experience",
      custom_choices: cf.choices,
      custom_label: null,
    };
  });
  await supabaseAdmin.from("form_field_configs").insert(customFieldConfigs);
}

async function initializeNotices(configId: string, eventId: string) {
  const defaultNotices = buildDefaultNotices(configId);

  const { data: eventRules } = await supabaseAdmin.from("event_rules").select("rule_id").eq("event_id", eventId);
  if (eventRules?.length) {
    const { data: rules } = await supabaseAdmin
      .from("rules")
      .select("name, description")
      .in(
        "id",
        eventRules.map((er) => er.rule_id),
      )
      .order("name");
    const rulesWithDesc = rules?.filter((r) => r.description) ?? [];
    if (rulesWithDesc.length > 0) {
      const ruleNoticeText = rulesWithDesc.map((r) => `【${r.name}】\n${r.description}`).join("\n\n");
      defaultNotices.push(
        templateToNotice(configId, {
          anchorType: "field",
          anchorFieldKey: "rule_preference",
          sortOrder: 0,
          textContent: ruleNoticeText,
          scrollableText: null,
          requireConsent: false,
          consentLabel: null,
        }),
      );
    }
  }
  await supabaseAdmin.from("form_notices").insert(defaultNotices);
}

async function ensureFormConfig(eventId: string) {
  const { data: existing } = await supabaseAdmin.from("form_configs").select("*").eq("event_id", eventId).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from("form_configs")
    .insert({ event_id: eventId })
    .select()
    .single();
  if (error) return null;

  const baseSortOrder = await initializeDefaultFields(created.id);
  await initializeCustomFields(created.id, baseSortOrder);
  await initializeNotices(created.id, eventId);
  return created;
}

async function backfillCustomDefs(
  configId: string,
  fieldKeys: string[],
  currentDefs: Record<string, unknown>[] | null,
) {
  const existingDefKeys = new Set((currentDefs ?? []).map((d: Record<string, unknown>) => d.field_key as string));
  const missingDefs = DEFAULT_CUSTOM_FIELDS.filter(
    (cf) => fieldKeys.includes(cf.field_key) && !existingDefKeys.has(cf.field_key),
  );
  if (missingDefs.length === 0) return currentDefs;

  await supabaseAdmin.from("custom_field_defs").insert(
    missingDefs.map((cf) => ({
      form_config_id: configId,
      field_key: cf.field_key,
      label: cf.label,
      field_type: cf.field_type,
      choices: cf.choices,
      sort_order: cf.sort_order,
    })),
  );
  const { data: refreshed } = await supabaseAdmin
    .from("custom_field_defs")
    .select("*")
    .eq("form_config_id", configId)
    .order("sort_order");
  return refreshed;
}

/** GET ?event_id=xxx — フォーム設定取得（なければ初期化して返す） */
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  const config = await ensureFormConfig(eventId);
  if (!config) return dbError(null, "フォーム設定の作成に失敗しました");

  const { data: fields } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", config.id)
    .order("sort_order");
  const { data: notices } = await supabaseAdmin
    .from("form_notices")
    .select("*, images:form_notice_images(*)")
    .eq("form_config_id", config.id)
    .order("sort_order");
  const { data: customFieldDefs } = await supabaseAdmin
    .from("custom_field_defs")
    .select("*")
    .eq("form_config_id", config.id)
    .order("sort_order");

  const finalDefs = await backfillCustomDefs(
    config.id,
    (fields ?? []).map((f) => f.field_key),
    customFieldDefs,
  );

  return NextResponse.json({ config, fields: fields ?? [], notices: notices ?? [], customFieldDefs: finalDefs ?? [] });
}

async function checkOptimisticLock(configId: string, expectedVersion: number | null) {
  if (expectedVersion == null) return null;
  const { data: current } = await supabaseAdmin.from("form_configs").select("version").eq("id", configId).single();
  if (current && current.version !== expectedVersion) {
    return NextResponse.json(
      { error: "フォーム設定が他のユーザーによって更新されています。画面を再読み込みしてください。" },
      { status: 409 },
    );
  }
  return null;
}

async function processDeletions(
  configId: string,
  deletedImageIds: string[] | undefined,
  noticeDeleteIds: string[] | undefined,
  customDeleteKeys: string[] | undefined,
) {
  if (deletedImageIds?.length) {
    await Promise.all(deletedImageIds.map((imageId) => deleteImageById(imageId)));
  }
  if (noticeDeleteIds?.length) {
    await Promise.all(noticeDeleteIds.map((noticeId) => deleteNoticeWithImages(noticeId)));
  }
  if (customDeleteKeys?.length) {
    await Promise.all(
      customDeleteKeys.map(async (fieldKey) => {
        await supabaseAdmin.from("custom_field_defs").delete().eq("form_config_id", configId).eq("field_key", fieldKey);
        await supabaseAdmin
          .from("form_field_configs")
          .delete()
          .eq("form_config_id", configId)
          .eq("field_key", fieldKey);
      }),
    );
  }
}

// any型を避けるためのユーティリティ
async function upsertNotices(configId: string, upsertList: Record<string, unknown>[]) {
  await Promise.all(
    upsertList.map((n) => {
      const noticeData = {
        form_config_id: configId,
        anchor_type: n.anchor_type,
        anchor_field_key: n.anchor_field_key ?? null,
        sort_order: n.sort_order ?? 0,
        text_content: n.text_content ?? null,
        scrollable_text: n.scrollable_text ?? null,
        link_url: n.link_url ?? null,
        link_label: n.link_label ?? null,
        require_consent: n.require_consent ?? false,
        consent_label: n.consent_label ?? null,
      };
      if (typeof n.id === "string" && n.id.startsWith("temp_")) {
        return supabaseAdmin.from("form_notices").insert(noticeData);
      }
      return supabaseAdmin
        .from("form_notices")
        .update(noticeData)
        .eq("id", n.id as string);
    }),
  );
}

function buildCustomFieldConfig(
  configId: string,
  cf: Record<string, unknown>,
  matchingField: Record<string, unknown> | undefined,
) {
  const sortOrder = (matchingField?.sort_order as number) ?? 0;
  return {
    def: {
      form_config_id: configId,
      field_key: cf.field_key,
      label: cf.label,
      field_type: cf.field_type,
      choices: cf.choices ?? null,
      sort_order: sortOrder,
    },
    fieldConfig: {
      form_config_id: configId,
      field_key: cf.field_key,
      visible: matchingField?.visible ?? true,
      required: matchingField?.required ?? false,
      sort_order: sortOrder,
      has_other_option: matchingField?.has_other_option ?? false,
      custom_choices: matchingField?.custom_choices ?? cf.choices ?? null,
      custom_label: matchingField?.custom_label ?? cf.label,
    },
  };
}

async function createCustomFields(
  configId: string,
  createList: Record<string, unknown>[],
  fields: Record<string, unknown>[],
) {
  await Promise.all(
    createList.map(async (cf) => {
      const matchingField = fields.find((f) => f.field_key === cf.field_key);
      const { def, fieldConfig } = buildCustomFieldConfig(configId, cf, matchingField);
      await supabaseAdmin.from("custom_field_defs").insert(def);
      await supabaseAdmin.from("form_field_configs").insert(fieldConfig);
    }),
  );
}

async function updateFieldConfigs(fields: Record<string, unknown>[]) {
  const updates = fields.filter((f) => !(typeof f.id === "string" && (f.id as string).startsWith("temp_")));
  await Promise.all(
    updates.map((f) =>
      supabaseAdmin
        .from("form_field_configs")
        .update({
          visible: f.visible,
          required: f.required,
          sort_order: f.sort_order,
          has_other_option: f.has_other_option,
          custom_choices: f.custom_choices,
          custom_label: f.custom_label ?? null,
        })
        .eq("id", f.id as string),
    ),
  );
}

async function incrementVersion(configId: string) {
  const { data: current } = await supabaseAdmin.from("form_configs").select("version").eq("id", configId).single();
  const newVersion = (current?.version ?? 0) + 1;
  await supabaseAdmin
    .from("form_configs")
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", configId);
  return newVersion;
}

/** PUT — フォーム設定の一括保存 */
export async function PUT(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { config_id, fields, notices, custom_fields, deleted_image_ids, expectedVersion } = await request.json();
  if (!config_id) return NextResponse.json({ error: "config_id required" }, { status: 400 });

  const lockErr = await checkOptimisticLock(config_id, expectedVersion);
  if (lockErr) return lockErr;

  await processDeletions(config_id, deleted_image_ids, notices?.delete_ids, custom_fields?.delete_keys);
  if (notices?.upsert?.length) await upsertNotices(config_id, notices.upsert);
  if (custom_fields?.create?.length) await createCustomFields(config_id, custom_fields.create, fields ?? []);
  if (fields?.length) await updateFieldConfigs(fields);

  const newVersion = await incrementVersion(config_id);
  return NextResponse.json({ ok: true, version: newVersion });
}
