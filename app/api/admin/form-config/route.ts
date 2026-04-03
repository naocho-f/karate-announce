import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { FIELD_POOL, DEFAULT_CUSTOM_FIELDS } from "@/lib/form-fields";

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

/** デフォルトの注意書き */
function buildDefaultNotices(configId: string) {
  return [
    // 承諾書（emailフィールド直後）
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "email",
      sort_order: 0,
      text_content: null,
      scrollable_text:
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
        "５．私は、本会中の写真・動画の撮影および公開について、主催者の方針に従います。",
      link_url: null,
      link_label: null,
      require_consent: true,
      consent_label: "上記内容に表明・承諾いたします",
    },
    // ルール解説動画リンク（rule_preference直前）
    {
      form_config_id: configId,
      anchor_type: "form_start",
      anchor_field_key: null,
      sort_order: 1,
      text_content:
        "※ダブルエントリー大歓迎です。\n" +
        "※一つしかチェックがない場合、参加される選手の偏りにより、試合が組めない場合もありますので、対応できるルールがあれば複数チェックにご協力下さい。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // 体重に関する注意書き
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "weight",
      sort_order: 0,
      text_content:
        "申告体重より当日計量でオーバーすると、下記ペナルティーが発生しますので、少し余裕をみて申告ください。\n" +
        "+2.0キロで相手に1P\n" +
        "+2.5キロで相手に2P\n" +
        "+3.0キロで失格\n\n" +
        "※ただし、対戦相手より体重が計量値が軽い場合はペナルティーは有りません。\n\n" +
        "体重をメインとして、年齢、性別、経歴、体格、段級により階級分けをします。\n" +
        "計量は試合に出場する服装（道着着用）にて行うので道着を着用した体重に少し余裕を持った数値で申告。\n" +
        "体重の申告については大会当日の体重を重めに見積もり申告すること。\n\n" +
        "※参加試費の返還はありませんのでくれぐれもご注意ください。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // 防具に関する注意書き（equipment_owned の前）
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "equipment_owned",
      sort_order: 0,
      text_content:
        "※チェックのつかないものは当日レンタルもしくは事前購入となります。\n" +
        "試合よりも前に練習のためにレンタルを希望する方は、ご相談ください。\n" +
        "1週間500円単位で着払いにて指定のご住所までお送りいたします。\n" +
        "返却は大会開会時にお返しください。\n" +
        "※参加申込と参加費の納金を済ませて居ない場合は発送できません。\n" +
        "※当日不参加になってしまった場合もレンタル料は発生します。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // シールド面の注意書き
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "shield_mask",
      sort_order: 0,
      text_content: "※ないものは当日レンタルもしくは事前購入となります。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // フィストガードの注意書き
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "fist_guard",
      sort_order: 0,
      text_content: "※ないものは当日レンタルもしくは事前購入となります。\n手首より上まであるアームガードも可とします。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // レッグガードの注意書き
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "leg_guard",
      sort_order: 0,
      text_content: "※今回は交流試合なのですべてのルール階級において着用とします。\n※ないものは当日レンタルもしくは事前購入となります。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // ファールカップの注意書き
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "groin_guard",
      sort_order: 0,
      text_content: "※ないものは当日レンタルもしくは事前購入となります。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
    // 道着の注意書き
    {
      form_config_id: configId,
      anchor_type: "field",
      anchor_field_key: "gi",
      sort_order: 0,
      text_content: "※ないものは当日レンタルもしくは事前購入となります。\n袖がない道着は不可。できれば肘が隠れている方が望ましい。\n破れた場合に当日急なレンタル品はありませんので、破れる恐れがある場合はレンタルがおすすめ。",
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
    },
  ];
}

/** GET ?event_id=xxx — フォーム設定取得（なければ初期化して返す） */
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  // form_config を取得 or 作成
  let { data: config } = await supabaseAdmin
    .from("form_configs")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!config) {
    const { data: created, error } = await supabaseAdmin
      .from("form_configs")
      .insert({ event_id: eventId })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    config = created;

    // デフォルトのフィールド設定を一括作成（画像のGoogleFormsフォームを再現する順序）
    const fieldConfigs = FIELD_POOL.map((f) => {
      const def = DEFAULT_SORT_MAP.get(f.key);
      return {
        form_config_id: config!.id,
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

    // デフォルトの自由設問を custom_field_defs + form_field_configs に挿入
    const baseSortOrder = fieldConfigs.length;
    const customDefs = DEFAULT_CUSTOM_FIELDS.map((cf) => ({
      form_config_id: config!.id,
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
        form_config_id: config!.id,
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

    // デフォルトの注意書きを作成
    const defaultNotices = buildDefaultNotices(config.id);

    // イベントに紐づくルールの説明をデフォルト注意書きとして追加
    const { data: eventRules } = await supabaseAdmin
      .from("event_rules")
      .select("rule_id")
      .eq("event_id", eventId);
    if (eventRules?.length) {
      const { data: rules } = await supabaseAdmin
        .from("rules")
        .select("name, description")
        .in("id", eventRules.map((er) => er.rule_id))
        .order("name");
      const rulesWithDesc = rules?.filter((r) => r.description) ?? [];
      if (rulesWithDesc.length > 0) {
        const ruleNoticeText = rulesWithDesc
          .map((r) => `【${r.name}】\n${r.description}`)
          .join("\n\n");
        defaultNotices.push({
          form_config_id: config.id,
          anchor_type: "field",
          anchor_field_key: "rule_preference",
          sort_order: 0,
          text_content: ruleNoticeText,
          scrollable_text: null,
          link_url: null,
          link_label: null,
          require_consent: false,
          consent_label: null,
        });
      }
    }

    await supabaseAdmin.from("form_notices").insert(defaultNotices);
  }

  // フィールド設定取得
  const { data: fields } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", config.id)
    .order("sort_order");

  // 注意書き取得（画像込み）
  const { data: notices } = await supabaseAdmin
    .from("form_notices")
    .select("*, images:form_notice_images(*)")
    .eq("form_config_id", config.id)
    .order("sort_order");

  // カスタムフィールド定義取得
  let { data: customFieldDefs } = await supabaseAdmin
    .from("custom_field_defs")
    .select("*")
    .eq("form_config_id", config.id)
    .order("sort_order");

  // 既存大会の自動補完: form_field_configs にあるが custom_field_defs にない自由設問を補完
  const existingDefKeys = new Set((customFieldDefs ?? []).map((d) => d.field_key));
  const fieldKeys = (fields ?? []).map((f) => f.field_key);
  const missingDefs = DEFAULT_CUSTOM_FIELDS.filter(
    (cf) => fieldKeys.includes(cf.field_key) && !existingDefKeys.has(cf.field_key)
  );
  if (missingDefs.length > 0) {
    const inserts = missingDefs.map((cf) => ({
      form_config_id: config.id,
      field_key: cf.field_key,
      label: cf.label,
      field_type: cf.field_type,
      choices: cf.choices,
      sort_order: cf.sort_order,
    }));
    await supabaseAdmin.from("custom_field_defs").insert(inserts);
    // 再取得
    const { data: refreshed } = await supabaseAdmin
      .from("custom_field_defs")
      .select("*")
      .eq("form_config_id", config.id)
      .order("sort_order");
    customFieldDefs = refreshed;
  }

  return NextResponse.json({ config, fields: fields ?? [], notices: notices ?? [], customFieldDefs: customFieldDefs ?? [] });
}

/** PUT — フォーム設定の一括更新（フィールド設定 + version インクリメント） */
export async function PUT(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { config_id, fields } = await request.json();
  if (!config_id) return NextResponse.json({ error: "config_id required" }, { status: 400 });

  // 現在の version を取得
  const { data: current } = await supabaseAdmin
    .from("form_configs")
    .select("version")
    .eq("id", config_id)
    .single();

  const newVersion = (current?.version ?? 0) + 1;

  // version インクリメント
  await supabaseAdmin
    .from("form_configs")
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", config_id);

  // フィールド設定の一括更新
  if (fields && Array.isArray(fields)) {
    for (const f of fields) {
      await supabaseAdmin
        .from("form_field_configs")
        .update({
          visible: f.visible,
          required: f.required,
          sort_order: f.sort_order,
          has_other_option: f.has_other_option,
          custom_choices: f.custom_choices,
          custom_label: f.custom_label ?? null,
        })
        .eq("id", f.id);
    }
  }

  return NextResponse.json({ ok: true, version: newVersion });
}
