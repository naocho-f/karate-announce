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
  result_method?: string | null;
  result_detail?: {
    red_points?: number;
    white_points?: number;
    red_wazaari?: number;
    white_wazaari?: number;
    red_fouls?: number;
    white_fouls?: number;
    corrected?: boolean;
  } | null;
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

const RESULT_METHOD_LABELS: Record<string, string> = {
  ippon: "一本",
  foul: "反則勝ち",
  decision: "判定",
  sudden_death: "延長戦",
  withdraw: "棄権勝ち",
  injury: "負傷勝ち",
  draw: "引き分け",
};

function formatDetailedResult(method: string, d: NonNullable<BracketMatch["result_detail"]>): string {
  if (method === "combined_ippon") {
    return `合わせ一本 (技${Math.max(d.red_wazaari ?? 0, d.white_wazaari ?? 0)})`;
  }
  if (method === "wazaari") {
    return `技あり優勢 (技${d.red_wazaari ?? 0}-${d.white_wazaari ?? 0})`;
  }
  if (method === "point") {
    return `ポイント (${d.red_points ?? 0}-${d.white_points ?? 0} 技${d.red_wazaari ?? 0}-${d.white_wazaari ?? 0})`;
  }
  return RESULT_METHOD_LABELS[method] ?? method;
}

/** 勝利方法を表示テキストに変換 */
export function formatResultMethod(
  method: string | null | undefined,
  detail: BracketMatch["result_detail"],
): string | null {
  if (!method) return null;
  if (RESULT_METHOD_LABELS[method]) return RESULT_METHOD_LABELS[method];
  return formatDetailedResult(method, detail ?? {});
}

type FighterSlotProps = {
  name: string;
  aff?: string;
  fighterId: string | null;
  isWinner: boolean;
  isWithdrawn: boolean;
  entryId?: string;
  borderBottom?: boolean;
  isRed: boolean;
  showResult?: boolean;
  matchId: string;
  matchStatus: string;
  timerControlActive: boolean;
  isCorrecting: boolean;
  resultText: string | null;
  isCorrected: boolean;
  onSetWinner?: (matchId: string, fighterId: string) => void;
  onCorrectWinner?: (matchId: string, fighterId: string) => void;
  onWithdrawnToggle?: (matchId: string, fighterId: string, entryId: string, withdrawn: boolean) => void;
  onCorrectionDone: () => void;
};

function fighterSlotBg(props: FighterSlotProps): string {
  const { matchStatus, isWithdrawn, isCorrecting, fighterId, timerControlActive, onSetWinner, onCorrectWinner } = props;
  const isOngoing = matchStatus === "ongoing";
  const correctable = isCorrecting && !!onCorrectWinner && !!fighterId && !isWithdrawn;
  const clickable = isOngoing && !!onSetWinner && !!fighterId && !isWithdrawn && !timerControlActive;
  if (isOngoing && isWithdrawn) return "bg-gray-900/60 opacity-50 cursor-not-allowed";
  if (correctable) return "bg-gray-800 hover:bg-orange-900/40 cursor-pointer transition-colors";
  if (clickable) return "bg-gray-800 hover:bg-green-900/40 cursor-pointer transition-colors";
  if (props.isWinner) return "bg-green-900/50";
  return "bg-gray-800";
}

function fighterNameClass(isWinner: boolean, isWithdrawn: boolean, fighterId: string | null): string {
  if (isWinner) return "text-green-300 font-bold";
  if (isWithdrawn) return "text-gray-500 line-through";
  if (fighterId) return "text-gray-100";
  return "text-gray-500 italic";
}

function fighterSlotClickHandler(props: FighterSlotProps): (() => void) | undefined {
  const { fighterId, isWithdrawn, matchId, matchStatus, isCorrecting, timerControlActive, onSetWinner, onCorrectWinner, onCorrectionDone } = props;
  if (isCorrecting && onCorrectWinner && fighterId && !isWithdrawn) {
    return () => { onCorrectWinner(matchId, fighterId); onCorrectionDone(); };
  }
  if (matchStatus === "ongoing" && onSetWinner && fighterId && !isWithdrawn && !timerControlActive) {
    return () => onSetWinner(matchId, fighterId);
  }
  return undefined;
}

function WithdrawnToggleButton({ props }: { props: FighterSlotProps }) {
  const { fighterId, isWithdrawn, entryId, matchId, matchStatus, onWithdrawnToggle } = props;
  const isDone = matchStatus === "done";
  const isOngoing = matchStatus === "ongoing";
  if (isDone || isOngoing || !fighterId || !entryId || !onWithdrawnToggle) return null;
  return (
    <button
      className={`absolute right-1 top-1/2 -translate-y-1/2 text-[8px] px-1 py-0.5 rounded border transition ${isWithdrawn ? "border-red-600 bg-red-900/60 text-red-400 hover:bg-red-900" : "border-gray-600 text-gray-600 hover:border-red-500 hover:text-red-400"}`}
      onClick={(e) => { e.stopPropagation(); onWithdrawnToggle(matchId, fighterId, entryId, !isWithdrawn); }}
    >
      棄
    </button>
  );
}

function FighterSlot(props: FighterSlotProps) {
  const { name, aff, fighterId, isWinner, isWithdrawn, borderBottom, isRed, showResult, resultText, isCorrected } = props;

  return (
    <div
      className={`relative flex flex-col justify-center px-2 ${borderBottom ? "border-b border-gray-600/50" : ""} ${fighterSlotBg(props)}`}
      style={{ height: BRACKET_FIGHTER_H }}
      onClick={fighterSlotClickHandler(props)}
    >
      <div className="flex items-center gap-1 min-w-0 pr-7">
        <span className={`shrink-0 text-[7px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center ${isRed ? "bg-red-700/80 text-red-100" : "bg-gray-500/60 text-gray-100"}`}>
          {isRed ? "赤" : "白"}
        </span>
        {isWinner && <span className="text-green-400 text-[9px] shrink-0">▶</span>}
        <span className={`truncate text-xs ${fighterNameClass(isWinner, isWithdrawn, fighterId)}`}>{name}</span>
        {isWithdrawn && <span className="text-[8px] bg-red-900 text-red-400 px-1 rounded shrink-0">棄権</span>}
      </div>
      {aff && !isWithdrawn && <p className="truncate text-[9px] text-gray-500 leading-tight pl-4 pr-7">{aff}</p>}
      {showResult && resultText && (
        <p className="truncate text-[8px] text-green-400 leading-tight pl-4 pr-7">
          {resultText}{isCorrected && <span className="text-yellow-400 ml-0.5">(訂正)</span>}
        </p>
      )}
      <WithdrawnToggleButton props={props} />
    </div>
  );
}

const FOOTER_BTN = "shrink-0 text-[9px] bg-gray-700 hover:bg-gray-600 px-1.5 py-0.5 rounded transition";

function SwapButtons({ m, isDone, isOngoing, canSwap, onSwapWithNext, onSwapFighters }: {
  m: BracketMatch; isDone: boolean; isOngoing: boolean; canSwap: boolean;
  onSwapWithNext?: (round: number, matchId: string) => void;
  onSwapFighters?: (matchId: string) => void;
}) {
  return (
    <>
      {canSwap && <button onClick={(e) => { e.stopPropagation(); onSwapWithNext?.(m.round, m.id); }} className={`${FOOTER_BTN} ml-auto text-gray-500 hover:text-blue-400`}>↕次</button>}
      {!isDone && !isOngoing && onSwapFighters && <button onClick={(e) => { e.stopPropagation(); onSwapFighters(m.id); }} title="赤・白（上下）を入れ替え" className={`${FOOTER_BTN} text-gray-500 hover:text-yellow-400`}>⇅赤白</button>}
    </>
  );
}

function AnnounceButtons({ m, isDone, isOngoing, onReannounceStart, onReannounceWinner, onCorrectWinner, setCorrectionMatchId }: {
  m: BracketMatch; isDone: boolean; isOngoing: boolean;
  onReannounceStart?: (matchId: string) => void;
  onReannounceWinner?: (matchId: string) => void;
  onCorrectWinner?: (matchId: string, fighterId: string) => void;
  setCorrectionMatchId: (id: string | null) => void;
}) {
  return (
    <>
      {isOngoing && onReannounceStart && <button onClick={() => onReannounceStart(m.id)} title="試合開始アナウンスを再読み上げ" className={`${FOOTER_BTN} ml-auto text-gray-500 hover:text-blue-300`}>📢</button>}
      {isDone && onReannounceWinner && <button onClick={() => onReannounceWinner(m.id)} title="勝者アナウンスを再読み上げ" className={`${FOOTER_BTN} text-gray-500 hover:text-blue-300`}>📢</button>}
      {isDone && onCorrectWinner && <button onClick={() => setCorrectionMatchId(m.id)} title="勝者を訂正する" className={`${FOOTER_BTN} text-gray-500 hover:text-orange-400`}>訂正</button>}
    </>
  );
}

function MatchFooterButtons({ m, isOngoing, isDone, canSwap, isMuted, onSwapWithNext, onSwapFighters, onReannounceStart, onReannounceWinner, onCorrectWinner, onToggleMute, setCorrectionMatchId }: {
  m: BracketMatch; isOngoing: boolean; isDone: boolean; canSwap: boolean; isMuted: boolean;
  onSwapWithNext?: (round: number, matchId: string) => void;
  onSwapFighters?: (matchId: string) => void;
  onReannounceStart?: (matchId: string) => void;
  onReannounceWinner?: (matchId: string) => void;
  onCorrectWinner?: (matchId: string, fighterId: string) => void;
  onToggleMute?: (matchId: string) => void;
  setCorrectionMatchId: (id: string | null) => void;
}) {
  return (
    <>
      {isOngoing && <span className="text-[9px] text-yellow-400 font-medium shrink-0">試合中</span>}
      <SwapButtons m={m} isDone={isDone} isOngoing={isOngoing} canSwap={canSwap} onSwapWithNext={onSwapWithNext} onSwapFighters={onSwapFighters} />
      <AnnounceButtons m={m} isDone={isDone} isOngoing={isOngoing} onReannounceStart={onReannounceStart} onReannounceWinner={onReannounceWinner} onCorrectWinner={onCorrectWinner} setCorrectionMatchId={setCorrectionMatchId} />
      {!isDone && onToggleMute && (
        <button onClick={(e) => { e.stopPropagation(); onToggleMute(m.id); }} title={isMuted ? "アナウンス OFF（クリックで ON）" : "アナウンス ON（クリックで OFF）"} className={`shrink-0 ml-auto text-[11px] leading-none px-1 py-0.5 rounded transition ${isMuted ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-200"}`}>
          {isMuted ? "🔇" : "🔊"}
        </button>
      )}
    </>
  );
}

function matchCardBorder(m: BracketMatch, isCorrectingThis: boolean, isNextMatch: boolean, isDimmed: boolean, isNumberingMode: boolean, isByeMatch: boolean, assignedNum: number | undefined): string {
  if (isNumberingMode && !isByeMatch) {
    return assignedNum != null ? "border-blue-500 cursor-pointer" : "border-gray-500 hover:border-blue-400 cursor-pointer";
  }
  if (isCorrectingThis) return "border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]";
  if (m.status === "done") return "border-green-800/70";
  if (m.status === "ongoing") return "border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.6)]";
  if (isNextMatch) return "border-blue-300 shadow-[0_0_20px_rgba(147,197,253,0.8)] animate-pulse";
  if (isDimmed) return "border-gray-600 opacity-40";
  return "border-gray-600";
}

function footerBg(isCorrectingThis: boolean, isOngoing: boolean, isNextMatch: boolean): string {
  if (isCorrectingThis) return "bg-orange-950/60";
  if (isOngoing) return "bg-yellow-950/60";
  if (isNextMatch) return "bg-blue-950/60";
  return "bg-gray-900/50";
}

function matchLabelBadgeClass(isNextMatch: boolean, isOngoing: boolean, isDone: boolean): string {
  if (isNextMatch) return "bg-blue-600 text-white";
  if (isOngoing) return "bg-yellow-700 text-yellow-100";
  if (isDone) return "bg-gray-700 text-gray-500";
  return "bg-gray-700 text-gray-300";
}

function MatchCard({ m, cardLeft, cardTop, isCorrectingThis, isNextMatch, isDimmed, isNumberingMode, isByeMatch, assignedNum, onNumberClick, children }: {
  m: BracketMatch;
  cardLeft: (round: number) => number;
  cardTop: (round: number, pos: number) => number;
  isCorrectingThis: boolean;
  isNextMatch: boolean;
  isDimmed: boolean;
  isNumberingMode: boolean;
  isByeMatch: boolean;
  assignedNum?: number;
  onNumberClick?: (matchId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`match-${m.id}`}
      className={`absolute border rounded-lg overflow-hidden transition-opacity ${matchCardBorder(m, isCorrectingThis, isNextMatch, isDimmed, isNumberingMode, isByeMatch, assignedNum)}`}
      onClick={isNumberingMode && !isByeMatch ? () => onNumberClick?.(m.id) : undefined}
      style={{ left: cardLeft(m.round), top: cardTop(m.round, m.position), width: BRACKET_CARD_W, height: BRACKET_CARD_H }}
    >
      {children}
    </div>
  );
}

function NumberingOverlay({ isNumberingMode, isByeMatch, assignedNum }: { isNumberingMode: boolean; isByeMatch: boolean; assignedNum?: number }) {
  if (!isNumberingMode || isByeMatch) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      {assignedNum != null ? (
        <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-base font-bold flex items-center justify-center shadow-lg">{assignedNum}</span>
      ) : (
        <span className="w-8 h-8 rounded-full border-2 border-dashed border-gray-500 text-gray-500 text-lg flex items-center justify-center">+</span>
      )}
    </div>
  );
}

function StartOverlay({ isReady, isProcessing, isNextMatch, hasOngoingMatch, timerControlActive, matchId, onMatchClick }: {
  isReady: boolean; isProcessing: boolean; isNextMatch: boolean; hasOngoingMatch: boolean; timerControlActive: boolean; matchId: string; onMatchClick?: (matchId: string) => void;
}) {
  if (!isReady || !onMatchClick || isProcessing || timerControlActive) return null;
  if (!isNextMatch && hasOngoingMatch) return null;
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center z-10 cursor-pointer transition-colors ${isNextMatch ? "bg-blue-600/75 hover:bg-blue-500/85 active:bg-blue-700/90" : "bg-gray-800/70 hover:bg-blue-900/60"}`}
      onClick={() => onMatchClick(matchId)}
    >
      <span className={`font-bold tracking-wide ${isNextMatch ? "text-white text-sm" : "text-gray-400 text-xs"}`}>
        {isNextMatch ? "▶ 試合開始" : "▶"}
      </span>
    </div>
  );
}

type BracketMatchCardProps = {
  m: BracketMatch; maxRound: number;
  nameMap: Record<string, string>; affiliationMap: Record<string, string>;
  withdrawnIds?: Set<string>; fighterEntryMap?: Record<string, string>;
  processingMatchIds?: Set<string>; mutedMatchIds?: Set<string>;
  assignedNumbers?: Record<string, number>; nextMatchId?: string | null;
  hasOngoingMatch: boolean; timerControlActive: boolean;
  correctionMatchId: string | null; setCorrectionMatchId: (id: string | null) => void;
  roundMatchIds: Record<number, string[]>;
  isBye: (m: BracketMatch) => boolean;
  cardLeft: (round: number) => number; cardTop: (round: number, pos: number) => number;
  onNumberClick?: (matchId: string) => void; onMatchClick?: (matchId: string) => void;
  onSetWinner?: (matchId: string, fighterId: string) => void;
  onCorrectWinner?: (matchId: string, fighterId: string) => void;
  onWithdrawnToggle?: (matchId: string, fighterId: string, entryId: string, withdrawn: boolean) => void;
  onSwapWithNext?: (round: number, matchId: string) => void;
  onSwapFighters?: (matchId: string) => void;
  onReannounceStart?: (matchId: string) => void;
  onReannounceWinner?: (matchId: string) => void;
  onToggleMute?: (matchId: string) => void;
};

function fighterName(fighterId: string | null, nameMap: Record<string, string>, round: number, position: number, slot: 0 | 1, maxRound: number): string {
  return fighterId ? (nameMap[fighterId] ?? "?") : pendingSlotLabel(round, position, slot, maxRound);
}

function BracketMatchCardFooter({ m, isCorrectingThis, isOngoing, isDone, isNextMatch, isNumberingMode, canSwap, isMuted, setCorrectionMatchId, onSwapWithNext, onSwapFighters, onReannounceStart, onReannounceWinner, onCorrectWinner, onToggleMute }: {
  m: BracketMatch; isCorrectingThis: boolean; isOngoing: boolean; isDone: boolean; isNextMatch: boolean; isNumberingMode: boolean; canSwap: boolean; isMuted: boolean;
  setCorrectionMatchId: (id: string | null) => void;
  onSwapWithNext?: (round: number, matchId: string) => void; onSwapFighters?: (matchId: string) => void;
  onReannounceStart?: (matchId: string) => void; onReannounceWinner?: (matchId: string) => void;
  onCorrectWinner?: (matchId: string, fighterId: string) => void; onToggleMute?: (matchId: string) => void;
}) {
  return (
    <div className={`flex items-center px-1.5 gap-1 border-t border-gray-600/50 ${footerBg(isCorrectingThis, isOngoing, isNextMatch)}`} style={{ height: BRACKET_FOOTER_H }}>
      {m.match_label && !isCorrectingThis && !isNumberingMode && <span className={`shrink-0 text-[8px] font-bold px-1 py-0.5 rounded leading-none ${matchLabelBadgeClass(isNextMatch, isOngoing, isDone)}`}>{m.match_label}</span>}
      {isCorrectingThis ? (
        <><span className="text-[9px] text-orange-400 font-medium truncate">タップで勝者を訂正</span><button onClick={() => setCorrectionMatchId(null)} className={`ml-auto ${FOOTER_BTN} text-gray-500 hover:text-gray-300`}>キャンセル</button></>
      ) : (
        <MatchFooterButtons m={m} isOngoing={isOngoing} isDone={isDone} canSwap={canSwap} isMuted={isMuted} onSwapWithNext={onSwapWithNext} onSwapFighters={onSwapFighters} onReannounceStart={onReannounceStart} onReannounceWinner={onReannounceWinner} onCorrectWinner={onCorrectWinner} onToggleMute={onToggleMute} setCorrectionMatchId={setCorrectionMatchId} />
      )}
    </div>
  );
}

function resolveFighterData(fighterId: string | null, slot: 0 | 1, m: BracketMatch, props: BracketMatchCardProps) {
  const { nameMap, affiliationMap, withdrawnIds, fighterEntryMap, maxRound } = props;
  return {
    name: fighterName(fighterId, nameMap, m.round, m.position, slot, maxRound),
    aff: fighterId ? affiliationMap[fighterId] : undefined,
    isWithdrawn: !!(fighterId && withdrawnIds?.has(fighterId)),
    entryId: fighterId ? fighterEntryMap?.[fighterId] : undefined,
    isWinner: m.winner_id === fighterId,
  };
}

function resolveMatchStatusFlags(m: BracketMatch) {
  return {
    isDone: m.status === "done",
    isOngoing: m.status === "ongoing",
    isReady: m.status === "ready" && !!m.fighter1_id && !!m.fighter2_id,
    isDraw: m.result_method === "draw",
    resultText: formatResultMethod(m.result_method, m.result_detail),
    isCorrected: !!m.result_detail?.corrected,
  };
}

function resolveMatchFlags(m: BracketMatch, props: BracketMatchCardProps) {
  const { processingMatchIds, mutedMatchIds, assignedNumbers, nextMatchId, hasOngoingMatch, onNumberClick, roundMatchIds, isBye: isByeFn, correctionMatchId, onSwapWithNext } = props;
  const status = resolveMatchStatusFlags(m);
  const isNumberingMode = !!onNumberClick;
  const isNextMatch = nextMatchId != null && m.id === nextMatchId;
  const roundList = roundMatchIds[m.round] ?? [];
  return {
    ...status,
    isNumberingMode, isNextMatch,
    isCorrectingThis: correctionMatchId === m.id,
    isProcessing: !!processingMatchIds?.has(m.id),
    isMuted: mutedMatchIds?.has(m.id) ?? false,
    isByeMatch: isByeFn(m),
    assignedNum: assignedNumbers?.[m.id],
    isDimmed: status.isReady && !isNextMatch && !status.isOngoing && !status.isDone && !isNumberingMode && hasOngoingMatch,
    canSwap: !status.isDone && !status.isOngoing && roundList.indexOf(m.id) < roundList.length - 1 && !!onSwapWithNext,
  };
}

function BracketMatchCard(props: BracketMatchCardProps) {
  const { m, timerControlActive, setCorrectionMatchId, cardLeft, cardTop, onNumberClick, onMatchClick, onSetWinner, onCorrectWinner, onWithdrawnToggle, onSwapWithNext, onSwapFighters, onReannounceStart, onReannounceWinner, onToggleMute } = props;
  const flags = resolveMatchFlags(m, props);
  const f1 = resolveFighterData(m.fighter1_id, 0, m, props);
  const f2 = resolveFighterData(m.fighter2_id, 1, m, props);
  const fighterBase = { matchId: m.id, matchStatus: m.status, timerControlActive, isCorrecting: flags.isCorrectingThis, resultText: flags.resultText, isCorrected: flags.isCorrected, onSetWinner, onCorrectWinner, onWithdrawnToggle, onCorrectionDone: () => setCorrectionMatchId(null) };

  return (
    <MatchCard m={m} cardLeft={cardLeft} cardTop={cardTop} isCorrectingThis={flags.isCorrectingThis} isNextMatch={flags.isNextMatch} isDimmed={flags.isDimmed} isNumberingMode={flags.isNumberingMode} isByeMatch={flags.isByeMatch} assignedNum={flags.assignedNum} onNumberClick={onNumberClick}>
      <FighterSlot {...fighterBase} name={f1.name} aff={f1.aff} fighterId={m.fighter1_id} isWinner={f1.isWinner} isWithdrawn={f1.isWithdrawn} entryId={f1.entryId} borderBottom isRed showResult={flags.isDone && !flags.isDraw && f1.isWinner} />
      <FighterSlot {...fighterBase} name={f2.name} aff={f2.aff} fighterId={m.fighter2_id} isWinner={f2.isWinner} isWithdrawn={f2.isWithdrawn} entryId={f2.entryId} isRed={false} showResult={flags.isDone && !flags.isDraw && f2.isWinner} />
      <NumberingOverlay isNumberingMode={flags.isNumberingMode} isByeMatch={flags.isByeMatch} assignedNum={flags.assignedNum} />
      <StartOverlay isReady={flags.isReady} isProcessing={flags.isProcessing} isNextMatch={flags.isNextMatch} hasOngoingMatch={props.hasOngoingMatch} timerControlActive={timerControlActive} matchId={m.id} onMatchClick={onMatchClick} />
      {flags.isProcessing && <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center z-10"><div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>}
      <BracketMatchCardFooter m={m} isCorrectingThis={flags.isCorrectingThis} isOngoing={flags.isOngoing} isDone={flags.isDone} isNextMatch={flags.isNextMatch} isNumberingMode={flags.isNumberingMode} canSwap={flags.canSwap} isMuted={flags.isMuted} setCorrectionMatchId={setCorrectionMatchId} onSwapWithNext={onSwapWithNext} onSwapFighters={onSwapFighters} onReannounceStart={onReannounceStart} onReannounceWinner={onReannounceWinner} onCorrectWinner={onCorrectWinner} onToggleMute={onToggleMute} />
    </MatchCard>
  );
}

function BracketLegend() {
  return (
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
  );
}

function RoundHeaders({ maxRound, totalWidth }: { maxRound: number; totalWidth: number }) {
  return (
    <div className="flex mb-2" style={{ width: totalWidth }}>
      {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
        <div key={round} className="text-xs text-gray-400 text-center shrink-0" style={{ width: round === maxRound ? BRACKET_CARD_W : BRACKET_COL_W }}>
          {roundLabel(round, maxRound)}
        </div>
      ))}
    </div>
  );
}

function ConnectorLines({ connectors, totalWidth, totalHeight }: { connectors: { x1: number; y1: number; x2: number; y2: number; xMid: number; key: string }[]; totalWidth: number; totalHeight: number }) {
  return (
    <svg className="absolute inset-0 pointer-events-none" width={totalWidth} height={totalHeight} style={{ overflow: "visible" }}>
      {connectors.map((c) => (
        <path key={c.key} d={`M ${c.x1} ${c.y1} H ${c.xMid} V ${c.y2} H ${c.x2}`} fill="none" stroke="#4b5563" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

const BRACKET_CARD_W = 172;
const BRACKET_FOOTER_H = 24;
const BRACKET_FIGHTER_H = 48;
const BRACKET_CARD_H = BRACKET_FIGHTER_H * 2 + BRACKET_FOOTER_H; // 120
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
  timerControlActive = false,
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
  /** タイマー操作画面で制御中（true の場合、操作ボタンを無効化） */
  timerControlActive?: boolean;
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
  [...matches]
    .sort((a, b) => a.position - b.position)
    .forEach((m) => {
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
      <BracketLegend />
      <RoundHeaders maxRound={maxRound} totalWidth={totalWidth} />
      <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
        <ConnectorLines connectors={connectors} totalWidth={totalWidth} totalHeight={totalHeight} />
        {matches.map((m) => (
          <BracketMatchCard key={m.id} m={m} maxRound={maxRound} nameMap={nameMap} affiliationMap={affiliationMap} withdrawnIds={withdrawnIds} fighterEntryMap={fighterEntryMap} processingMatchIds={processingMatchIds} mutedMatchIds={mutedMatchIds} assignedNumbers={assignedNumbers} nextMatchId={nextMatchId} hasOngoingMatch={hasOngoingMatch} timerControlActive={timerControlActive} correctionMatchId={correctionMatchId} setCorrectionMatchId={setCorrectionMatchId} roundMatchIds={roundMatchIds} isBye={isBye} cardLeft={cardLeft} cardTop={cardTop} onNumberClick={onNumberClick} onMatchClick={onMatchClick} onSetWinner={onSetWinner} onCorrectWinner={onCorrectWinner} onWithdrawnToggle={onWithdrawnToggle} onSwapWithNext={onSwapWithNext} onSwapFighters={onSwapFighters} onReannounceStart={onReannounceStart} onReannounceWinner={onReannounceWinner} onToggleMute={onToggleMute} />
        ))}
      </div>
    </div>
  );
}
