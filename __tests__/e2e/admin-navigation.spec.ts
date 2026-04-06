/**
 * E2E テスト: 管理画面ナビゲーション
 *
 * 全管理ページがメインの管理画面からアクセス可能であることを検証する。
 * URL 直アクセスでしか到達できないページがないことを保証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("管理画面ナビゲーション", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("メインタブ4つが表示され、クリックで切り替わる", async ({ page }) => {
    // ホームタブがデフォルト表示
    await expect(page.getByRole("tab", { name: /ホーム/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /試合/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /設定/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /操作説明/ })).toBeVisible();

    // 試合タブをクリック
    await page.getByRole("tab", { name: /試合/ }).click();
    await expect(page).toHaveURL(/tab=events/);

    // 設定タブをクリック
    await page.getByRole("tab", { name: /設定/ }).click();
    await expect(page).toHaveURL(/tab=settings/);

    // 操作説明タブをクリック
    await page.getByRole("tab", { name: /操作説明/ }).click();
    await expect(page).toHaveURL(/tab=guide/);

    // ホームに戻る
    await page.getByRole("tab", { name: /ホーム/ }).click();
    await expect(page).toHaveURL(/tab=home/);
  });

  test("設定タブにサブタブ6つが表示される", async ({ page }) => {
    await page.getByRole("tab", { name: /設定/ }).click();
    await expect(page).toHaveURL(/tab=settings/);

    await expect(page.getByRole("button", { name: "ルール", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "タイマー", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "アナウンス設定", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "年代区分", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "流派", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "不具合報告", exact: true })).toBeVisible();
  });

  test("設定タブのタイマーサブタブクリックでタイマー管理がインライン表示される", async ({ page }) => {
    await page.getByRole("tab", { name: /設定/ }).click();
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
    await page.getByRole("tab", { name: /設定/ }).click();

    // デフォルトはルール
    await expect(page.locator('input[placeholder*="ルール"]')).toBeVisible({ timeout: 5000 });

    // アナウンス設定サブタブ
    await page.getByRole("button", { name: "アナウンス設定", exact: true }).click();
    await expect(page.locator("text=音声設定")).toBeVisible({ timeout: 5000 });

    // 流派サブタブ
    await page.getByRole("button", { name: "流派", exact: true }).click();
    await expect(page.locator('input[placeholder*="流派"]')).toBeVisible({ timeout: 5000 });
  });

  test("操作説明タブにセットアップガイドが表示される", async ({ page }) => {
    await page.getByRole("tab", { name: /操作説明/ }).click();
    await expect(page).toHaveURL(/tab=guide/);

    // 第1部のタイトルが表示される
    await expect(page.locator("text=事前設定")).toBeVisible();
    // ルール設定ステップが表示される
    await expect(page.getByRole("button", { name: /ルール設定/ })).toBeVisible();
  });
});
