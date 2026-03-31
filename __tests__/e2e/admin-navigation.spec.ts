/**
 * E2E テスト: 管理画面ナビゲーション
 *
 * 全管理ページがメインの管理画面からアクセス可能であることを検証する。
 * URL 直アクセスでしか到達できないページがないことを保証する。
 */
import { test, expect, type Page } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD!;

/** API 経由でログインし Cookie を設定 */
async function adminLogin(page: Page) {
  // まずログインページにアクセスしてフォームからログイン
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");

  const usernameInput = page.locator('input[placeholder="ID"]');
  const passwordInput = page.locator('input[type="password"]');

  await usernameInput.fill(ADMIN_USER);
  await passwordInput.fill(ADMIN_PASS);
  await page.locator('button[type="submit"]').click();

  // /admin にリダイレクトされるのを待つ
  await page.waitForURL("**/admin", { timeout: 15_000 });
  // ページの描画完了を待つ
  await page.waitForLoadState("networkidle");
}

test.describe("管理画面ナビゲーション", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("メインタブ4つが表示され、クリックで切り替わる", async ({ page }) => {
    // ホームタブがデフォルト表示
    await expect(page.getByRole("button", { name: "ホーム", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "試合", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "設定", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "操作説明", exact: true })).toBeVisible();

    // 試合タブをクリック
    await page.getByRole("button", { name: "試合", exact: true }).click();
    await expect(page).toHaveURL(/tab=events/);

    // 設定タブをクリック
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await expect(page).toHaveURL(/tab=settings/);

    // 操作説明タブをクリック
    await page.getByRole("button", { name: "操作説明", exact: true }).click();
    await expect(page).toHaveURL(/tab=guide/);

    // ホームに戻る
    await page.getByRole("button", { name: "ホーム", exact: true }).click();
    await expect(page).toHaveURL(/tab=home/);
  });

  test("設定タブにサブタブ4つ（アナウンス設定・ルール・流派・タイマー）が表示される", async ({ page }) => {
    await page.getByRole("button", { name: "設定" }).click();
    await expect(page).toHaveURL(/tab=settings/);

    await expect(page.getByRole("button", { name: "アナウンス設定", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ルール", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "流派", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^タイマー/ })).toBeVisible();
  });

  test("設定タブのタイマーサブタブクリックでタイマー管理がインライン表示される", async ({ page }) => {
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await expect(page).toHaveURL(/tab=settings/);

    await page.getByRole("button", { name: /^タイマー/ }).click();
    await expect(page).toHaveURL(/tab=settings/);

    // タイマー管理がインライン表示される
    await expect(page.locator("h1", { hasText: "タイマー管理" })).toBeVisible();
  });

  test("タイマーページから設定タブに戻れる", async ({ page }) => {
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1", { hasText: "タイマー管理" })).toBeVisible();

    // パンくずナビの「設定」リンクをクリック
    await page.getByRole("link", { name: "設定" }).click();
    await expect(page).toHaveURL(/\/admin\?tab=settings/);
  });

  test("仕様書ページへのリンクがヘッダーにある", async ({ page }) => {
    const specLink = page.locator('a[href="/admin/spec"]');
    await expect(specLink).toBeVisible();
    await expect(specLink).toContainText("仕様書");
  });

  test("設定タブの各サブタブが正しく切り替わる", async ({ page }) => {
    await page.getByRole("button", { name: "設定" }).click();

    // デフォルトはアナウンス設定
    await expect(page.locator("text=音声設定")).toBeVisible();

    // ルールサブタブ
    await page.getByRole("button", { name: "ルール", exact: true }).click();
    // ルールパネルが表示される（入力欄がある）
    await expect(page.locator('input[placeholder*="ルール"]')).toBeVisible({ timeout: 5000 });

    // 流派サブタブ
    await page.getByRole("button", { name: "流派", exact: true }).click();
    await expect(page.locator('input[placeholder*="流派"]')).toBeVisible({ timeout: 5000 });
  });

  test("操作説明タブにセットアップガイドが表示される", async ({ page }) => {
    await page.getByRole("button", { name: "操作説明", exact: true }).click();
    await expect(page).toHaveURL(/tab=guide/);

    // ステップ1のタイトルが表示される
    await expect(page.locator("text=ルールを登録する")).toBeVisible();
  });
});
