"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FormFieldConfig, FormNotice, FormNoticeImage } from "@/lib/types";
import { FIELD_POOL, CATEGORY_LABELS, getFieldDef, isKanaField, type FieldCategory } from "@/lib/form-fields";

type Props = {
  eventId: string;
};

type FormConfigState = {
  id: string;
  version: number;
  is_ready: boolean;
};

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

  // 過去大会リスト取得
  useEffect(() => {
    supabase
      .from("events")
      .select("id, name")
      .neq("id", eventId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPastEvents((data ?? []).map((e) => ({ id: e.id, name: e.name })));
      });
  }, [eventId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    await fetch("/api/admin/form-config", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config_id: config.id, fields }),
    });
    setSaving(false);
    setDirty(false);
  }

  async function toggleReady() {
    if (!config) return;
    // 公開時はversion increment
    if (!config.is_ready) {
      await fetch("/api/admin/form-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_id: config.id }),
      });
    } else {
      await fetch("/api/admin/form-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_id: config.id, is_ready: false }),
      });
    }
    await load();
  }

  async function copyFromEvent(sourceEventId: string) {
    if (!config) return;
    await fetch("/api/admin/form-config/copy", {
      method: "POST",
      credentials: "include",
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

  function moveField(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const newFields = [...fields];
    [newFields[idx], newFields[newIdx]] = [newFields[newIdx], newFields[idx]];
    newFields.forEach((f, i) => (f.sort_order = i));

    // 読み仮名フィールドは親に追従
    const moved = newFields[newIdx];
    const kanaDef = FIELD_POOL.find((p) => p.kanaParent === moved.field_key);
    if (kanaDef) {
      const kanaIdx = newFields.findIndex((f) => f.field_key === kanaDef.key);
      if (kanaIdx >= 0) {
        const [kana] = newFields.splice(kanaIdx, 1);
        const parentIdx = newFields.findIndex((f) => f.field_key === moved.field_key);
        newFields.splice(parentIdx + 1, 0, kana);
        newFields.forEach((f, i) => (f.sort_order = i));
      }
    }

    setFields(newFields);
    setDirty(true);
  }

  // 注意書き操作
  async function addNotice(anchorType: "form_start" | "field" | "form_end", anchorFieldKey?: string) {
    if (!config) return;
    const res = await fetch("/api/admin/form-config/notices", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_config_id: config.id,
        anchor_type: anchorType,
        anchor_field_key: anchorFieldKey ?? null,
        sort_order: notices.filter((n) => n.anchor_type === anchorType && n.anchor_field_key === anchorFieldKey).length,
      }),
    });
    const notice = await res.json();
    setNotices((prev) => [...prev, notice]);
  }

  async function updateNotice(id: string, patch: Partial<FormNotice>) {
    await fetch(`/api/admin/form-config/notices/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function deleteNotice(id: string) {
    await fetch(`/api/admin/form-config/notices/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }

  async function uploadImage(noticeId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("notice_id", noticeId);
    const res = await fetch("/api/admin/form-config/image-upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) { alert("画像アップロードに失敗しました"); return; }
    const img = await res.json();
    setNotices((prev) =>
      prev.map((n) =>
        n.id === noticeId
          ? { ...n, images: [...(n.images ?? []), img] }
          : n
      )
    );
  }

  async function deleteImage(imageId: string, noticeId: string) {
    await fetch("/api/admin/form-config/image-upload", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
    });
    setNotices((prev) =>
      prev.map((n) =>
        n.id === noticeId
          ? { ...n, images: (n.images ?? []).filter((img) => img.id !== imageId) }
          : n
      )
    );
  }

  if (loading) return <div className="text-center py-8 text-gray-500">読み込み中...</div>;
  if (!config) return <div className="text-center py-8 text-red-400">設定の読み込みに失敗しました</div>;

  // 読み仮名フィールドを除外（親フィールドに統合表示）
  const mainFields = fields.filter((f) => !isKanaField(f.field_key));

  // カテゴリごとにグループ化
  const grouped = new Map<FieldCategory, typeof mainFields>();
  for (const f of mainFields) {
    const def = getFieldDef(f.field_key);
    if (!def) continue;
    const cat = def.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(f);
  }

  const formStartNotices = notices.filter((n) => n.anchor_type === "form_start");
  const formEndNotices = notices.filter((n) => n.anchor_type === "form_end");

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
            <button
              onClick={() => setShowCopyModal(true)}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              過去の大会から読み込む
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition font-medium"
            >
              {saving ? "保存中..." : dirty ? "保存する" : "保存済み"}
            </button>
            <button
              onClick={toggleReady}
              className={`px-4 py-1.5 text-sm rounded-lg transition font-medium ${
                config.is_ready
                  ? "bg-yellow-700 hover:bg-yellow-600 text-white"
                  : "bg-green-700 hover:bg-green-600 text-white"
              }`}
            >
              {config.is_ready ? "準備中に戻す" : "フォームを公開"}
            </button>
          </div>
        </div>
      </div>

      {/* フォーム先頭の注意書き */}
      <NoticeSection
        label="フォーム先頭の注意書き"
        notices={formStartNotices}
        onAdd={() => addNotice("form_start")}
        onUpdate={updateNotice}
        onDelete={deleteNotice}
        onUploadImage={uploadImage}
        onDeleteImage={deleteImage}
      />

      {/* フィールド一覧（カテゴリごと） */}
      {(["basic", "affiliation", "competition", "equipment"] as FieldCategory[]).map((cat) => {
        const catFields = grouped.get(cat);
        if (!catFields?.length) return null;
        return (
          <div key={cat} className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-800/80">
              <h3 className="text-sm font-semibold text-gray-300">{CATEGORY_LABELS[cat]}</h3>
            </div>
            <div className="divide-y divide-gray-700/50">
              {catFields.map((f, i) => {
                const globalIdx = mainFields.indexOf(f);
                const fieldNotices = notices.filter((n) => n.anchor_type === "field" && n.anchor_field_key === f.field_key);
                return (
                  <FieldRow
                    key={f.id}
                    field={f}
                    allFields={fields}
                    index={globalIdx}
                    total={mainFields.length}
                    notices={fieldNotices}
                    onUpdate={updateField}
                    onMove={moveField}
                    onAddNotice={() => addNotice("field", f.field_key)}
                    onUpdateNotice={updateNotice}
                    onDeleteNotice={deleteNotice}
                    onUploadImage={uploadImage}
                    onDeleteImage={deleteImage}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* フォーム末尾の注意書き */}
      <NoticeSection
        label="フォーム末尾の注意書き（送信ボタン前）"
        notices={formEndNotices}
        onAdd={() => addNotice("form_end")}
        onUpdate={updateNotice}
        onDelete={deleteNotice}
        onUploadImage={uploadImage}
        onDeleteImage={deleteImage}
      />

      {/* 過去大会コピーモーダル */}
      {showCopyModal && (
        <CopyModal
          events={pastEvents}
          onCopy={copyFromEvent}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  );
}

// ── フィールド行 ──────────────────────────────────────────────────────────

function FieldRow({
  field, allFields, index, total, notices,
  onUpdate, onMove, onAddNotice, onUpdateNotice, onDeleteNotice, onUploadImage, onDeleteImage,
}: {
  field: FormFieldConfig;
  allFields: FormFieldConfig[];
  index: number;
  total: number;
  notices: FormNotice[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onAddNotice: () => void;
  onUpdateNotice: (id: string, patch: Partial<FormNotice>) => void;
  onDeleteNotice: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  const def = getFieldDef(field.field_key);
  if (!def) return null;

  const isKanaParent = !!FIELD_POOL.find((p) => p.kanaParent === field.field_key);
  const kanaField = isKanaParent ? allFields.find((f) => {
    const kDef = FIELD_POOL.find((p) => p.kanaParent === field.field_key);
    return kDef && f.field_key === kDef.key;
  }) : null;

  const hasChoices = def.type === "radio" || def.type === "checkbox" || (def.type === "select" && !def.fixedChoices);
  const [editingChoices, setEditingChoices] = useState(false);
  const [choicesText, setChoicesText] = useState("");
  const [expanded, setExpanded] = useState(false);

  function startEditChoices() {
    const choices = field.custom_choices ?? def!.defaultChoices ?? [];
    setChoicesText(choices.map((c) => c.label).join("\n"));
    setEditingChoices(true);
  }

  function saveChoices() {
    const lines = choicesText.split("\n").filter((l) => l.trim());
    const choices = lines.map((label) => {
      const existing = (field.custom_choices ?? def!.defaultChoices ?? []).find((c) => c.label === label.trim());
      return { label: label.trim(), value: existing?.value ?? label.trim().toLowerCase().replace(/\s+/g, "_") };
    });
    onUpdate(field.id, { custom_choices: choices });
    setEditingChoices(false);
  }

  return (
    <div className={`${field.visible ? "" : "opacity-50"}`}>
      <div className="px-4 py-2.5 flex items-center gap-3">
        {/* 表示/非表示 */}
        <button
          onClick={() => {
            onUpdate(field.id, { visible: !field.visible });
            // 読み仮名も連動
            if (kanaField) onUpdate(kanaField.id, { visible: !field.visible });
          }}
          className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center text-xs ${
            field.visible ? "bg-blue-600 border-blue-600 text-white" : "border-gray-600"
          }`}
        >
          {field.visible && "✓"}
        </button>

        {/* ラベル */}
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left text-sm text-gray-200 hover:text-white truncate">
          {def.label}
          {isKanaParent && <span className="text-xs text-gray-500 ml-1.5">+ 読み仮名</span>}
        </button>

        {/* 必須/任意 */}
        <select
          value={field.required ? "required" : "optional"}
          onChange={(e) => onUpdate(field.id, { required: e.target.value === "required" })}
          className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300"
        >
          <option value="required">必須</option>
          <option value="optional">任意</option>
        </select>

        {/* 読み仮名の必須/任意 */}
        {kanaField && (
          <select
            value={kanaField.required ? "required" : "optional"}
            onChange={(e) => onUpdate(kanaField.id, { required: e.target.value === "required" })}
            className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300"
            title="読み仮名の必須/任意"
          >
            <option value="required">読み:必須</option>
            <option value="optional">読み:任意</option>
          </select>
        )}

        {/* 上下移動 */}
        <div className="flex gap-0.5 shrink-0">
          <button onClick={() => onMove(index, -1)} disabled={index === 0} className="px-1.5 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded transition">▲</button>
          <button onClick={() => onMove(index, 1)} disabled={index === total - 1} className="px-1.5 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 rounded transition">▼</button>
        </div>
      </div>

      {/* 展開エリア */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* その他オプション */}
          {(def.defaultHasOther !== undefined || hasChoices) && (
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={field.has_other_option}
                onChange={(e) => onUpdate(field.id, { has_other_option: e.target.checked })}
                className="rounded"
              />
              「その他の回答」欄を表示
            </label>
          )}

          {/* 選択肢編集 */}
          {hasChoices && (
            <div>
              {editingChoices ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">選択肢を1行1つで入力（追加・削除・並べ替え可）</p>
                  <textarea
                    value={choicesText}
                    onChange={(e) => setChoicesText(e.target.value)}
                    rows={6}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-gray-200"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveChoices} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">保存</button>
                    <button onClick={() => setEditingChoices(false)} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">キャンセル</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500">選択肢:</span>
                    <button onClick={startEditChoices} className="text-xs text-blue-400 hover:text-blue-300">編集</button>
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5">
                    {(field.custom_choices ?? def.defaultChoices ?? []).map((c, i) => (
                      <div key={i}>・{c.label}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 注意書き */}
          <div className="mt-2 space-y-2">
            {notices.map((n) => (
              <NoticeEditor
                key={n.id}
                notice={n}
                onUpdate={onUpdateNotice}
                onDelete={onDeleteNotice}
                onUploadImage={onUploadImage}
                onDeleteImage={onDeleteImage}
              />
            ))}
            <button
              onClick={onAddNotice}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + 注意書きを追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 注意書きセクション（フォーム先頭/末尾用） ───────────────────────────────

function NoticeSection({
  label, notices, onAdd, onUpdate, onDelete, onUploadImage, onDeleteImage,
}: {
  label: string;
  notices: FormNotice[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">{label}</h3>
        <button onClick={onAdd} className="text-xs text-blue-400 hover:text-blue-300">+ 追加</button>
      </div>
      {notices.length === 0 && <p className="text-xs text-gray-600">注意書きなし</p>}
      {notices.map((n) => (
        <NoticeEditor
          key={n.id}
          notice={n}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onUploadImage={onUploadImage}
          onDeleteImage={onDeleteImage}
        />
      ))}
    </div>
  );
}

// ── 注意書きエディタ ────────────────────────────────────────────────────

function NoticeEditor({
  notice, onUpdate, onDelete, onUploadImage, onDeleteImage,
}: {
  notice: FormNotice;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  const [localText, setLocalText] = useState(notice.text_content ?? "");
  const [localScrollable, setLocalScrollable] = useState(notice.scrollable_text ?? "");
  const [localUrl, setLocalUrl] = useState(notice.link_url ?? "");
  const [localUrlLabel, setLocalUrlLabel] = useState(notice.link_label ?? "");
  const [localConsentLabel, setLocalConsentLabel] = useState(notice.consent_label ?? "");

  function saveText() { onUpdate(notice.id, { text_content: localText || null }); }
  function saveScrollable() { onUpdate(notice.id, { scrollable_text: localScrollable || null }); }
  function saveLink() { onUpdate(notice.id, { link_url: localUrl || null, link_label: localUrlLabel || null }); }
  function saveConsent() { onUpdate(notice.id, { consent_label: localConsentLabel || null }); }

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-yellow-400 shrink-0 mt-0.5">⚠ 注意書き</span>
        <button onClick={() => onDelete(notice.id)} className="text-xs text-red-400 hover:text-red-300 shrink-0">削除</button>
      </div>

      {/* テキスト */}
      <div>
        <label className="text-xs text-gray-500 block mb-0.5">テキスト</label>
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={saveText}
          rows={2}
          className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200"
          placeholder="注意書きテキスト..."
        />
      </div>

      {/* 画像 */}
      <div>
        <label className="text-xs text-gray-500 block mb-0.5">画像</label>
        <div className="flex flex-wrap gap-2 mb-1">
          {(notice.images ?? []).map((img: FormNoticeImage & { public_url?: string }) => (
            <div key={img.id} className="relative group">
              <img
                src={img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`}
                alt=""
                className="h-16 rounded border border-gray-600"
              />
              <button
                onClick={() => onDeleteImage(img.id, notice.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
          + 画像をアップロード
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadImage(notice.id, file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* リンク */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 block mb-0.5">リンクURL</label>
          <input
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onBlur={saveLink}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
            placeholder="https://..."
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 block mb-0.5">リンク表示名</label>
          <input
            value={localUrlLabel}
            onChange={(e) => setLocalUrlLabel(e.target.value)}
            onBlur={saveLink}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
            placeholder="解説動画を見る"
          />
        </div>
      </div>

      {/* スクロールテキスト（規約用） */}
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">規約テキスト（スクロール表示）</summary>
        <textarea
          value={localScrollable}
          onChange={(e) => setLocalScrollable(e.target.value)}
          onBlur={saveScrollable}
          rows={4}
          className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200 mt-1"
          placeholder="規約全文をここに入力..."
        />
      </details>

      {/* 同意チェック */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={notice.require_consent}
            onChange={(e) => onUpdate(notice.id, { require_consent: e.target.checked })}
            className="rounded"
          />
          同意チェック必須
        </label>
        {notice.require_consent && (
          <input
            value={localConsentLabel}
            onChange={(e) => setLocalConsentLabel(e.target.value)}
            onBlur={saveConsent}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
            placeholder="上記内容に表明・承諾いたします"
          />
        )}
      </div>
    </div>
  );
}

// ── 過去大会コピーモーダル ───────────────────────────────────────────────

function CopyModal({
  events, onCopy, onClose,
}: {
  events: { id: string; name: string }[];
  onCopy: (eventId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg">過去の大会から読み込む</h3>
        <p className="text-sm text-gray-400">フォーム設定（項目の表示/非表示・選択肢・注意書き）をコピーします。現在の設定は上書きされます。</p>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">他の大会がありません</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {events.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  if (confirm(`「${e.name}」のフォーム設定をコピーしますか？\n現在の設定は上書きされます。`)) {
                    onCopy(e.id);
                  }
                }}
                className="w-full text-left px-4 py-2.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm transition"
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">閉じる</button>
      </div>
    </div>
  );
}
