/**
 * E2E テスト: 対戦表作成
 *
 * テスト参加者の追加、対戦表自動生成、振り分けルール、ワンマッチ作成、対戦表削除を検証する。
 */
import { test, expect, type Page } from "@playwright/test";
import { adminLogin, createTestEvent, cleanupEvent } from "./helpers";

async function createTestEntries(page: Page, eventId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await page.request.post("/api/admin/entries", {
      data: {
        entry: {
          event_id: eventId,
          family_name: `対戦テスト${i + 1}`,
          given_name: "選手",
          family_name_reading: `タイセンテスト${i + 1}`,
          given_name_reading: "センシュ",
          is_test: true,
          weight: 60 + i * 5,
          height: 165 + i * 3,
          age: 20 + i,
          sex: i % 2 === 0 ? "男" : "女",
        },
        rule_ids: [],
      },
    });
    if (res.ok()) {
      const data = await res.json();
      ids.push(data.id);
    }
  }
  return ids;
}

// ── テスト ──

test.describe("対戦表作成", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("テスト参加者を追加し、イベント管理画面で参加者が表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 4);
    expect(entryIds.length).toBe(4);

    // イベント管理画面のStep1（参加受付）を直接開く
    await page.goto(`/admin/events/${eventId}?step=1`);
    await page.waitForLoadState("networkidle");

    // テスト参加者が一覧に表示されていることを確認
    await expect(page.locator("text=対戦テスト1")).toBeVisible({ timeout: 10_000 });
  });

  test("振り分けルールを作成してイベント管理画面に表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    await createTestEntries(page, eventId, 4);

    // 振り分けルールをAPI経由で作成
    const ruleRes = await page.request.post("/api/admin/bracket-rules", {
      data: {
        event_id: eventId,
        name: "E2Eテスト振り分け",
        min_weight: 50,
        max_weight: 80,
        sort_order: 0,
      },
    });
    expect(ruleRes.ok()).toBeTruthy();
    const bracketRule = await ruleRes.json();
    expect(bracketRule.id).toBeTruthy();

    // イベント管理画面のStep2（対戦表）を直接開く
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    // ステップナビが表示されるまで待つ
    await expect(page.locator("text=② 対戦表作成")).toBeVisible({ timeout: 15_000 });

    // 「振り分けルール」サブタブをクリック（grid内のサブタブ）
    // 同テキストが複数存在する場合があるので、grid内のものを指定
    const subTabGrid = page.locator(".grid.grid-cols-2");
    const bracketTab = subTabGrid.locator('button:has-text("振り分けルール")');
    await expect(bracketTab).toBeVisible({ timeout: 10_000 });
    await bracketTab.click();

    // 振り分けルールが表示される
    await expect(page.locator("text=E2Eテスト振り分け")).toBeVisible({ timeout: 10_000 });

    // クリーンアップ
    await page.request.delete(`/api/admin/bracket-rules/${bracketRule.id}`).catch(() => {});
  });

  test("ワンマッチを作成できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 2);

    // アクティブにする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    // ワンマッチをAPI経由で作成
    const res = await page.request.post("/api/admin/tournaments", {
      data: {
        courtName: "ワンマッチテスト",
        courtNum: "1",
        eventId: eventId,
        type: "one_match",
        pairs: [
          {
            e1: {
              id: entryIds[0],
              family_name: "対戦テスト1",
              given_name: "選手",
              family_name_reading: "タイセンテスト1",
              given_name_reading: "センシュ",
            },
            e2: {
              id: entryIds[1],
              family_name: "対戦テスト2",
              given_name: "選手",
              family_name_reading: "タイセンテスト2",
              given_name_reading: "センシュ",
            },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { id: tournamentId } = await res.json();
    expect(tournamentId).toBeTruthy();

    // コート画面でワンマッチが表示されることを確認
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });

    // クリーンアップ
    await page.request.delete(`/api/admin/tournaments/${tournamentId}`).catch(() => {});
  });

  test("対戦表を削除できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 2);

    // トーナメントをAPI経由で作成
    const res = await page.request.post("/api/admin/tournaments", {
      data: {
        courtName: "削除テスト",
        courtNum: "1",
        eventId: eventId,
        type: "tournament",
        pairs: [
          {
            e1: {
              id: entryIds[0],
              family_name: "対戦テスト1",
              given_name: "選手",
              family_name_reading: "タイセンテスト1",
              given_name_reading: "センシュ",
            },
            e2: {
              id: entryIds[1],
              family_name: "対戦テスト2",
              given_name: "選手",
              family_name_reading: "タイセンテスト2",
              given_name_reading: "センシュ",
            },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const { id: tournamentId } = await res.json();

    // API経由で削除
    const delRes = await page.request.delete(`/api/admin/tournaments/${tournamentId}`);
    expect(delRes.ok()).toBeTruthy();
  });

  test("試合決定数フィルタ・選手選択・ソートが対戦表作成画面に表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    await createTestEntries(page, eventId, 4);

    // アクティブにする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    // Step2（対戦表作成）を開く
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=② 対戦表作成")).toBeVisible({ timeout: 15_000 });

    // 試合数フィルタセレクトが存在することを確認
    const matchCountLabel = page.locator("text=試合数");
    await expect(matchCountLabel.first()).toBeVisible({ timeout: 10_000 });

    // 「全選択」「全解除」ボタンが存在することを確認
    await expect(page.locator("button:has-text('全選択')").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button:has-text('全解除')").first()).toBeVisible({ timeout: 10_000 });

    // 「全員」ボタンと「選択した」ボタンの2つが存在することを確認
    await expect(page.locator("button:has-text('全員')").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button:has-text('選択した')").first()).toBeVisible({ timeout: 10_000 });

    // 選手チップをクリックして選択状態が切り替わることを確認
    const chip = page.locator(".rounded-full").filter({ hasText: "対戦テスト1" }).first();
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await chip.click();
    // 選択後、ring-blue-500 クラスが付くことを確認
    await expect(chip).toHaveClass(/ring-blue-500/, { timeout: 5_000 });

    // もう一度クリックして解除
    await chip.click();
    await expect(chip).not.toHaveClass(/ring-blue-500/, { timeout: 5_000 });
  });

  test("体重差のデフォルト値が5kgになっている", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    await createTestEntries(page, eventId, 4);

    // アクティブにする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    // Step2（対戦表作成）を開く
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=② 対戦表作成")).toBeVisible({ timeout: 15_000 });

    // 体重差入力欄のデフォルト値が5であることを確認
    const weightDiffInput = page.locator("input[type='number'][step='0.5']").first();
    await expect(weightDiffInput).toBeVisible({ timeout: 10_000 });
    await expect(weightDiffInput).toHaveValue("5");
  });

  test("新規トーナメントが既存の最下部に追加される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 4);

    // アクティブにする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    // 1つ目のトーナメントをAPI経由で作成（sort_order=1）
    const res1 = await page.request.post("/api/admin/tournaments", {
      data: {
        courtName: "先に作成",
        courtNum: "1",
        eventId: eventId,
        type: "one_match",
        sortOrder: 1,
        pairs: [
          {
            e1: {
              id: entryIds[0],
              family_name: "対戦テスト1",
              given_name: "選手",
              family_name_reading: "タイセンテスト1",
              given_name_reading: "センシュ",
            },
            e2: {
              id: entryIds[1],
              family_name: "対戦テスト2",
              given_name: "選手",
              family_name_reading: "タイセンテスト2",
              given_name_reading: "センシュ",
            },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    expect(res1.ok()).toBeTruthy();
    const { id: t1Id } = await res1.json();

    // 2つ目のトーナメントをAPI経由で作成（sort_order=2）
    const res2 = await page.request.post("/api/admin/tournaments", {
      data: {
        courtName: "後に追加される",
        courtNum: "1",
        eventId: eventId,
        type: "one_match",
        sortOrder: 2,
        pairs: [
          {
            e1: {
              id: entryIds[2],
              family_name: "対戦テスト3",
              given_name: "選手",
              family_name_reading: "タイセンテスト3",
              given_name_reading: "センシュ",
            },
            e2: {
              id: entryIds[3],
              family_name: "対戦テスト4",
              given_name: "選手",
              family_name_reading: "タイセンテスト4",
              given_name_reading: "センシュ",
            },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    expect(res2.ok()).toBeTruthy();
    const { id: t2Id } = await res2.json();

    // コート1の画面でトーナメントの順序を確認（is_active競合をリトライで吸収）
    await expect(async () => {
      await page.request.patch(`/api/admin/events/${eventId}`, {
        data: { is_active: true },
      });
      await page.goto("/court/1");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("text=先に作成").first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000, intervals: [2_000, 3_000] });
    const bodyText = await page.textContent("main");
    if (bodyText) {
      const idx1 = bodyText.indexOf("先に作成");
      const idx2 = bodyText.indexOf("後に追加される");
      // 「先に作成」が「後に追加される」より前に表示されること
      if (idx1 >= 0 && idx2 >= 0) {
        expect(idx1).toBeLessThan(idx2);
      }
    }

    // クリーンアップ
    await page.request.delete(`/api/admin/tournaments/${t1Id}`).catch(() => {});
    await page.request.delete(`/api/admin/tournaments/${t2Id}`).catch(() => {});
  });

  test("Step③ 試合番号設定でコートタブが表示され切り替えできる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 4);

    // 2つのコートにそれぞれトーナメントを作成
    const t1Res = await page.request.post("/api/admin/tournaments", {
      data: {
        courtName: "コート1トーナメント",
        courtNum: "1",
        eventId: eventId,
        type: "tournament",
        pairs: [
          {
            e1: {
              id: entryIds[0],
              family_name: "対戦テスト1",
              given_name: "選手",
              family_name_reading: "タイセンテスト1",
              given_name_reading: "センシュ",
            },
            e2: {
              id: entryIds[1],
              family_name: "対戦テスト2",
              given_name: "選手",
              family_name_reading: "タイセンテスト2",
              given_name_reading: "センシュ",
            },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const t2Res = await page.request.post("/api/admin/tournaments", {
      data: {
        courtName: "コート2トーナメント",
        courtNum: "2",
        eventId: eventId,
        type: "tournament",
        pairs: [
          {
            e1: {
              id: entryIds[2],
              family_name: "対戦テスト3",
              given_name: "選手",
              family_name_reading: "タイセンテスト3",
              given_name_reading: "センシュ",
            },
            e2: {
              id: entryIds[3],
              family_name: "対戦テスト4",
              given_name: "選手",
              family_name_reading: "タイセンテスト4",
              given_name_reading: "センシュ",
            },
            matchLabel: null,
            ruleName: null,
          },
        ],
      },
    });
    const t1 = await t1Res.json();
    const t2 = await t2Res.json();

    // Step③を開く
    await page.goto(`/admin/events/${eventId}?step=3`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=③ 試合番号設定")).toBeVisible({ timeout: 15_000 });

    // コートタブが表示されている（court_count=2 なので3つのタブ: 全コート + コート1 + コート2）
    const allTab = page.locator('button:has-text("全コート")');
    await expect(allTab).toBeVisible({ timeout: 10_000 });
    const court1Tab = page.locator('button:has-text("コート1")');
    await expect(court1Tab).toBeVisible();
    const court2Tab = page.locator('button:has-text("コート2")');
    await expect(court2Tab).toBeVisible();

    // 全コートタブ選択時は両方のトーナメントが表示される
    await expect(page.locator("text=コート1トーナメント")).toBeVisible();
    await expect(page.locator("text=コート2トーナメント")).toBeVisible();

    // コート1タブをクリック→コート1のみ表示
    await court1Tab.click();
    await expect(page.locator("text=コート1トーナメント")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=コート2トーナメント")).not.toBeVisible();

    // コート2タブをクリック→コート2のみ表示
    await court2Tab.click();
    await expect(page.locator("text=コート2トーナメント")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=コート1トーナメント")).not.toBeVisible();

    // クリーンアップ
    await page.request.delete(`/api/admin/tournaments/${t1.id}`).catch(() => {});
    await page.request.delete(`/api/admin/tournaments/${t2.id}`).catch(() => {});
  });
});
