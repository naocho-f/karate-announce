/**
 * E2E テスト: イベント管理
 *
 * イベントの編集・複製・アクティブ切り替え・削除・参加受付開始/終了を検証する。
 */
import { test, expect, type Page } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD!;

// ── ヘルパー ──

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[placeholder="ID"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/admin", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

async function createTestEvent(page: Page, name?: string): Promise<string> {
  const res = await page.request.post("/api/admin/events", {
    data: {
      name: name ?? `E2E イベント管理テスト ${Date.now()}`,
      event_date: "2027-12-01",
      court_count: 2,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  return id;
}

async function cleanupEvent(page: Page, eventId: string | null) {
  if (!eventId) return;
  await page.request.patch(`/api/admin/events/${eventId}`, {
    data: { is_active: false },
  }).catch(() => {});
  await page.request.delete(`/api/admin/events/${eventId}`).catch(() => {});
}

// ── テスト ──

test.describe("イベント管理", () => {
  const eventIds: string[] = [];

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    for (const id of eventIds) {
      await cleanupEvent(page, id);
    }
    eventIds.length = 0;
  });

  test("イベントを編集できる（名前・開催日・コート数）", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);
    eventIds.push(eventId);

    // API経由で編集
    const patchRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: {
        name: "E2E 編集済みイベント",
        event_date: "2027-12-25",
        court_count: 3,
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    // 管理画面で確認
    await page.goto("/admin?tab=events");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("E2E 編集済みイベント");
  });

  test("イベントを複製できる", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page, `E2E 複製元 ${Date.now()}`);
    eventIds.push(eventId);

    // API経由で複製
    const copyRes = await page.request.post("/api/admin/events", {
      data: {
        name: `E2E 複製先 ${Date.now()}`,
        event_date: "2027-12-15",
        copy_from_event_id: eventId,
      },
    });
    expect(copyRes.ok()).toBeTruthy();
    const { id: copiedId } = await copyRes.json();
    eventIds.push(copiedId);

    // 管理画面で複製先が表示されることを確認
    await page.goto("/admin?tab=events");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("E2E 複製先");
  });

  test("イベントをアクティブ/非アクティブに切り替えられる", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);
    eventIds.push(eventId);

    // アクティブにする
    const activateRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });
    expect(activateRes.ok()).toBeTruthy();

    // 管理画面のホームタブでアクティブなイベントが表示されることを確認
    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    let bodyText = await page.textContent("body");
    expect(bodyText).toContain("E2E イベント管理テスト");

    // 非アクティブにする
    const deactivateRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: false },
    });
    expect(deactivateRes.ok()).toBeTruthy();

    // ホームタブでアクティブイベントがなくなることを確認
    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    bodyText = await page.textContent("body");
    expect(bodyText).toContain("進行中の試合はありません");
  });

  test("イベントを削除できる", async ({ page }) => {
    await adminLogin(page);
    const ts = Date.now();
    const eventId = await createTestEvent(page, `E2E 削除テスト ${ts}`);
    // eventIds には追加しない（テスト内で削除するため）

    // API経由で削除
    const delRes = await page.request.delete(`/api/admin/events/${eventId}`);
    expect(delRes.ok()).toBeTruthy();

    // 管理画面で表示されないことを確認
    await page.goto("/admin?tab=events");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain(`E2E 削除テスト ${ts}`);
  });

  test("参加受付を開始/終了できる", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);
    eventIds.push(eventId);

    // 参加受付を終了
    const closeRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { entry_closed: true },
    });
    expect(closeRes.ok()).toBeTruthy();

    // 参加受付を再開
    const openRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { entry_closed: false },
    });
    expect(openRes.ok()).toBeTruthy();

    // アクティブにしてホームタブで受付状態を確認
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    await page.goto("/admin?tab=home");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("受付中");
  });
});
