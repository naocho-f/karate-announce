/**
 * E2E テスト: リファクタリングで分割されたコンポーネントの表示検証
 *
 * _group-section.tsx, _guide-sections.tsx, _participant-email-config.tsx,
 * _timer-preset-editor.tsx, _tournament-editor.tsx が正しくレンダリングされることを確認する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin, createTestEvent, cleanupEvent } from "./helpers";

let eventId: string | null = null;

test.afterAll(async ({ browser }) => {
  if (eventId) {
    const page = await browser.newPage();
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    await page.close();
  }
});

// ── _tournament-editor.tsx: 対戦表作成フォームが表示される ──

test.describe("TournamentEditor コンポーネント", () => {
  test("対戦表作成ボタンとワンマッチ追加ボタンが表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page, "コンポーネントテスト用");
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("button", { hasText: "トーナメントを追加" })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button", { hasText: "ワンマッチを追加" })).toBeVisible({ timeout: 10_000 });
  });
});

// ── _group-section.tsx: トーナメント作成フォーム内のグループセクション ──

test.describe("GroupSection コンポーネント", () => {
  test("トーナメント作成フォームを開くとグループ名入力が表示され、キャンセルで閉じられる", async ({ page }) => {
    await adminLogin(page);
    // テスト用エントリーを2件作成
    for (let i = 0; i < 2; i++) {
      await page.request.post("/api/admin/entries", {
        data: {
          entry: {
            event_id: eventId, family_name: `グループテスト${i + 1}`, given_name: "選手",
            family_name_reading: `グループテスト${i + 1}`, given_name_reading: "センシュ",
            is_test: true, weight: 60,
          },
          rule_ids: [],
        },
      });
    }
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    await page.locator("button", { hasText: "トーナメントを追加" }).click();
    // GroupSection のトーナメント名入力が表示される
    await expect(page.locator("input[value='トーナメント1']")).toBeVisible({ timeout: 10_000 });
    // キャンセルで閉じる
    await page.locator("button", { hasText: "キャンセル" }).click();
    await expect(page.locator("input[value='トーナメント1']")).not.toBeVisible({ timeout: 5_000 });
  });
});

// ── _guide-sections.tsx: ガイドパネルが表示される ──

test.describe("GuideSections コンポーネント", () => {
  test("管理画面ホームのガイドタブにガイドセクションが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // ガイドタブをクリック
    const guideTab = page.locator("button", { hasText: "ガイド" });
    await expect(guideTab).toBeVisible({ timeout: 10_000 });
    await guideTab.click();
    // ガイド内のセクション（事前準備 or 当日の操作）が表示される
    await expect(
      page.locator("text=事前準備").or(page.locator("text=当日の操作"))
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── _participant-email-config.tsx: メール設定パネル ──

test.describe("ParticipantEmailConfig コンポーネント", () => {
  test("参加者管理のメールタブにメール設定UIが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`/admin/events/${eventId}?step=1`);
    await page.waitForLoadState("networkidle");
    // 「メール」タブをクリック（タブが存在することを assert で確認）
    const emailTab = page.locator("button", { hasText: "メール" });
    await expect(emailTab).toBeVisible({ timeout: 10_000 });
    await emailTab.click();
    // メール設定関連のUIが表示される
    await expect(
      page.locator("text=確認メール").or(page.locator("text=メール設定"))
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── _timer-preset-editor.tsx: タイマープリセット編集フォーム ──

test.describe("TimerPresetEditor コンポーネント", () => {
  test("タイマー管理画面で新規作成フォームが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");
    const createBtn = page.locator("button", { hasText: "新規作成" });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();
    // TimerPresetEditor のフォームが表示される（プリセット名入力フィールド）
    await expect(
      page.locator("input[placeholder*='プリセット名']").or(page.locator("label", { hasText: "プリセット名" }))
    ).toBeVisible({ timeout: 5_000 });
  });
});
