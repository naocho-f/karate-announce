"use client";

import { useState } from "react";
import type { Event } from "@/lib/types";
import { MatchLabelEditor } from "@/components/match-label-editor";

export type MatchLabelSectionProps = {
  eventId: string;
  event: Event;
  onLoad: () => void;
};

export function MatchLabelSection({ eventId, event, onLoad }: MatchLabelSectionProps) {
  const [matchLabelCourt, setMatchLabelCourt] = useState<string>("all");

  return (
    <div className="space-y-6">
      {/* コートタブ */}
      {event.court_count > 1 && (
        <div className="grid rounded-xl overflow-hidden border border-gray-700" style={{ gridTemplateColumns: `repeat(${event.court_count + 1}, minmax(0, 1fr))` }}>
          <button
            onClick={() => setMatchLabelCourt("all")}
            className={`py-2 text-sm font-medium transition ${matchLabelCourt === "all" ? "bg-blue-700 text-white" : "bg-gray-800 hover:bg-gray-750 text-gray-400 hover:text-gray-200"}`}
          >
            全コート
          </button>
          {Array.from({ length: event.court_count }, (_, i) => {
            const courtKey = String(i + 1);
            const courtLabel = event.court_names?.[i]?.trim() || `コート${i + 1}`;
            return (
              <button
                key={courtKey}
                onClick={() => setMatchLabelCourt(courtKey)}
                className={`py-2 text-sm font-medium transition ${matchLabelCourt === courtKey ? "bg-blue-700 text-white" : "bg-gray-800 hover:bg-gray-750 text-gray-400 hover:text-gray-200"}`}
              >
                {courtLabel}
              </button>
            );
          })}
        </div>
      )}
      <MatchLabelEditor eventId={eventId} courtNames={event.court_names} courtCount={event.court_count} selectedCourt={matchLabelCourt === "all" ? undefined : matchLabelCourt} onChanged={onLoad} />
    </div>
  );
}
