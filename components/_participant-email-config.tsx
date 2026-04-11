"use client";

import { useState } from "react";
import { DEFAULT_SUBJECT, DEFAULT_BODY } from "@/lib/email-template";
import type { Event } from "@/lib/types";
import { showToast } from "@/components/toast";

function EmailTemplateVariables() {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">利用可能な変数:</p>
      <div className="flex flex-wrap gap-2">
        {[
          ["{{participant_name}}", "申込者名"],
          ["{{event_name}}", "大会名"],
          ["{{event_date}}", "開催日"],
          ["{{venue_info}}", "会場情報"],
          ["{{entry_details}}", "申込内容"],
          ["{{submission_date}}", "申込日時"],
        ].map(([key, desc]) => (
          <span key={key} className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
            <code className="text-blue-400">{key}</code> {desc}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        ※ {"{{#開催日}}...{{/開催日}}"} のように囲むと、その情報がある場合のみ表示されます（例:
        開催日が未設定なら非表示）
      </p>
    </div>
  );
}

export function EmailSettingsPanel({ event, onUpdate }: { event: Event; onUpdate: (u: Partial<Event>) => void }) {
  const [subjectTemplate, setSubjectTemplate] = useState(event.email_subject_template ?? DEFAULT_SUBJECT);
  const [bodyTemplate, setBodyTemplate] = useState(event.email_body_template ?? DEFAULT_BODY);
  const [venueInfo, setVenueInfo] = useState(event.venue_info ?? "");
  const [notificationEmails, setNotificationEmails] = useState((event.notification_emails ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    const emails = notificationEmails.split("\n").map((e) => e.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      email_subject_template: subjectTemplate || null,
      email_body_template: bodyTemplate || null,
      venue_info: venueInfo || null,
      notification_emails: emails.length > 0 ? emails : null,
    };
    const res = await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { showToast("保存に失敗しました"); return; }
    onUpdate(body as Partial<Event>);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <h2 className="font-semibold text-gray-200">確認メール設定</h2>
      <p className="text-xs text-gray-400">
        申込完了時に申込者へ確認メールを送信します。RESEND_API_KEY が未設定の場合、メールは送信されません。
      </p>
      <div className="space-y-1">
        <label className="text-sm text-gray-400">管理者通知メールアドレス（BCC、1行1アドレス）</label>
        <textarea rows={3} className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600" value={notificationEmails} onChange={(e) => setNotificationEmails(e.target.value)} placeholder="admin@example.com&#10;manager@example.com" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-gray-400">件名テンプレート</label>
        <input type="text" className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600" value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} placeholder="【{{event_name}}】参加申込を受け付けました" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-gray-400">会場情報</label>
        <textarea rows={3} className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600" value={venueInfo} onChange={(e) => setVenueInfo(e.target.value)} placeholder="〇〇体育館 2F アリーナ&#10;住所: ..." />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-gray-400">本文テンプレート</label>
        <textarea rows={12} className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600 font-mono" value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} placeholder="{{participant_name}} 様&#10;&#10;{{event_name}} への参加申込を受け付けました。..." />
      </div>
      <EmailTemplateVariables />
      <div className="flex items-center gap-3">
        <button onClick={() => void save()} disabled={saving} className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
        {saved && <span className="text-sm text-green-400">保存しました</span>}
      </div>
    </div>
  );
}

export function EmailStatusBadge({ event }: { event: Event }) {
  const hasTemplate = !!(event.email_subject_template || event.email_body_template);
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${hasTemplate ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
      {hasTemplate ? "設定済み" : "デフォルト"}
    </span>
  );
}

export function EmailConfigCard({ event, entrySubTab, onSetEntrySubTab, onSetEvent }: {
  event: Event; entrySubTab: "entries" | "form" | "email"; onSetEntrySubTab: (tab: "entries" | "form" | "email") => void; onSetEvent: (fn: (prev: Event | null) => Event | null) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => onSetEntrySubTab(entrySubTab === "email" ? "entries" : "email")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">メール設定</span>
          <EmailStatusBadge event={event} />
        </div>
        <span className={`text-gray-500 text-xs transition-transform ${entrySubTab === "email" ? "rotate-180" : ""}`}>▼</span>
      </button>
      {entrySubTab === "email" && (
        <div className="border-t border-gray-700">
          <EmailSettingsPanel event={event} onUpdate={(updates) => onSetEvent((prev) => (prev ? { ...prev, ...updates } : prev))} />
        </div>
      )}
    </div>
  );
}
