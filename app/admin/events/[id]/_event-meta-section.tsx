"use client";

import { useState } from "react";
import type { Event } from "@/lib/types";
import { showToast } from "@/components/toast";

type EventMetaSectionProps = {
  event: Event;
  eventId: string;
  onEventUpdate: (updates: Partial<Event>) => void;
};

export default function EventMetaSection({ event, eventId, onEventUpdate }: EventMetaSectionProps) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaDate, setMetaDate] = useState("");
  const [metaCourtNames, setMetaCourtNames] = useState<string[]>([]);

  async function saveEventMeta() {
    setSavingMeta(true);
    const updates = {
      event_date: metaDate || null,
      court_names: metaCourtNames,
    };
    const res = await fetch(`/api/admin/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setSavingMeta(false);
    if (!res.ok) {
      showToast("保存に失敗しました");
      return;
    }
    onEventUpdate(updates);
    setEditingMeta(false);
  }

  function startEditing() {
    setMetaDate(event.event_date ?? "");
    setMetaCourtNames(Array.from({ length: event.court_count }, (_, i) => event.court_names?.[i] ?? ""));
    setEditingMeta(true);
  }

  if (!editingMeta) {
    return (
      <div className="mb-6 bg-gray-800 rounded-xl px-4 py-3">
        <MetaDisplayView event={event} onEdit={startEditing} />
      </div>
    );
  }

  return (
    <div className="mb-6 bg-gray-800 rounded-xl px-4 py-3">
      <MetaEditForm
        metaDate={metaDate}
        metaCourtNames={metaCourtNames}
        savingMeta={savingMeta}
        onSetMetaDate={setMetaDate}
        onSetMetaCourtNames={setMetaCourtNames}
        onSave={() => void saveEventMeta()}
        onCancel={() => setEditingMeta(false)}
      />
    </div>
  );
}

function MetaDisplayView({ event, onEdit }: { event: Event; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="text-sm text-gray-400">
        開催日: <span className="text-gray-200">{event.event_date ?? "未設定"}</span>
      </span>
      <span className="text-sm text-gray-400">
        コート数: <span className="text-gray-200">{event.court_count}</span>
      </span>
      {event.court_names && event.court_names.some((n) => n?.trim()) && (
        <span className="text-sm text-gray-400">
          コート名: <span className="text-gray-200">{event.court_names.map((n, i) => n?.trim() || `コート${i + 1}`).join(" / ")}</span>
        </span>
      )}
      <button onClick={onEdit} className="ml-auto text-xs text-blue-400 hover:text-blue-300">
        編集
      </button>
    </div>
  );
}

function MetaEditForm({
  metaDate,
  metaCourtNames,
  savingMeta,
  onSetMetaDate,
  onSetMetaCourtNames,
  onSave,
  onCancel,
}: {
  metaDate: string;
  metaCourtNames: string[];
  savingMeta: boolean;
  onSetMetaDate: (v: string) => void;
  onSetMetaCourtNames: React.Dispatch<React.SetStateAction<string[]>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="meta-event-date" className="text-xs text-gray-400 shrink-0">
          開催日
        </label>
        <input
          id="meta-event-date"
          type="date"
          value={metaDate}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onSetMetaDate(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-gray-400">コート名</span>
        <div className="grid grid-cols-2 gap-2">
          {metaCourtNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-14 shrink-0">コート{i + 1}</span>
              <input
                id={`court-name-${i}`}
                value={name}
                onChange={(e) =>
                  onSetMetaCourtNames((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })
                }
                placeholder={`コート${i + 1}`}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={savingMeta}
          className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 flex items-center gap-1.5"
        >
          {savingMeta && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          {savingMeta ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          disabled={savingMeta}
          className="px-4 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
