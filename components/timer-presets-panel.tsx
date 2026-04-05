"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { TimerPreset } from "@/lib/types";
import { DEFAULT_LAYOUT } from "@/lib/types";
import type { LayoutConfig, LayoutRow, LayoutRowType, LayoutAlignment, LayoutVerticalAlign } from "@/lib/types";
import { rowTypeLabel } from "@/lib/timer-layout";
import { BUILTIN_SOUNDS, SOUND_CATEGORIES, testBuzzer, preloadCustomBuzzer } from "@/lib/timer-buzzer";

type EditablePreset = Partial<TimerPreset> & { name: string };

const EMPTY_PRESET: EditablePreset = {
  name: "",
  match_duration: 120,
  timer_direction: "countdown",
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death",
  extension_timer_direction: "countdown",
  extension_show_timer: true,
  extension_max_count: 0,
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_direction: "countup",
  newaza_limit_type: "unlimited",
  newaza_max_count: 2,
  newaza_free_release: 10,
  show_points: true,
  show_wazaari: true,
  wazaari_points: 0,
  show_ippon: true,
  ippon_wins: true,
  combined_ippon_wins: false,
  point_win_threshold: 0,
  show_fouls: true,
  foul_to_point_start: 0,
  foul_point_value: 1,
  foul_loss_count: 0,
  foul_vs_point_priority: "foul_priority",
  show_player_names: true,
  show_match_number: true,
  color_left: "#DC2626",
  color_right: "#FFFFFF",
  color_left_name: "赤",
  color_right_name: "白",
  theme_bg_color: "#000000",
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "mid-square-single",
  buzzer_duration: 1.5,
  buzzer_repeat: 1,
  buzzer_sound_newaza: "mid-square-single",
  buzzer_duration_newaza: 1.5,
  buzzer_repeat_newaza: 1,
  swap_sides: false,
  layout: { ...DEFAULT_LAYOUT, rows: DEFAULT_LAYOUT.rows.map((r) => ({ ...r })) },
};

const FONT_FAMILY_MAP: Record<string, string> = {
  digital: "'Courier New', 'Consolas', monospace",
  sans: "system-ui, sans-serif",
  mono: "'Courier New', monospace",
};

const ROW_DEFAULTS: Record<LayoutRowType, LayoutRow> = {
  timer: { type: "timer", height: 40, fontSize: 35, align: "center", verticalAlign: "middle" },
  scores: { type: "scores", height: 0, fontSize: 25, align: "center", verticalAlign: "middle", subFontSize: 6 },
  player_names: { type: "player_names", height: 0, fontSize: 2.5, align: "left", verticalAlign: "middle" },
  match_info: { type: "match_info", height: 0, fontSize: 2, align: "center", verticalAlign: "middle" },
  newaza: { type: "newaza", height: 8, fontSize: 4, align: "center", verticalAlign: "middle" },
  spacer: { type: "spacer", height: 5, fontSize: 0, align: "center", verticalAlign: "middle" },
};

const ALL_ROW_TYPES: LayoutRowType[] = ["timer", "scores", "player_names", "match_info", "newaza", "spacer"];

function PreviewTimerDigits({ text, style }: { text: string; style: React.CSSProperties }) {
  const colonIdx = text.indexOf(":");
  if (colonIdx === -1) return <span style={style}>{text}</span>;
  const before = text.slice(0, colonIdx);
  const after = text.slice(colonIdx + 1);
  return (
    <span className="font-bold tabular-nums leading-none" style={style}>
      {before}
      <span style={{ position: "relative", bottom: "0.06em" }}>:</span>
      {after}
    </span>
  );
}

export function TimerPresetsPanel() {
  const [presets, setPresets] = useState<TimerPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditablePreset | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewHeight, setPreviewHeight] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/timer-presets");
    if (res.ok) setPresets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Measure preview container height
  useEffect(() => {
    if (!previewRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPreviewHeight(entry.contentRect.height);
      }
    });
    obs.observe(previewRef.current);
    return () => obs.disconnect();
  }, [editing]);

  // Derive layout when editing changes
  const layout: LayoutConfig = editing?.layout ?? { ...DEFAULT_LAYOUT, rows: DEFAULT_LAYOUT.rows.map((r) => ({ ...r })) };

  const setLayout = (newLayout: LayoutConfig) => {
    if (!editing) return;
    setEditing({ ...editing, layout: newLayout });
  };

  const updateRow = (idx: number, patch: Partial<LayoutRow>) => {
    const rows = [...layout.rows];
    rows[idx] = { ...rows[idx], ...patch };
    setLayout({ ...layout, rows });
  };

  const removeRow = (idx: number) => {
    const rows = layout.rows.filter((_, i) => i !== idx);
    setLayout({ ...layout, rows });
    if (expandedRow === idx) setExpandedRow(null);
    else if (expandedRow !== null && expandedRow > idx) setExpandedRow(expandedRow - 1);
  };

  const addRow = (type: LayoutRowType) => {
    const newRow: LayoutRow = { ...ROW_DEFAULTS[type] };
    setLayout({ ...layout, rows: [...layout.rows, newRow] });
    setAddRowOpen(false);
  };

  const moveRow = (from: number, to: number) => {
    if (from === to) return;
    const rows = [...layout.rows];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    setLayout({ ...layout, rows });
    if (expandedRow === from) setExpandedRow(to);
    else if (expandedRow !== null) {
      if (from < expandedRow && to >= expandedRow) setExpandedRow(expandedRow - 1);
      else if (from > expandedRow && to <= expandedRow) setExpandedRow(expandedRow + 1);
    }
  };

  const handleSave = async () => {
    if (!editing?.name) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/admin/timer-presets/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) { alert("保存に失敗しました"); return; }
      } else {
        const res = await fetch("/api/admin/timer-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) { alert("作成に失敗しました"); return; }
      }
      setEditing(null);
      setEditId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このタイマーを削除しますか？")) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/timer-presets/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert("削除に失敗しました");
    setDeletingId(null);
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    const res = await fetch(`/api/admin/timer-presets/${id}/duplicate`, { method: "POST" });
    if (res.ok) await load();
    else alert("複製に失敗しました");
    setDuplicatingId(null);
  };

  const field = (key: keyof EditablePreset, label: string, type: "text" | "number" | "checkbox" | "select" | "color" | "duration", opts?: { options?: { value: string; label: string }[] }) => {
    if (!editing) return null;
    const val = editing[key];
    if (type === "checkbox") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!val}
            onChange={(e) => setEditing({ ...editing, [key]: e.target.checked })}
            className="rounded" />
          {label}
        </label>
      );
    }
    if (type === "select" && opts?.options) {
      return (
        <label className="text-sm">
          <span className="text-gray-400">{label}</span>
          <select value={String(val ?? "")}
            onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
            className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm">
            {opts.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    if (type === "color") {
      return (
        <label className="text-sm">
          <span className="text-gray-400">{label}</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="color" value={String(val ?? "#000000")}
              onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
              className="h-8 w-10 rounded border border-gray-700 bg-gray-800 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded" />
            <span className="text-xs text-gray-500 font-mono">{String(val ?? "#000000")}</span>
          </div>
        </label>
      );
    }
    if (type === "duration") {
      const totalSec = Number(val ?? 0);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return (
        <label className="text-sm">
          <span className="text-gray-400">{label}</span>
          <div className="mt-1 flex items-center gap-1">
            <input type="number" min={0} value={min}
              onChange={(e) => setEditing({ ...editing, [key]: Number(e.target.value) * 60 + sec })}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-right" />
            <span className="text-gray-500 text-xs">分</span>
            <input type="number" min={0} max={59} value={sec}
              onChange={(e) => setEditing({ ...editing, [key]: min * 60 + Math.min(59, Number(e.target.value)) })}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-right" />
            <span className="text-gray-500 text-xs">秒</span>
          </div>
        </label>
      );
    }
    return (
      <label className="text-sm">
        <span className="text-gray-400">{label}</span>
        <input type={type} value={val as string | number ?? ""}
          onChange={(e) => setEditing({ ...editing, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
          className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm" />
      </label>
    );
  };

  const alignButton = (current: LayoutAlignment, value: LayoutAlignment, label: string, onChange: (v: LayoutAlignment) => void) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-2 py-1 text-xs rounded ${current === value ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
    >
      {label}
    </button>
  );

  const vAlignButton = (current: LayoutVerticalAlign, value: LayoutVerticalAlign, label: string, onChange: (v: LayoutVerticalAlign) => void) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-2 py-1 text-xs rounded ${current === value ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
    >
      {label}
    </button>
  );

  // Preview helper: convert vh to px
  const vhToPx = (vh: number) => (vh / 100) * previewHeight;

  const renderPreview = () => {
    if (!editing) return null;
    const bgColor = editing.theme_bg_color ?? "#000000";
    const timerColor = editing.theme_timer_color ?? "#00FF00";
    const dividerColor = editing.theme_divider_color ?? "#333333";
    const colorLeft = editing.color_left ?? "#DC2626";
    const colorRight = editing.color_right ?? "#FFFFFF";
    const fontFamily = FONT_FAMILY_MAP[editing.theme_font_family ?? "digital"] ?? FONT_FAMILY_MAP.digital;
    const dividerThickness = layout.dividerThickness;

    // Calculate row heights
    const totalFixedVh = layout.rows.reduce((s, r) => s + r.height, 0);
    const flexCount = layout.rows.filter((r) => r.height === 0).length;
    const remainingVh = Math.max(0, 100 - totalFixedVh);
    const flexVh = flexCount > 0 ? remainingVh / flexCount : 0;

    const alignStyle = (a: LayoutAlignment): React.CSSProperties => ({
      justifyContent: a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center",
    });
    const vAlignStyle = (v: LayoutVerticalAlign): React.CSSProperties => ({
      alignItems: v === "top" ? "flex-start" : v === "bottom" ? "flex-end" : "center",
    });

    return (
      <div
        ref={previewRef}
        className="relative aspect-video overflow-hidden rounded"
        style={{ background: bgColor, fontFamily }}
      >
        <div className="absolute inset-0 flex flex-col" style={{ height: "100%" }}>
          {layout.rows.map((row, idx) => {
            const rowVh = row.height === 0 ? flexVh : row.height;
            const fsPx = vhToPx(row.fontSize);
            const borderTop = idx > 0 ? `${dividerThickness}px solid ${dividerColor}` : "none";

            if (row.type === "timer") {
              const timerText = editing.theme_show_decimals ? "1:23.4" : "1:23";
              return (
                <div
                  key={idx}
                  className="flex"
                  style={{
                    height: `${rowVh}%`,
                    borderTop,
                    ...alignStyle(row.align),
                    ...vAlignStyle(row.verticalAlign),
                    padding: "0 4px",
                  }}
                >
                  <PreviewTimerDigits text={timerText} style={{ color: timerColor, fontSize: `${fsPx}px` }} />
                </div>
              );
            }

            if (row.type === "newaza") {
              return (
                <div
                  key={idx}
                  className="flex gap-1"
                  style={{
                    height: `${rowVh}%`,
                    borderTop,
                    ...alignStyle(row.align),
                    ...vAlignStyle(row.verticalAlign),
                    padding: "0 4px",
                  }}
                >
                  <span className="text-gray-500 font-bold" style={{ fontSize: `${fsPx * 0.5}px` }}>{layout.labelNewaza || "寝技"}</span>
                  <PreviewTimerDigits text="0:12" style={{ color: "rgb(34 211 238)", fontSize: `${fsPx}px` }} />
                </div>
              );
            }

            if (row.type === "match_info") {
              return (
                <div
                  key={idx}
                  className="flex"
                  style={{
                    height: `${rowVh}%`,
                    borderTop,
                    ...alignStyle(row.align),
                    ...vAlignStyle(row.verticalAlign),
                    padding: "0 4px",
                  }}
                >
                  <span className="text-gray-400" style={{ fontSize: `${fsPx}px` }}>A-1 第1試合</span>
                </div>
              );
            }

            if (row.type === "player_names") {
              return (
                <div
                  key={idx}
                  className="flex"
                  style={{
                    height: `${rowVh}%`,
                    borderTop,
                    ...alignStyle(row.align),
                    ...vAlignStyle(row.verticalAlign),
                    padding: "0 4px",
                    gap: `${layout.scoreGap}px`,
                  }}
                >
                  <div className="flex-1 flex" style={{ ...alignStyle(row.align) }}>
                    <span className="font-bold" style={{ color: colorLeft, fontSize: `${fsPx}px` }}>山田 太郎</span>
                  </div>
                  <div className="flex-1 flex" style={{ ...alignStyle(row.align) }}>
                    <span className="font-bold" style={{ color: colorRight, fontSize: `${fsPx}px` }}>鈴木 一郎</span>
                  </div>
                </div>
              );
            }

            if (row.type === "scores") {
              const foulCellH = Math.max(fsPx * 0.22, 4);
              const foulCellW = Math.max(fsPx * 0.35, 6);
              const foulFsPx = Math.max(fsPx * 0.13, 3);
              const showPoints = editing.show_points ?? true;
              const showWazaari = editing.show_wazaari ?? false;
              const bothVisible = showPoints && showWazaari;
              const mainFsPx = bothVisible ? fsPx * 0.67 : fsPx;
              const wazaariFsPx = bothVisible ? fsPx * 0.35 : fsPx;
              return (
                <div
                  key={idx}
                  className="flex"
                  style={{
                    height: `${rowVh}%`,
                    borderTop,
                  }}
                >
                  {/* Left: foul indicator + score */}
                  <div className="flex-1 flex">
                    {/* Foul indicator (left edge) */}
                    <div className="flex flex-col items-center justify-center" style={{ padding: `0 ${fsPx * 0.05}px` }}>
                      <span className="text-gray-500 font-bold" style={{ fontSize: `${fsPx * 0.1}px` }}>反則</span>
                      {[4, 3, 2, 1].map((n) => (
                        <div
                          key={n}
                          style={{
                            width: `${foulCellW}px`,
                            height: `${foulCellH}px`,
                            backgroundColor: n === 1 ? colorLeft : "#1a1a2e",
                            border: "1px solid #333",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: `${foulFsPx}px`,
                            color: n === 1 ? "#000" : "#555",
                          }}
                        />
                      ))}
                    </div>
                    {/* Score content */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                      {showPoints && (
                        <span className="font-bold tabular-nums leading-none" style={{ color: colorLeft, fontSize: `${mainFsPx}px` }}>3</span>
                      )}
                      {showWazaari && (
                        <div className="flex items-baseline justify-center gap-0.5" style={{ marginTop: showPoints ? `${fsPx * 0.05}px` : undefined }}>
                          <span className="text-gray-500 font-bold" style={{ fontSize: `${wazaariFsPx * 0.35}px` }}>技</span>
                          <span className="font-bold tabular-nums leading-none" style={{ color: colorLeft, fontSize: `${wazaariFsPx}px` }}>1</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Center: newaza */}
                  <div className="flex flex-col items-center justify-center" style={{ minWidth: `${fsPx * 1.2}px`, borderLeft: `${dividerThickness}px solid ${dividerColor}`, borderRight: `${dividerThickness}px solid ${dividerColor}` }}>
                    <span className="text-gray-500 font-bold" style={{ fontSize: `${fsPx * 0.2}px` }}>{layout.labelNewaza || "寝技"}</span>
                    <PreviewTimerDigits text="0:12" style={{ color: "rgb(34 211 238)", fontSize: `${fsPx * 0.45}px` }} />
                  </div>
                  {/* Right: score + foul indicator */}
                  <div className="flex-1 flex">
                    {/* Score content */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                      {showPoints && (
                        <span className="font-bold tabular-nums leading-none" style={{ color: colorRight, fontSize: `${mainFsPx}px` }}>1</span>
                      )}
                      {showWazaari && (
                        <div className="flex items-baseline justify-center gap-0.5" style={{ marginTop: showPoints ? `${fsPx * 0.05}px` : undefined }}>
                          <span className="text-gray-500 font-bold" style={{ fontSize: `${wazaariFsPx * 0.35}px` }}>技</span>
                          <span className="font-bold tabular-nums leading-none" style={{ color: colorRight, fontSize: `${wazaariFsPx}px` }}>0</span>
                        </div>
                      )}
                    </div>
                    {/* Foul indicator (right edge) */}
                    <div className="flex flex-col items-center justify-center" style={{ padding: `0 ${fsPx * 0.05}px` }}>
                      <span className="text-gray-500 font-bold" style={{ fontSize: `${fsPx * 0.1}px` }}>反則</span>
                      {[4, 3, 2, 1].map((n) => (
                        <div
                          key={n}
                          style={{
                            width: `${foulCellW}px`,
                            height: `${foulCellH}px`,
                            backgroundColor: "#1a1a2e",
                            border: "1px solid #333",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: `${foulFsPx}px`,
                            color: "#555",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            if (row.type === "spacer") {
              return (
                <div
                  key={idx}
                  style={{ height: `${rowVh}%`, borderTop }}
                />
              );
            }

            return <div key={idx} style={{ height: `${rowVh}%`, borderTop }} />;
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">タイマー管理</h1>
        <div className="flex gap-2">
          <button onClick={() => { setEditing({ ...EMPTY_PRESET, layout: { ...DEFAULT_LAYOUT, rows: DEFAULT_LAYOUT.rows.map((r) => ({ ...r })) } }); setEditId(null); }}
            className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-sm text-white transition">
            新規作成
          </button>
        </div>
      </div>

      {/* 一覧 */}
      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : presets.length === 0 ? (
        <p className="text-gray-500">タイマーがありません。新規作成してください。</p>
      ) : (
        <div className="space-y-2">
          {presets.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div>
                <p className="font-bold">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {Math.floor(p.match_duration / 60)}分{p.match_duration % 60 > 0 ? `${p.match_duration % 60}秒` : ""} / {p.timer_direction === "countdown" ? "カウントダウン" : "カウントアップ"}
                  {p.has_extension && ` / 延長${Math.floor(p.extension_duration / 60)}分${p.extension_duration % 60 > 0 ? `${p.extension_duration % 60}秒` : ""}`}
                  {p.newaza_enabled && " / 寝技あり"}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing({ ...p }); setEditId(p.id); }}
                  className="px-2 py-1 rounded bg-blue-900/50 hover:bg-blue-800/60 text-xs text-blue-300 transition">
                  編集
                </button>
                <button onClick={() => handleDuplicate(p.id)}
                  disabled={duplicatingId === p.id}
                  className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition disabled:opacity-50">
                  {duplicatingId === p.id ? "複製中..." : "複製"}
                </button>
                <button onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="px-2 py-1 rounded bg-red-900/50 hover:bg-red-800/60 text-xs text-red-300 transition disabled:opacity-50">
                  {deletingId === p.id ? "削除中..." : "削除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 編集フォーム */}
      {editing && (
        <div className="mt-6 border border-gray-700 rounded-xl bg-gray-900 p-6">
            <h2 className="text-lg font-bold mb-4">{editId ? "タイマー編集" : "新規タイマー"}</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左: 設定フォーム */}
            <div className="space-y-4 overflow-y-auto max-h-[80vh]">
              {field("name", "タイマー名", "text")}
              <p className="text-xs text-gray-600 mt-1">試合時間・延長有無などの設定名を入力（例: 3分カウントダウン・延長1分）</p>

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">基本設定</h3>
              <div className="grid grid-cols-2 gap-3">
                {field("match_duration", "試合時間", "duration")}
                {field("timer_direction", "タイマー方向", "select", {
                  options: [{ value: "countdown", label: "カウントダウン" }, { value: "countup", label: "カウントアップ" }]
                })}
              </div>
              <div className="space-y-2">
                {field("has_extension", "延長戦あり", "checkbox")}
                {editing.has_extension && (
                  <div className="space-y-2 pl-4">
                    {field("extension_mode", "延長タイプ", "select", {
                      options: [{ value: "timed", label: "時間延長" }, { value: "sudden_death", label: "先取延長" }]
                    })}
                    {editing.extension_mode === "timed" && (
                      <div className="grid grid-cols-2 gap-3">
                        {field("extension_duration", "延長時間", "duration")}
                        {field("extension_timer_direction", "カウント方向", "select", {
                          options: [{ value: "countdown", label: "カウントダウン" }, { value: "countup", label: "カウントアップ" }]
                        })}
                        {field("extension_max_count", "最大延長回数（0=無制限）", "number")}
                      </div>
                    )}
                    {editing.extension_mode === "sudden_death" && (
                      <div className="grid grid-cols-2 gap-3">
                        {field("extension_show_timer", "タイマー表示（カウントアップ）", "checkbox")}
                      </div>
                    )}
                  </div>
                )}
                {field("allow_draw", "引き分け判定あり", "checkbox")}
              </div>

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">寝技タイマー</h3>
              {field("newaza_enabled", "寝技タイマー有効", "checkbox")}
              {editing.newaza_enabled && (
                <div className="grid grid-cols-2 gap-3 pl-4">
                  {field("newaza_duration", "寝技制限時間", "duration")}
                  {field("newaza_direction", "寝技タイマー方向", "select", {
                    options: [{ value: "countup", label: "カウントアップ" }, { value: "countdown", label: "カウントダウン" }]
                  })}
                  {field("newaza_limit_type", "起動回数制限", "select", {
                    options: [{ value: "unlimited", label: "無制限" }, { value: "limited", label: "回数制限あり" }]
                  })}
                  {editing.newaza_limit_type === "limited" && field("newaza_max_count", "最大起動回数", "number")}
                  {field("newaza_free_release", "無消費解除時間", "duration")}
                </div>
              )}

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">ポイント・判定</h3>
              <div className="space-y-2">
                {field("show_points", "ポイント表示", "checkbox")}
                {field("show_wazaari", "技あり表示", "checkbox")}
                {field("wazaari_points", "技あり→ポイント変換数", "number")}
                {field("show_ippon", "一本表示", "checkbox")}
                {field("ippon_wins", "一本で即勝利", "checkbox")}
                {field("combined_ippon_wins", "技あり2回で合わせ一本勝ち", "checkbox")}
                {field("point_win_threshold", "ポイント先取り勝ち（0=なし）", "number")}
              </div>

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">反則</h3>
              <div className="space-y-2">
                {field("show_fouls", "反則カウント表示", "checkbox")}
                {field("foul_to_point_start", "反則→相手ポイント開始回数（0=なし）", "number")}
                {field("foul_point_value", "反則1回あたりの付与ポイント", "number")}
                {field("foul_loss_count", "反則負け回数（0=なし）", "number")}
                {field("foul_vs_point_priority", "反則負けvsポイント先取り", "select", {
                  options: [{ value: "foul_priority", label: "反則負け優先" }, { value: "point_priority", label: "ポイント先取り優先" }]
                })}
              </div>

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">表示設定</h3>
              <div className="grid grid-cols-2 gap-3">
                {field("color_left", "左選手カラー", "color")}
                {field("color_right", "右選手カラー", "color")}
                {field("color_left_name", "左カラー名", "text")}
                {field("color_right_name", "右カラー名", "text")}
              </div>
              <div className="space-y-2">
                {field("show_player_names", "選手名表示", "checkbox")}
                {field("show_match_number", "試合番号表示", "checkbox")}
              </div>

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">カラー・フォント</h3>
              <div className="grid grid-cols-2 gap-3">
                {field("theme_bg_color", "背景色", "color")}
                {field("theme_timer_color", "タイマー色", "color")}
                {field("theme_timer_warn_color", "警告色", "color")}
                {field("theme_warn_threshold", "警告閾値", "duration")}
                {field("theme_divider_color", "区切り線色", "color")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("theme_font_family", "フォント", "select", {
                  options: [{ value: "digital", label: "デジタル" }, { value: "sans", label: "ゴシック" }, { value: "mono", label: "等幅" }]
                })}
              </div>
              {field("theme_show_decimals", "0.1秒表示", "checkbox")}

              {/* レイアウトエディタ */}
              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">レイアウトエディタ</h3>

              {/* Row list */}
              <div className="space-y-2">
                {layout.rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden"
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(idx);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) {
                        moveRow(dragIdx, idx);
                        setDragIdx(null);
                      }
                    }}
                    onDragEnd={() => setDragIdx(null)}
                  >
                    {/* Row header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700/30"
                      onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                    >
                      <span className="cursor-grab text-gray-500 hover:text-gray-300 text-lg select-none" title="ドラッグで並べ替え">⠿</span>
                      <span className="flex-1 text-sm font-medium">{rowTypeLabel(row.type)}</span>
                      <span className="text-xs text-gray-500 mr-1">{expandedRow === idx ? "▼" : "▶"}</span>
                      <span className="text-xs text-gray-500">
                        {row.height > 0 ? `${row.height}vh` : "自動"} / {row.fontSize}vh
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeRow(idx); }}
                        className="text-gray-500 hover:text-red-400 text-sm px-1"
                        title="削除"
                      >
                        ×
                      </button>
                    </div>

                    {/* Row detail panel */}
                    {expandedRow === idx && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-700 space-y-3">
                        {/* Height */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-20 shrink-0">高さ</span>
                          <input
                            type="range"
                            min={0} max={80} step={1}
                            value={row.height}
                            onChange={(e) => updateRow(idx, { height: Number(e.target.value) })}
                            className="flex-1 accent-blue-500"
                          />
                          <input
                            type="number"
                            min={0} max={80} step={1}
                            value={row.height}
                            onChange={(e) => updateRow(idx, { height: Number(e.target.value) })}
                            className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-right"
                          />
                          <span className="text-xs text-gray-500">vh</span>
                          {row.height === 0 && <span className="text-xs text-blue-400">(自動)</span>}
                        </div>

                        {/* Font size */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-20 shrink-0">フォント</span>
                          <input
                            type="range"
                            min={1} max={100} step={0.5}
                            value={row.fontSize}
                            onChange={(e) => updateRow(idx, { fontSize: Number(e.target.value) })}
                            className="flex-1 accent-blue-500"
                          />
                          <input
                            type="number"
                            min={0} step={0.5}
                            value={row.fontSize}
                            onChange={(e) => updateRow(idx, { fontSize: Number(e.target.value) })}
                            className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-right"
                          />
                          <span className="text-xs text-gray-500">vh</span>
                        </div>

                        {/* Horizontal align */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-20 shrink-0">水平揃え</span>
                          <div className="grid grid-cols-3 gap-1">
                            {alignButton(row.align, "left", "左", (v) => updateRow(idx, { align: v }))}
                            {alignButton(row.align, "center", "中", (v) => updateRow(idx, { align: v }))}
                            {alignButton(row.align, "right", "右", (v) => updateRow(idx, { align: v }))}
                          </div>
                        </div>

                        {/* Vertical align */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-20 shrink-0">垂直揃え</span>
                          <div className="grid grid-cols-3 gap-1">
                            {vAlignButton(row.verticalAlign, "top", "上", (v) => updateRow(idx, { verticalAlign: v }))}
                            {vAlignButton(row.verticalAlign, "middle", "中", (v) => updateRow(idx, { verticalAlign: v }))}
                            {vAlignButton(row.verticalAlign, "bottom", "下", (v) => updateRow(idx, { verticalAlign: v }))}
                          </div>
                        </div>

                        {/* scores-specific: subFontSize and subAlign */}
                        {row.type === "scores" && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-20 shrink-0">副フォント</span>
                              <input
                                type="range"
                                min={1} max={100} step={0.5}
                                value={row.subFontSize ?? 6}
                                onChange={(e) => updateRow(idx, { subFontSize: Number(e.target.value) })}
                                className="flex-1 accent-blue-500"
                              />
                              <input
                                type="number"
                                min={0} step={0.5}
                                value={row.subFontSize ?? 6}
                                onChange={(e) => updateRow(idx, { subFontSize: Number(e.target.value) })}
                                className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-right"
                              />
                              <span className="text-xs text-gray-500">vh</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-20 shrink-0">副揃え</span>
                              <div className="grid grid-cols-3 gap-1">
                                {alignButton(row.subAlign ?? "center", "left", "左", (v) => updateRow(idx, { subAlign: v }))}
                                {alignButton(row.subAlign ?? "center", "center", "中", (v) => updateRow(idx, { subAlign: v }))}
                                {alignButton(row.subAlign ?? "center", "right", "右", (v) => updateRow(idx, { subAlign: v }))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 表示ラベル設定 */}
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 font-medium mb-2">表示ラベル設定</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="text-gray-400">技ありラベル</span>
                  <input type="text" value={layout.labelWazaari ?? "W"}
                    onChange={(e) => setLayout({ ...layout, labelWazaari: e.target.value })}
                    placeholder="W"
                    className="mt-0.5 block w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs" />
                  <span className="text-gray-600 text-[10px]">例: W, 技あり, 技</span>
                </label>
                <label className="text-xs">
                  <span className="text-gray-400">反則ラベル</span>
                  <input type="text" value={layout.labelFoul ?? "F"}
                    onChange={(e) => setLayout({ ...layout, labelFoul: e.target.value })}
                    placeholder="F"
                    className="mt-0.5 block w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs" />
                  <span className="text-gray-600 text-[10px]">例: F, 反則, 反</span>
                </label>
                <label className="text-xs">
                  <span className="text-gray-400">ポイントラベル</span>
                  <input type="text" value={layout.labelPoint ?? ""}
                    onChange={(e) => setLayout({ ...layout, labelPoint: e.target.value })}
                    placeholder="空欄で非表示"
                    className="mt-0.5 block w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs" />
                  <span className="text-gray-600 text-[10px]">例: pt, P, 空欄</span>
                </label>
                <label className="text-xs">
                  <span className="text-gray-400">寝技ラベル</span>
                  <input type="text" value={layout.labelNewaza ?? "寝技"}
                    onChange={(e) => setLayout({ ...layout, labelNewaza: e.target.value })}
                    placeholder="寝技"
                    className="mt-0.5 block w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs" />
                  <span className="text-gray-600 text-[10px]">例: 寝技, NEWAZA</span>
                </label>
              </div>
              </div>

              {/* Add row button */}
              <div className="relative mt-2">
                <button
                  type="button"
                  onClick={() => setAddRowOpen(!addRowOpen)}
                  className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-950/30 text-sm text-gray-400 hover:text-blue-400 transition font-medium"
                >
                  + 行を追加
                </button>
                {addRowOpen && (
                  <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 py-1 min-w-48">
                    {ALL_ROW_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addRow(type)}
                        className="block w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition"
                      >
                        {rowTypeLabel(type)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">ブザー</h3>
              <div className="grid grid-cols-2 gap-3">
                {field("buzzer_on_time_up", "試合終了ブザー", "select", {
                  options: [{ value: "auto", label: "自動" }, { value: "manual", label: "手動" }, { value: "off", label: "なし" }]
                })}
                {field("buzzer_on_newaza", "寝技タイムアップブザー", "select", {
                  options: [{ value: "auto", label: "自動" }, { value: "manual", label: "手動" }, { value: "off", label: "なし" }]
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2 mb-1">試合終了ブザー音源</p>
              <BuzzerSoundSelector
                soundId={editing.buzzer_sound ?? "mid-square-single"}
                duration={editing.buzzer_duration ?? 1.5}
                repeat={editing.buzzer_repeat ?? 1}
                customPath={editing.buzzer_custom_path ?? null}
                presetId={editId}
                onSoundChange={(v) => setEditing({ ...editing, buzzer_sound: v })}
                onDurationChange={(v) => setEditing({ ...editing, buzzer_duration: v })}
                onRepeatChange={(v) => setEditing({ ...editing, buzzer_repeat: v })}
                onCustomPathChange={(v) => setEditing({ ...editing, buzzer_custom_path: v, buzzer_sound: v ? "custom" : "mid-square-single" })}
              />
              <p className="text-xs text-gray-500 mt-3 mb-1">寝技タイムアップブザー音源</p>
              <BuzzerSoundSelector
                soundId={editing.buzzer_sound_newaza ?? "mid-square-single"}
                duration={editing.buzzer_duration_newaza ?? 1.5}
                repeat={editing.buzzer_repeat_newaza ?? 1}
                customPath={null}
                presetId={null}
                onSoundChange={(v) => setEditing({ ...editing, buzzer_sound_newaza: v })}
                onDurationChange={(v) => setEditing({ ...editing, buzzer_duration_newaza: v })}
                onRepeatChange={(v) => setEditing({ ...editing, buzzer_repeat_newaza: v })}
                onCustomPathChange={() => {}}
              />
            </div>

            {/* 右: プレビュー（sticky） */}
            <div className="lg:sticky lg:top-4 self-start">
              <div className="rounded-lg overflow-hidden border border-gray-700">
                <p className="text-xs text-gray-500 px-2 py-1 bg-gray-800/50">プレビュー（実際のタイマー画面イメージ）</p>
                {renderPreview()}
              </div>
            </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={handleSave} disabled={saving || !editing.name}
                className="flex-1 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
              <button onClick={() => { setEditing(null); setEditId(null); }}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition">
                キャンセル
              </button>
            </div>
        </div>
      )}
    </>
  );
}

// ═══════════ ブザー音源選択コンポーネント ═══════════

function BuzzerSoundSelector({ soundId, duration, repeat, customPath, presetId, onSoundChange, onDurationChange, onRepeatChange, onCustomPathChange }: {
  soundId: string;
  duration: number;
  repeat: number;
  customPath: string | null;
  presetId: string | null;
  onSoundChange: (id: string) => void;
  onDurationChange: (d: number) => void;
  onRepeatChange: (r: number) => void;
  onCustomPathChange: (path: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);

  async function handlePreview() {
    if (playing) return;
    setPlaying(true);
    if (soundId === "custom" && customPath) {
      preloadCustomBuzzer(customPath);
      await new Promise(r => setTimeout(r, 300));
    }
    await testBuzzer(soundId, duration, repeat);
    setTimeout(() => setPlaying(false), Math.max(duration * 1000 * repeat + 300 * (repeat - 1), 500));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !presetId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/admin/timer-presets/${presetId}/buzzer`, { method: "POST", body: formData });
    if (res.ok) {
      const { url } = await res.json();
      onCustomPathChange(url);
    } else {
      alert("アップロードに失敗しました");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete() {
    if (!presetId) return;
    await fetch(`/api/admin/timer-presets/${presetId}/buzzer`, { method: "DELETE" });
    onCustomPathChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">ブザー音源</label>
          <div className="flex gap-1">
            <select
              value={soundId}
              onChange={(e) => onSoundChange(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
            >
              {SOUND_CATEGORIES.map(cat => (
                <optgroup key={cat} label={cat}>
                  {BUILTIN_SOUNDS.filter(s => s.category === cat).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="その他">
                <option value="custom">カスタム音源</option>
              </optgroup>
            </select>
            <button
              onClick={handlePreview}
              disabled={playing}
              className="bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white px-2 py-1 rounded text-sm transition shrink-0"
            >
              {playing ? "..." : "▶"}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">鳴動秒数</label>
          <select
            value={duration}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            disabled={soundId === "custom" || soundId.endsWith("-double") || soundId.endsWith("-triple")}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
          >
            {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0].map(v => (
              <option key={v} value={v}>{v}秒</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">連続回数</label>
          <select
            value={repeat}
            onChange={(e) => onRepeatChange(Number(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value={1}>1回</option>
            <option value={2}>2回</option>
            <option value={3}>3回</option>
          </select>
        </div>
      </div>

      {soundId === "custom" && (
        <div className="bg-gray-900 rounded px-3 py-2 space-y-2">
          {customPath ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-300 truncate flex-1">アップロード済み</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={handlePreview} disabled={playing} className="text-xs text-blue-400 hover:text-blue-300">
                  {playing ? "再生中..." : "試聴"}
                </button>
                <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300">削除</button>
              </div>
            </div>
          ) : presetId ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">音源ファイル（MP3/WAV/OGG、2MB以内）</label>
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/ogg"
                onChange={handleUpload}
                disabled={uploading}
                className="text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
              />
              {uploading && <p className="text-xs text-blue-400 mt-1">アップロード中...</p>}
            </div>
          ) : (
            <p className="text-xs text-gray-500">カスタム音源のアップロードはプリセット保存後に行えます</p>
          )}
        </div>
      )}
    </div>
  );
}
