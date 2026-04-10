/**
 * E2E テスト共通ヘルパー
 *
 * 複数テストファイルで共通して使う関数・定数を一元管理する。
 */
import { expect, type Page } from "@playwright/test";

export const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
export const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? "";

/** API 経由でログインし Cookie を設定 */
export async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[placeholder="ID"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/admin", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

/** テスト用イベントを API 経由で作成 */
export async function createTestEvent(page: Page, name?: string): Promise<string> {
  const res = await page.request.post("/api/admin/events", {
    data: {
      name: name ?? `E2E テストイベント ${Date.now()}`,
      event_date: "2027-12-01",
      court_count: 2,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  return id;
}

/** テスト用イベントを削除（is_active を false にしてから削除） */
export async function cleanupEvent(page: Page, eventId: string | null) {
  if (!eventId) return;
  await page.request
    .patch(`/api/admin/events/${eventId}`, {
      data: { is_active: false },
    })
    .catch(() => {});
  await page.request.delete(`/api/admin/events/${eventId}`).catch(() => {});
}
