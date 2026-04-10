"use client";

import { useState } from "react";
import type { AdminTab } from "@/components/home-dashboard-panel";
import { GuidePartPresetup, GuidePartOperations } from "@/components/_guide-sections";

export function GuidePanel({ onNavigate }: { onNavigate: (tab: AdminTab) => void }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-400">
        このシステムは武道大会の試合管理・AI アナウンス・リアルタイム速報を行うツールです。
        以下の手順に沿って設定・運営を進めてください。各セクションをクリックすると詳細が表示されます。
      </p>

      <GuidePartPresetup openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      <GuidePartOperations openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
    </div>
  );
}
