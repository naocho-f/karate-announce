"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Dojo, Fighter, Tournament } from "@/lib/types";
import { generateFirstRound, totalRounds } from "@/lib/tournament";
import Link from "next/link";

const COURTS = ["A", "B", "C", "D"];

export default function AdminPage() {
  const [tab, setTab] = useState<"dojos" | "fighters" | "tournaments">("dojos");

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">管理画面</h1>
        </div>

        <div className="flex gap-2 mb-6">
          {(["dojos", "fighters", "tournaments"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t === "dojos" ? "流派" : t === "fighters" ? "選手" : "トーナメント"}
            </button>
          ))}
        </div>

        {tab === "dojos" && <DojoPanel />}
        {tab === "fighters" && <FighterPanel />}
        {tab === "tournaments" && <TournamentPanel />}
      </div>
    </main>
  );
}

// ── 流派 ──────────────────────────────────────────────────────────────────

function DojoPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const { data } = await supabase.from("dojos").select("*").order("name");
    setDojos(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("dojos").insert({ name: name.trim() });
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？所属選手も削除されます。")) return;
    await supabase.from("dojos").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="流派名（例: 極真会）"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium">
          追加
        </button>
      </form>
      <ul className="space-y-2">
        {dojos.map((d) => (
          <li key={d.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
            <span>{d.name}</span>
            <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
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
  const [dojoId, setDojoId] = useState("");

  async function load() {
    const { data: ds } = await supabase.from("dojos").select("*").order("name");
    const { data: fs } = await supabase.from("fighters").select("*, dojo:dojos(*)").order("name");
    setDojos(ds ?? []);
    setFighters((fs ?? []) as Fighter[]);
    if (ds && ds.length > 0 && !dojoId) setDojoId(ds[0].id);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !dojoId) return;
    await supabase.from("fighters").insert({ name: name.trim(), dojo_id: dojoId });
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("fighters").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 mb-4">
        <select
          value={dojoId}
          onChange={(e) => setDojoId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        >
          {dojos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="選手名（例: 山田 太郎）"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium">
          追加
        </button>
      </form>
      <ul className="space-y-2">
        {fighters.map((f) => (
          <li key={f.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
            <span>
              <span className="text-gray-400 text-sm mr-2">{(f.dojo as unknown as Dojo)?.name}</span>
              {f.name}
            </span>
            <button onClick={() => remove(f.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
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

    // 1回戦の試合を挿入
    const inserts = matchDefs.map((m) => ({ ...m, tournament_id: t.id, status: "waiting" as const }));
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
              <span className="text-xs text-gray-400">{dojoMap[f.dojo_id]}</span>
              <span className="text-sm">{f.name}</span>
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
