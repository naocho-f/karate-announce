"use client";
import { TimerPresetsPanel } from "@/components/timer-presets-panel";

export default function TimerPresetsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <TimerPresetsPanel />
      </div>
    </div>
  );
}
