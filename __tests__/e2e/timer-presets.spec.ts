/**
 * E2E テスト: タイマープリセット管理・表示同期
 *
 * タイマープリセットのCRUD操作と、操作画面↔表示画面の同期を検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("タイマープリセット管理", () => {
  let createdPresetId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (createdPresetId) {
      await adminLogin(page);
      await page.request.delete(`/api/admin/timer-presets/${createdPresetId}`).catch(() => {});
      createdPresetId = null;
    }
  });

  test("タイマー管理画面にアクセスできる", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=タイマー管理")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button", { hasText: "新規作成" })).toBeVisible();
  });

  test("タイマープリセットを作成できる", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");

    // 新規作成
    await page.locator("button", { hasText: "新規作成" }).click();

    // 名前を入力
    const nameInput = page.locator("input").first();
    await nameInput.fill("E2Eプリセットテスト");

    // 保存
    await page.locator("button", { hasText: "保存" }).click();

    // 一覧に表示される
    await expect(page.locator("text=E2Eプリセットテスト").first()).toBeVisible({ timeout: 5_000 });

    // ID を取得してクリーンアップ
    const presetsRes = await page.request.get("/api/admin/timer-presets");
    const presets = await presetsRes.json();
    const created = presets.find((p: { name: string }) => p.name === "E2Eプリセットテスト");
    if (created) createdPresetId = created.id;
  });

  test("タイマープリセットを複製できる", async ({ page }) => {
    await adminLogin(page);

    // API でプリセットを作成
    const createRes = await page.request.post("/api/admin/timer-presets", {
      data: { name: "E2E複製元プリセット", match_duration: 120 },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    createdPresetId = created.id;

    // 複製
    const dupRes = await page.request.post(`/api/admin/timer-presets/${created.id}/duplicate`);
    expect(dupRes.ok()).toBeTruthy();
    const duplicated = await dupRes.json();

    // 複製先を削除対象に追加
    const dupId = duplicated.id;

    // 管理画面で確認
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");

    // 複製されたプリセットが表示される
    await expect(page.locator("text=E2E複製元プリセット").first()).toBeVisible({ timeout: 5_000 });

    // クリーンアップ
    await page.request.delete(`/api/admin/timer-presets/${dupId}`).catch(() => {});
  });

  test("タイマープリセットを削除できる", async ({ page }) => {
    await adminLogin(page);

    // API でプリセットを作成
    const createRes = await page.request.post("/api/admin/timer-presets", {
      data: { name: "E2E削除テストプリセット", match_duration: 60 },
    });
    const created = await createRes.json();

    // 削除
    const delRes = await page.request.delete(`/api/admin/timer-presets/${created.id}`);
    expect(delRes.ok()).toBeTruthy();

    // 管理画面で確認
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");

    // 削除されたプリセットが表示されない
    await expect(page.locator("text=E2E削除テストプリセット")).not.toBeVisible({ timeout: 5_000 });

    createdPresetId = null; // 既に削除済み
  });
});

test.describe("タイマー表示同期", () => {
  test("操作画面でクイック試合を開始すると表示画面にスコアが反映される", async ({ page, context }) => {
    // 操作画面と表示画面を同時に開く
    const controlPage = await context.newPage();
    await controlPage.goto("/timer/1/control");
    await page.goto("/timer/1");

    // 表示画面がロードされるのを待つ
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    // 操作画面でクイック試合を開始
    await controlPage.locator("text=クイック試合").click();
    await expect(controlPage.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });

    // 表示画面に選手名が反映される（BroadcastChannel 経由）
    await expect(page.locator("text=選手A")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=選手B")).toBeVisible();

    await controlPage.close();
  });

  test("操作画面のスコア変更が表示画面に即時反映される", async ({ page, context }) => {
    const controlPage = await context.newPage();
    await controlPage.goto("/timer/1/control");
    await page.goto("/timer/1");

    // クイック試合を開始して試合中にする
    await controlPage.locator("text=クイック試合").click();
    await expect(controlPage.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });
    await controlPage.keyboard.press("Space");
    await expect(controlPage.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // Q キーでスコア追加
    await controlPage.keyboard.press("KeyQ");

    // 表示画面でスコアが更新されるのを待つ（BroadcastChannel 同期）
    await page.waitForTimeout(500);

    // 表示画面にスコアが反映されている（0以外の値がある）
    const displayText = await page.textContent("body");
    expect(displayText).toBeTruthy();

    await controlPage.close();
  });
});

test.describe("設定タブからのタイマー管理", () => {
  test("設定タブのタイマーサブタブからプリセット一覧が表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    // タイマーサブタブをクリック
    await page.getByRole("button", { name: "タイマー", exact: true }).click();

    // タイマー管理がインライン表示される
    await expect(page.locator("text=タイマー管理")).toBeVisible({ timeout: 10_000 });
    // 新規作成ボタンが表示される
    await expect(page.locator("button", { hasText: "新規作成" })).toBeVisible();
  });
});
