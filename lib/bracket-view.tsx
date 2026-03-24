"use client";

import { useState } from "react";

// ブラケット表示コンポーネント（管理画面・アナウンス画面で共用）

export type BracketMatch = {
  id: string;
  round: number;
  position: number;
  fighter1_id: string | null;
  fighter2_id: string | null;
  winner_id: string | null;
  status: string;
  match_label: string | null;
};

export function roundLabel(round: number, totalRounds: number): string {
  const diff = totalRounds - round;
  if (diff === 0) return "決勝";
  if (diff === 1) return "準決勝";
  if (diff === 2) return "準々決勝";
  return `第${round}回戦`;
}

function pendingSlotLabel(round: number, position: number, slot: 0 | 1, totalRounds: number): string {
  if (round === 1) return "不戦勝";
  const feederRound = round - 1;
  const feederPos = position * 2 + slot;
  if (feederRound === 1) return `第${feederPos + 1}試合の勝者`;
  return `${roundLabel(feederRound, totalRounds)} 第${feederPos + 1}試合勝者`;
}

const BRACKET_CARD_W = 172;
const BRACKET_FOOTER_H = 24;
const BRACKET_FIGHTER_H = 38;
const BRACKET_CARD_H = BRACKET_FIGHTER_H * 2 + BRACKET_FOOTER_H; // 100
const BRACKET_GAP_W = 40;
const BRACKET_COL_W = BRACKET_CARD_W + BRACKET_GAP_W;
const BRACKET_BASE_SLOT = 120;

export function BracketView({
  matches,
  nameMap,
  affiliationMap = {},
  withdrawnIds,
  fighterEntryMap,
  processingMatchIds,
  mutedMatchIds,
  assignedNumbers,
  nextMatchId,
  hasOngoingMatch = false,
  onNumberClick,
  onMatchClick,
  onSetWinner,
  onCorrectWinner,
  onReannounceStart,
  onReannounceWinner,
  onWithdrawnToggle,
  onSwapWithNext,
  onSwapFighters,
  onToggleMute,
}: {
  matches: BracketMatch[];
  nameMap: Record<string, string>;
  affiliationMap?: Record<string, string>;
  withdrawnIds?: Set<string>;
  fighterEntryMap?: Record<string, string>;
  processingMatchIds?: Set<string>;
  mutedMatchIds?: Set<string>;
  /** 番号付けモード: matchId → 割り当て番号 */
  assignedNumbers?: Record<string, number>;
  /** 次に開始すべき試合のID（コート画面でハイライト用） */
  nextMatchId?: string | null;
  /** 現在進行中の試合が存在する（true の場合、ready 試合の開始オーバーレイを非表示） */
  hasOngoingMatch?: boolean;
  onNumberClick?: (matchId: string) => void;
  onMatchClick?: (matchId: string) => void;
  onSetWinner?: (matchId: string, fighterId: string) => void;
  onCorrectWinner?: (matchId: string, fighterId: string) => void;
  onReannounceStart?: (matchId: string) => void;
  onReannounceWinner?: (matchId: string) => void;
  onWithdrawnToggle?: (matchId: string, fighterId: string, entryId: string, withdrawn: boolean) => void;
  onSwapWithNext?: (round: number, matchId: string) => void;
  onSwapFighters?: (matchId: string) => void;
  onToggleMute?: (matchId: string) => void;
}) {
  const [correctionMatchId, setCorrectionMatchId] = useState<string | null>(null);

  if (matches.length === 0) return null;

  const maxRound = Math.max(...matches.map((m) => m.round));
  const round1 = matches.filter((m) => m.round === 1);
  const totalSlots = round1.length > 0 ? Math.max(...round1.map((m) => m.position)) + 1 : 1;

  const slotH = (round: number) => BRACKET_BASE_SLOT * Math.pow(2, round - 1);
  const centerY = (round: number, pos: number) => pos * slotH(round) + slotH(round) / 2;
  const cardTop = (round: number, pos: number) => pos * slotH(round) + (slotH(round) - BRACKET_CARD_H) / 2;
  const cardLeft = (round: number) => (round - 1) * BRACKET_COL_W;

  const totalHeight = totalSlots * BRACKET_BASE_SLOT;
  const totalWidth = maxRound * BRACKET_COL_W - BRACKET_GAP_W;

  // round → sorted match IDs by position (for swap detection)
  const roundMatchIds: Record<number, string[]> = {};
  [...matches].sort((a, b) => a.position - b.position).forEach((m) => {
    roundMatchIds[m.round] ??= [];
    roundMatchIds[m.round].push(m.id);
  });

  const isBye = (m: BracketMatch) => m.round === 1 && !!m.fighter1_id && !m.fighter2_id;

  const connectors = matches
    .filter((m) => m.round < maxRound)
    .map((m) => {
      const nextPos = Math.floor(m.position / 2);
      const x1 = cardLeft(m.round) + BRACKET_CARD_W;
      const y1 = centerY(m.round, m.position);
      const x2 = cardLeft(m.round + 1);
      const y2 = centerY(m.round + 1, nextPos);
      const xMid = x1 + BRACKET_GAP_W / 2;
      return { x1, y1, x2, y2, xMid, key: m.id };
    });

  return (
    <div className="overflow-x-auto pb-4">
      {/* 赤・白 凡例 */}
      <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 rounded-full bg-red-700/80 text-red-100 text-[7px] font-bold flex items-center justify-center">赤</span>
          上の選手（赤）
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 rounded-full bg-gray-500/60 text-gray-100 text-[7px] font-bold flex items-center justify-center">白</span>
          下の選手（白）
        </span>
      </div>
      {/* ラウンドヘッダー */}
      <div className="flex mb-2" style={{ width: totalWidth }}>
        {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
          <div
            key={round}
            className="text-xs text-gray-500 text-center shrink-0"
            style={{ width: round === maxRound ? BRACKET_CARD_W : BRACKET_COL_W }}
          >
            {roundLabel(round, maxRound)}
          </div>
        ))}
      </div>

      {/* ブラケット本体 */}
      <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
        {/* SVG 接続線 */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={totalWidth}
          height={totalHeight}
          style={{ overflow: "visible" }}
        >
          {connectors.map((c) => (
            <path
              key={c.key}
              d={`M ${c.x1} ${c.y1} H ${c.xMid} V ${c.y2} H ${c.x2}`}
              fill="none"
              stroke="#374151"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {/* 試合カード */}
        {matches.map((m) => {
          const isDone = m.status === "done";
          const isOngoing = m.status === "ongoing";
          const isReady = m.status === "ready" && !!m.fighter1_id && !!m.fighter2_id;

          const name1 = m.fighter1_id ? (nameMap[m.fighter1_id] ?? "?") : pendingSlotLabel(m.round, m.position, 0, maxRound);
          const name2 = m.fighter2_id ? (nameMap[m.fighter2_id] ?? "?") : pendingSlotLabel(m.round, m.position, 1, maxRound);
          const aff1 = m.fighter1_id ? affiliationMap[m.fighter1_id] : undefined;
          const aff2 = m.fighter2_id ? affiliationMap[m.fighter2_id] : undefined;
          const isW1 = !!(m.fighter1_id && withdrawnIds?.has(m.fighter1_id));
          const isW2 = !!(m.fighter2_id && withdrawnIds?.has(m.fighter2_id));
          const eid1 = m.fighter1_id ? fighterEntryMap?.[m.fighter1_id] : undefined;
          const eid2 = m.fighter2_id ? fighterEntryMap?.[m.fighter2_id] : undefined;

          const roundList = roundMatchIds[m.round] ?? [];
          const matchIdx = roundList.indexOf(m.id);
          const canSwap = !isDone && !isOngoing && matchIdx < roundList.length - 1 && !!onSwapWithNext;

          const isCorrectingThis = correctionMatchId === m.id;

          const FighterSlot = ({
            name, aff, fighterId, isWinner, isWithdrawn, entryId, borderBottom, isRed,
          }: {
            name: string; aff?: string; fighterId: string | null;
            isWinner: boolean; isWithdrawn: boolean; entryId?: string; borderBottom?: boolean; isRed: boolean;
          }) => {
            const clickable = isOngoing && !!onSetWinner && !!fighterId && !isWithdrawn;
            const correctable = isCorrectingThis && !!onCorrectWinner && !!fighterId && !isWithdrawn;
            return (
              <div
                className={`relative flex flex-col justify-center px-2 ${borderBottom ? "border-b border-gray-700" : ""} ${
                  isOngoing && isWithdrawn ? "bg-gray-900/60 opacity-50 cursor-not-allowed" :
                  correctable ? "bg-gray-800 hover:bg-orange-900/40 cursor-pointer transition-colors" :
                  clickable ? "bg-gray-800 hover:bg-green-900/40 cursor-pointer transition-colors" :
                  isWinner ? "bg-green-900/50" :
                  "bg-gray-800"
                }`}
                style={{ height: BRACKET_FIGHTER_H }}
                onClick={correctable ? () => { onCorrectWinner!(m.id, fighterId!); setCorrectionMatchId(null); } :
                         clickable ? () => onSetWinner!(m.id, fighterId!) : undefined}
              >
                <div className="flex items-center gap-1 min-w-0 pr-7">
                  <span className={`shrink-0 text-[7px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                    isRed
                      ? "bg-red-700/80 text-red-100"
                      : "bg-gray-500/60 text-gray-100"
                  }`}>
                    {isRed ? "赤" : "白"}
                  </span>
                  {isWinner && <span className="text-green-400 text-[9px] shrink-0">▶</span>}
                  <span className={`truncate text-xs ${
                    isWinner ? "text-green-300 font-bold" :
                    isWithdrawn ? "text-gray-600 line-through" :
                    fighterId ? "text-gray-200" : "text-gray-600 italic"
                  }`}>{name}</span>
                  {isWithdrawn && (
                    <span className="text-[8px] bg-red-900 text-red-400 px-1 rounded shrink-0">棄権</span>
                  )}
                </div>
                {aff && !isWithdrawn && (
                  <p className="truncate text-[9px] text-gray-500 leading-tight pl-4 pr-7">{aff}</p>
                )}
                {/* 棄権トグルボタン */}
                {!isDone && !isOngoing && fighterId && entryId && onWithdrawnToggle && (
                  <button
                    className={`absolute right-1 top-1/2 -translate-y-1/2 text-[8px] px-1 py-0.5 rounded border transition ${
                      isWithdrawn
                        ? "border-red-600 bg-red-900/60 text-red-400 hover:bg-red-900"
                        : "border-gray-600 text-gray-600 hover:border-red-500 hover:text-red-400"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onWithdrawnToggle(m.id, fighterId, entryId, !isWithdrawn);
                    }}
                  >
                    棄
                  </button>
                )}
              </div>
            );
          };

          const isProcessing = processingMatchIds?.has(m.id);
          const isMuted = mutedMatchIds?.has(m.id) ?? false;
          const isNumberingMode = !!onNumberClick;
          const isByeMatch = isBye(m);
          const assignedNum = assignedNumbers?.[m.id];
          const isNextMatch = nextMatchId != null && m.id === nextMatchId;
          // ready だが次の試合でも進行中でもない → トーンダウン
          const isDimmed = isReady && !isNextMatch && !isOngoing && !isDone && !isNumberingMode;

          return (
            <div
              key={m.id}
              className={`absolute border rounded-lg overflow-hidden transition-opacity ${
                isNumberingMode && !isByeMatch
                  ? assignedNum != null
                    ? "border-blue-500 cursor-pointer"
                    : "border-gray-600 hover:border-blue-400 cursor-pointer"
                  : isCorrectingThis ? "border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" :
                  isDone    ? "border-green-900/60" :
                  isOngoing ? "border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.6)]" :
                  isNextMatch ? "border-blue-300 shadow-[0_0_20px_rgba(147,197,253,0.8)] animate-pulse" :
                  isDimmed  ? "border-gray-700 opacity-40" :
                              "border-gray-700"
              }`}
              onClick={isNumberingMode && !isByeMatch ? () => onNumberClick!(m.id) : undefined}
              style={{
                left: cardLeft(m.round),
                top: cardTop(m.round, m.position),
                width: BRACKET_CARD_W,
                height: BRACKET_CARD_H,
              }}
            >
              <FighterSlot
                name={name1} aff={aff1} fighterId={m.fighter1_id}
                isWinner={m.winner_id === m.fighter1_id} isWithdrawn={isW1} entryId={eid1} borderBottom isRed={true}
              />
              <FighterSlot
                name={name2} aff={aff2} fighterId={m.fighter2_id}
                isWinner={m.winner_id === m.fighter2_id} isWithdrawn={isW2} entryId={eid2} isRed={false}
              />

              {/* 番号付けモードオーバーレイ（不戦勝は対象外） */}
              {isNumberingMode && !isByeMatch && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  {assignedNum != null ? (
                    <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-base font-bold flex items-center justify-center shadow-lg">
                      {assignedNum}
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-full border-2 border-dashed border-gray-500 text-gray-500 text-lg flex items-center justify-center">
                      +
                    </span>
                  )}
                </div>
              )}

              {/* 試合開始オーバーレイ（ready 状態・進行中試合がない場合のみ） */}
              {isReady && onMatchClick && !isProcessing && !hasOngoingMatch && (
                <div
                  className={`absolute inset-0 flex items-center justify-center z-10 cursor-pointer transition-colors ${
                    isNextMatch
                      ? "bg-blue-600/75 hover:bg-blue-500/85 active:bg-blue-700/90"
                      : "bg-gray-800/70 hover:bg-blue-900/60"
                  }`}
                  onClick={() => onMatchClick(m.id)}
                >
                  <span className={`font-bold tracking-wide ${isNextMatch ? "text-white text-sm" : "text-gray-400 text-xs"}`}>
                    {isNextMatch ? "▶ 試合開始" : "▶"}
                  </span>
                </div>
              )}

              {/* 処理中オーバーレイ */}
              {isProcessing && (
                <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center z-10">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* フッター */}
              <div
                className={`flex items-center px-1.5 gap-1 border-t border-gray-700 ${
                  isCorrectingThis ? "bg-orange-950/60" :
                  isOngoing ? "bg-yellow-950/60" :
                  isNextMatch ? "bg-blue-950/60" : "bg-gray-900/40"
                }`}
                style={{ height: BRACKET_FOOTER_H }}
              >
                {/* 試合番号バッジ */}
                {m.match_label && !isCorrectingThis && !isNumberingMode && (
                  <span className={`shrink-0 text-[8px] font-bold px-1 py-0.5 rounded leading-none ${
                    isNextMatch ? "bg-blue-600 text-white" :
                    isOngoing   ? "bg-yellow-700 text-yellow-100" :
                    isDone      ? "bg-gray-700 text-gray-500" :
                                  "bg-gray-700 text-gray-300"
                  }`}>
                    {m.match_label}
                  </span>
                )}
                {isCorrectingThis ? (
                  <>
                    <span className="text-[9px] text-orange-400 font-medium truncate">タップで勝者を訂正</span>
                    <button
                      onClick={() => setCorrectionMatchId(null)}
                      className="ml-auto shrink-0 text-[9px] text-gray-500 hover:text-gray-300 bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition"
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  <>
                    {isOngoing && (
                      <span className="text-[9px] text-yellow-400 font-medium shrink-0">試合中</span>
                    )}
                    {canSwap && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSwapWithNext!(m.round, m.id); }}
                        className="shrink-0 ml-auto text-[9px] text-gray-500 hover:text-blue-400 bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition"
                      >
                        ↕次
                      </button>
                    )}
                    {!isDone && !isOngoing && onSwapFighters && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSwapFighters(m.id); }}
                        title="赤・白（上下）を入れ替え"
                        className="shrink-0 text-[9px] text-gray-500 hover:text-yellow-400 bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition"
                      >
                        ⇅赤白
                      </button>
                    )}
                    {/* 再読み上げ */}
                    {isOngoing && onReannounceStart && (
                      <button
                        onClick={() => onReannounceStart(m.id)}
                        title="試合開始アナウンスを再読み上げ"
                        className="shrink-0 ml-auto text-[9px] text-gray-500 hover:text-blue-300 bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition"
                      >
                        📢
                      </button>
                    )}
                    {isDone && onReannounceWinner && (
                      <button
                        onClick={() => onReannounceWinner(m.id)}
                        title="勝者アナウンスを再読み上げ"
                        className="shrink-0 text-[9px] text-gray-500 hover:text-blue-300 bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition"
                      >
                        📢
                      </button>
                    )}
                    {isDone && onCorrectWinner && (
                      <button
                        onClick={() => setCorrectionMatchId(m.id)}
                        title="勝者を訂正する"
                        className="shrink-0 text-[9px] text-gray-500 hover:text-orange-400 bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition"
                      >
                        訂正
                      </button>
                    )}
                    {!isDone && onToggleMute && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleMute(m.id); }}
                        title={isMuted ? "アナウンス OFF（クリックで ON）" : "アナウンス ON（クリックで OFF）"}
                        className={`shrink-0 ml-auto text-[11px] leading-none px-1 py-0.5 rounded transition ${
                          isMuted
                            ? "text-gray-600 hover:text-gray-400"
                            : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {isMuted ? "🔇" : "🔊"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
