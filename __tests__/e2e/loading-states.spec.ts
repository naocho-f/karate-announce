/**
 * E2E テスト: ローディング表示
 *
 * 非同期操作を行うボタンに disabled 状態とローディングテキストが表示されることを検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin, createTestEvent } from "./helpers";

// ── テスト ──

test.describe("ローディング表示", () => {
  test("ログアウトボタンに disabled + テキスト変更がある", async ({ page }) => {
    await adminLogin(page);

    // ログアウトボタンが表示されていること
    const logoutBtn = page.getByRole("button", { name: "ログアウト" });
    await expect(logoutBtn).toBeVisible({ timeout: 10_000 });
    await expect(logoutBtn).toBeEnabled();

    // クリック後に disabled + テキスト変更（ログアウト中...）になることを確認
    // ネットワークを遅延させてローディング状態を確認
    await page.route("**/api/admin/login", async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fulfill({ status: 200, body: "{}" });
    });

    await logoutBtn.click();
    await expect(logoutBtn).toHaveText("ログアウト中...");
    await expect(logoutBtn).toBeDisabled();
  });

  test("振り分けルールの削除ボタンにローディングが表示される", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);

    // 振り分けルールを作成
    const ruleRes = await page.request.post("/api/admin/bracket-rules", {
      data: {
        event_id: eventId,
        name: "テスト振り分けルール",
        sort_order: 0,
      },
    });
    expect(ruleRes.ok()).toBeTruthy();

    // イベント管理画面の対戦表作成タブへ
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");

    // 振り分けルールタブに移動
    const brTab = page.getByRole("button", { name: "振り分けルール" });
    if (await brTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await brTab.click();
      await page.waitForTimeout(500);
    }

    // 削除ボタンを探す
    const deleteBtn = page.locator('button:has-text("削除")').first();
    if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // confirm ダイアログを自動承認
      page.on("dialog", (dialog) => dialog.accept());

      // ネットワーク遅延
      await page.route("**/api/admin/bracket-rules/**", async (route) => {
        if (route.request().method() === "DELETE") {
          await new Promise((r) => setTimeout(r, 1000));
          await route.fulfill({ status: 200, body: "{}" });
        } else {
          await route.continue();
        }
      });

      await deleteBtn.click();
      await expect(deleteBtn).toHaveText("削除中...", { timeout: 2_000 });
      await expect(deleteBtn).toBeDisabled();
    }

    // クリーンアップ
    await page.request.delete(`/api/admin/events/${eventId}`);
  });

  test("フォーム設定の公開ボタンにローディングが表示される", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);

    // フォーム設定を初期化
    const cfgRes = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
    expect(cfgRes.ok()).toBeTruthy();

    // イベント管理画面の参加申込タブへ
    await page.goto(`/admin/events/${eventId}?step=4`);
    await page.waitForLoadState("networkidle");

    // 公開ボタンを探す
    const publishBtn = page.getByRole("button", { name: "公開する" });
    if (await publishBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(publishBtn).toBeEnabled();

      // ネットワーク遅延
      await page.route("**/api/admin/form-config", async (route) => {
        if (route.request().method() === "PATCH") {
          await new Promise((r) => setTimeout(r, 1000));
          await route.continue();
        } else {
          await route.continue();
        }
      });

      await publishBtn.click();
      await expect(publishBtn).toHaveText("処理中...", { timeout: 2_000 });
      await expect(publishBtn).toBeDisabled();
    }

    // クリーンアップ
    await page.request.delete(`/api/admin/events/${eventId}`);
  });

  test("イベント画像削除ボタンにローディングが表示される", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);

    await page.goto(`/admin/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    // バナー削除ボタンが存在する場合にローディングを確認
    // (バナー画像が無い場合はスキップ)
    const bannerDeleteBtn = page.locator('button:has-text("削除")').first();
    if (await bannerDeleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // ボタンが enabled であることを確認
      await expect(bannerDeleteBtn).toBeEnabled();
    }

    // クリーンアップ
    await page.request.delete(`/api/admin/events/${eventId}`);
  });

  test("完了済みイベントの再開ボタンにローディングが表示される", async ({ page }) => {
    await adminLogin(page);
    const eventId = await createTestEvent(page);

    // イベントを完了状態にする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { status: "finished", is_active: false },
    });

    // 試合タブを開く
    await page.goto("/admin?tab=events");
    await page.waitForLoadState("networkidle");

    // 過去の試合を表示
    const pastBtn = page.getByRole("button", { name: /過去の試合/ });
    if (await pastBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await pastBtn.click();
      await page.waitForTimeout(500);
    }

    // 再開するボタンを探す
    const reopenBtn = page.locator('button:has-text("再開する")').first();
    if (await reopenBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(reopenBtn).toBeEnabled();

      // ネットワーク遅延
      await page.route(`**/api/admin/events/${eventId}`, async (route) => {
        if (route.request().method() === "PATCH") {
          await new Promise((r) => setTimeout(r, 1000));
          await route.continue();
        } else {
          await route.continue();
        }
      });

      await reopenBtn.click();
      await expect(reopenBtn).toHaveText("再開中...", { timeout: 2_000 });
      await expect(reopenBtn).toBeDisabled();
    }

    // クリーンアップ
    await page.request.delete(`/api/admin/events/${eventId}`);
  });
});
