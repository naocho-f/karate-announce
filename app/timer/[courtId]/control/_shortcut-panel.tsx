"use client";

import { useState, useEffect, useRef } from "react";
import { undo, undoActionLabel, type TimerState, type UndoEntry } from "@/lib/timer-state";

export default function HistoryPanel({
  state,
  onUpdate,
}: {
  state: TimerState;
  onUpdate: (fn: (s: TimerState) => TimerState) => void;
}) {
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const entries = state.undoStack;

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  const handleUndo = () => {
    if (entries.length === 0) return;
    const idx = entries.length - 1;
    setRemovingIdx(idx);
    setTimeout(() => {
      onUpdate(undo);
      setRemovingIdx(null);
    }, 300);
  };

  return (
    <div className="w-96 shrink-0 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto hidden lg:flex lg:flex-col">
      <h3 className="text-sm font-bold text-gray-400 mb-3">操作履歴</h3>

      <div className="flex-1 overflow-y-auto space-y-1 mb-3">
        {entries.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8">操作なし</p>
        ) : (
          entries.map((entry: UndoEntry, i: number) => (
            <div
              key={`${i}-${entry.action}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-300 ${
                removingIdx === i
                  ? "opacity-0 translate-x-8 scale-95"
                  : "opacity-100 translate-x-0 scale-100"
              } ${entry.action.startsWith("red") ? "bg-red-950/50 text-red-300" : entry.action.startsWith("white") ? "bg-blue-950/50 text-blue-300" : "bg-gray-800/50 text-gray-300"}`}
            >
              <span className="text-xs text-gray-500 font-mono w-5 shrink-0">{i + 1}</span>
              <span className="font-medium">{undoActionLabel(entry.action)}</span>
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      {entries.length > 0 && (
        <button
          onClick={handleUndo}
          disabled={removingIdx !== null}
          className="w-full py-3 rounded-lg bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white text-base font-bold transition shadow-lg"
        >
          取消 — {undoActionLabel(entries[entries.length - 1].action)}
        </button>
      )}
    </div>
  );
}
