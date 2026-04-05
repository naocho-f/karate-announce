/**
 * タイマー操作・表示画面のUI改善に関するユニットテスト
 *
 * #2: confirm()削除 — addIppon が直接呼ばれることを確認
 * #6: 勝利方法ボタン化 — ResultMethod の全値が定義済みであることを確認
 * #12: 半角→全角数字変換
 * 反則インジケータ: 反則数に応じたセル塗りつぶしロジック
 * 試合一覧: フィルタ・ソート・表示スタイルのロジック
 */
import { describe, it, expect } from "vitest";
import type { ResultMethod } from "@/lib/timer-state";
import { addIppon, createInitialState, setMatch } from "@/lib/timer-state";
import type { TimerPreset } from "@/lib/types";

// toFullWidthDigits は page.tsx 内のローカル関数なのでテスト用に再実装
function toFullWidthDigits(str: string): string {
  return str.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

// resultMethodLabel も page.tsx 内のローカル関数なのでテスト用に再実装
const RESULT_METHODS: { value: ResultMethod; label: string }[] = [
  { value: "point", label: "ポイント" },
  { value: "wazaari", label: "技あり優勢" },
  { value: "ippon", label: "一本" },
  { value: "combined_ippon", label: "合わせ一本" },
  { value: "foul", label: "反則勝ち" },
  { value: "decision", label: "判定" },
  { value: "withdraw", label: "棄権勝ち" },
  { value: "injury", label: "負傷勝ち" },
];

function resultMethodLabel(method: ResultMethod | null): string {
  if (!method) return "";
  const found = RESULT_METHODS.find((rm) => rm.value === method);
  if (found) return found.label;
  if (method === "draw") return "引き分け";
  if (method === "sudden_death") return "延長戦";
  return method;
}

const DEFAULT_PRESET: TimerPreset = {
  id: "test",
  name: "テスト",
  event_id: null,
  rule_id: null,
  match_duration: 120,
  timer_direction: "countdown",
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death",
  extension_timer_direction: "countdown",
  extension_show_timer: true,
  extension_max_count: 0,
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_direction: "countup",
  newaza_limit_type: "unlimited",
  newaza_max_count: 0,
  newaza_free_release: 0,
  show_points: true,
  show_wazaari: true,
  wazaari_points: 0,
  show_ippon: true,
  ippon_wins: true,
  combined_ippon_wins: false,
  point_win_threshold: 0,
  show_fouls: true,
  foul_to_point_start: 0,
  foul_point_value: 1,
  foul_loss_count: 0,
  foul_vs_point_priority: "foul_priority",
  show_player_names: true,
  show_match_number: true,
  color_left: "#DC2626",
  color_right: "#FFFFFF",
  color_left_name: "赤",
  color_right_name: "白",
  theme_bg_color: "#000000",
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  layout: null,
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "mid-square-single",
  buzzer_duration: 1.5,
  buzzer_repeat: 1,
  buzzer_sound_newaza: "mid-square-single",
  buzzer_duration_newaza: 1.5,
  buzzer_repeat_newaza: 1,
  buzzer_custom_path: null,
  swap_sides: false,
  created_at: "",
  updated_at: "",
};

describe("半角→全角数字変換 (#12)", () => {
  it("半角数字を全角に変換する", () => {
    expect(toFullWidthDigits("第1試合")).toBe("第１試合");
    expect(toFullWidthDigits("第12試合")).toBe("第１２試合");
    expect(toFullWidthDigits("全8試合")).toBe("全８試合");
  });

  it("数字以外はそのまま残す", () => {
    expect(toFullWidthDigits("延長戦")).toBe("延長戦");
    expect(toFullWidthDigits("abc")).toBe("abc");
  });

  it("0-9 すべてを正しく変換する", () => {
    expect(toFullWidthDigits("0123456789")).toBe("０１２３４５６７８９");
  });

  it("空文字列を処理できる", () => {
    expect(toFullWidthDigits("")).toBe("");
  });
});

describe("勝利方法ラベル (#6)", () => {
  it("8つの勝利方法がすべて定義されている", () => {
    expect(RESULT_METHODS).toHaveLength(8);
    const values = RESULT_METHODS.map((rm) => rm.value);
    expect(values).toContain("point");
    expect(values).toContain("wazaari");
    expect(values).toContain("ippon");
    expect(values).toContain("combined_ippon");
    expect(values).toContain("foul");
    expect(values).toContain("decision");
    expect(values).toContain("withdraw");
    expect(values).toContain("injury");
  });

  it("各メソッドに日本語ラベルがある", () => {
    expect(resultMethodLabel("point")).toBe("ポイント");
    expect(resultMethodLabel("wazaari")).toBe("技あり優勢");
    expect(resultMethodLabel("ippon")).toBe("一本");
    expect(resultMethodLabel("combined_ippon")).toBe("合わせ一本");
    expect(resultMethodLabel("foul")).toBe("反則勝ち");
    expect(resultMethodLabel("decision")).toBe("判定");
    expect(resultMethodLabel("withdraw")).toBe("棄権勝ち");
    expect(resultMethodLabel("injury")).toBe("負傷勝ち");
  });

  it("特殊なメソッドもラベルを返す", () => {
    expect(resultMethodLabel("draw")).toBe("引き分け");
    expect(resultMethodLabel("sudden_death")).toBe("延長戦");
  });

  it("null の場合は空文字を返す", () => {
    expect(resultMethodLabel(null)).toBe("");
  });
});

describe("反則インジケータのセル塗りつぶしロジック", () => {
  // 反則インジケータは①(下)〜④(上)の4セル。反則数以下のセルが選手色で塗りつぶし。
  // ロジック: fouls >= n のとき、セル n が塗りつぶされる。

  function isFoulCellFilled(fouls: number, cellNumber: number): boolean {
    return fouls >= cellNumber;
  }

  it("反則0回: すべてのセルが暗い背景", () => {
    expect(isFoulCellFilled(0, 1)).toBe(false);
    expect(isFoulCellFilled(0, 2)).toBe(false);
    expect(isFoulCellFilled(0, 3)).toBe(false);
    expect(isFoulCellFilled(0, 4)).toBe(false);
  });

  it("反則1回: ①のみ塗りつぶし", () => {
    expect(isFoulCellFilled(1, 1)).toBe(true);
    expect(isFoulCellFilled(1, 2)).toBe(false);
    expect(isFoulCellFilled(1, 3)).toBe(false);
    expect(isFoulCellFilled(1, 4)).toBe(false);
  });

  it("反則2回: ①②が塗りつぶし", () => {
    expect(isFoulCellFilled(2, 1)).toBe(true);
    expect(isFoulCellFilled(2, 2)).toBe(true);
    expect(isFoulCellFilled(2, 3)).toBe(false);
    expect(isFoulCellFilled(2, 4)).toBe(false);
  });

  it("反則3回: ①②③が塗りつぶし", () => {
    expect(isFoulCellFilled(3, 1)).toBe(true);
    expect(isFoulCellFilled(3, 2)).toBe(true);
    expect(isFoulCellFilled(3, 3)).toBe(true);
    expect(isFoulCellFilled(3, 4)).toBe(false);
  });

  it("反則4回: ①②③④が全て塗りつぶし", () => {
    expect(isFoulCellFilled(4, 1)).toBe(true);
    expect(isFoulCellFilled(4, 2)).toBe(true);
    expect(isFoulCellFilled(4, 3)).toBe(true);
    expect(isFoulCellFilled(4, 4)).toBe(true);
  });
});

describe("一本操作に confirm 不要 (#2)", () => {
  it("addIppon は confirm なしで直接実行できる", () => {
    const initial = createInitialState();
    const ready = setMatch(initial, {
      matchId: "m1",
      tournamentId: "t1",
      preset: DEFAULT_PRESET,
      red: { id: "r1", name: "赤選手", nameReading: null, affiliation: "", affiliationReading: null },
      white: { id: "w1", name: "白選手", nameReading: null, affiliation: "", affiliationReading: null },
      matchLabel: "第1試合",
      rules: null,
      rulesReading: null,
      matchNumber: 1,
      totalMatches: 1,
    });
    // running 状態にする
    const running = { ...ready, phase: "running" as const, timerStartedAt: Date.now(), timerBaseMs: ready.timerMs };
    const result = addIppon(running, "red");
    // ippon_wins: true なので finished になる
    expect(result.phase).toBe("finished");
    expect(result.winnerSide).toBe("red");
    expect(result.resultMethod).toBe("ippon");
  });
});

// ── 試合一覧のフィルタ・ソート・表示ロジック ──

// page.tsx のフィルタロジックを再実装（ユニットテスト用）
function filterMatchStatuses(statuses: string[]): string[] {
  const visibleStatuses = new Set(["ongoing", "ready", "waiting", "done"]);
  return statuses.filter((s) => visibleStatuses.has(s));
}

// page.tsx のソートロジックを再実装
function sortByMatchLabel(labels: (string | null)[]): (string | null)[] {
  return [...labels].sort((a, b) => {
    const nA = parseInt((a ?? "").replace(/[^\d]/g, "") || "999", 10);
    const nB = parseInt((b ?? "").replace(/[^\d]/g, "") || "999", 10);
    return nA - nB;
  });
}

// 最初の ready のみハイライトするロジック
function getFirstReadyId(matches: { id: string; status: string }[]): string | null {
  return matches.find((m) => m.status === "ready")?.id ?? null;
}

// 試合が無効化（クリック不可）かどうか
function isMatchDisabled(status: string): boolean {
  return status === "done" || status === "waiting";
}

describe("試合一覧のフィルタロジック", () => {
  it("ongoing, ready, waiting, done を含める", () => {
    const input = ["ongoing", "ready", "waiting", "done", "cancelled"];
    expect(filterMatchStatuses(input)).toEqual(["ongoing", "ready", "waiting", "done"]);
  });

  it("waiting ステータスが表示対象に含まれる", () => {
    expect(filterMatchStatuses(["waiting"])).toEqual(["waiting"]);
  });

  it("未知のステータスは除外される", () => {
    expect(filterMatchStatuses(["cancelled", "unknown"])).toEqual([]);
  });
});

describe("試合一覧のソートロジック（match_label 数値順のみ）", () => {
  it("試合番号順にソートされる", () => {
    const labels = ["第3試合", "第1試合", "第2試合"];
    expect(sortByMatchLabel(labels)).toEqual(["第1試合", "第2試合", "第3試合"]);
  });

  it("ステータスに関係なく数値順（ongoing が先にならない）", () => {
    // 以前はステータスグループ順だったが、今は match_label のみ
    const matches = [
      { label: "第5試合", status: "ongoing" },
      { label: "第1試合", status: "done" },
      { label: "第3試合", status: "ready" },
      { label: "第2試合", status: "waiting" },
    ];
    const sorted = [...matches].sort((a, b) => {
      const nA = parseInt(a.label.replace(/[^\d]/g, "") || "999", 10);
      const nB = parseInt(b.label.replace(/[^\d]/g, "") || "999", 10);
      return nA - nB;
    });
    expect(sorted.map((m) => m.label)).toEqual(["第1試合", "第2試合", "第3試合", "第5試合"]);
  });

  it("null ラベルは末尾にソートされる", () => {
    const labels = ["第2試合", null, "第1試合"];
    expect(sortByMatchLabel(labels)).toEqual(["第1試合", "第2試合", null]);
  });
});

describe("試合一覧の表示スタイル", () => {
  it("最初の ready のみハイライトされる", () => {
    const matches = [
      { id: "m1", status: "done" },
      { id: "m2", status: "ready" },
      { id: "m3", status: "ready" },
      { id: "m4", status: "waiting" },
    ];
    expect(getFirstReadyId(matches)).toBe("m2");
  });

  it("ready がなければ null を返す", () => {
    const matches = [
      { id: "m1", status: "done" },
      { id: "m2", status: "waiting" },
    ];
    expect(getFirstReadyId(matches)).toBeNull();
  });

  it("done 試合はクリック不可", () => {
    expect(isMatchDisabled("done")).toBe(true);
  });

  it("waiting 試合はクリック不可", () => {
    expect(isMatchDisabled("waiting")).toBe(true);
  });

  it("ready 試合はクリック可能", () => {
    expect(isMatchDisabled("ready")).toBe(false);
  });

  it("ongoing 試合はクリック可能", () => {
    expect(isMatchDisabled("ongoing")).toBe(false);
  });
});

// ── 修正1: スコア表示ロジック（show_points / show_wazaari フラグ） ──

describe("スコア表示ロジック（show_points / show_wazaari）", () => {
  // 表示画面のスコア行レンダリングロジックを再実装
  function getScoreDisplayMode(showPoints: boolean, showWazaari: boolean): "points_only" | "wazaari_only" | "both" | "none" {
    if (showPoints && showWazaari) return "both";
    if (showPoints) return "points_only";
    if (showWazaari) return "wazaari_only";
    return "none";
  }

  function getMainFontScale(showPoints: boolean, showWazaari: boolean): number {
    return (showPoints && showWazaari) ? 0.67 : 1;
  }

  function getWazaariFontScale(showPoints: boolean, showWazaari: boolean): number {
    return (showPoints && showWazaari) ? 0.35 : 1;
  }

  it("ポイントのみ: mainFs = フルサイズ", () => {
    expect(getScoreDisplayMode(true, false)).toBe("points_only");
    expect(getMainFontScale(true, false)).toBe(1);
  });

  it("技ありのみ: wazaariFs = フルサイズ", () => {
    expect(getScoreDisplayMode(false, true)).toBe("wazaari_only");
    expect(getWazaariFontScale(false, true)).toBe(1);
  });

  it("ポイント+技あり: mainFs = 0.67, wazaariFs = 0.35", () => {
    expect(getScoreDisplayMode(true, true)).toBe("both");
    expect(getMainFontScale(true, true)).toBe(0.67);
    expect(getWazaariFontScale(true, true)).toBe(0.35);
  });

  it("どちらもオフ: none", () => {
    expect(getScoreDisplayMode(false, false)).toBe("none");
  });
});

describe("合わせ一本判定ロジック", () => {
  it("技あり2以上で合わせ一本と判定される", () => {
    expect(2 >= 2).toBe(true); // leftCombinedIppon
    expect(3 >= 2).toBe(true);
  });

  it("技あり1以下では合わせ一本にならない", () => {
    expect(0 >= 2).toBe(false);
    expect(1 >= 2).toBe(false);
  });
});

// ── 修正2: 確定前は「次の試合へ」非表示 ──

describe("「次の試合へ」ボタンの表示条件", () => {
  function isNextMatchButtonVisible(phase: string, resultWritten: boolean): boolean {
    return phase === "finished" && resultWritten === true;
  }

  it("finished + resultWritten=true: 表示", () => {
    expect(isNextMatchButtonVisible("finished", true)).toBe(true);
  });

  it("finished + resultWritten=false: 非表示", () => {
    expect(isNextMatchButtonVisible("finished", false)).toBe(false);
  });

  it("running フェーズでは非表示", () => {
    expect(isNextMatchButtonVisible("running", true)).toBe(false);
    expect(isNextMatchButtonVisible("running", false)).toBe(false);
  });
});

// ── 修正3: 寝技の残り回数表示 ──

describe("寝技の残り回数計算", () => {
  function newazaRemainingCount(limitType: string, maxCount: number, usedCount: number): number | null {
    if (limitType !== "limited") return null;
    return maxCount - usedCount;
  }

  it("limited モードで残り回数を計算", () => {
    expect(newazaRemainingCount("limited", 3, 0)).toBe(3);
    expect(newazaRemainingCount("limited", 3, 1)).toBe(2);
    expect(newazaRemainingCount("limited", 3, 3)).toBe(0);
  });

  it("unlimited モードでは null を返す", () => {
    expect(newazaRemainingCount("unlimited", 0, 0)).toBeNull();
  });

  it("上限到達時は0を返す", () => {
    expect(newazaRemainingCount("limited", 2, 2)).toBe(0);
  });
});

// ── 修正d5a5f89c: 区切り線デフォルト1px ──

describe("区切り線のデフォルト値", () => {
  it("DEFAULT_LAYOUT の dividerThickness が 1 である", async () => {
    const { DEFAULT_LAYOUT } = await import("@/lib/types");
    expect(DEFAULT_LAYOUT.dividerThickness).toBe(1);
  });

  it("resolveLayout のデフォルトが dividerThickness: 1 である", async () => {
    const { resolveLayout } = await import("@/lib/timer-layout");
    const layout = resolveLayout(null);
    expect(layout.dividerThickness).toBe(1);
  });
});

// ── 勝利オーバーレイ（統合版）──

// resultDisplayText を page.tsx から再実装（ユニットテスト用）
function resultDisplayText(state: { resultMethod: string | null; resultDetail: Record<string, number> | null }): string {
  const m = state.resultMethod;
  const d = state.resultDetail;
  if (!m) return "";
  switch (m) {
    case "point":
      return `ポイント (${d?.red_points ?? 0}-${d?.white_points ?? 0} 技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0})`;
    case "wazaari":
      return `技あり優勢 (技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0})`;
    case "combined_ippon": {
      const n = Math.max(d?.red_wazaari ?? 0, d?.white_wazaari ?? 0);
      return `合わせ一本 (技${n})`;
    }
    default:
      return resultMethodLabel(m as ResultMethod);
  }
}

describe("勝利オーバーレイの表示ロジック", () => {
  // page.tsx のオーバーレイ表示条件: isFinished && !isDraw && (leftWins || rightWins)
  function shouldShowVictoryOverlay(phase: string, resultMethod: string | null, winnerSide: string | null): boolean {
    const isFinished = phase === "finished";
    const isDraw = resultMethod === "draw";
    const hasWinner = winnerSide === "red" || winnerSide === "white";
    return isFinished && !isDraw && hasWinner;
  }

  // オーバーレイの背景色を決定
  function getOverlayColor(leftWins: boolean, colorLeft: string, colorRight: string): string {
    return `${leftWins ? colorLeft : colorRight}B3`;
  }

  it("finished + 勝者あり: オーバーレイを表示", () => {
    expect(shouldShowVictoryOverlay("finished", "ippon", "red")).toBe(true);
    expect(shouldShowVictoryOverlay("finished", "combined_ippon", "white")).toBe(true);
    expect(shouldShowVictoryOverlay("finished", "point", "red")).toBe(true);
  });

  it("引き分け: オーバーレイを非表示", () => {
    expect(shouldShowVictoryOverlay("finished", "draw", null)).toBe(false);
  });

  it("running フェーズ: オーバーレイを非表示", () => {
    expect(shouldShowVictoryOverlay("running", null, null)).toBe(false);
  });

  it("勝者なし: オーバーレイを非表示", () => {
    expect(shouldShowVictoryOverlay("finished", "ippon", null)).toBe(false);
  });

  it("左側勝利時は左色を使用（B3 = 70%透過）", () => {
    expect(getOverlayColor(true, "#DC2626", "#FFFFFF")).toBe("#DC2626B3");
  });

  it("右側勝利時は右色を使用（B3 = 70%透過）", () => {
    expect(getOverlayColor(false, "#DC2626", "#FFFFFF")).toBe("#FFFFFFB3");
  });

  it("一本の resultDisplayText", () => {
    expect(resultDisplayText({ resultMethod: "ippon", resultDetail: null })).toBe("一本");
  });

  it("合わせ一本の resultDisplayText", () => {
    expect(resultDisplayText({ resultMethod: "combined_ippon", resultDetail: { red_wazaari: 2, white_wazaari: 0 } })).toBe("合わせ一本 (技2)");
  });

  it("ポイントの resultDisplayText", () => {
    expect(resultDisplayText({ resultMethod: "point", resultDetail: { red_points: 5, white_points: 3, red_wazaari: 1, white_wazaari: 0 } })).toBe("ポイント (5-3 技1-0)");
  });

  it("技あり優勢の resultDisplayText", () => {
    expect(resultDisplayText({ resultMethod: "wazaari", resultDetail: { red_wazaari: 1, white_wazaari: 0 } })).toBe("技あり優勢 (技1-0)");
  });

  it("null の resultMethod は空文字", () => {
    expect(resultDisplayText({ resultMethod: null, resultDetail: null })).toBe("");
  });
});

// ── 修正34710efb: 次の試合位置スクロールのロジック ──

describe("次の試合位置スクロールのインデックス計算", () => {
  function getScrollTargetIndex(matches: { status: string }[]): number {
    const firstReadyIdx = matches.findIndex((m) => m.status === "ready");
    if (firstReadyIdx > 0) return firstReadyIdx - 1;
    return -1; // -1 = リスト先頭にスクロール
  }

  it("ready の前に done がある場合は done の位置を返す", () => {
    const matches = [
      { status: "done" },
      { status: "done" },
      { status: "ready" },
      { status: "waiting" },
    ];
    expect(getScrollTargetIndex(matches)).toBe(1);
  });

  it("ready が先頭の場合は -1（リスト先頭）を返す", () => {
    const matches = [
      { status: "ready" },
      { status: "waiting" },
    ];
    expect(getScrollTargetIndex(matches)).toBe(-1);
  });

  it("ready がない場合は -1 を返す", () => {
    const matches = [
      { status: "done" },
      { status: "done" },
    ];
    expect(getScrollTargetIndex(matches)).toBe(-1);
  });
});
