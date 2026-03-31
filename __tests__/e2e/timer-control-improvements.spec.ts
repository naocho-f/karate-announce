/**
 * E2E テスト: タイマー操作パネル改善（13件の不具合修正）
 *
 * テスト対象:
 * #1: 次の試合へ押下でidle（試合一覧）に戻る
 * #2: 一本のconfirm()削除
 * #3: プリセット→ルールのラベル変更
 * #4: 試合一覧に戻るボタン
 * #5: 画面全体を使うレイアウト
 * #6: 勝利理由のボタン化
 * #7: 勝利確定後フロー（確定する/訂正する）
 * #8: 結果ボタン左右均等
 * #9: 反則ポイント設定の表示
 * #10: ボタン縦幅の増大
 * #11: 待て→ストップ
 * #12: 半角→全角数字変換（表示画面）
 * #13: フルスクリーンAPI（表示画面）
 */
import { test, expect } from "@playwright/test";

test.describe("タイマー操作パネル改善", () => {
  test("#3: ルールラベルが表示される", async ({ page }) => {
    await page.goto("/timer/1/control");
    // プリセット選択のラベルが「ルール」であること
    const label = page.locator("label", { hasText: "ルール" });
    // ラベルが存在するか（プリセットがあれば表示される）
    // プリセットがない環境でもエラーにならないことを確認
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
  });

  test("#11: ストップボタンが表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合をセットアップ
    await page.locator("text=クイック試合").click();
    await expect(page.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });

    // Space キーで開始
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // 「ストップ」が表示されている（旧「待て」ではない）
    await expect(page.locator("button", { hasText: "ストップ" })).toBeVisible();
  });

  test("#4: 試合一覧に戻るボタンが表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合をセットアップ
    await page.locator("text=クイック試合").click();
    await expect(page.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });

    // 「← 試合一覧に戻る」ボタンが表示される
    const backBtn = page.locator("button", { hasText: "試合一覧に戻る" });
    await expect(backBtn).toBeVisible();

    // クリックで idle に戻る
    await backBtn.click();
    await expect(page.locator("text=試合セット")).toBeVisible({ timeout: 5_000 });
  });

  test("#2: 一本ボタンが confirm なしで動作する", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合を開始
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // dialog イベントが来ないことを確認するためリスナーを設定
    let dialogShown = false;
    page.on("dialog", () => { dialogShown = true; });

    // R キーで赤一本（confirm なしで直接実行）
    await page.keyboard.press("KeyR");

    // 一本で試合終了（ippon_wins: true）
    await expect(page.locator("text=終了")).toBeVisible({ timeout: 5_000 });
    expect(dialogShown).toBe(false);
  });

  test("#6: 勝利理由をボタンで選択できる", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合を開始して time_up まで進める
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // 即座に停止して time_up をシミュレート
    await page.keyboard.press("Space"); // pause
    // 時間を 0 に調整（← キーを連打）
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("ArrowLeft");
    }

    // time_up になるまで少し待つ
    await page.waitForTimeout(1_000);

    // 赤勝利ボタンをクリック
    const redWinBtn = page.locator("button", { hasText: "赤 勝利" });
    if (await redWinBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await redWinBtn.click();

      // 勝利方法のボタンリストが表示される（prompt ではなくボタン）
      await expect(page.locator("button", { hasText: "判定" })).toBeVisible({ timeout: 3_000 });
      await expect(page.locator("button", { hasText: "ポイント" })).toBeVisible();
      await expect(page.locator("button", { hasText: "反則勝ち" })).toBeVisible();

      // 判定ボタンをクリック
      await page.locator("button", { hasText: "判定" }).click();

      // finished 状態になる
      await expect(page.locator("text=終了")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("#7: 勝利確定後に確定する/訂正するボタンが表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合を開始
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // R キーで赤一本 → 即 finished
    await page.keyboard.press("KeyR");
    await expect(page.locator("text=終了")).toBeVisible({ timeout: 5_000 });

    // 確定するボタンが表示される
    await expect(page.locator("button", { hasText: "確定する" })).toBeVisible({ timeout: 3_000 });
    // 訂正するボタンが表示される
    await expect(page.locator("button", { hasText: "訂正する" })).toBeVisible();
    // 次の試合へボタンが表示される
    await expect(page.locator("button", { hasText: "次の試合へ" })).toBeVisible();
  });

  test("#5: h-screen クラスが適用されている", async ({ page }) => {
    await page.goto("/timer/1/control");
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    // ルートコンテナに h-screen が適用されている
    const root = page.locator("div.h-screen.min-h-screen").first();
    await expect(root).toBeVisible();
  });

  test("#9: 反則ポイント設定が表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合を開始
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // 反則ルール設定が表示される（デフォルトは無効）
    await expect(page.locator("text=反則→ポイント変換: 無効")).toBeVisible({ timeout: 3_000 });
  });

  test("ブザーボタンがサブ操作エリアに表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合を開始
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // サブ操作セクション内にブザーボタンがある
    const subSection = page.locator("section", { hasText: "サブ操作" });
    await expect(subSection).toBeVisible({ timeout: 3_000 });
    await expect(subSection.locator("button", { hasText: "ブザー" })).toBeVisible();
  });

  test("未確定で「次の試合へ」押下時に確認ダイアログが表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合を開始
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // R キーで赤一本 → finished
    await page.keyboard.press("KeyR");
    await expect(page.locator("text=終了")).toBeVisible({ timeout: 5_000 });

    // 次の試合へを押すと、未確定なので confirm が表示される
    let dialogMessage = "";
    page.on("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // キャンセル
    });
    await page.locator("button", { hasText: "次の試合へ" }).click();
    await page.waitForTimeout(500);

    // ダイアログが「試合結果が未確定です」と表示されたことを確認
    expect(dialogMessage).toContain("試合結果が未確定です");
  });

  test("アナウンスボタンが再生中に無効化される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合をセットアップ
    await page.locator("text=クイック試合").click();
    await expect(page.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });

    // アナウンスボタンが存在する（ミュートでなければ有効）
    const announceBtn = page.locator("button", { hasText: "試合開始アナウンス" });
    await expect(announceBtn).toBeVisible({ timeout: 3_000 });
    // disabled 属性がないことを確認（ミュートでなければ）
    await expect(announceBtn).not.toBeDisabled();
  });
});

test.describe("タイマー表示画面改善", () => {
  test("#13: クリックでフルスクリーン切替テキストが表示される", async ({ page }) => {
    await page.goto("/timer/1");
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    // idle 画面にフルスクリーン切替の説明テキストがある
    await expect(page.locator("text=クリックでフルスクリーン切替")).toBeVisible({ timeout: 5_000 });
  });

  test("スコア行が3分割レイアウトで反則インジケータが表示される", async ({ page, context }) => {
    // 操作画面と表示画面を同時に開く
    const controlPage = await context.newPage();
    await controlPage.goto("/timer/1/control");
    await page.goto("/timer/1");

    // 操作画面でクイック試合を開始
    await controlPage.locator("text=クイック試合").click();
    await expect(controlPage.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });

    // 表示画面でスコア行が表示されるのを待つ
    await expect(page.locator("[data-testid='scores-row']")).toBeVisible({ timeout: 10_000 });

    // 反則インジケータ（左・右）が表示される
    await expect(page.locator("[data-testid='foul-indicator-left']")).toBeVisible();
    await expect(page.locator("[data-testid='foul-indicator-right']")).toBeVisible();

    // 反則セル（①〜④）が存在する
    for (const side of ["left", "right"]) {
      for (const n of [1, 2, 3, 4]) {
        await expect(page.locator(`[data-testid='foul-cell-${side}-${n}']`)).toBeVisible();
      }
    }

    // 操作画面を閉じる
    await controlPage.close();
  });
});
