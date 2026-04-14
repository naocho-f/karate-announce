"use client";

import { flush } from "@/lib/offline-queue";
import { useOfflineMode } from "@/components/unified-status-bar";
import { setMode } from "@/lib/offline-mode";
import { resetToIdle } from "@/lib/timer-state";
import HistoryPanel from "./_shortcut-panel";
import IdlePanel from "./_idle-panel";
import MatchOperations from "./_match-operations";
import { PHASE_BADGE } from "./_timer-constants";
import MiniPreview from "./_mini-preview";
import { useTimerControl } from "./_use-timer-control";

function OfflineBanner({ offlineMode }: { offlineMode: string }) {
  if (offlineMode !== "offline") return null;
  return (
    <div className="bg-blue-600 text-white text-center px-3 py-1 text-xs font-medium flex items-center justify-center gap-2">
      <span>オフラインモード</span>
      <button
        onClick={() => {
          setMode("online");
          flush().catch(() => {});
        }}
        className="bg-blue-800 hover:bg-blue-900 px-2 py-0.5 rounded text-xs"
      >
        オンラインに切り替え
      </button>
    </div>
  );
}

export default function TimerControlPage() {
  const { mode: offlineMode } = useOfflineMode();
  const tc = useTimerControl();
  const phase = tc.state.phase;
  const badge = PHASE_BADGE[phase] ?? PHASE_BADGE.idle;
  const p = tc.state.preset;

  return (
    <div className="min-h-screen h-screen bg-gray-950 text-gray-100 flex flex-col">
      <OfflineBanner offlineMode={offlineMode} />

      <MiniPreview
        state={tc.state}
        p={p}
        displayMs={tc.displayMs}
        swapSides={tc.swapSides}
        isMuted={tc.isMuted}
        courtId={tc.courtId}
        badge={badge}
        onToggleMute={() => tc.setIsMuted((prev) => !prev)}
      />

      {tc.buzzerWarning && (
        <div className="bg-yellow-900 border-b border-yellow-700 px-4 py-2 flex items-center justify-between">
          <p className="text-yellow-200 text-sm font-medium">
            カスタム音源の読み込みに失敗しました。デフォルト音源を使用しています。
          </p>
          <button
            onClick={() => tc.setBuzzerWarning(false)}
            className="text-yellow-400 hover:text-yellow-200 text-sm ml-4"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {phase === "idle" && (
            <IdlePanel
              presets={tc.presets}
              selectedPresetId={tc.selectedPresetId}
              onSelectPresetId={tc.setSelectedPresetId}
              matchCandidates={tc.matchCandidates}
              loadingTournament={tc.loadingTournament}
              swapSides={tc.swapSides}
              swapping={tc.swapping}
              onSwapSides={() => {
                tc.setSwapping(true);
                const next = !tc.swapSides;
                tc.setSwapSides(next);
                tc.update((s) => ({
                  ...s,
                  preset: s.preset ? { ...s.preset, swap_sides: next } : s.preset,
                }));
                void new Promise<void>((r) => setTimeout(r, 300)).then(() => tc.setSwapping(false));
              }}
              onSelectMatch={tc.handleSelectMatch}
              onQuickMatch={tc.handleQuickMatch}
              matchItemRefs={tc.matchItemRefs}
              matchListTopRef={tc.matchListTopRef}
            />
          )}

          <MatchOperations
            state={tc.state}
            phase={phase}
            p={p}
            swapSides={tc.swapSides}
            showAnnounceSelection={tc.showAnnounceSelection}
            isMuted={tc.isMuted}
            isPlaying={tc.isPlaying}
            ipponConfirmSide={tc.ipponConfirmSide}
            selectingResultFor={tc.selectingResultFor}
            writingBack={tc.writingBack}
            newazaDispMs={tc.newazaDispMs}
            onUpdate={tc.update}
            onSetShowAnnounceSelection={tc.setShowAnnounceSelection}
            onSetIpponConfirmSide={tc.setIpponConfirmSide}
            onSetSelectingResultFor={tc.setSelectingResultFor}
            onSetBuzzerWarning={tc.setBuzzerWarning}
            onAnnounceStart={() => void tc.handleAnnounceStart()}
            onAnnounceWinner={() => void tc.handleAnnounceWinner()}
            onWriteBack={() => void tc.handleWriteBack()}
            onResetToIdle={() => {
              tc.update(resetToIdle);
              void tc.loadTournamentData();
              tc.setShouldScrollToNext(true);
            }}
            onLoadTournamentData={() => void tc.loadTournamentData()}
          />
        </div>

        <HistoryPanel state={tc.state} onUpdate={tc.update} />
      </div>

      {tc.isPlaying && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70">
          <p className="text-white text-4xl font-bold">アナウンス再生中</p>
          <button
            onClick={tc.handleStopSpeech}
            className="mt-6 px-6 py-3 text-xl font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white"
          >
            再生停止
          </button>
        </div>
      )}
    </div>
  );
}
