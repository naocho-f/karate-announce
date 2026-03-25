"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FormFieldConfig, FormNotice, FormNoticeImage } from "@/lib/types";
import { FIELD_POOL, getFieldDef, isKanaField } from "@/lib/form-fields";
import type { FieldPoolItem } from "@/lib/form-fields";

type Props = { eventId: string };

type FormConfigState = { id: string; version: number; is_ready: boolean };

// ══════════════════════════════════════════════════════════════
// メインパネル
// ══════════════════════════════════════════════════════════════

export function FormConfigPanel({ eventId }: Props) {
  const [config, setConfig] = useState<FormConfigState | null>(null);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [notices, setNotices] = useState<FormNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pastEvents, setPastEvents] = useState<{ id: string; name: string }[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/form-config?event_id=${eventId}`, { credentials: "include" });
    const data = await res.json();
    setConfig(data.config);
    setFields(data.fields);
    setNotices(data.notices);
    setLoading(false);
    setDirty(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from("events").select("id, name").neq("id", eventId).order("created_at", { ascending: false })
      .then(({ data }) => setPastEvents((data ?? []).map((e) => ({ id: e.id, name: e.name }))));
  }, [eventId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    const res = await fetch("/api/admin/form-config", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config_id: config.id, fields }),
    });
    if (!res.ok) { alert("保存に失敗しました"); setSaving(false); return; }
    setSaving(false);
    setDirty(false);
  }

  async function toggleReady() {
    if (!config) return;
    if (!config.is_ready) {
      await fetch("/api/admin/form-config", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_id: config.id }),
      });
    } else {
      await fetch("/api/admin/form-config", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_id: config.id, is_ready: false }),
      });
    }
    await load();
  }

  async function copyFromEvent(sourceEventId: string) {
    if (!config) return;
    await fetch("/api/admin/form-config/copy", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_event_id: sourceEventId, target_config_id: config.id }),
    });
    setShowCopyModal(false);
    await load();
  }

  function updateField(id: string, patch: Partial<FormFieldConfig>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function moveField(fieldKey: string, dir: -1 | 1) {
    setFields((prev) => {
      const sorted = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      // 表示中の主要フィールドだけでインデックスを取得
      const visibleMain = sorted.filter((f) => f.visible && !isKanaField(f.field_key));
      const idx = visibleMain.findIndex((f) => f.field_key === fieldKey);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= visibleMain.length) return prev;

      // sort_order を交換
      const a = visibleMain[idx];
      const b = visibleMain[newIdx];
      const tmpSort = a.sort_order;

      const result = sorted.map((f) => {
        if (f.id === a.id) return { ...f, sort_order: b.sort_order };
        if (f.id === b.id) return { ...f, sort_order: tmpSort };
        return f;
      });

      // 読み仮名は親に追従
      const kanaDef = FIELD_POOL.find((p) => p.kanaParent === fieldKey);
      if (kanaDef) {
        const kana = result.find((f) => f.field_key === kanaDef.key);
        const parent = result.find((f) => f.field_key === fieldKey);
        if (kana && parent) {
          return result.map((f) => f.id === kana.id ? { ...f, sort_order: parent.sort_order + 0.5 } : f)
            .sort((x, y) => x.sort_order - y.sort_order)
            .map((f, i) => ({ ...f, sort_order: i }));
        }
      }

      return result.sort((x, y) => x.sort_order - y.sort_order).map((f, i) => ({ ...f, sort_order: i }));
    });
    setDirty(true);
  }

  function toggleVisibility(fieldKey: string) {
    const field = fields.find((f) => f.field_key === fieldKey);
    if (!field) return;
    const newVisible = !field.visible;
    updateField(field.id, { visible: newVisible });
    // 読み仮名も連動
    const kanaDef = FIELD_POOL.find((p) => p.kanaParent === fieldKey);
    if (kanaDef) {
      const kana = fields.find((f) => f.field_key === kanaDef.key);
      if (kana) updateField(kana.id, { visible: newVisible });
    }
  }

  // 注意書き操作
  async function addNotice(anchorType: "form_start" | "field" | "form_end", anchorFieldKey?: string) {
    if (!config) return;
    const res = await fetch("/api/admin/form-config/notices", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_config_id: config.id, anchor_type: anchorType,
        anchor_field_key: anchorFieldKey ?? null,
        sort_order: notices.filter((n) => n.anchor_type === anchorType && n.anchor_field_key === anchorFieldKey).length,
      }),
    });
    if (!res.ok) { alert("注意書きの追加に失敗しました"); return; }
    const notice = await res.json();
    setNotices((prev) => [...prev, notice]);
  }

  async function updateNotice(id: string, patch: Partial<FormNotice>) {
    await fetch(`/api/admin/form-config/notices/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function deleteNotice(id: string) {
    await fetch(`/api/admin/form-config/notices/${id}`, { method: "DELETE", credentials: "include" });
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }

  async function uploadImage(noticeId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("notice_id", noticeId);
    const res = await fetch("/api/admin/form-config/image-upload", { method: "POST", credentials: "include", body: fd });
    if (!res.ok) { alert("画像アップロードに失敗しました"); return; }
    const img = await res.json();
    setNotices((prev) => prev.map((n) => n.id === noticeId ? { ...n, images: [...(n.images ?? []), img] } : n));
  }

  async function deleteImage(imageId: string, noticeId: string) {
    await fetch("/api/admin/form-config/image-upload", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
    });
    setNotices((prev) => prev.map((n) => n.id === noticeId ? { ...n, images: (n.images ?? []).filter((img) => img.id !== imageId) } : n));
  }

  if (loading) return <div className="text-center py-8 text-gray-500">読み込み中...</div>;
  if (!config) return <div className="text-center py-8 text-red-400">設定の読み込みに失敗しました</div>;

  // フィールドをソート順に分ける
  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);
  const visibleMain = sorted.filter((f) => f.visible && !isKanaField(f.field_key));
  const hiddenMain = sorted.filter((f) => !f.visible && !isKanaField(f.field_key));

  const formStartNotices = notices.filter((n) => n.anchor_type === "form_start");
  const formEndNotices = notices.filter((n) => n.anchor_type === "form_end");
  const fieldNoticesMap = (key: string) => notices.filter((n) => n.anchor_type === "field" && n.anchor_field_key === key);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-200">フォーム設定</h2>
            <span className={`text-xs px-2 py-0.5 rounded ${config.is_ready ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
              {config.is_ready ? "公開中" : "準備中"}
            </span>
            <span className="text-xs text-gray-500">v{config.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCopyModal(true)} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg transition">
              過去の大会から読み込む
            </button>
            <button onClick={save} disabled={!dirty || saving}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition font-medium">
              {saving ? "保存中..." : dirty ? "保存する" : "保存済み"}
            </button>
            <button onClick={toggleReady}
              className={`px-4 py-1.5 text-sm rounded-lg transition font-medium ${config.is_ready ? "bg-yellow-700 hover:bg-yellow-600 text-white" : "bg-green-700 hover:bg-green-600 text-white"}`}>
              {config.is_ready ? "準備中に戻す" : "フォームを公開"}
            </button>
          </div>
        </div>
      </div>

      {/* ── フォームプレビュー ── */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-750">
          <p className="text-xs text-gray-400">実際のフォームに近い見た目で表示しています。各項目の右上からON/OFFや設定ができます。</p>
        </div>

        {/* 入力フォーム風プレビュー */}
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          {/* タイトル（プレビュー） */}
          <div className="text-center pb-2">
            <div className="text-lg font-bold text-gray-300">大会名</div>
            <div className="text-sm text-gray-500">エントリーフォーム</div>
          </div>

          {/* フォーム先頭注意書き */}
          {formStartNotices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
            <InlineNoticeEditor key={n.id} notice={n}
              onUpdate={updateNotice} onDelete={deleteNotice}
              onUploadImage={uploadImage} onDeleteImage={deleteImage} />
          ))}
          <button onClick={() => addNotice("form_start")} className="text-xs text-blue-400 hover:text-blue-300 block">
            + フォーム先頭に注意書きを追加
          </button>

          {/* 表示中のフィールド */}
          {visibleMain.map((f, i) => {
            const def = getFieldDef(f.field_key);
            if (!def) return null;
            const kanaField = fields.find((kf) => {
              const kDef = FIELD_POOL.find((p) => p.kanaParent === f.field_key);
              return kDef && kf.field_key === kDef.key;
            });
            const fNotices = fieldNoticesMap(f.field_key);
            return (
              <FieldPreviewCard
                key={f.id}
                field={f}
                def={def}
                kanaField={kanaField ?? null}
                index={i}
                total={visibleMain.length}
                notices={fNotices}
                allFields={fields}
                onUpdate={updateField}
                onMove={moveField}
                onToggle={toggleVisibility}
                onAddNotice={() => addNotice("field", f.field_key)}
                onUpdateNotice={updateNotice}
                onDeleteNotice={deleteNotice}
                onUploadImage={uploadImage}
                onDeleteImage={deleteImage}
              />
            );
          })}

          {/* フォーム末尾注意書き */}
          {formEndNotices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
            <InlineNoticeEditor key={n.id} notice={n}
              onUpdate={updateNotice} onDelete={deleteNotice}
              onUploadImage={uploadImage} onDeleteImage={deleteImage} />
          ))}
          <button onClick={() => addNotice("form_end")} className="text-xs text-blue-400 hover:text-blue-300 block">
            + 送信ボタン前に注意書きを追加
          </button>

          {/* 送信ボタン（プレビュー） */}
          <div className="bg-blue-600/30 border border-blue-700/50 py-3 rounded-xl text-center text-sm text-blue-300 font-bold cursor-default">
            エントリーする（プレビュー）
          </div>
        </div>
      </div>

      {/* ── 非表示の項目 ── */}
      {hiddenMain.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-400">非表示の項目（{hiddenMain.length}件）</h3>
            <p className="text-xs text-gray-500 mt-0.5">ONにするとフォームに追加されます</p>
          </div>
          <div className="divide-y divide-gray-700/50">
            {hiddenMain.map((f) => {
              const def = getFieldDef(f.field_key);
              if (!def) return null;
              return (
                <div key={f.id} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">{def.label}</span>
                  <button
                    onClick={() => toggleVisibility(f.field_key)}
                    className="px-3 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-lg transition"
                  >
                    フォームに追加
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* コピーモーダル */}
      {showCopyModal && (
        <CopyModal events={pastEvents} onCopy={copyFromEvent} onClose={() => setShowCopyModal(false)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// フィールドプレビューカード
// ══════════════════════════════════════════════════════════════

const inp = "w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500 pointer-events-none select-none";

function FieldPreviewCard({
  field, def, kanaField, index, total, notices, allFields,
  onUpdate, onMove, onToggle, onAddNotice, onUpdateNotice, onDeleteNotice, onUploadImage, onDeleteImage,
}: {
  field: FormFieldConfig;
  def: FieldPoolItem;
  kanaField: FormFieldConfig | null;
  index: number;
  total: number;
  notices: FormNotice[];
  allFields: FormFieldConfig[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onMove: (fieldKey: string, dir: -1 | 1) => void;
  onToggle: (fieldKey: string) => void;
  onAddNotice: () => void;
  onUpdateNotice: (id: string, patch: Partial<FormNotice>) => void;
  onDeleteNotice: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const key = def.key;
  const choices = field.custom_choices?.length ? field.custom_choices : (def.fixedChoices ?? def.defaultChoices ?? []);

  return (
    <div className="relative group">
      {/* 操作ツールバー（右上に浮かぶ） */}
      <div className="absolute -top-2 right-0 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition bg-gray-700 rounded-lg px-1.5 py-0.5 shadow-lg">
        <button onClick={() => onMove(key, -1)} disabled={index === 0}
          className="px-1.5 py-0.5 text-xs text-gray-300 hover:text-white disabled:opacity-30 transition" title="上へ">▲</button>
        <button onClick={() => onMove(key, 1)} disabled={index === total - 1}
          className="px-1.5 py-0.5 text-xs text-gray-300 hover:text-white disabled:opacity-30 transition" title="下へ">▼</button>
        <span className="w-px h-4 bg-gray-600" />
        <select
          value={field.required ? "required" : "optional"}
          onChange={(e) => onUpdate(field.id, { required: e.target.value === "required" })}
          className="text-xs bg-transparent text-gray-300 border-none outline-none cursor-pointer"
        >
          <option value="required">必須</option>
          <option value="optional">任意</option>
        </select>
        {kanaField && (
          <select
            value={kanaField.required ? "required" : "optional"}
            onChange={(e) => onUpdate(kanaField.id, { required: e.target.value === "required" })}
            className="text-xs bg-transparent text-gray-300 border-none outline-none cursor-pointer"
          >
            <option value="required">読み:必須</option>
            <option value="optional">読み:任意</option>
          </select>
        )}
        <span className="w-px h-4 bg-gray-600" />
        <button onClick={() => setExpanded(!expanded)}
          className="px-1.5 py-0.5 text-xs text-gray-300 hover:text-white transition" title="詳細設定">⚙</button>
        <span className="w-px h-4 bg-gray-600" />
        <button onClick={() => onToggle(key)}
          className="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300 transition" title="非表示にする">✕</button>
      </div>

      {/* フィールドプレビュー */}
      <div className="border border-gray-700/50 rounded-xl p-3 space-y-1.5 hover:border-gray-600 transition">
        {/* ラベル */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 font-medium">{def.label}</span>
          {field.required && <span className="text-red-400 text-xs">*</span>}
          {def.unit && <span className="text-xs text-gray-600">（{def.unit}）</span>}
          {kanaField && <span className="text-xs text-gray-600">+ 読み仮名</span>}
        </div>

        {/* 入力プレビュー */}
        {renderInputPreview(key, def, choices, field, kanaField)}

        {/* 展開: 詳細設定 */}
        {expanded && (
          <FieldDetailEditor field={field} def={def} allFields={allFields} onUpdate={onUpdate} />
        )}

        {/* この項目の注意書き（インライン） */}
        {notices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
          <InlineNoticeEditor key={n.id} notice={n}
            onUpdate={onUpdateNotice} onDelete={onDeleteNotice}
            onUploadImage={onUploadImage} onDeleteImage={onDeleteImage} />
        ))}
        <button onClick={onAddNotice} className="text-xs text-blue-400/60 hover:text-blue-400 transition">
          + 注意書き
        </button>
      </div>
    </div>
  );
}

// ── 入力プレビュー ──

function renderInputPreview(
  key: string,
  def: FieldPoolItem,
  choices: { label: string; value: string }[],
  field: FormFieldConfig,
  kanaField: FormFieldConfig | null,
) {
  // full_name: 姓名 + 読み仮名 4カラム
  if (key === "full_name") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <span className="text-[10px] text-gray-600">姓</span>
          <div className={inp}>山田</div>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] text-gray-600">名</span>
          <div className={inp}>太郎</div>
        </div>
        {kanaField?.visible && (
          <>
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-600">姓（読み）</span>
              <div className={inp}>やまだ</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-600">名（読み）</span>
              <div className={inp}>たろう</div>
            </div>
          </>
        )}
      </div>
    );
  }

  // organization: セレクト＋自由入力 + 読み仮名
  if (key === "organization") {
    return (
      <div className="space-y-1.5">
        <div className={inp}>選択 または 自由入力</div>
        {kanaField?.visible && (
          <div className="space-y-0.5">
            <span className="text-[10px] text-gray-600">よみがな</span>
            <div className={inp}>じゅうくうかい</div>
          </div>
        )}
      </div>
    );
  }

  // branch + 読み仮名
  if (key === "branch") {
    return (
      <div className="space-y-1.5">
        <div className={inp}>{def.placeholder || ""}</div>
        {kanaField?.visible && (
          <div className="space-y-0.5">
            <span className="text-[10px] text-gray-600">よみがな</span>
            <div className={inp}></div>
          </div>
        )}
      </div>
    );
  }

  // 読み仮名は親と一緒に表示されるのでスキップ
  if (isKanaField(key)) return null;

  // radio
  if (def.type === "radio") {
    return (
      <div className="space-y-1 pl-1">
        {choices.map((c) => (
          <label key={c.value} className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />
            {c.label}
          </label>
        ))}
        {field.has_other_option && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />
            その他
          </label>
        )}
      </div>
    );
  }

  // checkbox
  if (def.type === "checkbox") {
    return (
      <div className="space-y-1 pl-1">
        {choices.map((c) => (
          <label key={c.value} className="flex items-start gap-2 text-xs text-gray-500">
            <div className="w-3.5 h-3.5 rounded border border-gray-600 shrink-0 mt-0.5" />
            {c.label}
          </label>
        ))}
        {field.has_other_option && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-3.5 h-3.5 rounded border border-gray-600" />
            その他
          </label>
        )}
      </div>
    );
  }

  // select
  if (def.type === "select") {
    return <div className={`${inp} flex items-center justify-between`}><span>選択してください</span><span className="text-gray-600">▼</span></div>;
  }

  // textarea
  if (def.type === "textarea") {
    return <div className={`${inp} h-16`}>{def.placeholder ?? ""}</div>;
  }

  // email with confirm
  if (def.type === "email" && def.hasConfirmInput) {
    return (
      <div className="space-y-1.5">
        <div className={inp}>example@mail.com</div>
        <div className="space-y-0.5">
          <span className="text-[10px] text-gray-600">メールアドレス（確認）</span>
          <div className={inp}>もう一度入力</div>
        </div>
      </div>
    );
  }

  // date
  if (def.type === "date") {
    return <div className={inp}>2000-01-01</div>;
  }

  // default: text, number, tel, email
  return <div className={inp}>{def.placeholder ?? ""}</div>;
}

// ══════════════════════════════════════════════════════════════
// フィールド詳細設定（展開部分）
// ══════════════════════════════════════════════════════════════

function FieldDetailEditor({ field, def, allFields, onUpdate }: {
  field: FormFieldConfig;
  def: FieldPoolItem;
  allFields: FormFieldConfig[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
}) {
  const hasChoices = def.type === "radio" || def.type === "checkbox" || (def.type === "select" && !def.fixedChoices);
  const [editingChoices, setEditingChoices] = useState(false);
  const [choicesText, setChoicesText] = useState("");

  function startEditChoices() {
    const choices = field.custom_choices ?? def.defaultChoices ?? [];
    setChoicesText(choices.map((c) => c.label).join("\n"));
    setEditingChoices(true);
  }

  function saveChoices() {
    const lines = choicesText.split("\n").filter((l) => l.trim());
    const choices = lines.map((label) => {
      const existing = (field.custom_choices ?? def.defaultChoices ?? []).find((c) => c.label === label.trim());
      return { label: label.trim(), value: existing?.value ?? label.trim().toLowerCase().replace(/\s+/g, "_") };
    });
    onUpdate(field.id, { custom_choices: choices });
    setEditingChoices(false);
  }

  return (
    <div className="bg-gray-900/40 rounded-lg p-2.5 mt-1 space-y-2 border border-gray-700/50">
      <p className="text-xs text-gray-500 font-medium">詳細設定</p>

      {/* その他オプション */}
      {(def.defaultHasOther !== undefined || hasChoices) && (
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={field.has_other_option}
            onChange={(e) => onUpdate(field.id, { has_other_option: e.target.checked })} className="rounded" />
          「その他の回答」欄を表示
        </label>
      )}

      {/* 選択肢編集 */}
      {hasChoices && (
        <div>
          {editingChoices ? (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">選択肢を1行1つで入力</p>
              <textarea value={choicesText} onChange={(e) => setChoicesText(e.target.value)}
                rows={6} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-gray-200" />
              <div className="flex gap-2">
                <button onClick={saveChoices} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">適用</button>
                <button onClick={() => setEditingChoices(false)} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">キャンセル</button>
              </div>
            </div>
          ) : (
            <button onClick={startEditChoices} className="text-xs text-blue-400 hover:text-blue-300">選択肢を編集</button>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// インライン注意書きエディタ
// ══════════════════════════════════════════════════════════════

function InlineNoticeEditor({ notice, onUpdate, onDelete, onUploadImage, onDeleteImage }: {
  notice: FormNotice;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localText, setLocalText] = useState(notice.text_content ?? "");
  const [localScrollable, setLocalScrollable] = useState(notice.scrollable_text ?? "");
  const [localUrl, setLocalUrl] = useState(notice.link_url ?? "");
  const [localUrlLabel, setLocalUrlLabel] = useState(notice.link_label ?? "");
  const [localConsentLabel, setLocalConsentLabel] = useState(notice.consent_label ?? "");

  function saveAll() {
    onUpdate(notice.id, {
      text_content: localText || null,
      scrollable_text: localScrollable || null,
      link_url: localUrl || null,
      link_label: localUrlLabel || null,
      consent_label: localConsentLabel || null,
    });
    setEditing(false);
  }

  // プレビュー表示（編集中でないとき）
  if (!editing) {
    const hasContent = notice.text_content || notice.scrollable_text || notice.link_url || (notice.images?.length ?? 0) > 0;
    return (
      <div className="bg-gray-800/60 border border-dashed border-gray-600 rounded-lg p-2.5 group/notice relative">
        <div className="absolute -top-1.5 right-1 flex gap-1 opacity-0 group-hover/notice:opacity-100 transition">
          <button onClick={() => setEditing(true)} className="px-2 py-0.5 text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600 rounded shadow">編集</button>
          <button onClick={() => onDelete(notice.id)} className="px-2 py-0.5 text-[10px] bg-red-900 text-red-300 hover:bg-red-800 rounded shadow">削除</button>
        </div>

        {!hasContent && <p className="text-xs text-gray-600 italic">空の注意書き（クリックで編集）</p>}

        {notice.text_content && (
          <p className="text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">{notice.text_content}</p>
        )}
        {notice.scrollable_text && (
          <div className="max-h-24 overflow-y-auto border border-gray-600 rounded-lg p-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap bg-gray-900 mt-1">
            {notice.scrollable_text.slice(0, 200)}{notice.scrollable_text.length > 200 && "..."}
          </div>
        )}
        {(notice.images ?? []).length > 0 && (
          <div className="flex gap-2 mt-1">
            {(notice.images ?? []).map((img: FormNoticeImage & { public_url?: string }) => (
              <img key={img.id}
                src={img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`}
                alt="" className="h-12 rounded border border-gray-600" />
            ))}
          </div>
        )}
        {notice.link_url && (
          <p className="text-xs text-blue-400 mt-1">{notice.link_label || notice.link_url}</p>
        )}
        {notice.require_consent && (
          <label className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
            <div className="w-3.5 h-3.5 rounded border border-gray-600" />
            {notice.consent_label || "上記に同意します"}
          </label>
        )}
      </div>
    );
  }

  // 編集モード
  return (
    <div className="bg-gray-900/60 border border-blue-700/50 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-400 font-medium">注意書き編集</span>
        <div className="flex gap-2">
          <button onClick={saveAll} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">保存</button>
          <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">閉じる</button>
        </div>
      </div>

      {/* テキスト */}
      <div>
        <label className="text-xs text-gray-500 block mb-0.5">テキスト</label>
        <textarea value={localText} onChange={(e) => setLocalText(e.target.value)}
          rows={3} className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200" placeholder="注意書きテキスト..." />
      </div>

      {/* 画像 */}
      <div>
        <label className="text-xs text-gray-500 block mb-0.5">画像</label>
        <div className="flex flex-wrap gap-2 mb-1">
          {(notice.images ?? []).map((img: FormNoticeImage & { public_url?: string }) => (
            <div key={img.id} className="relative group/img">
              <img src={img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`}
                alt="" className="h-16 rounded border border-gray-600" />
              <button onClick={() => onDeleteImage(img.id, notice.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">×</button>
            </div>
          ))}
        </div>
        <label className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
          + 画像をアップロード
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(notice.id, f); e.target.value = ""; }} />
        </label>
      </div>

      {/* リンク */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">リンクURL</label>
          <input value={localUrl} onChange={(e) => setLocalUrl(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" placeholder="https://..." />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">リンク表示名</label>
          <input value={localUrlLabel} onChange={(e) => setLocalUrlLabel(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" placeholder="解説動画を見る" />
        </div>
      </div>

      {/* 規約テキスト */}
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">規約テキスト（スクロール表示）</summary>
        <textarea value={localScrollable} onChange={(e) => setLocalScrollable(e.target.value)}
          rows={4} className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200 mt-1" placeholder="規約全文をここに入力..." />
      </details>

      {/* 同意チェック */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input type="checkbox" checked={notice.require_consent}
            onChange={(e) => onUpdate(notice.id, { require_consent: e.target.checked })} className="rounded" />
          同意チェック必須
        </label>
        {notice.require_consent && (
          <input value={localConsentLabel} onChange={(e) => setLocalConsentLabel(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" placeholder="上記に同意します" />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// コピーモーダル
// ══════════════════════════════════════════════════════════════

function CopyModal({ events, onCopy, onClose }: {
  events: { id: string; name: string }[];
  onCopy: (eventId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg">過去の大会から読み込む</h3>
        <p className="text-sm text-gray-400">フォーム設定をコピーします。現在の設定は上書きされます。</p>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">他の大会がありません</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {events.map((e) => (
              <button key={e.id}
                onClick={() => { if (confirm(`「${e.name}」のフォーム設定をコピーしますか？\n現在の設定は上書きされます。`)) onCopy(e.id); }}
                className="w-full text-left px-4 py-2.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm transition">{e.name}</button>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">閉じる</button>
      </div>
    </div>
  );
}
