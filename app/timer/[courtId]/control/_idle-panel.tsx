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
          <label className="text-xs text-gray-500">ルール</label>
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

      {/* トーナメント試合一覧（カード形式） */}
      {loadingTournament ? (
        <p className="text-gray-600 text-sm">読み込み中...</p>
      ) : matchCandidates.length > 0 ? (
        <div className="space-y-2" ref={matchListTopRef}>
          <p className="text-xs text-gray-500">試合を選択して開始</p>
          {(() => {
            const firstReadyId = matchCandidates.find((c) => c.match.status === "ready")?.match.id ?? null;
            return matchCandidates.map((c) => {
              const isDone = c.match.status === "done";
              const isWaiting = c.match.status === "waiting";
              const isReady = c.match.status === "ready";
              const isFirstReady = isReady && c.match.id === firstReadyId;
              const isOngoing = c.match.status === "ongoing";
              const isDisabled = isDone || isWaiting;
              const rulesLabel = c.match.rules ?? c.tournament.default_rules ?? null;
              return (
                <button
                  key={c.match.id}
                  ref={(el) => {
                    matchItemRefs.current[c.match.id] = el;
                  }}
                  onClick={() => !isDisabled && onSelectMatch(c)}
                  disabled={isDisabled}
                  className={`w-full text-left rounded-xl border-2 transition overflow-hidden ${
                    isDone
                      ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                      : isOngoing
                        ? "border-yellow-600 bg-yellow-950/40 hover:bg-yellow-950/70"
                        : isFirstReady
                          ? "border-blue-500 bg-blue-950/30 hover:bg-blue-950/50"
                          : isWaiting
                            ? "border-gray-800 bg-gray-900/70 cursor-not-allowed"
                            : "border-gray-700 bg-gray-900 hover:bg-gray-800"
                  }`}
                >
                  {/* ヘッダー */}
                  <div
                    className={`px-3 py-1.5 flex items-center justify-between ${
                      isDone
                        ? "bg-gray-800/50"
                        : isOngoing
                          ? "bg-yellow-900/40"
                          : isFirstReady
                            ? "bg-blue-900/30"
                            : "bg-gray-800/30"
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${isDone ? "text-gray-600" : isOngoing ? "text-yellow-300" : isFirstReady ? "text-blue-300" : isWaiting ? "text-gray-500" : "text-gray-300"}`}
                    >
                      {c.match.match_label ?? `R${c.match.round}-P${c.match.position}`}
                    </span>
                    <div className="flex items-center gap-2">
                      {isDone && (
                        <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-bold">終了</span>
                      )}
                      {isOngoing && (
                        <span className="text-xs text-yellow-400 bg-yellow-900/60 px-1.5 py-0.5 rounded font-bold animate-pulse">
                          試合中
                        </span>
                      )}
                      {isFirstReady && (
                        <span className="text-xs text-blue-400 bg-blue-900/60 px-1.5 py-0.5 rounded font-bold">
                          次の試合
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 選手情報 */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-5 rounded-sm shrink-0 ${isDone || isWaiting ? "bg-gray-700" : "bg-red-600"}`}
                      />
                      <div className="min-w-0">
                        <span
                          className={`text-sm font-bold block truncate ${isDone || isWaiting ? "text-gray-600" : "text-red-400"}`}
                        >
                          {c.fighter1 ? fighterFullName(c.fighter1) : "未定"}
                        </span>
                        {!isDone && !isWaiting && c.fighter1?.affiliation && (
                          <span className="text-[10px] text-gray-500 block truncate">{c.fighter1.affiliation}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-center text-gray-600 text-xs my-0.5">vs</div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-5 rounded-sm shrink-0 ${isDone || isWaiting ? "bg-gray-700" : "bg-white/80"}`}
                      />
                      <div className="min-w-0">
                        <span
                          className={`text-sm font-bold block truncate ${isDone || isWaiting ? "text-gray-600" : "text-gray-200"}`}
                        >
                          {c.fighter2 ? fighterFullName(c.fighter2) : "未定"}
                        </span>
                        {!isDone && !isWaiting && c.fighter2?.affiliation && (
                          <span className="text-[10px] text-gray-500 block truncate">{c.fighter2.affiliation}</span>
                        )}
                      </div>
                    </div>
                    {/* ルール・トーナメント名 */}
                    <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-800/60">
                      {rulesLabel && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${isDone ? "bg-gray-800 text-gray-600" : "bg-gray-800 text-gray-400"}`}
                        >
                          {rulesLabel}
                        </span>
                      )}
                      <span className={`text-[10px] ml-auto ${isDone ? "text-gray-700" : "text-gray-600"}`}>
                        {c.tournament.name}
                      </span>
                    </div>
                  </div>
                </button>
              );
            });
          })()}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">
          開始可能な試合がありません（コートにトーナメントが割り当てられていない可能性があります）
        </p>
      )}

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
