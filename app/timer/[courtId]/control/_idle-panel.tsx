"use client";

import type { MutableRefObject } from "react";
import type { TimerPreset, Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName } from "@/lib/types";

export type MatchCandidate = {
  match: Match;
  tournament: Tournament;
  fighter1: Fighter | null;
  fighter2: Fighter | null;
  totalRounds: number;
};

type IdlePanelProps = {
  presets: TimerPreset[];
  selectedPresetId: string | null;
  onSelectPresetId: (id: string | null) => void;
  matchCandidates: MatchCandidate[];
  loadingTournament: boolean;
  swapSides: boolean;
  swapping: boolean;
  onSwapSides: () => void;
  onSelectMatch: (candidate: MatchCandidate) => void;
  onQuickMatch: () => void;
  matchItemRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  matchListTopRef: MutableRefObject<HTMLDivElement | null>;
};

export default function IdlePanel({
  presets,
  selectedPresetId,
  onSelectPresetId,
  matchCandidates,
  loadingTournament,
  swapSides,
  swapping,
  onSwapSides,
  onSelectMatch,
  onQuickMatch,
  matchItemRefs,
  matchListTopRef,
}: IdlePanelProps) {
  return (
    <section className="space-y-3">
      {/* 赤白入替 */}
      <button
        onClick={onSwapSides}
        disabled={swapping}
        className={`w-full py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 ${
          swapSides
            ? "bg-yellow-700 hover:bg-yellow-600 text-yellow-100"
            : "bg-gray-800 hover:bg-gray-700 text-gray-300"
        } disabled:opacity-60`}
      >
        {swapping ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>⇄</>
        )}
        {swapSides ? "赤白入替中（赤=右・白=左）" : "赤白の左右を入れ替える"}
      </button>

      <h3 className="text-sm font-bold text-gray-400 mb-2">試合セット</h3>

      {/* プリセット選択 */}
      {presets.length > 0 && (
        <div>
          <label className="text-xs text-gray-400">ルール</label>
          <select
            value={selectedPresetId ?? ""}
            onChange={(e) => onSelectPresetId(e.target.value || null)}
            className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {presets.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <MatchCandidateList
        loadingTournament={loadingTournament} matchCandidates={matchCandidates}
        matchItemRefs={matchItemRefs} matchListTopRef={matchListTopRef} onSelectMatch={onSelectMatch}
      />

      {/* テスト用 */}
      <div className="border-t border-gray-800 pt-3">
        <button
          onClick={onQuickMatch}
          className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition"
        >
          クイック試合（テスト）
        </button>
      </div>
    </section>
  );
}

// ── 試合候補リスト ──

function MatchCandidateList({ loadingTournament, matchCandidates, matchItemRefs, matchListTopRef, onSelectMatch }: {
  loadingTournament: boolean; matchCandidates: MatchCandidate[];
  matchItemRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  matchListTopRef: MutableRefObject<HTMLDivElement | null>;
  onSelectMatch: (c: MatchCandidate) => void;
}) {
  if (loadingTournament) return <p className="text-gray-600 text-sm">読み込み中...</p>;
  if (matchCandidates.length === 0) return <p className="text-gray-600 text-sm">開始可能な試合がありません（コートにトーナメントが割り当てられていない可能性があります）</p>;
  const firstReadyId = matchCandidates.find((c) => c.match.status === "ready")?.match.id ?? null;
  return (
    <div className="space-y-2" ref={matchListTopRef}>
      <p className="text-xs text-gray-500">試合を選択して開始</p>
      {matchCandidates.map((c) => (
        <MatchCard key={c.match.id} candidate={c} isFirstReady={c.match.status === "ready" && c.match.id === firstReadyId}
          onRef={(el) => { matchItemRefs.current[c.match.id] = el; }} onSelectMatch={onSelectMatch} />
      ))}
    </div>
  );
}

// ── 試合カード ──

type MatchStatus = "done" | "waiting" | "ongoing" | "firstReady" | "ready";

function resolveMatchStatus(c: MatchCandidate, isFirstReady: boolean): MatchStatus {
  if (c.match.status === "done") return "done";
  if (c.match.status === "waiting") return "waiting";
  if (c.match.status === "ongoing") return "ongoing";
  if (isFirstReady) return "firstReady";
  return "ready";
}

const CARD_BORDER: Record<MatchStatus, string> = {
  done: "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed",
  waiting: "border-gray-800 bg-gray-900/70 cursor-not-allowed",
  ongoing: "border-yellow-600 bg-yellow-950/40 hover:bg-yellow-950/70",
  firstReady: "border-blue-500 bg-blue-950/30 hover:bg-blue-950/50",
  ready: "border-gray-700 bg-gray-900 hover:bg-gray-800",
};
const HEADER_BG: Record<MatchStatus, string> = { done: "bg-gray-800/50", waiting: "bg-gray-800/30", ongoing: "bg-yellow-900/40", firstReady: "bg-blue-900/30", ready: "bg-gray-800/30" };
const LABEL_COLOR: Record<MatchStatus, string> = { done: "text-gray-600", waiting: "text-gray-500", ongoing: "text-yellow-300", firstReady: "text-blue-300", ready: "text-gray-300" };

function MatchCard({ candidate: c, isFirstReady, onRef, onSelectMatch }: {
  candidate: MatchCandidate; isFirstReady: boolean;
  onRef: (el: HTMLButtonElement | null) => void;
  onSelectMatch: (c: MatchCandidate) => void;
}) {
  const ms = resolveMatchStatus(c, isFirstReady);
  const isDisabled = ms === "done" || ms === "waiting";
  const dimmed = isDisabled;
  const rulesLabel = c.match.rules ?? c.tournament.default_rules ?? null;
  return (
    <button ref={onRef} onClick={() => !isDisabled && onSelectMatch(c)} disabled={isDisabled}
      className={`w-full text-left rounded-xl border-2 transition overflow-hidden ${CARD_BORDER[ms]}`}>
      <div className={`px-3 py-1.5 flex items-center justify-between ${HEADER_BG[ms]}`}>
        <span className={`text-sm font-bold ${LABEL_COLOR[ms]}`}>{c.match.match_label ?? `R${c.match.round}-P${c.match.position}`}</span>
        <MatchBadge status={ms} />
      </div>
      <div className="px-3 py-2">
        <FighterRow fighter={c.fighter1} sideColor={dimmed ? "bg-gray-700" : "bg-red-600"} nameColor={dimmed ? "text-gray-600" : "text-red-400"} showAff={!dimmed} />
        <div className="text-center text-gray-600 text-xs my-0.5">vs</div>
        <FighterRow fighter={c.fighter2} sideColor={dimmed ? "bg-gray-700" : "bg-gray-300"} nameColor={dimmed ? "text-gray-600" : "text-gray-200"} showAff={!dimmed} />
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-800/60">
          {rulesLabel && <span className={`text-[10px] px-1.5 py-0.5 rounded ${ms === "done" ? "bg-gray-800 text-gray-600" : "bg-gray-800 text-gray-400"}`}>{rulesLabel}</span>}
          <span className={`text-[10px] ml-auto ${ms === "done" ? "text-gray-700" : "text-gray-600"}`}>{c.tournament.name}</span>
        </div>
      </div>
    </button>
  );
}

function MatchBadge({ status }: { status: MatchStatus }) {
  if (status === "done") return <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-bold">終了</span>;
  if (status === "ongoing") return <span className="text-xs text-yellow-400 bg-yellow-900/60 px-1.5 py-0.5 rounded font-bold animate-pulse">試合中</span>;
  if (status === "firstReady") return <span className="text-xs text-blue-400 bg-blue-900/60 px-1.5 py-0.5 rounded font-bold">次の試合</span>;
  return null;
}

function FighterRow({ fighter, sideColor, nameColor, showAff }: { fighter: Fighter | null; sideColor: string; nameColor: string; showAff: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-5 rounded-sm shrink-0 ${sideColor}`} />
      <div className="min-w-0">
        <span className={`text-sm font-bold block truncate ${nameColor}`}>{fighter ? fighterFullName(fighter) : "未定"}</span>
        {showAff && fighter?.affiliation && <span className="text-[10px] text-gray-500 block truncate">{fighter.affiliation}</span>}
      </div>
    </div>
  );
}
