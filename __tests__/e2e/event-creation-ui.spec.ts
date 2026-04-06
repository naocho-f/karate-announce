/**
 * E2E テスト: イベント作成UI
 *
 * 管理画面の試合タブでイベントをUI操作で作成するフローを検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin, cleanupEvent } from "./helpers";

test.describe("イベント作成UI", () => {
  const eventIds: string[] = [];

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    for (const id of eventIds) {
      await cleanupEvent(page, id);
    }
    eventIds.length = 0;
  });

  test("UI操作でイベントを作成できる", async ({ page }) => {
    await adminLogin(page);

    // API レスポンスをインターセプトしてIDを取得
    let createdId: string | null = null;
    page.on("response", async (response) => {
      if (response.url().includes("/api/admin/events") && response.request().method() === "POST" && response.ok()) {
        try {
          const data = await response.json();
          if (data.id) createdId = data.id;
        } catch {}
      }
    });

    await page.goto("/admin?tab=events");
    await page.waitForLoadState("networkidle");

    // 「新規試合を作成」ボタンをクリック
    await page.locator("button", { hasText: "新規試合を作成" }).click();

    // 試合名を入力
    const ts = Date.now();
    const eventName = `E2E UI作成テスト ${ts}`;
    const nameInput = page.locator('input[placeholder*="試合名"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(eventName);

    // 「試合を作成」ボタンをクリック（exactで絞る）
    await page.getByRole("button", { name: "試合を作成", exact: true }).click();

    // 作成したイベントが一覧に表示される
    await expect(page.locator(`text=${eventName}`).first()).toBeVisible({ timeout: 10_000 });

    // クリーンアップ
    if (createdId) eventIds.push(createdId);
  });

  test("イベントを完了にして再開できる", async ({ page }) => {
    await adminLogin(page);
    const res = await page.request.post("/api/admin/events", {
      data: {
        name: `E2E 完了テスト ${Date.now()}`,
        event_date: "2027-12-01",
        court_count: 1,
      },
    });
    const { id: eventId } = await res.json();
    eventIds.push(eventId);

    // イベントを完了にする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { status: "finished", is_active: false },
    });

    await page.goto("/admin?tab=events");
    await page.waitForLoadState("networkidle");

    // 過去・完了の試合セクションを開く
    const pastToggle = page.locator("button", { hasText: "過去・完了の試合" });
    if (await pastToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await pastToggle.click();
      await page.waitForTimeout(500);
    }

    // 再開する（API経由）
    const reopenRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { status: "active" },
    });
    expect(reopenRes.ok()).toBeTruthy();
  });
});
