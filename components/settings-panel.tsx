"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isDev } from "@/lib/app-mode";
import type { Dojo, Rule } from "@/lib/types";
import {
  TTS_VOICES, getTtsSettings, saveTtsSettings, announceCustom, type TtsVoice,
  renderTemplate, DEFAULT_TEMPLATES,
  MATCH_VARS, WINNER_VARS, SAMPLE_MATCH_VARS, SAMPLE_WINNER_VARS, type AnnounceTemplates,
} from "@/lib/speech";
import { TimerPresetsPanel } from "@/components/timer-presets-panel";
import { showToast } from "@/components/toast";
import AgeCategoriesPanel from "@/components/age-categories-panel";
import BugReportsPanel from "@/components/bug-reports-panel";

// ── 流派 ──────────────────────────────────────────────────────────────────

function DojoPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("dojos").select("*").order("name");
    setDojos(data ?? []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/dojos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), name_reading: reading.trim() || null }),
    });
    setAdding(false);
    if (!res.ok) { showToast("追加に失敗しました"); return; }
    setName(""); setReading("");
    load();
  }

  async function updateReading(id: string, value: string) {
    const res = await fetch(`/api/admin/dojos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_reading: value.trim() || null }),
    });
    if (!res.ok) { showToast("読み仮名の更新に失敗しました"); return; }
    load();
  }

  async function remove(id: string) {
    if (!confirm("この道場を削除しますか？所属選手も削除されます。")) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/dojos/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) { showToast("削除に失敗しました"); return; }
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2 mb-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="流派名（例: 極真会）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder="読み仮名（例: きょくしんかい）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <button type="submit" disabled={adding} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50 flex items-center gap-1.5">
            {adding && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
            {adding ? "追加中..." : "追加"}
          </button>
        </div>
      </form>
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {dojos.map((d) => (
            <li key={d.id} className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{d.name}</span>
                <button onClick={() => remove(d.id)} disabled={removingId === d.id} className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50">
                  {removingId === d.id ? "削除中..." : "削除"}
                </button>
              </div>
              <ReadingInput
                value={d.name_reading ?? ""}
                placeholder="読み仮名（例: きょくしんかい）"
                onSave={(v) => updateReading(d.id, v)}
              />
            </li>
          ))}
          {dojos.length === 0 && <li className="text-gray-500 text-sm">流派が登録されていません</li>}
        </ul>
      )}
    </div>
  );
}

// ── ルール ────────────────────────────────────────────────────────────────

function RulesPanel({ onNavigateToTimer }: { onNavigateToTimer: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [presets, setPresets] = useState<{id: string; name: string}[]>([]);
  const [linkingRuleId, setLinkingRuleId] = useState<string | null>(null);
  const [selectingRuleId, setSelectingRuleId] = useState<string | null>(null);

  async function loadPresets() {
    const presetsRes = await fetch("/api/admin/timer-presets");
    if (presetsRes.ok) setPresets(await presetsRes.json());
  }

  async function load() {
    const { data } = await supabase.from("rules").select("*").order("name");
    setRules(data ?? []);
    setLoading(false);
    await loadPresets();
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- initial data fetch on mount
  useEffect(() => { load(); }, []);

  async function linkPreset(ruleId: string, presetId: string | null) {
    setLinkingRuleId(ruleId);
    const res = await fetch(`/api/admin/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timer_preset_id: presetId }),
    });
    if (!res.ok) { showToast("タイマーの設定に失敗しました"); }
    await load();
    setLinkingRuleId(null);
    setSelectingRuleId(null);
  }

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), name_reading: reading.trim() || null, description: description.trim() || null }),
    });
    setAdding(false);
    if (!res.ok) { showToast("追加に失敗しました"); return; }
    setName(""); setReading(""); setDescription("");
    load();
  }

  async function updateReading(id: string, value: string) {
    const res = await fetch(`/api/admin/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_reading: value.trim() || null }),
    });
    if (!res.ok) { showToast("読み仮名の更新に失敗しました"); return; }
    load();
  }

  async function updateDescription(id: string, value: string) {
    const res = await fetch(`/api/admin/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: value.trim() || null }),
    });
    if (!res.ok) { showToast("説明の更新に失敗しました"); return; }
    load();
  }

  async function remove(id: string) {
    if (!confirm("このルールを削除しますか？")) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/rules/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) { showToast("削除に失敗しました"); return; }
    load();
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">対戦表で選択できるルールを登録します（例: 組手3分・形・ワンマッチ）</p>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2 mb-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ルール名（例: 組手ポイント制・形）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder="読み仮名（例: くみて3ぷんえんちょう1ぷん）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <button type="submit" disabled={adding} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50 flex items-center gap-1.5">
            {adding && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
            {adding ? "追加中..." : "追加"}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="装備や特殊ルール等を記載（例: 防具はメンホー・拳サポーター着用必須）※試合時間・延長有無はタイマーで設定"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500 resize-none"
        />
      </form>
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => {
            const linkedPreset = r.timer_preset_id ? presets.find((p) => p.id === r.timer_preset_id) : null;
            const isLinking = linkingRuleId === r.id;
            const isSelecting = selectingRuleId === r.id;
            return (
            <li key={r.id} className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.name}</span>
                  {linkedPreset ? (
                    <span className="bg-orange-900 text-orange-300 text-xs px-2 py-0.5 rounded inline-flex items-center gap-1.5">
                      タイマー: {linkedPreset.name}
                      <button
                        onClick={() => setSelectingRuleId(r.id)}
                        disabled={isLinking}
                        className="text-orange-400 hover:text-orange-200 text-xs disabled:opacity-50"
                      >変更</button>
                      <button
                        onClick={() => linkPreset(r.id, null)}
                        disabled={isLinking}
                        className="text-orange-400 hover:text-orange-200 text-xs disabled:opacity-50"
                      >{isLinking ? "..." : "解除"}</button>
                    </span>
                  ) : !isSelecting ? (
                    <button
                      onClick={() => setSelectingRuleId(r.id)}
                      disabled={isLinking}
                      className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-2 py-0.5 rounded transition disabled:opacity-50"
                    >
                      {isLinking ? "設定中..." : "タイマーを設定する"}
                    </button>
                  ) : null}
                </div>
                <button onClick={() => remove(r.id)} disabled={removingId === r.id} className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50">
                  {removingId === r.id ? "削除中..." : "削除"}
                </button>
              </div>
              {isSelecting && (
                <div className="mb-1 flex items-center gap-2">
                  {presets.length === 0 ? (
                    <>
                      <span className="text-xs text-gray-500">タイマーが未登録です。</span>
                      <button
                        onClick={() => { setSelectingRuleId(null); onNavigateToTimer(); }}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >タイマータブで作成</button>
                    </>
                  ) : (
                    <>
                      <select
                        value={r.timer_preset_id ?? ""}
                        disabled={isLinking}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setSelectingRuleId(null);
                            onNavigateToTimer();
                            return;
                          }
                          if (e.target.value) {
                            linkPreset(r.id, e.target.value);
                          } else {
                            linkPreset(r.id, null);
                          }
                        }}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 disabled:opacity-50"
                      >
                        <option value="">-- タイマー未設定 --</option>
                        {presets.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="__new__">＋ 新規追加（タイマータブへ）</option>
                      </select>
                    </>
                  )}
                  <button
                    onClick={() => setSelectingRuleId(null)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >キャンセル</button>
                </div>
              )}
              <ReadingInput
                value={r.name_reading ?? ""}
                placeholder="読み仮名（例: くみて3ぷんえんちょう1ぷん）"
                onSave={(v) => updateReading(r.id, v)}
              />
              <DescriptionInput
                value={r.description ?? ""}
                onSave={(v) => updateDescription(r.id, v)}
              />
            </li>
            );
          })}
          {rules.length === 0 && <li className="text-gray-500 text-sm">ルールが登録されていません</li>}
        </ul>
      )}
    </div>
  );
}

// ── TTS設定 ───────────────────────────────────────────────────────────────

function AnnounceSettingsPanel() {
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [speed, setSpeed] = useState(1.0);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    if (typeof window !== "undefined") {
      const s = getTtsSettings();
      setVoice(s.voice);
      setSpeed(s.speed);
    }
    setInitialized(true);
  }

  function save() {
    saveTtsSettings(voice, speed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function preview() {
    saveTtsSettings(voice, speed);
    setPlaying(true);
    await new Promise<void>((resolve) => {
      announceCustom("Aコート、男子一般部、準決勝。極真会所属、山田太郎選手。対。正道会館所属、鈴木一郎選手。これより試合を開始します。");
      setTimeout(resolve, 500);
    });
    setPlaying(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-5 space-y-5">
        <h2 className="font-semibold text-sm text-gray-300">音声設定</h2>

        {/* 声質 */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400">声質</label>
          <div className="grid grid-cols-2 gap-2">
            {TTS_VOICES.map((v) => (
              <button
                key={v.value}
                onClick={() => setVoice(v.value)}
                className={`px-3 py-2.5 rounded-lg text-sm text-left transition ${
                  voice === v.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* 速度 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs text-gray-400">速度</label>
            <span className="text-sm font-mono text-white">{speed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.5x（遅い）</span>
            <span>1.0x（標準）</span>
            <span>1.5x（速い）</span>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={preview}
            disabled={playing}
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {playing ? "再生中..." : "試し聞き"}
          </button>
          <button
            onClick={save}
            className="flex-1 bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {saved ? "保存しました" : "保存"}
          </button>
        </div>
        <p className="text-xs text-gray-500">※ 設定はこのブラウザに保存されます</p>
      </div>

      <TemplateEditor />
    </div>
  );
}

// ── アナウンス文テンプレートエディタ ─────────────────────────────────────────

function TemplateEditor() {
  const [templates, setTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);
  const [activeTab, setActiveTab] = useState<"matchStart" | "winner">("matchStart");
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.announce_templates) setTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch(() => {});
  }, []);

  const currentTemplate = templates[activeTab];
  const vars = activeTab === "matchStart" ? MATCH_VARS : WINNER_VARS;
  const sampleVars = activeTab === "matchStart" ? SAMPLE_MATCH_VARS : SAMPLE_WINNER_VARS;
  const preview = renderTemplate(currentTemplate, sampleVars);

  function updateTemplate(value: string) {
    setTemplates((prev) => ({ ...prev, [activeTab]: value }));
  }

  function insertVar(key: string) {
    const ta = textareaRef.current;
    if (!ta) {
      updateTemplate(currentTemplate + `{{${key}}}`);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = `{{${key}}}`;
    const newVal = currentTemplate.slice(0, start) + insert + currentTemplate.slice(end);
    updateTemplate(newVal);
    // カーソルを挿入後に移動
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + insert.length, start + insert.length);
    });
  }

  async function save() {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "announce_templates", value: templates }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function resetToDefault() {
    if (!confirm("デフォルトのテンプレートに戻しますか？")) return;
    setTemplates(DEFAULT_TEMPLATES);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "announce_templates", value: DEFAULT_TEMPLATES }),
    });
  }

  async function playPreview() {
    setPlaying(true);
    await new Promise<void>((resolve) => {
      announceCustom(preview);
      setTimeout(resolve, 500);
    });
    setPlaying(false);
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-300">アナウンス文カスタマイズ</h2>
        <button
          onClick={resetToDefault}
          className="text-xs text-gray-500 hover:text-gray-300 transition"
        >
          デフォルトに戻す
        </button>
      </div>

      {/* タブ */}
      <div className="grid grid-cols-2 gap-2">
        {(["matchStart", "winner"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2 rounded-lg text-sm font-medium transition text-center ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {tab === "matchStart" ? "試合開始" : "勝者発表"}
          </button>
        ))}
      </div>

      {/* 変数チップ */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500">クリックしてカーソル位置に挿入</p>
        <div className="flex flex-wrap gap-1.5">
          {vars.map(({ key, desc }) => (
            <button
              key={key}
              onClick={() => insertVar(key)}
              title={desc}
              className="px-2 py-1 bg-gray-700 hover:bg-blue-700 text-xs text-blue-300 hover:text-white rounded transition font-mono"
            >
              {`{{${key}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* テンプレートテキストエリア */}
      <textarea
        ref={textareaRef}
        value={currentTemplate}
        onChange={(e) => updateTemplate(e.target.value)}
        rows={4}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500 resize-none font-mono leading-relaxed"
      />

      {/* プレビュー */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500">プレビュー（サンプル値で展開）</p>
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 leading-relaxed min-h-[3rem]">
          {preview || <span className="text-gray-600">（空）</span>}
        </div>
      </div>

      {/* ボタン */}
      <div className="flex gap-2">
        <button
          onClick={playPreview}
          disabled={playing}
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {playing ? "再生中..." : "試し聞き"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          {saving ? "保存中..." : saved ? "保存しました" : "保存"}
        </button>
      </div>

      {/* 変数一覧（説明＋サンプル値を統合） */}
      <div className="border-t border-gray-700 pt-3 space-y-1">
        <p className="text-xs text-gray-500 font-medium mb-2">使用できる変数</p>
        {vars.map(({ key, desc, sample }) => (
          <div key={key} className="flex items-baseline gap-2 text-xs py-0.5">
            <span className="text-blue-400 font-mono shrink-0">{`{{${key}}}`}</span>
            <span className="text-gray-600 shrink-0">—</span>
            <span className="text-gray-500">{desc}</span>
            {sample && (
              <>
                <span className="text-gray-700 shrink-0">例:</span>
                <span className="text-gray-400 font-mono">{sample}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600">※ テンプレートはこのブラウザに保存されます</p>
    </div>
  );
}

// ── 共通入力コンポーネント ──────────────────────────────────────────────────

function ReadingInput({ value, placeholder, onSave }: {
  value: string;
  placeholder: string;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition"
      >
        読み: {value || "未設定（タップして編集）"}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex gap-1 mt-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        disabled={saving}
        className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none disabled:opacity-50"
      />
      <button type="submit" disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded disabled:opacity-50">
        {saving ? "保存中..." : "保存"}
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 disabled:opacity-50">×</button>
    </form>
  );
}

function DescriptionInput({ value, onSave }: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition mt-1 block"
      >
        説明: {value || "未設定（タップして編集）"}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="mt-1 space-y-1">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="説明・詳細（参加申込フォームの注意書きにデフォルト挿入されます）"
        rows={3}
        disabled={saving}
        className="w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none resize-none disabled:opacity-50"
      />
      <div className="flex gap-1">
        <button type="submit" disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded disabled:opacity-50">
          {saving ? "保存中..." : "保存"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 disabled:opacity-50">×</button>
      </div>
    </form>
  );
}


// ── メインの SettingsPanel ──────────────────────────────────────────────────

type SettingsSubTab = "announce" | "rules" | "dojos" | "timer" | "age_categories" | "bug_reports";

const SETTINGS_SUBTAB_LABELS: Record<SettingsSubTab, string> = {
  announce: "アナウンス設定",
  rules: "ルール",
  dojos: "流派",
  timer: "タイマー",
  age_categories: "年代区分",
  bug_reports: "不具合報告",
};

export function SettingsPanel() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<SettingsSubTab>(() => {
    if (typeof window === "undefined") return "rules";
    const sub = new URLSearchParams(window.location.search).get("sub") as SettingsSubTab | null;
    return sub && sub in SETTINGS_SUBTAB_LABELS ? sub : "rules";
  });

  function handleSubTab(t: SettingsSubTab) {
    setSubTab(t);
    router.replace(`/admin?tab=settings&sub=${t}`, { scroll: false });
  }

  const subTabs = isDev()
    ? (["rules", "timer", "announce", "age_categories", "dojos", "bug_reports"] as const)
    : (["rules", "timer", "announce", "age_categories", "dojos"] as const);

  return (
    <div className="space-y-4">
      <div className={`grid gap-2 ${subTabs.length === 6 ? "grid-cols-6" : "grid-cols-5"}`}>
        {subTabs.map((t) => (
          <button
            key={t}
            onClick={() => handleSubTab(t)}
            className={`py-1.5 rounded-lg text-sm font-medium transition text-center ${
              subTab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {SETTINGS_SUBTAB_LABELS[t]}
          </button>
        ))}
      </div>

      {subTab === "announce"       && <AnnounceSettingsPanel />}
      {subTab === "rules"          && <RulesPanel onNavigateToTimer={() => handleSubTab("timer")} />}
      {subTab === "dojos"          && <DojoPanel />}
      {subTab === "timer"          && <TimerPresetsPanel />}
      {subTab === "age_categories" && <AgeCategoriesPanel />}
      {subTab === "bug_reports"    && <BugReportsPanel />}
    </div>
  );
}
