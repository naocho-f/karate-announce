"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Fighter, Tournament } from "@/lib/types";
import { createTournamentBracket } from "@/lib/bracket";
import {
  checkCompatibility, worstCompatibility, getMismatchSettings,
  COMPAT_COLORS, COMPAT_LABEL, type CompatibilityLevel, type MismatchSettings,
} from "@/lib/compatibility";
import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [eventFighters, setEventFighters] = useState<Fighter[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [mismatchSettings, setMismatchSettings] = useState<MismatchSettings>({ maxWeightDiff: 5, maxHeightDiff: null });

  const load = useCallback(async () => {
    const { data: e } = await supabase.from("events").select("*").eq("id", id).single();
    setEvent(e ?? null);

    const { data: ef } = await supabase.from("event_fighters").select("fighter_id").eq("event_id", id);
    if (ef && ef.length > 0) {
      const { data: fs } = await supabase.from("fighters").select("*, dojo:dojos(*)").in("id", ef.map((r) => r.fighter_id));
      setEventFighters((fs ?? []) as Fighter[]);
    }

    const { data: ts } = await supabase.from("tournaments").select("*").eq("event_id", id);
    setTournaments(ts ?? []);

    setMismatchSettings(getMismatchSettings());
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!event) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-gray-400">読み込み中...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <span className="text-sm text-gray-500">{event.court_count}コート / 参加{eventFighters.length}名</span>
        </div>

        <div className="space-y-6">
          {Array.from({ length: event.court_count }, (_, i) => i + 1).map((courtNum) => (
            <CourtSection
              key={courtNum}
              courtNum={courtNum}
              eventId={id}
              eventFighters={eventFighters}
              tournament={tournaments.find((t) => t.court === String(courtNum)) ?? null}
              mismatchSettings={mismatchSettings}
              onCreated={load}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function CourtSection({ courtNum, eventId, eventFighters, tournament, mismatchSettings, onCreated }: {
  courtNum: number;
  eventId: string;
  eventFighters: Fighter[];
  tournament: Tournament | null;
  mismatchSettings: MismatchSettings;
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const selectedFighters = eventFighters.filter((f) => selected.has(f.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function create() {
    if (selected.size < 2) return;
    setCreating(true);
    await createTournamentBracket(
      `コート${courtNum}`,
      String(courtNum),
      selectedFighters,
      eventId,
    );
    setCreating(false);
    onCreated();
  }

  // 対戦表あり
  if (tournament) {
    return (
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-200">コート{courtNum}</h2>
            <span className={`text-xs px-2 py-0.5 rounded ${
              tournament.status === "finished" ? "bg-green-900 text-green-300" :
              tournament.status === "ongoing"  ? "bg-yellow-900 text-yellow-300" :
              "bg-gray-700 text-gray-400"
            }`}>
              {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
            </span>
          </div>
          <Link
            href={`/court/${courtNum}`}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            コート画面 →
          </Link>
        </div>
      </div>
    );
  }

  // 対戦表なし → 作成フォーム
  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-gray-200">コート{courtNum} の対戦表を作成</h2>

      <p className="text-xs text-gray-400">出場選手を選択（{selected.size}名）</p>
      <div className="max-h-64 overflow-y-auto space-y-1">
        {eventFighters.map((f) => {
          const isSelected = selected.has(f.id);
          const others = selectedFighters.filter((s) => s.id !== f.id);
          const compat: CompatibilityLevel = !isSelected && others.length > 0
            ? worstCompatibility(f, others, mismatchSettings)
            : "unknown";
          return (
            <label key={f.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 cursor-pointer ${isSelected ? "bg-gray-700" : ""}`}>
              <input type="checkbox" checked={isSelected} onChange={() => toggle(f.id)} className="accent-blue-500 shrink-0" />
              {!isSelected && others.length > 0
                ? <span className={`text-sm font-bold w-4 shrink-0 ${COMPAT_COLORS[compat]}`}>{COMPAT_LABEL[compat]}</span>
                : <span className="w-4 shrink-0" />
              }
              <span className="text-xs text-gray-400 shrink-0">{(f.dojo as unknown as { name: string })?.name}</span>
              <span className="text-sm">{f.name}</span>
              {(f.weight || f.height || f.age_info || f.experience) && (
                <span className="ml-auto text-xs text-gray-500 shrink-0">
                  {[f.weight ? `${f.weight}kg` : null, f.height ? `${f.height}cm` : null, f.age_info, f.experience].filter(Boolean).join(" / ")}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* ミスマッチ警告 */}
      {selectedFighters.length >= 2 && (() => {
        const pairs: { f1: Fighter; f2: Fighter; level: CompatibilityLevel }[] = [];
        for (let i = 0; i < selectedFighters.length; i++) {
          for (let j = i + 1; j < selectedFighters.length; j++) {
            const level = checkCompatibility(selectedFighters[i], selectedFighters[j], mismatchSettings);
            if (level === "warn" || level === "ng") pairs.push({ f1: selectedFighters[i], f2: selectedFighters[j], level });
          }
        }
        if (pairs.length === 0) return null;
        return (
          <div className="space-y-1">
            {pairs.map((p, i) => (
              <p key={i} className={`text-xs px-2 py-1 rounded ${p.level === "ng" ? "bg-red-900 text-red-300" : "bg-yellow-900 text-yellow-300"}`}>
                {p.level === "ng" ? "✕" : "△"} {p.f1.name} vs {p.f2.name}
                {p.f1.weight && p.f2.weight ? ` 体重差${Math.abs(p.f1.weight - p.f2.weight).toFixed(1)}kg` : ""}
                {p.f1.height && p.f2.height ? ` 身長差${Math.abs(p.f1.height - p.f2.height).toFixed(0)}cm` : ""}
              </p>
            ))}
          </div>
        );
      })()}

      <button
        onClick={create}
        disabled={creating || selected.size < 2}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition"
      >
        {creating ? "作成中..." : `対戦表を作成（${selected.size}名）`}
      </button>
    </div>
  );
}
