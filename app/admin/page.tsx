"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Dojo, Fighter, Tournament } from "@/lib/types";
import { generateFirstRound, totalRounds } from "@/lib/tournament";
import { TTS_VOICES, getTtsSettings, saveTtsSettings, announceCustom, type TtsVoice } from "@/lib/speech";
import Link from "next/link";

const COURTS = ["A", "B", "C", "D"];

export default function AdminPage() {
  const [tab, setTab] = useState<"dojos" | "fighters" | "tournaments" | "settings">("dojos");

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">管理画面</h1>
        </div>

        <div className="flex gap-2 mb-6">
          {(["dojos", "fighters", "tournaments", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t === "dojos" ? "流派" : t === "fighters" ? "選手" : t === "tournaments" ? "トーナメント" : "設定"}
            </button>
          ))}
        </div>

        {tab === "dojos" && <DojoPanel />}
        {tab === "fighters" && <FighterPanel />}
        {tab === "tournaments" && <TournamentPanel />}
        {tab === "settings" && <SettingsPanel />}
      </div>
    </main>
  );
}

// ── 流派 ──────────────────────────────────────────────────────────────────

function DojoPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");

  async function load() {
    const { data } = await supabase.from("dojos").select("*").order("name");
    setDojos(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("dojos").insert({ name: name.trim(), name_reading: reading.trim() || null });
    setName(""); setReading("");
    load();
  }

  async function updateReading(id: string, value: string) {
    await supabase.from("dojos").update({ name_reading: value.trim() || null }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？所属選手も削除されます。")) return;
    await supabase.from("dojos").delete().eq("id", id);
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
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0">
            追加
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {dojos.map((d) => (
          <li key={d.id} className="bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{d.name}</span>
              <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
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
    </div>
  );
}

// ── 選手 ──────────────────────────────────────────────────────────────────

function FighterPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const [dojoId, setDojoId] = useState("");

  async function load() {
    const { data: ds } = await supabase.from("dojos").select("*").order("name");
    const { data: fs } = await supabase.from("fighters").select("*, dojo:dojos(*)").order("name");
    setDojos(ds ?? []);
    setFighters((fs ?? []) as Fighter[]);
    if (ds && ds.length > 0 && !dojoId) setDojoId(ds[0].id);
  }

  useEffect(() => { load(); }, []);

  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [ageInfo, setAgeInfo] = useState("");

  async function add() {
    if (!name.trim() || !dojoId) return;
    await supabase.from("fighters").insert({
      name: name.trim(),
      name_reading: reading.trim() || null,
      dojo_id: dojoId,
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseFloat(height) : null,
      age_info: ageInfo.trim() || null,
    });
    setName(""); setReading(""); setWeight(""); setHeight(""); setAgeInfo("");
    load();
  }

  async function updateReading(id: string, value: string) {
    await supabase.from("fighters").update({ name_reading: value.trim() || null }).eq("id", id);
    load();
  }

  async function updateProfile(id: string, weight: string, height: string, ageInfo: string) {
    await supabase.from("fighters").update({
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseFloat(height) : null,
      age_info: ageInfo.trim() || null,
    }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("fighters").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2 mb-4">
        <div className="flex gap-2">
          <select
            value={dojoId}
            onChange={(e) => setDojoId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 shrink-0"
          >
            {dojos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="選手名"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder="読み"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="体重 kg"
            type="number"
            step="0.1"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="身長 cm"
            type="number"
            step="0.1"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={ageInfo}
            onChange={(e) => setAgeInfo(e.target.value)}
            placeholder="年齢 / 学年（例: 25歳 / 小3）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0">
            追加
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {fighters.map((f) => (
          <li key={f.id} className="bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span>
                <span className="text-gray-400 text-sm mr-2">{(f.dojo as unknown as Dojo)?.name}</span>
                <span className="font-medium">{f.name}</span>
                {(f.weight || f.height || f.age_info) && (
                  <span className="ml-2 text-xs text-gray-500">
                    {[
                      f.weight ? `${f.weight}kg` : null,
                      f.height ? `${f.height}cm` : null,
                      f.age_info ?? null,
                    ].filter(Boolean).join(" / ")}
                  </span>
                )}
              </span>
              <button onClick={() => remove(f.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
            </div>
            <ReadingInput
              value={f.name_reading ?? ""}
              placeholder="読み仮名（例: やまだ たろう）"
              onSave={(v) => updateReading(f.id, v)}
            />
            <ProfileInput
              weight={f.weight?.toString() ?? ""}
              height={f.height?.toString() ?? ""}
              ageInfo={f.age_info ?? ""}
              onSave={(w, h, a) => updateProfile(f.id, w, h, a)}
            />
          </li>
        ))}
        {fighters.length === 0 && <li className="text-gray-500 text-sm">選手が登録されていません</li>}
      </ul>
    </div>
  );
}

// ── トーナメント ───────────────────────────────────────────────────────────

function TournamentPanel() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [name, setName] = useState("");
  const [court, setCourt] = useState("A");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data: ts } = await supabase.from("tournaments").select("*").order("created_at", { ascending: false });
    const { data: fs } = await supabase.from("fighters").select("*, dojo:dojos(*)").order("name");
    const { data: ds } = await supabase.from("dojos").select("*").order("name");
    setTournaments(ts ?? []);
    setFighters((fs ?? []) as Fighter[]);
    setDojos(ds ?? []);
  }

  useEffect(() => { load(); }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim() || selected.size < 2) return;
    setCreating(true);
    const { data: t } = await supabase.from("tournaments").insert({ name: name.trim(), court, status: "preparing" }).select().single();
    if (!t) { setCreating(false); return; }

    const selectedFighters = fighters.filter((f) => selected.has(f.id));
    const matchDefs = generateFirstRound(selectedFighters);
    const rounds = totalRounds(selectedFighters.length);

    // 1回戦の試合を挿入（両選手揃っていれば ready）
    const inserts = matchDefs.map((m) => ({
      ...m,
      tournament_id: t.id,
      status: (m.fighter1_id && m.fighter2_id ? "ready" : "waiting") as "ready" | "waiting",
    }));
    await supabase.from("matches").insert(inserts);

    // 以降のラウンドの空試合を挿入
    for (let r = 2; r <= rounds; r++) {
      const count = Math.pow(2, rounds - r);
      const emptyMatches = Array.from({ length: count }, (_, i) => ({
        tournament_id: t.id, round: r, position: i,
        fighter1_id: null, fighter2_id: null, winner_id: null, status: "waiting" as const,
      }));
      await supabase.from("matches").insert(emptyMatches);
    }

    // シード（bye）を自動処理
    for (const m of matchDefs) {
      if (m.fighter1_id && !m.fighter2_id) {
        // fighter1 が不戦勝 → 次ラウンドに進める
        await advanceWinner(t.id, 1, m.position, m.fighter1_id, rounds);
        await supabase.from("matches").update({ winner_id: m.fighter1_id, status: "done" })
          .eq("tournament_id", t.id).eq("round", 1).eq("position", m.position);
      }
    }

    setName(""); setSelected(new Set()); setCreating(false);
    load();
  }

  async function advanceWinner(tournamentId: string, round: number, position: number, winnerId: string, maxRounds: number) {
    if (round >= maxRounds) return;
    const nextRound = round + 1;
    const nextPosition = Math.floor(position / 2);
    const isSlot1 = position % 2 === 0;
    const field = isSlot1 ? "fighter1_id" : "fighter2_id";
    await supabase.from("matches").update({ [field]: winnerId, status: "ready" })
      .eq("tournament_id", tournamentId).eq("round", nextRound).eq("position", nextPosition);
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("tournaments").delete().eq("id", id);
    load();
  }

  const dojoMap = Object.fromEntries(dojos.map((d) => [d.id, d.name]));

  return (
    <div className="space-y-6">
      {/* 新規作成 */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300">新規トーナメント作成</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="トーナメント名（例: 男子一般部）"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <select
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          >
            {COURTS.map((c) => <option key={c} value={c}>{c}コート</option>)}
          </select>
        </div>

        <p className="text-xs text-gray-400">出場選手を選択（{selected.size}名選択中）</p>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {fighters.map((f) => (
            <label key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700 cursor-pointer">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="accent-blue-500" />
              <span className="text-xs text-gray-400 shrink-0">{dojoMap[f.dojo_id]}</span>
              <span className="text-sm">{f.name}</span>
              {(f.weight || f.height || f.age_info) && (
                <span className="ml-auto text-xs text-gray-500 shrink-0">
                  {[
                    f.weight ? `${f.weight}kg` : null,
                    f.height ? `${f.height}cm` : null,
                    f.age_info ?? null,
                  ].filter(Boolean).join(" / ")}
                </span>
              )}
            </label>
          ))}
        </div>
        <button
          onClick={create}
          disabled={creating || !name.trim() || selected.size < 2}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition"
        >
          {creating ? "作成中..." : "トーナメントを作成"}
        </button>
      </div>

      {/* 一覧 */}
      <ul className="space-y-2">
        {tournaments.map((t) => (
          <li key={t.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
            <div>
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{t.court}コート</span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                t.status === "finished" ? "bg-green-900 text-green-300" :
                t.status === "ongoing" ? "bg-yellow-900 text-yellow-300" :
                "bg-gray-700 text-gray-400"
              }`}>
                {t.status === "preparing" ? "準備中" : t.status === "ongoing" ? "進行中" : "終了"}
              </span>
            </div>
            <button onClick={() => remove(t.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
          </li>
        ))}
        {tournaments.length === 0 && <li className="text-gray-500 text-sm">トーナメントがありません</li>}
      </ul>
    </div>
  );
}

// ── TTS設定 ───────────────────────────────────────────────────────────────

function SettingsPanel() {
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [speed, setSpeed] = useState(1.0);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = getTtsSettings();
    setVoice(s.voice);
    setSpeed(s.speed);
  }, []);

  function save() {
    saveTtsSettings(voice, speed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function preview() {
    saveTtsSettings(voice, speed);
    setPlaying(true);
    await new Promise<void>((resolve) => {
      // announceCustom は fire-and-forget なので少し待つ
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
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {playing ? "再生中..." : "試し聞き"}
          </button>
          <button
            onClick={save}
            className="flex-1 bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {saved ? "保存しました ✓" : "保存"}
          </button>
        </div>
        <p className="text-xs text-gray-500">※ 設定はこのブラウザに保存されます</p>
      </div>
    </div>
  );
}

// ── 読み仮名インライン編集 ─────────────────────────────────────────────────

function ProfileInput({ weight, height, ageInfo, onSave }: {
  weight: string;
  height: string;
  ageInfo: string;
  onSave: (weight: string, height: string, ageInfo: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dw, setDw] = useState(weight);
  const [dh, setDh] = useState(height);
  const [da, setDa] = useState(ageInfo);

  function commit() {
    onSave(dw, dh, da);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDw(weight); setDh(height); setDa(ageInfo); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition mt-0.5 block"
      >
        体格: {weight || height || ageInfo
          ? [weight ? `${weight}kg` : null, height ? `${height}cm` : null, ageInfo || null].filter(Boolean).join(" / ")
          : "未設定（タップして編集）"}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex gap-1 mt-1">
      <input
        autoFocus
        value={dw}
        onChange={(e) => setDw(e.target.value)}
        placeholder="体重kg"
        type="number"
        step="0.1"
        className="w-20 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <input
        value={dh}
        onChange={(e) => setDh(e.target.value)}
        placeholder="身長cm"
        type="number"
        step="0.1"
        className="w-20 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <input
        value={da}
        onChange={(e) => setDa(e.target.value)}
        placeholder="25歳 / 小3"
        className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">保存</button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">×</button>
    </form>
  );
}

function ReadingInput({ value, placeholder, onSave }: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    onSave(draft);
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
        className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">保存</button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">×</button>
    </form>
  );
}
