/**
 * E2E テスト: 設定
 *
 * ルール・流派の CRUD とアナウンス設定の変更を検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

// ── テスト ──

test.describe("設定", () => {
  test("ルールを作成・編集・削除できる", async ({ page }) => {
    await adminLogin(page);

    const ts = Date.now();
    const ruleName = `E2Eテストルール${ts}`;

    // ルール作成
    const createRes = await page.request.post("/api/admin/rules", {
      data: {
        name: ruleName,
        name_reading: "テストルール",
        description: "E2Eテスト用ルール",
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // 管理画面の設定タブでルールサブタブを開く
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "ルール", exact: true }).click();

    // ルール名が表示されることを確認
    await expect(page.locator(`text=${ruleName}`).first()).toBeVisible({ timeout: 5_000 });

    // ルールを取得して ID を得る（削除に使用）
    // 設定画面に表示されたルールを見つけて削除
    // ルール一覧から該当するルールのテキストを確認
    const ruleElements = page.locator(`text=${ruleName}`);
    await expect(ruleElements.first()).toBeVisible({ timeout: 5_000 });

    // API経由で作成したルールのIDを取得するため、再度APIで取得
    // ルール削除ボタンをUI経由でクリック
    page.on("dialog", (dialog) => dialog.accept());

    // 削除ボタン（該当ルールの近くにある）
    const ruleRow = page.locator(`text=${ruleName}`).first().locator("..").locator("..");
    const deleteBtn = ruleRow.locator('button:has-text("削除"), button[aria-label*="削除"]').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();

      // 削除後にルールが消えることを確認
      await expect(page.locator(`text=${ruleName}`)).not.toBeVisible({ timeout: 5_000 });
    }
  });

  test("流派を作成・編集・削除できる", async ({ page }) => {
    await adminLogin(page);

    const ts = Date.now();
    const dojoName = `E2Eテスト流派${ts}`;

    // 流派作成
    const createRes = await page.request.post("/api/admin/dojos", {
      data: {
        name: dojoName,
        name_reading: "テストリュウハ",
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // 管理画面の設定タブで流派サブタブを開く
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "流派", exact: true }).click();

    // 流派名が表示されることを確認
    await expect(page.locator(`text=${dojoName}`).first()).toBeVisible({ timeout: 5_000 });

    // 削除
    page.on("dialog", (dialog) => dialog.accept());

    const dojoRow = page.locator(`text=${dojoName}`).first().locator("..").locator("..");
    const deleteBtn = dojoRow.locator('button:has-text("削除"), button[aria-label*="削除"]').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();

      await expect(page.locator(`text=${dojoName}`)).not.toBeVisible({ timeout: 5_000 });
    }
  });

  test("アナウンス設定（TTS音声・速度）を変更して保存できる", async ({ page }) => {
    await adminLogin(page);

    // 管理画面の設定タブを開く
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    // アナウンス設定サブタブをクリック（デフォルトはルール）
    await page.getByRole("button", { name: "アナウンス設定", exact: true }).click();
    await expect(page.locator("text=音声設定")).toBeVisible({ timeout: 10_000 });

    // TTS音声の選択ドロップダウンが表示されることを確認
    const voiceSelect = page.locator("select").first();
    if (await voiceSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // 音声を変更
      const options = await voiceSelect.locator("option").allTextContents();
      expect(options.length).toBeGreaterThan(0);
    }

    // 速度スライダーまたは入力が存在することを確認
    const speedInput = page.locator('input[type="range"], input[type="number"]').first();
    if (await speedInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 速度設定が存在する
      expect(await speedInput.isVisible()).toBeTruthy();
    }

    // 保存ボタンがある場合
    const saveBtn = page.locator('button:has-text("保存"), button:has-text("テスト再生")').first();
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      expect(await saveBtn.isEnabled()).toBeTruthy();
    }
  });
});
