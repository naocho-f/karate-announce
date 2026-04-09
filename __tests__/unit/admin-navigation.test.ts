/**
 * 管理画面ナビゲーション構造のテスト
 * 全管理ページがメインの管理画面からアクセス可能であることを検証する。
 * React コンポーネントの描画テストではなく、ソースコード解析による構造テスト。
 *
 * admin/page.tsx は分割コンポーネント（components/home-dashboard-panel.tsx,
 * components/events-panel.tsx, components/settings-panel.tsx, components/guide-panel.tsx）
 * に委譲しているため、検証対象はそれらのファイルも含む。
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const ROOT = join(__dirname, "../..");
const ADMIN_PAGE = readFileSync(join(ROOT, "app/admin/page.tsx"), "utf-8");

/** admin/page.tsx と分割先コンポーネントの全ソースを結合した文字列 */
const ADMIN_ALL_SOURCES = [
  ADMIN_PAGE,
  readFileSync(join(ROOT, "components/home-dashboard-panel.tsx"), "utf-8"),
  readFileSync(join(ROOT, "components/events-panel.tsx"), "utf-8"),
  readFileSync(join(ROOT, "components/settings-panel.tsx"), "utf-8"),
  readFileSync(join(ROOT, "components/guide-panel.tsx"), "utf-8"),
].join("\n");

/** app/admin 配下のページファイルを列挙 */
function findAdminPages(): string[] {
  const pages: string[] = [];
  const dirs = [
    "app/admin/timer-presets",
    "app/admin/spec",
  ];
  for (const dir of dirs) {
    const pagePath = join(ROOT, dir, "page.tsx");
    if (existsSync(pagePath)) pages.push(dir);
  }
  return pages;
}

describe("管理画面ナビゲーション", () => {
  it("メインタブが4つ定義されている（ホーム・試合・設定・操作説明）", () => {
    // AdminTab 型は home-dashboard-panel.tsx で定義されている
    expect(ADMIN_ALL_SOURCES).toContain('"home" | "events" | "settings" | "guide"');
  });

  it("設定タブのサブタブにタイマーが含まれている", () => {
    expect(ADMIN_ALL_SOURCES).toContain('"announce" | "rules" | "dojos" | "timer"');
  });

  it("タイマーサブタブが設定タブ内にインライン表示される", () => {
    // リダイレクトではなくインライン表示に変更済み
    expect(ADMIN_ALL_SOURCES).toContain("TimerPresetsPanel");
    expect(ADMIN_ALL_SOURCES).not.toContain('router.push("/admin/timer-presets")');
  });

  it("仕様書ページ（/admin/spec）へのリンクがヘッダーにある", () => {
    expect(ADMIN_PAGE).toContain('href="/admin/spec"');
  });

  it("全管理サブページへのリンクまたは遷移コードが存在する", () => {
    const adminPages = findAdminPages();
    expect(adminPages.length).toBeGreaterThan(0);

    for (const page of adminPages) {
      // /admin/timer-presets はインライン化されたのでリンクではなくコンポーネントインポートで確認
      if (page.includes("timer-presets")) {
        expect(ADMIN_ALL_SOURCES).toContain("TimerPresetsPanel");
        continue;
      }
      const pagePath = `/${page.replace("app/", "")}`;
      const hasLink = ADMIN_ALL_SOURCES.includes(`href="${pagePath}"`) || ADMIN_ALL_SOURCES.includes(`"${pagePath}"`);
      expect(hasLink, `${pagePath} へのリンクが管理画面ソースに見つかりません`).toBe(true);
    }
  });

  it("タイマーが設定タブ内にインライン表示される", () => {
    expect(ADMIN_ALL_SOURCES).toContain("TimerPresetsPanel");
    // timer-presets/page.tsx は TimerPresetsPanel をインポートするラッパー
    const timerPage = readFileSync(join(ROOT, "app/admin/timer-presets/page.tsx"), "utf-8");
    expect(timerPage).toContain("TimerPresetsPanel");
  });

  it("イベント詳細ページに試合タブへの戻るリンクがある", () => {
    const eventPage = readFileSync(join(ROOT, "app/admin/events/[id]/page.tsx"), "utf-8");
    expect(eventPage).toContain("/admin?tab=events");
  });

  it("設定サブタブが grid-cols-4 で均等配置されている", () => {
    expect(ADMIN_PAGE).toContain("grid-cols-4");
  });

  it("進行中の試合にタイマー操作画面へのリンクがある", () => {
    expect(ADMIN_ALL_SOURCES).toContain("/timer/");
    expect(ADMIN_ALL_SOURCES).toContain("/control");
  });

  it("参加者詳細ページにイベント詳細への戻るリンクがある", () => {
    const entryPage = readFileSync(join(ROOT, "app/admin/events/[id]/entries/[entryId]/page.tsx"), "utf-8");
    expect(entryPage).toContain("/admin/events/");
  });
});
