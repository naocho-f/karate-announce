/**
 * 音声合成ユーティリティのテスト
 * 純粋関数（renderTemplate, normalizeMatchLabelForTts）と
 * localStorage 依存関数（getTtsSettings, saveTtsSettings）をテスト
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorage モック
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (index: number) => [...store.keys()][index] ?? null,
};
vi.stubGlobal("localStorage", localStorageMock);

const {
  renderTemplate,
  normalizeMatchLabelForTts,
  getTtsSettings,
  saveTtsSettings,
  buildAffiliationForTts,
  splitAffiliationParts,
  buildMatchStartText,
  prefetchTts,
  announceMatchStart,
  announceWinner,
  announceCustom,
  DEFAULT_TEMPLATES,
  TTS_VOICES,
  MATCH_VARS,
  WINNER_VARS,
  SAMPLE_MATCH_VARS,
  SAMPLE_WINNER_VARS,
  SAMPLE_TEXT,
} = await import("@/lib/speech");

describe("renderTemplate", () => {
  it("変数を置換する", () => {
    expect(renderTemplate("{{名前}}選手", { "名前": "太郎" })).toBe("太郎選手");
  });

  it("複数の変数を置換する", () => {
    const result = renderTemplate("{{A}} vs {{B}}", { A: "選手1", B: "選手2" });
    expect(result).toBe("選手1 vs 選手2");
  });

  it("未定義の変数は空文字になる", () => {
    expect(renderTemplate("{{存在しない}}", {})).toBe("");
  });

  it("変数がない文字列はそのまま返す", () => {
    expect(renderTemplate("変数なし", {})).toBe("変数なし");
  });
});

describe("normalizeMatchLabelForTts", () => {
  it("「決勝」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("決勝")).toBe("けっしょう");
  });

  it("「準決勝」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("準決勝")).toBe("じゅんけっしょう");
  });

  it("「準々決勝」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("準々決勝")).toBe("じゅんじゅんけっしょう");
  });

  it("「3位決定戦」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("3位決定戦")).toBe("さんいけっていせん");
  });

  it("「第1試合」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第1試合")).toBe("だいいちしあい");
  });

  it("「第5試合」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第5試合")).toBe("だいごしあい");
  });

  it("「第10試合」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第10試合")).toBe("だいじゅうしあい");
  });

  it("漢数字「第一試合」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第一試合")).toBe("だいいちしあい");
  });

  it("全角数字「第１試合」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第１試合")).toBe("だいいちしあい");
  });

  it("「第2回戦」を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第2回戦")).toBe("だいにかいせん");
  });

  it("「1回戦」（第なし）を読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("1回戦")).toBe("いっかいせん");
  });

  it("「第1回戦」を促音付きで読み仮名に変換", () => {
    expect(normalizeMatchLabelForTts("第1回戦")).toBe("だいいっかいせん");
  });

  it("未知のラベルはそのまま返す", () => {
    expect(normalizeMatchLabelForTts("エキシビション")).toBe("エキシビション");
  });
});

describe("getTtsSettings / saveTtsSettings", () => {
  beforeEach(() => store.clear());

  it("デフォルト値を返す（未設定時）", () => {
    const settings = getTtsSettings();
    expect(settings.voice).toBe("nova");
    expect(settings.speed).toBe(1.0);
  });

  it("保存した値を取得できる", () => {
    saveTtsSettings("echo", 1.5);
    const settings = getTtsSettings();
    expect(settings.voice).toBe("echo");
    expect(settings.speed).toBe(1.5);
  });

  it("不正な speed は 1.0 にフォールバック", () => {
    store.set("tts_speed", "invalid");
    const settings = getTtsSettings();
    expect(settings.speed).toBe(1.0);
  });
});

describe("定数エクスポート", () => {
  it("DEFAULT_TEMPLATES に matchStart と winner がある", () => {
    expect(DEFAULT_TEMPLATES.matchStart).toContain("{{試合ラベル}}");
    expect(DEFAULT_TEMPLATES.winner).toContain("{{勝者名前}}");
  });

  it("TTS_VOICES に nova が含まれる", () => {
    expect(TTS_VOICES.find((v) => v.value === "nova")).toBeTruthy();
  });

  it("MATCH_VARS にサンプル値がある", () => {
    expect(MATCH_VARS.length).toBeGreaterThan(0);
    expect(MATCH_VARS[0].key).toBeDefined();
  });

  it("WINNER_VARS にサンプル値がある", () => {
    expect(WINNER_VARS.length).toBeGreaterThan(0);
  });

  it("SAMPLE_MATCH_VARS が Record として存在する", () => {
    expect(SAMPLE_MATCH_VARS["試合ラベル"]).toBeDefined();
  });

  it("SAMPLE_WINNER_VARS が Record として存在する", () => {
    expect(SAMPLE_WINNER_VARS["勝者名前"]).toBeDefined();
  });

  it("SAMPLE_TEXT がスペック通りの値である", () => {
    expect(SAMPLE_TEXT).toBe(
      "Aコート、男子一般部、準決勝。極真会所属、山田太郎選手。対。正道会館所属、鈴木一郎選手。これより試合を開始します。"
    );
  });
});

describe("buildAffiliationForTts", () => {
  it("全角スペース区切りを読点に変換する", () => {
    expect(buildAffiliationForTts("柔空会　本部道場")).toBe("柔空会、本部道場");
  });

  it("空文字列は空文字列を返す", () => {
    expect(buildAffiliationForTts("")).toBe("");
  });

  it("スペースなしの単一文字列はそのまま返す", () => {
    expect(buildAffiliationForTts("柔空会")).toBe("柔空会");
  });
});

describe("splitAffiliationParts", () => {
  it("全角スペース区切りを流派と道場に分割する", () => {
    expect(splitAffiliationParts("柔空会　本部道場")).toEqual({
      school: "柔空会",
      dojo: "本部道場",
    });
  });

  it("道場なしの場合は dojo が空文字", () => {
    expect(splitAffiliationParts("柔空会")).toEqual({
      school: "柔空会",
      dojo: "",
    });
  });

  it("空文字列の場合は両方空文字", () => {
    expect(splitAffiliationParts("")).toEqual({
      school: "",
      dojo: "",
    });
  });
});

describe("buildMatchStartText", () => {
  it("テンプレートに選手情報を埋め込んだテキストを返す", () => {
    const text = buildMatchStartText(
      "山田太郎", "極真会　本部道場",
      "鈴木一郎", "正道会館",
      "準決勝",
    );
    expect(text).toContain("じゅんけっしょう");
    expect(text).toContain("山田太郎");
    expect(text).toContain("鈴木一郎");
    expect(text).toContain("極真会、本部道場");
    expect(text).toContain("正道会館");
  });

  it("読み仮名がある場合は読み仮名を使う", () => {
    const text = buildMatchStartText(
      "山田太郎", "極真会",
      "鈴木一郎", "正道会館",
      "決勝",
      "やまだたろう", "きょくしんかい",
      "すずきいちろう", "せいどうかいかん",
    );
    expect(text).toContain("やまだたろう");
    expect(text).toContain("きょくしんかい");
    expect(text).toContain("すずきいちろう");
    expect(text).toContain("せいどうかいかん");
    // 漢字名は含まれない
    expect(text).not.toContain("山田太郎");
  });

  it("matchLabel がある場合はそちらを使う", () => {
    const text = buildMatchStartText(
      "山田太郎", "極真会",
      "鈴木一郎", "正道会館",
      "準決勝",
      null, null, null, null,
      "第3試合",
    );
    expect(text).toContain("だいさんしあい");
    expect(text).not.toContain("じゅんけっしょう");
  });

  it("カスタムテンプレートを使える", () => {
    const templates = {
      matchStart: "{{選手1名前}} 対 {{選手2名前}}",
      winner: "{{勝者名前}}の勝ち",
    };
    const text = buildMatchStartText(
      "山田太郎", "",
      "鈴木一郎", "",
      "決勝",
      null, null, null, null,
      null, null, templates,
    );
    expect(text).toBe("山田太郎 対 鈴木一郎");
  });
});

describe("announceWinner テンプレート展開", () => {
  it("デフォルトテンプレートで勝者アナウンステキストが生成される", () => {
    const { winner } = DEFAULT_TEMPLATES;
    const name = "やまだたろう";
    const aff = buildAffiliationForTts("極真会　本部道場");
    const parts = splitAffiliationParts("極真会　本部道場");
    const text = renderTemplate(winner, {
      "勝者名前": name,
      "勝者流派＋道場": aff,
      "勝者流派": parts.school,
      "勝者道場": parts.dojo,
    });
    expect(text).toContain("やまだたろう");
    expect(text).toContain("極真会、本部道場");
  });

  it("カスタムテンプレートで変数が展開される", () => {
    const template = "{{勝者名前}}選手の勝ちです。所属、{{勝者流派}}。";
    const text = renderTemplate(template, {
      "勝者名前": "鈴木一郎",
      "勝者流派＋道場": "柔空会、本部道場",
      "勝者流派": "柔空会",
      "勝者道場": "本部道場",
    });
    expect(text).toBe("鈴木一郎選手の勝ちです。所属、柔空会。");
  });
});

describe("prefetchTts", () => {
  it("空文字列の場合は fetch を呼ばない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await prefetchTts("");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("テキストがある場合は /api/tts に POST する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    await prefetchTts("テストテキスト");
    expect(fetchSpy).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
      method: "POST",
    }));
    fetchSpy.mockRestore();
  });

  it("fetch が失敗してもエラーを投げない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    await expect(prefetchTts("テスト")).resolves.toBeUndefined();
    fetchSpy.mockRestore();
  });
});

// ── speak / announce 系関数のテスト ─────────────────────────────────────

/**
 * speak() の内部で使われる fetch + Audio を一括モックするヘルパー。
 * Audio.play() → onended を即座に呼ぶことで非同期再生を高速に完了させる。
 */
function mockSpeakDeps() {
  const audioBlob = new Blob(["fake-audio"], { type: "audio/mpeg" });
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(audioBlob, { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
  );

  // Audio モック: play() 呼び出し時に即座に onended を発火
  const audioInstances: { onended: (() => void) | null; onerror: (() => void) | null }[] = [];
  const AudioMock = vi.fn().mockImplementation(() => {
    const instance = {
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      play: vi.fn().mockImplementation(() => {
        // microtask で onended を呼ぶ（Promise チェーンの後に発火）
        queueMicrotask(() => instance.onended?.());
        return Promise.resolve();
      }),
    };
    audioInstances.push(instance);
    return instance;
  });
  vi.stubGlobal("Audio", AudioMock);

  // URL.createObjectURL / revokeObjectURL
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });

  return {
    fetchSpy,
    AudioMock,
    audioInstances,
    cleanup: () => {
      fetchSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.stubGlobal("localStorage", localStorageMock);
    },
  };
}

describe("announceMatchStart", () => {
  it("テキストを組み立てて TTS API を呼び出す", async () => {
    const deps = mockSpeakDeps();
    store.clear();

    await announceMatchStart(
      "山田太郎", "極真会　本部道場",
      "鈴木一郎", "正道会館",
      "決勝",
    );

    // fetch が /api/tts に POST で呼ばれたことを検証
    expect(deps.fetchSpy).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
      method: "POST",
    }));
    // fetch の body にテンプレート展開済みテキストが含まれる
    const callBody = JSON.parse((deps.fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.text).toContain("けっしょう");
    expect(callBody.text).toContain("山田太郎");

    // Audio が生成されて play() が呼ばれたことを検証
    expect(deps.AudioMock).toHaveBeenCalled();
    deps.cleanup();
  });

  it("読み仮名が指定されている場合はそちらを使う", async () => {
    const deps = mockSpeakDeps();
    store.clear();

    await announceMatchStart(
      "山田太郎", "極真会　本部道場",
      "鈴木一郎", "正道会館",
      "決勝",
      "やまだたろう", "きょくしんかい、ほんぶどうじょう",
      "すずきいちろう", "せいどうかいかん",
    );

    const callBody = JSON.parse((deps.fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.text).toContain("やまだたろう");
    expect(callBody.text).toContain("すずきいちろう");
    expect(callBody.text).not.toContain("山田太郎");
    deps.cleanup();
  });
});

describe("announceWinner", () => {
  it("勝者テンプレートを展開して TTS API を呼び出す", async () => {
    const deps = mockSpeakDeps();
    store.clear();

    await announceWinner("山田太郎", "極真会　本部道場");

    expect(deps.fetchSpy).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
      method: "POST",
    }));
    const callBody = JSON.parse((deps.fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.text).toContain("山田太郎");
    expect(callBody.text).toContain("勝ち");
    deps.cleanup();
  });

  it("読み仮名優先で展開する", async () => {
    const deps = mockSpeakDeps();
    store.clear();

    await announceWinner(
      "山田太郎", "極真会　本部道場",
      "やまだたろう", "きょくしんかい、ほんぶどうじょう",
    );

    const callBody = JSON.parse((deps.fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.text).toContain("やまだたろう");
    expect(callBody.text).not.toContain("山田太郎");
    deps.cleanup();
  });
});

describe("announceCustom", () => {
  it("任意テキストで TTS API を呼び出す", async () => {
    const deps = mockSpeakDeps();
    store.clear();

    await announceCustom("テスト音声です");

    const callBody = JSON.parse((deps.fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.text).toBe("テスト音声です");
    deps.cleanup();
  });
});

describe("speak（内部関数の間接テスト）", () => {
  it("TTS API エラー時もエラーを投げない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    vi.stubGlobal("URL", { ...globalThis.URL, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    store.clear();

    // announceCustom は speak を呼ぶ。エラーでも reject しない
    await expect(announceCustom("エラーテスト")).resolves.toBeUndefined();

    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  it("TTS 設定の voice/speed が fetch に渡される", async () => {
    const deps = mockSpeakDeps();
    store.set("tts_voice", "onyx");
    store.set("tts_speed", "1.5");

    await announceCustom("テスト");

    const callBody = JSON.parse((deps.fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.voice).toBe("onyx");
    expect(callBody.speed).toBe(1.5);
    deps.cleanup();
  });
});
