/**
 * bracket.ts 単体テスト
 *
 * createTournamentBracket / createTournamentBracketFromPairs の動作を検証する。
 * Supabase はモックし、DB 呼び出しの引数と返り値を確認する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  mockResult,
  getCalls,
  getCallsFor,
  resetAll,
} from "../helpers/supabase-mock";
import type { Fighter } from "@/lib/types";

// Supabase モック（vi.mock はホイスティングされるため factory 内で直接呼ぶ）
vi.mock("@/lib/supabase", () => ({ supabase: createMockSupabase() }));

// テスト対象
import {
  createTournamentBracket,
  createTournamentBracketFromPairs,
} from "@/lib/bracket";

function makeFighter(id: string): Fighter {
  return {
    id,
    name: `選手${id}`,
    name_reading: null,
    family_name: null,
    given_name: null,
    family_name_reading: null,
    given_name_reading: null,
    dojo_id: "dojo-1",
    affiliation: null,
    affiliation_reading: null,
    weight: null,
    height: null,
    age_info: null,
    experience: null,
    extra_fields: {},
    created_at: "",
  };
}

const TOURNAMENT_ID = "t-001";

beforeEach(() => {
  resetAll();
  // tournaments insert → 成功
  mockResult("tournaments", "insert", {
    data: { id: TOURNAMENT_ID, name: "テスト", court: "A", status: "preparing" },
    error: null,
  });
  // matches insert → 成功
  mockResult("matches", "insert", { data: [], error: null });
  // matches update → 成功
  mockResult("matches", "update", { data: [], error: null });
});

// ── createTournamentBracket ──

describe("createTournamentBracket", () => {
  it("0人 → トーナメントは作成されるがラウンド0で試合なし", async () => {
    const id = await createTournamentBracket("大会", "A", []);
    expect(id).toBe(TOURNAMENT_ID);
    // matches insert は空配列で呼ばれる（generateFirstRound が空を返す）
    const insertCalls = getCallsFor("matches", "insert");
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    // 初戦は空配列
    expect(insertCalls[0].args[0]).toHaveLength(0);
  });

  it("1人 → トーナメントは作成されるが試合なし", async () => {
    const id = await createTournamentBracket("大会", "A", [makeFighter("A")]);
    expect(id).toBe(TOURNAMENT_ID);
    const insertCalls = getCallsFor("matches", "insert");
    expect(insertCalls[0].args[0]).toHaveLength(0);
  });

  it("2人 → 1試合・1ラウンド", async () => {
    const fighters = [makeFighter("A"), makeFighter("B")];
    const id = await createTournamentBracket("大会", "A", fighters);
    expect(id).toBe(TOURNAMENT_ID);

    const insertCalls = getCallsFor("matches", "insert");
    // 初戦: 1試合
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound).toHaveLength(1);
    expect(firstRound[0]).toMatchObject({
      tournament_id: TOURNAMENT_ID,
      round: 1,
      position: 0,
      status: "ready",
    });
    // 両選手が配置されている
    const ids = [firstRound[0].fighter1_id, firstRound[0].fighter2_id].filter(Boolean);
    expect(ids).toHaveLength(2);

    // totalRounds(2) = 1 なので、追加ラウンドの insert は呼ばれない
    // （ループ for r=2..1 は実行されない）
    expect(insertCalls).toHaveLength(1);
  });

  it("3人 → 2試合（1つはシード）・2ラウンド", async () => {
    const fighters = [makeFighter("A"), makeFighter("B"), makeFighter("C")];
    const id = await createTournamentBracket("大会", "A", fighters);
    expect(id).toBe(TOURNAMENT_ID);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound).toHaveLength(2);

    // シード試合が1つある
    const byeMatches = firstRound.filter(
      (m) => !m.fighter1_id || !m.fighter2_id,
    );
    expect(byeMatches).toHaveLength(1);

    // 通常試合が1つある
    const normalMatches = firstRound.filter(
      (m) => m.fighter1_id && m.fighter2_id,
    );
    expect(normalMatches).toHaveLength(1);
    expect(normalMatches[0].status).toBe("ready");

    // 2ラウンド目が作成される（1試合: 決勝）
    const secondRound = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(secondRound).toHaveLength(1);
    expect(secondRound[0]).toMatchObject({ round: 2, position: 0 });
  });

  it("4人 → 2試合・2ラウンド（シードなし）", async () => {
    const fighters = Array.from({ length: 4 }, (_, i) => makeFighter(String(i)));
    const id = await createTournamentBracket("大会", "A", fighters);
    expect(id).toBe(TOURNAMENT_ID);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound).toHaveLength(2);

    // 全試合に両選手がいる → シードなし
    const byeMatches = firstRound.filter(
      (m) => !m.fighter1_id || !m.fighter2_id,
    );
    expect(byeMatches).toHaveLength(0);

    // 2ラウンド目（決勝: 1試合）
    const secondRound = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(secondRound).toHaveLength(1);
  });

  it("5人 → 4試合・3ラウンド（シードあり）", async () => {
    const fighters = Array.from({ length: 5 }, (_, i) => makeFighter(String(i)));
    const id = await createTournamentBracket("大会", "A", fighters);
    expect(id).toBe(TOURNAMENT_ID);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    // 5人 → slots=8 → 4試合
    expect(firstRound).toHaveLength(4);

    // 3つの null スロットが存在する（8-5=3）
    const allSlots = firstRound.flatMap((m) => [m.fighter1_id, m.fighter2_id]);
    const nullCount = allSlots.filter((s) => s === null).length;
    expect(nullCount).toBe(3);

    // シード試合が少なくとも1つある
    const byeMatches = firstRound.filter(
      (m) => !m.fighter1_id || !m.fighter2_id,
    );
    expect(byeMatches.length).toBeGreaterThanOrEqual(1);

    // 3ラウンド: round2 = 2試合, round3 = 1試合
    const round2 = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(round2).toHaveLength(2);
    const round3 = insertCalls[2].args[0] as Array<Record<string, unknown>>;
    expect(round3).toHaveLength(1);
  });

  it("8人 → 4試合・3ラウンド（シードなし）", async () => {
    const fighters = Array.from({ length: 8 }, (_, i) => makeFighter(String(i)));
    await createTournamentBracket("大会", "A", fighters);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound).toHaveLength(4);

    // シードなし
    const byeMatches = firstRound.filter(
      (m) => !m.fighter1_id || !m.fighter2_id,
    );
    expect(byeMatches).toHaveLength(0);

    // round2 = 2試合, round3 = 1試合
    expect((insertCalls[1].args[0] as unknown[]).length).toBe(2);
    expect((insertCalls[2].args[0] as unknown[]).length).toBe(1);
  });

  it("16人 → 8試合・4ラウンド（シードなし）", async () => {
    const fighters = Array.from({ length: 16 }, (_, i) => makeFighter(String(i)));
    await createTournamentBracket("大会", "A", fighters);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound).toHaveLength(8);

    const byeMatches = firstRound.filter(
      (m) => !m.fighter1_id || !m.fighter2_id,
    );
    expect(byeMatches).toHaveLength(0);

    // round2=4, round3=2, round4=1
    expect((insertCalls[1].args[0] as unknown[]).length).toBe(4);
    expect((insertCalls[2].args[0] as unknown[]).length).toBe(2);
    expect((insertCalls[3].args[0] as unknown[]).length).toBe(1);
  });

  it("シード選手は自動的に次ラウンドへ進む（advanceWinner + done）", async () => {
    const fighters = [makeFighter("A"), makeFighter("B"), makeFighter("C")];
    await createTournamentBracket("大会", "A", fighters);

    // シードの試合に対して update が呼ばれる（winner_id 設定 + done）
    const updateCalls = getCallsFor("matches", "update");
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("tournaments insert が失敗 → null を返す", async () => {
    mockResult("tournaments", "insert", { data: null, error: { message: "fail" } });
    const id = await createTournamentBracket("大会", "A", [makeFighter("A"), makeFighter("B")]);
    expect(id).toBeNull();
  });

  it("eventId が渡された場合、tournaments insert に含まれる", async () => {
    const fighters = [makeFighter("A"), makeFighter("B")];
    await createTournamentBracket("大会", "A", fighters, "event-1");

    const tournamentInsert = getCallsFor("tournaments", "insert");
    expect(tournamentInsert).toHaveLength(1);
    const insertArg = tournamentInsert[0].args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      name: "大会",
      court: "A",
      status: "preparing",
      event_id: "event-1",
    });
  });

  it("eventId なしの場合、event_id フィールドが含まれない", async () => {
    const fighters = [makeFighter("A"), makeFighter("B")];
    await createTournamentBracket("大会", "A", fighters);

    const tournamentInsert = getCallsFor("tournaments", "insert");
    const insertArg = tournamentInsert[0].args[0] as Record<string, unknown>;
    expect(insertArg).not.toHaveProperty("event_id");
  });

  it("全選手が初戦に漏れなく配置される", async () => {
    const fighters = Array.from({ length: 6 }, (_, i) => makeFighter(String(i)));
    await createTournamentBracket("大会", "A", fighters);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    const placedIds = firstRound
      .flatMap((m) => [m.fighter1_id, m.fighter2_id])
      .filter(Boolean);
    expect(new Set(placedIds).size).toBe(6);
  });
});

// ── createTournamentBracketFromPairs ──

describe("createTournamentBracketFromPairs", () => {
  it("空の pairs → null を返す", async () => {
    const id = await createTournamentBracketFromPairs("大会", "A", []);
    expect(id).toBeNull();
    // tournaments insert は呼ばれない
    const tournamentInsert = getCallsFor("tournaments", "insert");
    expect(tournamentInsert).toHaveLength(0);
  });

  it("1ペア → 1試合・1ラウンド", async () => {
    const pairs = [{ f1: "A", f2: "B", matchLabel: "第1試合", rules: null }];
    const id = await createTournamentBracketFromPairs("大会", "A", pairs);
    expect(id).toBe(TOURNAMENT_ID);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound).toHaveLength(1);
    expect(firstRound[0]).toMatchObject({
      tournament_id: TOURNAMENT_ID,
      round: 1,
      position: 0,
      fighter1_id: "A",
      fighter2_id: "B",
      status: "ready",
      match_label: "第1試合",
    });

    // roundsFromPairCount(1) = 1 → 追加ラウンドなし
    expect(insertCalls).toHaveLength(1);
  });

  it("2ペア → 2試合・2ラウンド", async () => {
    const pairs = [
      { f1: "A", f2: "B", matchLabel: null, rules: null },
      { f1: "C", f2: "D", matchLabel: null, rules: null },
    ];
    const id = await createTournamentBracketFromPairs("大会", "A", pairs);
    expect(id).toBe(TOURNAMENT_ID);

    const insertCalls = getCallsFor("matches", "insert");
    expect((insertCalls[0].args[0] as unknown[]).length).toBe(2);

    // 2ラウンド目: 1試合
    const round2 = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(round2).toHaveLength(1);
    expect(round2[0]).toMatchObject({ round: 2, position: 0 });
  });

  it("3ペア → 3試合・2ラウンド（round2 = 2試合）", async () => {
    const pairs = [
      { f1: "A", f2: "B", matchLabel: null, rules: null },
      { f1: "C", f2: "D", matchLabel: null, rules: null },
      { f1: "E", f2: "F", matchLabel: null, rules: null },
    ];
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    // round1 = 3試合
    expect((insertCalls[0].args[0] as unknown[]).length).toBe(3);
    // roundsFromPairCount(3): count=3→2→1, rounds=3 → round2=2試合, round3=1試合
    // 実際: r=2 → matchCount = ceil(3/2) = 2, r=3 → matchCount = ceil(2/2) = 1
    // しかし roundsFromPairCount(3) = 3 なので round2 と round3 がある
    // Wait, let me recalculate: n=3, rounds=1, count=3 → ceil(3/2)=2, rounds=2 → ceil(2/2)=1, rounds=3
    // So totalR=3, round2: matchCount starts at 3, loop i=1: ceil(3/2)=2, so 2 matches
    // round3: matchCount starts at 3, loop i=1: ceil(3/2)=2, loop i=2: ceil(2/2)=1, so 1 match
    const round2 = insertCalls[1].args[0] as Array<Record<string, unknown>>;
    expect(round2).toHaveLength(2);
    const round3 = insertCalls[2].args[0] as Array<Record<string, unknown>>;
    expect(round3).toHaveLength(1);
  });

  it("4ペア → 4試合・3ラウンド", async () => {
    const pairs = Array.from({ length: 4 }, (_, i) => ({
      f1: `f${i * 2}`, f2: `f${i * 2 + 1}`, matchLabel: null, rules: null,
    }));
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    expect((insertCalls[0].args[0] as unknown[]).length).toBe(4);
    // roundsFromPairCount(4): 4→2→1, rounds=3
    // round2: ceil(4/2)=2, round3: ceil(2/2)=1
    expect((insertCalls[1].args[0] as unknown[]).length).toBe(2);
    expect((insertCalls[2].args[0] as unknown[]).length).toBe(1);
  });

  it("5ペア → 5試合・4ラウンド", async () => {
    const pairs = Array.from({ length: 5 }, (_, i) => ({
      f1: `f${i * 2}`, f2: `f${i * 2 + 1}`, matchLabel: null, rules: null,
    }));
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    expect((insertCalls[0].args[0] as unknown[]).length).toBe(5);
    // roundsFromPairCount(5): 5→3→2→1, rounds=4
    // round2: ceil(5/2)=3, round3: ceil(3/2)=2, round4: ceil(2/2)=1
    expect((insertCalls[1].args[0] as unknown[]).length).toBe(3);
    expect((insertCalls[2].args[0] as unknown[]).length).toBe(2);
    expect((insertCalls[3].args[0] as unknown[]).length).toBe(1);
  });

  it("8ペア → 8試合・4ラウンド", async () => {
    const pairs = Array.from({ length: 8 }, (_, i) => ({
      f1: `f${i * 2}`, f2: `f${i * 2 + 1}`, matchLabel: null, rules: null,
    }));
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    expect((insertCalls[0].args[0] as unknown[]).length).toBe(8);
    // roundsFromPairCount(8): 8→4→2→1, rounds=4
    expect((insertCalls[1].args[0] as unknown[]).length).toBe(4);
    expect((insertCalls[2].args[0] as unknown[]).length).toBe(2);
    expect((insertCalls[3].args[0] as unknown[]).length).toBe(1);
  });

  it("16ペア → 16試合・5ラウンド", async () => {
    const pairs = Array.from({ length: 16 }, (_, i) => ({
      f1: `f${i * 2}`, f2: `f${i * 2 + 1}`, matchLabel: null, rules: null,
    }));
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    expect((insertCalls[0].args[0] as unknown[]).length).toBe(16);
    // roundsFromPairCount(16): 16→8→4→2→1, rounds=5
    expect((insertCalls[1].args[0] as unknown[]).length).toBe(8);
    expect((insertCalls[2].args[0] as unknown[]).length).toBe(4);
    expect((insertCalls[3].args[0] as unknown[]).length).toBe(2);
    expect((insertCalls[4].args[0] as unknown[]).length).toBe(1);
  });

  it("シードペア（f1のみ）→ 自動進出＋done", async () => {
    const pairs = [
      { f1: "A", f2: "B", matchLabel: null, rules: null },
      { f1: "C", f2: null, matchLabel: null, rules: null }, // シード
    ];
    await createTournamentBracketFromPairs("大会", "A", pairs);

    // update が呼ばれる（advanceWinner + done 設定）
    const updateCalls = getCallsFor("matches", "update");
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("f1 が null のペア → シード進出しない（waiting のまま）", async () => {
    const pairs = [
      { f1: null, f2: "B", matchLabel: null, rules: null },
      { f1: "C", f2: "D", matchLabel: null, rules: null },
    ];
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    // f1=null, f2="B" → status: "waiting"
    expect(firstRound[0].status).toBe("waiting");
    // f1=null のペアは advanceWinner されない（条件は f1 && !f2）
  });

  it("matchLabel と rules がペアごとに設定される", async () => {
    const pairs = [
      { f1: "A", f2: "B", matchLabel: "第1試合", rules: "本戦2分" },
      { f1: "C", f2: "D", matchLabel: "第2試合", rules: "延長1分" },
    ];
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound[0]).toMatchObject({
      match_label: "第1試合",
      rules: "本戦2分",
    });
    expect(firstRound[1]).toMatchObject({
      match_label: "第2試合",
      rules: "延長1分",
    });
  });

  it("defaultRules がトーナメントに設定される", async () => {
    const pairs = [{ f1: "A", f2: "B", matchLabel: null, rules: null }];
    await createTournamentBracketFromPairs("大会", "A", pairs, "event-1", "デフォルトルール");

    const tournamentInsert = getCallsFor("tournaments", "insert");
    const insertArg = tournamentInsert[0].args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      default_rules: "デフォルトルール",
      event_id: "event-1",
    });
  });

  it("defaultRules が undefined → null になる", async () => {
    const pairs = [{ f1: "A", f2: "B", matchLabel: null, rules: null }];
    await createTournamentBracketFromPairs("大会", "A", pairs, "event-1");

    const tournamentInsert = getCallsFor("tournaments", "insert");
    const insertArg = tournamentInsert[0].args[0] as Record<string, unknown>;
    expect(insertArg.default_rules).toBeNull();
  });

  it("tournaments insert が失敗 → null を返す", async () => {
    mockResult("tournaments", "insert", { data: null, error: { message: "fail" } });
    const pairs = [{ f1: "A", f2: "B", matchLabel: null, rules: null }];
    const id = await createTournamentBracketFromPairs("大会", "A", pairs);
    expect(id).toBeNull();
  });

  it("position は0始まりで連番になる", async () => {
    const pairs = [
      { f1: "A", f2: "B", matchLabel: null, rules: null },
      { f1: "C", f2: "D", matchLabel: null, rules: null },
      { f1: "E", f2: "F", matchLabel: null, rules: null },
    ];
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound[0].position).toBe(0);
    expect(firstRound[1].position).toBe(1);
    expect(firstRound[2].position).toBe(2);
  });

  it("全ペアが ready / waiting を正しく設定する", async () => {
    const pairs = [
      { f1: "A", f2: "B", matchLabel: null, rules: null },   // ready
      { f1: "C", f2: null, matchLabel: null, rules: null },   // waiting (f2 null)
      { f1: null, f2: "E", matchLabel: null, rules: null },   // waiting (f1 null)
      { f1: null, f2: null, matchLabel: null, rules: null },  // waiting (both null)
    ];
    await createTournamentBracketFromPairs("大会", "A", pairs);

    const insertCalls = getCallsFor("matches", "insert");
    const firstRound = insertCalls[0].args[0] as Array<Record<string, unknown>>;
    expect(firstRound[0].status).toBe("ready");
    expect(firstRound[1].status).toBe("waiting");
    expect(firstRound[2].status).toBe("waiting");
    expect(firstRound[3].status).toBe("waiting");
  });
});
