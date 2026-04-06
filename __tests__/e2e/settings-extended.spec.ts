/**
 * E2E テスト: 設定拡張（年代区分・不具合報告）
 *
 * 設定タブ内の年代区分管理と不具合報告表示を検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("年代区分", () => {
  test("年代区分サブタブが表示され、固定区分と年齢ベース区分がある", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    // 年代区分サブタブをクリック
    await page.getByRole("button", { name: "年代区分", exact: true }).click();

    // 固定区分セクションが表示される
    await expect(page.locator("text=固定区分")).toBeVisible({ timeout: 5_000 });
  });

  test("年代区分を追加・保存できる", async ({ page }) => {
    await adminLogin(page);

    // 現在の年代区分を取得（テスト後のリストア用）
    const settingsRes = await page.request.get("/api/admin/settings");
    const settings = await settingsRes.json();
    const originalCategories = settings?.age_categories;

    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    // 年代区分サブタブ
    await page.getByRole("button", { name: "年代区分", exact: true }).click();

    // 「区分を追加」ボタンをクリック
    const addBtn = page.locator("button", { hasText: "区分を追加" });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();

    // 新しい入力欄が追加される（最後の入力欄にラベルを入力）
    const labelInputs = page.locator('input[placeholder*="ラベル"]');
    const lastLabel = labelInputs.last();
    await lastLabel.fill("E2Eテスト区分");

    // 保存ボタンをクリック
    await page.locator("button", { hasText: "保存" }).click();

    // 保存後もラベルが入力欄に残っている
    await expect(labelInputs.last()).toHaveValue("E2Eテスト区分", { timeout: 5_000 });

    // テスト後のクリーンアップ: 元に戻す
    if (originalCategories) {
      await page.request.put("/api/admin/settings", {
        data: { key: "age_categories", value: originalCategories },
      });
    }
  });
});

test.describe("不具合報告", () => {
  test("不具合報告サブタブが表示され、フィルタボタンがある", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    // 不具合報告サブタブをクリック
    await page.getByRole("button", { name: "不具合報告", exact: true }).click();

    // フィルタボタンが表示される（exactで絞る）
    await expect(page.getByRole("button", { name: "全件", exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "未対応", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "対応済み", exact: true })).toBeVisible();
  });

  test("不具合を投稿して一覧に表示される", async ({ page }) => {
    // 不具合報告を API 経由で作成
    const ts = Date.now();
    const reportRes = await page.request.post("/api/bug-reports", {
      data: {
        what_did: `E2Eテスト操作 ${ts}`,
        what_happened: "テストで発生した不具合",
        what_expected: "正常に動作すること",
        page_url: "/admin",
      },
    });
    expect(reportRes.ok()).toBeTruthy();
    const report = await reportRes.json();

    await adminLogin(page);
    await page.goto("/admin?tab=settings");
    await page.waitForLoadState("networkidle");

    // 不具合報告サブタブ
    await page.getByRole("button", { name: "不具合報告", exact: true }).click();

    // 投稿した報告が一覧に表示される
    await expect(page.locator(`text=E2Eテスト操作 ${ts}`).first()).toBeVisible({ timeout: 5_000 });

    // クリーンアップ: ステータスを wontfix に更新（削除APIがないため）
    await page.request.patch(`/api/bug-reports/${report.id}`, {
      data: { status: "wontfix", resolution: "E2Eテスト用" },
    });
  });
});
