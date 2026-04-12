"use client";

import { useEffect, useState, useCallback } from "react";
import type { TimerPreset } from "@/lib/types";
import { DEFAULT_LAYOUT } from "@/lib/types";
import { showToast } from "@/components/toast";
import { TimerPresetEditor, EMPTY_PRESET } from "@/components/_timer-preset-editor";
import type { EditablePreset } from "@/components/_timer-preset-editor";

function presetSummary(p: TimerPreset): string {
  const dur = `${Math.floor(p.match_duration / 60)}分${p.match_duration % 60 > 0 ? `${p.match_duration % 60}秒` : ""}`;
  const dir = p.timer_direction === "countdown" ? "カウントダウン" : "カウントアップ";
  const ext = p.has_extension
    ? ` / 延長${Math.floor(p.extension_duration / 60)}分${p.extension_duration % 60 > 0 ? `${p.extension_duration % 60}秒` : ""}`
    : "";
  const nwz = p.newaza_enabled ? " / 寝技あり" : "";
  return `${dur} / ${dir}${ext}${nwz}`;
}

function PresetListItem({
  p,
  deletingId,
  duplicatingId,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  p: TimerPreset;
  deletingId: string | null;
  duplicatingId: string | null;
  onEdit: (p: TimerPreset) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div>
        <p className="font-bold">{p.name}</p>
        <p className="text-xs text-gray-500">{presetSummary(p)}</p>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onEdit(p)}
          className="px-2 py-1 rounded bg-blue-900/50 hover:bg-blue-800/60 text-xs text-blue-300 transition"
        >
          編集
        </button>
        <button
          onClick={() => void onDuplicate(p.id)}
          disabled={duplicatingId === p.id}
          className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition disabled:opacity-50"
        >
          {duplicatingId === p.id ? "複製中..." : "複製"}
        </button>
        <button
          onClick={() => void onDelete(p.id)}
          disabled={deletingId === p.id}
          className="px-2 py-1 rounded bg-red-900/50 hover:bg-red-800/60 text-xs text-red-300 transition disabled:opacity-50"
        >
          {deletingId === p.id ? "削除中..." : "削除"}
        </button>
      </div>
    </div>
  );
}

export function TimerPresetsPanel() {
  const [presets, setPresets] = useState<TimerPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditablePreset | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/timer-presets");
    if (res.ok) setPresets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/admin/timer-presets");
      if (!cancelled) {
        if (res.ok) setPresets(await res.json());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (preset: EditablePreset) => {
    if (!preset.name) return;
    const url = editId ? `/api/admin/timer-presets/${editId}` : "/api/admin/timer-presets";
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    });
    if (!res.ok) {
      showToast(editId ? "保存に失敗しました" : "作成に失敗しました");
      return;
    }
    setEditing(null);
    setEditId(null);
    void load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このタイマーを削除しますか？")) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/timer-presets/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else showToast("削除に失敗しました");
    setDeletingId(null);
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    const res = await fetch(`/api/admin/timer-presets/${id}/duplicate`, { method: "POST" });
    if (res.ok) await load();
    else showToast("複製に失敗しました");
    setDuplicatingId(null);
  };

  function startNewPreset() {
    setEditing({ ...EMPTY_PRESET, layout: { ...DEFAULT_LAYOUT, rows: DEFAULT_LAYOUT.rows.map((r) => ({ ...r })) } });
    setEditId(null);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">タイマー管理</h1>
        <button
          onClick={startNewPreset}
          className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-sm text-white transition"
        >
          新規作成
        </button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : presets.length === 0 ? (
        <p className="text-gray-500">タイマーがありません。新規作成してください。</p>
      ) : (
        <div className="space-y-2">
          {presets.map((p) => (
            <PresetListItem
              key={p.id}
              p={p}
              deletingId={deletingId}
              duplicatingId={duplicatingId}
              onEdit={(pr) => {
                setEditing({ ...pr });
                setEditId(pr.id);
              }}
              onDelete={(id) => void handleDelete(id)}
              onDuplicate={(id) => void handleDuplicate(id)}
            />
          ))}
        </div>
      )}

      {/* 編集フォーム */}
      {editing && (
        <TimerPresetEditor
          editing={editing}
          editId={editId}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setEditId(null);
          }}
        />
      )}
    </>
  );
}
