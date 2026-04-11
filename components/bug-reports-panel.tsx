"use client";

import { useEffect, useState } from "react";
import { showToast } from "@/components/toast";

type BugReport = {
  id: string;
  what_did: string;
  what_happened: string;
  what_expected: string | null;
  page_url: string;
  user_agent: string | null;
  viewport: string | null;
  app_version: string | null;
  status: "open" | "in_progress" | "resolved" | "wontfix";
  resolution: string | null;
  fixed_in_version: string | null;
  created_at: string;
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "未対応", cls: "bg-red-900 text-red-300" },
  in_progress: { label: "修正中", cls: "bg-yellow-900 text-yellow-300" },
  resolved: { label: "対応済み", cls: "bg-green-900 text-green-300" },
  wontfix: { label: "対応しない", cls: "bg-gray-700 text-gray-400" },
};

function ReportDetailSection({ report }: { report: BugReport }) {
  return (
    <div className="space-y-2 pt-2">
      <div><p className="text-[10px] text-gray-500 uppercase">やったこと</p><p className="text-sm text-gray-300">{report.what_did}</p></div>
      <div><p className="text-[10px] text-gray-500 uppercase">起きたこと</p><p className="text-sm text-gray-300">{report.what_happened}</p></div>
      {report.what_expected && <div><p className="text-[10px] text-gray-500 uppercase">期待した動作</p><p className="text-sm text-gray-300">{report.what_expected}</p></div>}
    </div>
  );
}

function ReportEditSection({ report, editStatus, editResolution, editFixedVersion, saving, setEditStatus, setEditResolution, setEditFixedVersion, onSave }: {
  report: BugReport; editStatus: string; editResolution: string; editFixedVersion: string; saving: boolean;
  setEditStatus: (v: string) => void; setEditResolution: (v: string) => void; setEditFixedVersion: (v: string) => void; onSave: (id: string) => void;
}) {
  return (
    <div className="space-y-2 bg-gray-900 rounded p-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">ステータス</label>
        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="bg-gray-700 text-sm text-white rounded px-2 py-1 outline-none">
          <option value="open">未対応</option><option value="resolved">対応済み</option><option value="wontfix">対応しない</option>
        </select>
      </div>
      <div><label className="text-xs text-gray-400">対応内容（原因と修正内容）</label><textarea value={editResolution} onChange={(e) => setEditResolution(e.target.value)} rows={2} className="w-full bg-gray-700 rounded px-2 py-1 text-sm text-white outline-none resize-none mt-1" /></div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">修正バージョン</label>
        <input value={editFixedVersion} onChange={(e) => setEditFixedVersion(e.target.value)} className="bg-gray-700 rounded px-2 py-1 text-sm text-white outline-none" placeholder="例: abc1234" />
      </div>
      <button onClick={() => void onSave(report.id)} disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1 rounded">{saving ? "保存中..." : "保存"}</button>
    </div>
  );
}

const FILTER_BUTTONS: { key: "all" | "open" | "in_progress" | "resolved" | "wontfix"; label: string }[] = [
  { key: "all", label: "全件" }, { key: "open", label: "未対応" }, { key: "in_progress", label: "修正中" },
  { key: "resolved", label: "対応済み" }, { key: "wontfix", label: "対応しない" },
];

function BugReportsHeader({ filter, filteredCount, hasOpen, onSetFilter }: { filter: string; filteredCount: number; hasOpen: boolean; onSetFilter: (f: "all" | "open" | "in_progress" | "resolved" | "wontfix") => void }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h2 className="text-lg font-bold">不具合報告</h2>
      <span className="text-xs text-gray-400">{filteredCount}件</span>
      {hasOpen && (
        <a href={process.env.NEXT_PUBLIC_AGENT_DASHBOARD_URL || "http://localhost:3456"} target="_blank" rel="noopener noreferrer" className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-1 rounded-lg transition">Agent で自動修正 →</a>
      )}
      <div className="flex gap-1 ml-auto">
        {FILTER_BUTTONS.map((f) => (
          <button key={f.key} onClick={() => onSetFilter(f.key)} className={`px-2 py-0.5 rounded-full text-xs transition ${filter === f.key ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>{f.label}</button>
        ))}
      </div>
    </div>
  );
}

function ReportRow({ report, isExpanded, onToggle, children }: { report: BugReport; isExpanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  const badge = STATUS_BADGE[report.status] ?? STATUS_BADGE.open;
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-750 transition">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
        <span className="text-sm text-gray-200 truncate flex-1">{report.what_did.length > 30 ? report.what_did.slice(0, 30) + "..." : report.what_did}</span>
        <span className="text-xs text-gray-500 whitespace-nowrap">{relativeTime(report.created_at)}</span>
        {report.app_version && <span className="text-[10px] bg-gray-700 text-gray-400 px-1 py-0.5 rounded">{report.app_version}</span>}
      </button>
      {isExpanded && children}
    </div>
  );
}

export default function BugReportsPanel() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "wontfix">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editResolution, setEditResolution] = useState("");
  const [editFixedVersion, setEditFixedVersion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await fetch("/api/bug-reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(report: BugReport) {
    if (expandedId === report.id) {
      setExpandedId(null);
    } else {
      setExpandedId(report.id);
      setEditStatus(report.status);
      setEditResolution(report.resolution ?? "");
      setEditFixedVersion(report.fixed_in_version ?? "");
    }
  }

  async function saveReport(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          resolution: editResolution || null,
          fixed_in_version: editFixedVersion || null,
        }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: editStatus as BugReport["status"],
                  resolution: editResolution || null,
                  fixed_in_version: editFixedVersion || null,
                }
              : r,
          ),
        );
      } else {
        showToast("保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  }

  const filtered = reports.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-3">
      <BugReportsHeader filter={filter} filteredCount={filtered.length} hasOpen={reports.some((r) => r.status === "open")} onSetFilter={setFilter} />
      {loading && <p className="text-sm text-gray-500">読み込み中...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-gray-500">報告はありません</p>}
      {filtered.map((report) => (
        <ReportRow key={report.id} report={report} isExpanded={expandedId === report.id} onToggle={() => toggleExpand(report)}>
          <div className="px-3 pb-3 space-y-3 border-t border-gray-700">
            <ReportDetailSection report={report} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <a href={report.page_url} target="_blank" rel="noreferrer" className="hover:text-blue-400 underline">{report.page_url}</a>
              {report.viewport && <span>viewport: {report.viewport}</span>}
              <span>{new Date(report.created_at).toLocaleString("ja-JP")}</span>
            </div>
            <ReportEditSection report={report} editStatus={editStatus} editResolution={editResolution} editFixedVersion={editFixedVersion} saving={saving} setEditStatus={setEditStatus} setEditResolution={setEditResolution} setEditFixedVersion={setEditFixedVersion} onSave={(id) => void saveReport(id)} />
          </div>
        </ReportRow>
      ))}
    </div>
  );
}
