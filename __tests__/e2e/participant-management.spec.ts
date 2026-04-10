/**
 * E2E テスト: 参加者管理
 *
 * 参加者一覧表示・テスト参加者追加・欠場切り替え・詳細表示を検証する。
 */
import { test, expect, type Page } from "@playwright/test";
import { adminLogin, createTestEvent, cleanupEvent } from "./helpers";

async function createTestEntry(page: Page, eventId: string, index: number): Promise<string> {
  const res = await page.request.post("/api/admin/entries", {
    data: {
      entry: {
        event_id: eventId,
        family_name: `参加者テスト${index}`,
        given_name: "太郎",
        family_name_reading: `サンカシャテスト${index}`,
        given_name_reading: "タロウ",
        is_test: true,
        weight: 65,
        height: 170,
        age: 25,
        sex: "男",
      },
      rule_ids: [],
    },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  return data.id;
}

// ── テスト ──

test.describe("参加者管理", () => {
  let eventId: string | null = null;
  const entryIds: string[] = [];

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    for (const id of entryIds) {
      await page.request.delete(`/api/admin/entries/${id}`).catch(() => {});
    }
    entryIds.length = 0;
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("参加者一覧が表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const id1 = await createTestEntry(page, eventId, 1);
    const id2 = await createTestEntry(page, eventId, 2);
    entryIds.push(id1, id2);

    // イベント管理画面のStep1（参加受付）を直接開く
    await page.goto(`/admin/events/${eventId}?step=1`);
    await page.waitForLoadState("networkidle");

    // 参加者名が表示されることを確認
    await expect(page.locator("text=参加者テスト1")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=参加者テスト2")).toBeVisible({ timeout: 10_000 });
  });

  test("テスト参加者を追加できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    const ts = Date.now();
    const res = await page.request.post("/api/admin/entries", {
      data: {
        entry: {
          event_id: eventId,
          family_name: `追加テスト${ts}`,
          given_name: "選手",
          family_name_reading: "ツイカテスト",
          given_name_reading: "センシュ",
          is_test: true,
          weight: 70,
          height: 175,
          age: 30,
        },
        rule_ids: [],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();
    entryIds.push(id);

    // イベント管理画面で確認
    await page.goto(`/admin/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`text=追加テスト${ts}`)).toBeVisible({ timeout: 10_000 });
  });

  test("参加者の欠場を切り替えられる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryId = await createTestEntry(page, eventId, 1);
    entryIds.push(entryId);

    // API経由で欠場に設定
    const withdrawRes = await page.request.patch(`/api/admin/entries/${entryId}`, {
      data: { is_withdrawn: true },
    });
    expect(withdrawRes.ok()).toBeTruthy();

    // 欠場を解除
    const restoreRes = await page.request.patch(`/api/admin/entries/${entryId}`, {
      data: { is_withdrawn: false },
    });
    expect(restoreRes.ok()).toBeTruthy();
  });

  test("参加者詳細画面で情報が表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryId = await createTestEntry(page, eventId, 1);
    entryIds.push(entryId);

    // エントリー詳細ページがあるか確認（/admin/events/[id]/entries/[entryId]）
    await page.goto(`/admin/events/${eventId}/entries/${entryId}`);
    await page.waitForLoadState("networkidle");

    // 参加者情報が表示されることを確認（見出しで特定）
    await expect(page.getByRole("heading", { name: /参加者テスト1/ })).toBeVisible({ timeout: 5_000 });
  });
});
