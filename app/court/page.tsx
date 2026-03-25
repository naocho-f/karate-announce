"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Event, Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import { roundName } from "@/lib/tournament";
import { announceMatchStart, announceWinner, DEFAULT_TEMPLATES, type AnnounceTemplates } from "@/lib/speech";
import { BracketView } from "@/lib/bracket-view";

// ── 単一コートのパネルコンポーネント ─────────────────────────────────────────

function CourtPanel({ courtNum, courtDisplayName, announceTemplates }: {
  courtNum: string;
  courtDisplayName: string;
  announceTemplates: AnnounceTemplates;
}) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [fighters, setFighters] = useState<Record<string, Fighter>>({});
  const [withdrawnFighterIds, setWithdrawnFighterIds] = useState<Set<string>>(new Set());
  const [fighterEntryMap, setFighterEntryMap] = useState<Record<string, string>>({});
  const [processingMatchIds, setProcessingMatchIds] = useState<Set<string>>(new Set());
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("muted_match_ids");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const prevDataRef = useRef<string>("");

  function startProcessing(matchId: string) {
    setProcessingMatchIds((prev) => new Set(prev).add(matchId));
  }
  function endProcessing(matchId: string) {
    setProcessingMatchIds((prev) => { const next = new Set(prev); next.delete(matchId); return next; });
  }

  const load = useCallback(async () => {
    const { data: tourns } = await supabase
      .from("tournaments")
      .select("*")
      .eq("court", courtNum)
      .neq("status", "finished")
      .order("sort_order")
      .order("created_at");

    if (!tourns?.length) {
      setTournaments([]);
      setMatchesMap({});
      return;
    }

    setTournaments(tourns);

    const tournIds = tourns.map((t) => t.id);
    const { data: allMatches } = await supabase
      .from("matches")
      .select("*")
      .in("tournament_id", tournIds)
      .order("round")
      .order("position");

    const allFighterIds = new Set<string>();
    (allMatches ?? []).forEach((m) => {
      if (m.fighter1_id) allFighterIds.add(m.fighter1_id);
      if (m.fighter2_id) allFighterIds.add(m.fighter2_id);
    });

    const eventId = tourns[0]?.event_id;
    let allEntries: { id: string; fighter_id: string | null; is_withdrawn: boolean }[] = [];
    if (allFighterIds.size > 0 && eventId) {
      const { data: e } = await supabase
        .from("entries")
        .select("id, fighter_id, is_withdrawn")
        .eq("event_id", eventId)
        .in("fighter_id", [...allFighterIds]);
      allEntries = e ?? [];
    }

    const serialized = JSON.stringify({ allMatches, allEntries });
    if (serialized === prevDataRef.current) return;
    prevDataRef.current = serialized;

    const byTournament: Record<string, Match[]> = {};
    tournIds.forEach((id) => { byTournament[id] = []; });
    (allMatches ?? []).forEach((m) => { byTournament[m.tournament_id]?.push(m); });
    setMatchesMap(byTournament);

    if (allFighterIds.size > 0) {
      const { data: fs } = await supabase
        .from("fighters")
        .select("*, dojo:dojos(*)")
        .in("id", [...allFighterIds]);
      const fighterMap: Record<string, Fighter> = {};
      (fs ?? []).forEach((f) => { fighterMap[f.id] = f as Fighter; });
      setFighters(fighterMap);
    }

    const withdrawn = new Set<string>();
    const entryMap: Record<string, string> = {};
    allEntries.forEach((e) => {
      if (e.fighter_id) {
        entryMap[e.fighter_id] = e.id;
        if (e.is_withdrawn) withdrawn.add(e.fighter_id);
      }
    });
    setWithdrawnFighterIds(withdrawn);
    setFighterEntryMap(entryMap);
  }, [courtNum]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  async function startMatch(tournamentId: string, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;

    startProcessing(matchId);
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    await fetch(`/api/court/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", tournamentId }),
    });
    await load();
    endProcessing(matchId);

    if (!mutedMatchIds.has(matchId)) {
      const tournament = tournaments.find((t) => t.id === tournamentId);
      announceMatchStart(
        fighterFullName(f1), f1.affiliation ?? f1.dojo?.name ?? "",
        fighterFullName(f2), f2.affiliation ?? f2.dojo?.name ?? "",
        roundName(match.round, rounds),
        fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading,
        fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading,
        match.match_label,
        match.rules ?? tournament?.default_rules,
        announceTemplates,
      );
    }
  }

  async function setWinner(tournamentId: string, matchId: string, winnerId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const winner = fighters[winnerId];
    if (!winner) return;

    startProcessing(matchId);
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    await fetch(`/api/court/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_winner", winnerId, tournamentId, round: match.round, rounds, position: match.position }),
    });
    await load();
    endProcessing(matchId);
    if (!mutedMatchIds.has(matchId)) {
      announceWinner(
        fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
        fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading,
        announceTemplates,
      );
    }
  }

  async function toggleWithdrawal(matchId: string, entryId: string, withdrawn: boolean) {
    startProcessing(matchId);
    await fetch(`/api/court/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_withdrawn: withdrawn }),
    });
    await load();
    endProcessing(matchId);
  }

  function toggleMute(matchId: string) {
    setMutedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId); else next.add(matchId);
      localStorage.setItem("muted_match_ids", JSON.stringify([...next]));
      return next;
    });
  }

  async function correctWinner(tournamentId: string, matchId: string, winnerId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const winner = fighters[winnerId];
    if (!winner) return;

    startProcessing(matchId);
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    await fetch(`/api/court/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "correct_winner", winnerId, tournamentId, round: match.round, rounds, position: match.position }),
    });
    await load();
    endProcessing(matchId);
    if (!mutedMatchIds.has(matchId)) {
      announceWinner(
        fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
        fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading,
        announceTemplates,
      );
    }
  }

  function reannounceStart(tournamentId: string, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    const tournament = tournaments.find((t) => t.id === tournamentId);
    announceMatchStart(
      fighterFullName(f1), f1.affiliation ?? f1.dojo?.name ?? "",
      fighterFullName(f2), f2.affiliation ?? f2.dojo?.name ?? "",
      roundName(match.round, rounds),
      fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading,
      fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading,
      match.match_label,
      match.rules ?? tournament?.default_rules,
      announceTemplates,
    );
  }

  function reannounceWinner(tournamentId: string, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match?.winner_id) return;
    const winner = fighters[match.winner_id];
    if (!winner) return;
    announceWinner(
      fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
      fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading,
      announceTemplates,
    );
  }

  async function swapWithNext(tournamentId: string, round: number, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const roundMatches = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
    const idx = roundMatches.findIndex((m) => m.id === matchId);
    if (idx < 0 || idx >= roundMatches.length - 1) return;
    const nextMatch = roundMatches[idx + 1];
    startProcessing(matchId);
    startProcessing(nextMatch.id);
    await fetch(`/api/court/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "swap_with", otherMatchId: nextMatch.id }),
    });
    await load();
    endProcessing(matchId);
    endProcessing(nextMatch.id);
  }

  const nameMap = Object.fromEntries(Object.entries(fighters).map(([id, f]) => [id, fighterFullName(f)]));
  const affiliationMap = Object.fromEntries(Object.entries(fighters).map(([id, f]) => [id, f.affiliation ?? f.dojo?.name ?? ""]));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-100 border-b border-gray-700 pb-2">{courtDisplayName}</h2>
      {tournaments.length === 0 ? (
        <p className="text-sm text-gray-500">このコートにトーナメントがありません</p>
      ) : (
        <div className="space-y-6">
          {tournaments.map((tournament) => {
            const matches = matchesMap[tournament.id] ?? [];
            return (
              <div key={tournament.id}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-semibold text-base">{tournament.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    tournament.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-600 text-gray-400"
                  }`}>
                    {tournament.status === "ongoing" ? "進行中" : "準備中"}
                  </span>
                </div>
                <div className="bg-gray-700 rounded-xl p-4">
                  {matches.length === 0 ? (
                    <p className="text-sm text-gray-500">試合データなし</p>
                  ) : (
                    <BracketView
                      matches={matches}
                      nameMap={nameMap}
                      affiliationMap={affiliationMap}
                      withdrawnIds={withdrawnFighterIds}
                      fighterEntryMap={fighterEntryMap}
                      processingMatchIds={processingMatchIds}
                      mutedMatchIds={mutedMatchIds}
                      onMatchClick={(matchId) => startMatch(tournament.id, matchId)}
                      onSetWinner={(matchId, fighterId) => setWinner(tournament.id, matchId, fighterId)}
                      onCorrectWinner={(matchId, fighterId) => correctWinner(tournament.id, matchId, fighterId)}
                      onReannounceStart={(matchId) => reannounceStart(tournament.id, matchId)}
                      onReannounceWinner={(matchId) => reannounceWinner(tournament.id, matchId)}
                      onWithdrawnToggle={(matchId, fighterId, entryId, withdrawn) => toggleWithdrawal(matchId, entryId, withdrawn)}
                      onSwapWithNext={(round, matchId) => swapWithNext(tournament.id, round, matchId)}
                      onToggleMute={toggleMute}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function CourtIndexPage() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [announceTemplates, setAnnounceTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);

  useEffect(() => {
    supabase.from("events").select("*").eq("is_active", true).maybeSingle()
      .then(({ data }) => setActiveEvent(data ?? null));
  }, []);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.announce_templates) setAnnounceTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch(() => {});
  }, []);

  if (activeEvent === undefined) return <div className="min-h-screen bg-gray-800" />;

  if (!activeEvent) {
    return (
      <main className="min-h-screen bg-gray-800 text-white p-4 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-lg mb-2">試合はまだ開始されていません</p>
          <p className="text-sm text-gray-600">管理者が大会をアクティブに設定するとアクセスできます</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-800 text-white p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{activeEvent.name}</h1>
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">● 進行中</span>
        </div>
        <div className="space-y-10">
          {Array.from({ length: activeEvent.court_count }, (_, i) => i + 1).map((n) => (
            <CourtPanel
              key={n}
              courtNum={String(n)}
              courtDisplayName={activeEvent.court_names?.[n - 1]?.trim() || `コート${n}`}
              announceTemplates={announceTemplates}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
