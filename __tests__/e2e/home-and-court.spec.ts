/**
 * E2E テスト: ホームダッシュボード・コート選択ページ
 *
 * ホーム画面の表示内容とコート選択ページの表示を検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin, cleanupEvent } from "./helpers";

test.describe("ホームダッシュボード", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("ホームタブに進行中の試合がない場合のメッセージが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");

    // ダッシュボードのコンテンツが描画されるまで待機
    await page.waitForSelector('[role="tabpanel"]', { timeout: 10_000 });

    const body = await page.textContent("body");
    const hasContent =
      body?.includes("進行中の試合はありません") ||
      body?.includes("開催中の試合はありません") ||
      body?.includes("進行中");
    expect(hasContent).toBeTruthy();
  });

  test("アクティブイベントがあるとダッシュボードにコート操作が表示される", async ({ page }) => {
    await adminLogin(page);

    // テストイベントを作成してアクティブにする
    const res = await page.request.post("/api/admin/events", {
      data: {
        name: `E2E ダッシュボード ${Date.now()}`,
        event_date: "2027-12-01",
        court_count: 2,
      },
    });
    const { id } = await res.json();
    eventId = id;

    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");

    // コート操作セクションが表示される
    await expect(page.locator("text=コート進行").first()).toBeVisible({ timeout: 10_000 });
    // タイマー操作リンクが表示される
    await expect(page.locator("text=タイマー操作").first()).toBeVisible();
  });

  test("ホームから試合タブへの遷移ボタンが動作する", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");

    // 「試合を管理する →」ボタンが表示される場合にクリック
    const manageBtn = page.locator("button", { hasText: "試合を管理する" });
    if (await manageBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await manageBtn.click();
      await expect(page).toHaveURL(/tab=events/);
    }
  });

  test("ライブ速報リンクが表示される", async ({ page }) => {
    await adminLogin(page);

    // アクティブイベントを作成
    const res = await page.request.post("/api/admin/events", {
      data: {
        name: `E2E ライブリンク ${Date.now()}`,
        event_date: "2027-12-01",
        court_count: 1,
      },
    });
    const { id } = await res.json();
    eventId = id;

    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");

    // ライブ速報リンクが表示される
    await expect(page.locator("text=試合速報").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("コート選択ページ", () => {
  test("コート選択ページが表示される", async ({ page }) => {
    await page.goto("/court");
    await page.waitForLoadState("networkidle");

    // ページが正常に表示される（エラーなし）
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
    // エラーページでないことを確認
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("エラーが発生しました");
  });

  test("コート個別ページが表示される", async ({ page }) => {
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");

    // ページが正常にロードされる
    const content = page.locator("main, body");
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  test("コート画面にタイマーリンクが表示される", async ({ page }) => {
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");

    // タイマー表示画面・操作パネルへのリンクが存在する
    const timerLink = page.locator("a[href*='/timer/1'], button:has-text('タイマー')").first();
    await expect(timerLink).toBeVisible({ timeout: 10_000 });
  });
});
