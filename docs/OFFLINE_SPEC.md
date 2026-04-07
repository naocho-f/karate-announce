# オフライン対応 実装計画書

> 最終更新: 2026-04-07
> ステータス: **Phase 1a 実装中**
> 対象プロジェクト: karate-announce

**関連仕様書**: [COURT_SPEC.md](COURT_SPEC.md), [TIMER_SPEC.md](TIMER_SPEC.md), [ANNOUNCE_SPEC.md](ANNOUNCE_SPEC.md)

**開発ルール**: 各コミットは CLAUDE.md の Step 1〜8（TDD 駆動）に従う。SPEC.md 変更履歴への追記を毎コミットで行うこと。

---

## 段階的実施方針

**Phase 1 + Phase S を最優先で実施する。Phase 2/3 は実際の大会で運用してから判断する。**

| フェーズ | 位置づけ | 判断基準 |
|---------|---------|---------|
| Phase 1 + S | **確定実施** | ページ表示保証 + リトライ + 接続表示 + サーバー整合性。これだけで「数分の瞬断」に対処できる |
| Phase 2 | **実運用後に判断** | Phase 1 だけではリトライでも解決しない長時間断が実際に問題になった場合のみ実施。モバイルルーター持ち込み等の非技術的解決策も検討の上で判断 |
| Phase 3 | **Phase 2 実施後に判断** | Phase 2 のキューが安定稼働し、楽観的更新が必要と判断された場合のみ |
| Phase 4 | **将来** | フィードバックに基づいて |

この方針の理由:
- 大会は年に数回、WiFi問題はその一部でしか起きない。Phase 1+S（3-4週間）で十分な投資対効果が得られる
- Phase 2 の IndexedDB キュー + 再送は状態管理の複雑さを大幅に増加させ、メンテナンスコストが高い。本当に必要になるまで作らない（YAGNI原則）
- Phase 3 の楽観的更新はバグの温床になりやすい。実運用データに基づいて必要性を判断すべき

---

## 背景と目的

大会会場（体育館）のWiFiは不安定であり、数百人のスマートフォンによる帯域圧迫や、コンクリート建物内のモバイル回線不安定が頻繁に発生する。現状ではネットワーク断時にページ表示不可・操作消失・データ取得停止が起き、大会運営が中断するリスクがある。

**設計原則: 「大会は止まらない」**

- ネットワークは信頼できない前提で設計する
- 最悪でも「画面が開ける」「操作が消えない」を保証する
- 完全オフラインでの長時間運用は非目標（数分の瞬断・不安定接続が主なターゲット）

**UX原則**（運営スタッフの ITリテラシーが高くない前提）:

- **「見る場所は1か所」**: 接続状態・キュー状態を別々に表示しない。統合して1箇所のバーで見せる
- **「正常は無音」**: 正常動作時は何も表示しない。通知は異常時だけ
- **「手動操作を求めない」**: 「再読込してください」は可能な限り自動化。スタッフに技術的操作を要求しない
- **「曖昧な表現を使わない」**: 「しばらく」「可能性があります」ではなく具体的な時間や事実を示す
- **「逃げ道を用意する」**: オフラインが長引いた場合の最終手段（本部への連絡先）を画面に表示する

---

## 現状の問題

| 問題 | 影響 | 重大度 |
|------|------|:------:|
| Service Worker なし → オフラインでページが開けない | ブラウザ再起動/リロードで白画面 | **致命的** |
| API 失敗時のリトライなし → 操作が消失する | 勝者設定・試合開始が反映されない | **致命的** |
| 接続状態バナーのみ → 操作成否が不明 | スタッフが操作完了と誤認 | 高 |
| ポーリング失敗時のフォールバックなし | 最新データが取得できない | 中 |
| TTS 音声がオンライン必須 | アナウンスが再生できない | 中 |

## 現状で既にオフライン耐性がある箇所

| 箇所 | 理由 | 注意点 |
|------|------|--------|
| タイマー表示（`/timer/[courtId]`） | BroadcastChannel でローカル受信のみ。ネットワーク不要 | 初回表示時にプリセット情報を API から取得するため、**初回ロード**にはネットワーク必要 |
| タイマー操作の時間計測・スコア管理 | ローカル state + localStorage で完結 | **試合リストの取得**と**結果書き戻し**にはネットワーク必要 |
| タイマー排他制御 | localStorage + BroadcastChannel。ネットワーク不要 | — |
| ウォッチリスト設定の保持 | localStorage に永続化済み | ウォッチリストの**表示**はポーリングデータに依存。オフライン時は「設定が保持される」のみ |

---

## 画面別のオフライン重要度

| 画面 | 重要度 | 理由 | 対応フェーズ |
|------|:------:|------|:----------:|
| `/timer/[courtId]` (表示) | 最重要 | 選手・審判がスコアを見ている | 対応済み（初回ロード除く） |
| `/timer/[courtId]/control` (操作) | 最重要 | 試合中にタイマーが止まると大会中断 | Phase 1 |
| `/court/[court]` | 高 | コート別の試合進行操作端末 | Phase 1-2 |
| `/court`（統合コート画面） | 高 | コート一覧でも試合操作（勝者設定等）が可能 | Phase 1-2 |
| `/live` | 中 | 観客向け。多少遅延しても致命的ではない | Phase 1-2 |
| `/entry/[eventId]` | 低 | 大会前に使用。当日はほぼ不要 | Phase 1 |
| `/admin/*` | 低 | 事前準備用 | 対象外 |

---

## コミット分割計画

CLAUDE.md のルール「1つの実装に対して1回コミット」に従い、各 Phase をサブタスクに分割する。各コミットで SPEC.md 変更履歴に1行追記する。

| # | コミット内容 | Phase |
|:-:|------------|:-----:|
| 1 | SW 基盤 + PWA マニフェスト + offline ページ | 1a |
| 2 | リトライ付き fetch ラッパー | 1b |
| 3 | useConnectionStatus 3段階化 + Realtime 再接続対応 | 1c |
| 4 | 各画面への resilient-fetch 適用 + 操作フィードバック UI | 1d |
| 5 | エントリーフォーム入力の自動保存 | 1e |
| 6 | 冪等性キー（サーバー） | S-1 |
| 7 | 楽観ロック全アクション拡張（サーバー） | S-2 |
| 8 | set_winner / finish_timer のトランザクション化 | S-4 |
| 9 | 操作キュー基盤（IndexedDB）+ データキャッシュ | 2a |
| 10 | キュー再送ロジック + タブ間排他 | 2b |
| 11 | コート画面・タイマー画面へのキュー統合 + バッジ | 2c |
| 12 | 控えめな楽観的更新（court + timer） | 3a |
| 13 | TTS 音声のプリキャッシュ（既存 prefetchTts を Cache API 化） | 3b |

---

## Phase 1: 「画面が死なない」基盤

> **目標**: ネットワーク断でもページが表示でき、API 呼び出しが自動リトライされ、操作の成否が明確になる
> **前提**: なし（独立してデプロイ可能）
> **見積もり**: 2.5〜3 週間

### 1a. Service Worker + App Shell キャッシュ + PWA マニフェスト

**ライブラリ**: Serwist（`@serwist/turbopack` + `serwist`）
- next-pwa はメンテナンス停止、Next.js 16 App Router 非対応のため不採用
- **重要**: Next.js 16 はデフォルトで Turbopack を使用。`@serwist/next`（webpack版）は Turbopack と非互換のため、`@serwist/turbopack` + Route Handler 方式を採用する
- `app/sw.ts` は SW のソースファイル（ビルド元）、`app/serwist/[path]/route.ts` が Turbopack 用のルーティングを担う
- Serwist が Next.js 16 と非互換の場合は Workbox 直接利用にフォールバック

**キャッシュ戦略**:

| 対象 | 戦略 | 理由 |
|------|------|------|
| `/_next/static/*` (JS/CSS) | **Cache First** | コンテンツハッシュ付き。更新時は新ファイル名になる |
| `public/` 画像・フォント | **Cache First** | 静的アセット |
| `manifest.json` | **Cache First** | PWA 設定 |
| HTMLページ (`/court/*`, `/timer/*`, `/live`, `/entry/*`) | **Network First** | オフライン時のみキャッシュから返す。`force-dynamic` 設定のSSRレスポンスをキャッシュする形 |
| `/api/*` | **Network Only** | キャッシュしない。Phase 2 の操作キューで対処 |
| `/admin/*` | **キャッシュ除外** | 認証ミドルウェアとの衝突を防止 |
| RSC ペイロード (`?_rsc=...`, `/_next/data/`) | **キャッシュ除外** | ストリーミングレスポンスのキャッシュは不安定 |
| 外部リクエスト (`*.supabase.co` 等) | **SW ルーティング除外** | ポーリングの Supabase SDK 直接呼び出しを SW 経由にしない |

**オフラインフォールバック**:
- キャッシュにない URL へのアクセス時は `/offline` ページを返す
- `/offline` ページは「ネットワークに接続してから、下のボタンを押してください」+ 大きな「再読込」ボタン

**SW 更新ライフサイクル**:
- `skipWaiting()` + `clients.claim()` を採用（大会中は即座に新バージョンに切り替わることが重要）
- 新バージョン検知時: UI バナー「新しいバージョンがあります。更新します...」→ 自動 `window.location.reload()`
- `clients.claim()` により初回ロードでも即座に SW がページを制御する（controller が null になる問題を回避）

**SW とタブ間通信の分離**:
- 既存の BroadcastChannel（`timer-{courtId}`）はタブ間同期専用として維持
- SW との通信は null ガード付きで使用:
  ```typescript
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage(data);
  ```
- 既存の `lib/timer-broadcast.ts` は変更不要だが、SW 導入後に干渉がないことをテストで確認

**開発・プレビュー環境での SW 制御**:
- `next.config.ts` で `disable: process.env.NODE_ENV === 'development'` を設定し、開発環境では SW を無効化
- Vercel プレビュー環境（`VERCEL_ENV === 'preview'`）でも原則無効化（テスト時のみ手動有効化）

**大会前の事前準備**:
- SW は初回アクセス時にインストール・キャッシュ構築される。大会当日朝にアクセスして SW 未インストールのままオフラインになるとページが開けない
- 対策: 管理画面に「端末事前準備チェックリスト」セクションを追加し、SW キャッシュ構築完了を確認できるようにする（Phase 4 で検討）

**PWA マニフェスト**:

```json
{
  "name": "空手大会管理システム",
  "short_name": "空手大会",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e3a5f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

> マルチテナント化の際は name/short_name/theme_color をテナントごとに動的生成する必要がある。現時点では静的ファイルで十分。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `package.json` | 変更 | `@serwist/turbopack`, `serwist`, `esbuild`, `esbuild-wasm` 追加 |
| `next.config.ts` | 変更 | Serwist プラグイン追加（`disable: dev/preview`） |
| `tsconfig.json` | 変更 | `lib` に `"WebWorker"` 追加（SW の型定義用） |
| `app/serwist/[path]/route.ts` | 新規 | Serwist Turbopack 用 Route Handler |
| `app/sw.ts` | 新規 | Service Worker エントリポイント |
| `public/manifest.json` | 新規 | PWA マニフェスト |
| `public/icon-192.png` | 新規 | PWA アイコン |
| `public/icon-512.png` | 新規 | PWA アイコン |
| `app/layout.tsx` | 変更 | `<link rel="manifest">` 追加 |
| `app/offline/page.tsx` | 新規 | オフラインフォールバックページ |
| `SPEC.md` | 変更 | 画面一覧に `/offline` 追加、変更履歴追記 |
| `docs/OFFLINE_SPEC.md` | 変更 | ステータス更新 |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/e2e/service-worker-offline.spec.ts` | Playwright `context.setOffline(true)` でキャッシュ済みページが表示されること |
| `__tests__/e2e/service-worker-offline.spec.ts` | キャッシュ未済みページで `/offline` フォールバックが表示されること |
| `__tests__/e2e/service-worker-offline.spec.ts` | オンライン復帰後に通常動作に戻ること |

> E2E テストは CLAUDE.md ルールに従い「書くが実行しない」。リリース前にまとめて通す。
> 1a はユニットテスト対象のロジックがほぼないため、CLAUDE.md Step 2（Red 確認）は E2E で代替する。E2E 無効化中のため、手動確認で代替しコミットメッセージに「手動確認済み: オフラインページ表示」と記載する。

**ロールバック手順**:
- SW が古いキャッシュを返し続ける場合: noop SW（`self.skipWaiting()` + 全キャッシュ削除のみ行う SW）をデプロイし、全クライアントの SW を上書き更新する
- 手順: `app/sw.ts` を noop に差し替え → push → Vercel 自動デプロイ → 全端末でリロード

**受け入れ基準**:
- [ ] Chrome DevTools の Network で「Offline」にした状態で `/court/1` をリロード → ページが表示される
- [ ] キャッシュ未済みの URL にオフラインアクセス → `/offline` ページが表示される
- [ ] Lighthouse PWA スコアで installable 判定
- [ ] `npx vitest run` 全テスト通過
- [ ] `npm run build` 成功

---

### 1b. リトライ付き fetch ラッパー

**ファイル**: `lib/resilient-fetch.ts`

```typescript
interface ResilientFetchOptions {
  maxRetries: number;        // リトライ回数
  timeout: number;           // 1リクエストのタイムアウト (ms)
  signal?: AbortSignal;      // 外部からのキャンセル用（ページ遷移時に abort）
  onQueueFallback?: (req: unknown) => void;  // Phase 2 で QueuedOperation 型に具体化
}
```

**AbortController 対応**:
- 各画面コンポーネントの `useEffect` クリーンアップで `AbortController.abort()` を呼び、ページ遷移時にリトライを中断する
- リトライ待機中（バックオフの setTimeout）も `signal.aborted` チェックで即座に中断
- これにより、遷移後のメモリリーク・重複リクエストを防止する

**リトライ戦略**:
- 指数バックオフ: 1秒 → 2秒 → 4秒（最大10秒）
- ジッター: 各待機時間に 0〜500ms のランダム遅延を追加
- **5xx → リトライ**
- **4xx → 即エラー**（リトライしない）
- **ネットワークエラー / タイムアウト → リトライ**

**適用箇所と設定**（主要なもの。全 fetch は実装時に網羅する）:

| API 呼び出し | タイムアウト | リトライ | 失敗時の挙動 |
|-------------|:---------:|:------:|------------|
| `PATCH /api/court/matches/{id}` (start) | 5秒 | 3回 | エラー表示 |
| `PATCH /api/court/matches/{id}` (set_winner) | 5秒 | 3回 | エラー表示（Phase 2 でキュー化） |
| `PATCH /api/court/matches/{id}` (correct_winner) | 5秒 | 3回 | エラー表示（Phase 2 でキュー化） |
| `PATCH /api/court/matches/{id}` (finish_timer) | 5秒 | 3回 | エラー表示（Phase 2 でキュー化） |
| `PATCH /api/court/matches/{id}` (swap_with) | 5秒 | 3回 | エラー表示 |
| `PATCH /api/court/matches/{id}` (replace, edit) | 5秒 | 3回 | エラー表示 |
| `PATCH /api/court/entries/{id}` (棄権切替) | 5秒 | 3回 | エラー表示 |
| `GET /api/admin/settings` (テンプレート取得) | 5秒 | 2回 | 前回値を維持 |
| `GET /api/admin/timer-presets` | 5秒 | 2回 | 前回値を維持 |
| timer_logs 書き込み（※現在 Supabase SDK 直接呼び出し） | 3秒 | 1回 | 静かに失敗（Phase 2 でキュー化） |
| `POST /api/tts` (音声取得) | 10秒 | 2回 | アナウンスをスキップ |
| ポーリング（Supabase SDK 経由のデータ取得） | — | 0回 | 前回データを維持（resilient-fetch の対象外。useConnectionStatus で検知） |

> **注意**: ポーリングのデータ取得は `supabase.from(...)` の SDK 呼び出しであり、`fetch()` ではない。resilient-fetch の適用対象は API ルートへの `fetch()` 呼び出しのみ。ポーリング失敗時の検知は `useConnectionStatus` が担当する。

> **注意**: timer_logs の書き込みは現在 `supabase.from("timer_logs").insert(...)` の SDK 直接呼び出し。Phase 1 では変更しない（fire-and-forget のまま）。Phase 2 のコミット11（2c）で timer_logs のキュー化と合わせて API ルート経由に変更する。

> **注意**: `onQueueFallback` は Phase 2 で初めて使用する。Phase 1 の段階では引数として型定義に含めるが、実装は空（未使用）。Phase 2 のコミット10（2b）で `lib/resilient-fetch.ts` を変更して統合する。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `lib/resilient-fetch.ts` | 新規 | リトライ付き fetch ラッパー |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/unit/resilient-fetch.test.ts` | 5xx レスポンスで指定回数リトライすること |
| `__tests__/unit/resilient-fetch.test.ts` | 4xx レスポンスではリトライしないこと |
| `__tests__/unit/resilient-fetch.test.ts` | タイムアウト時にリトライすること |
| `__tests__/unit/resilient-fetch.test.ts` | 最大リトライ到達後にエラーを返すこと |
| `__tests__/unit/resilient-fetch.test.ts` | バックオフ間隔が指数的に増加すること |
| `__tests__/unit/resilient-fetch.test.ts` | signal が abort されたらリトライが即座に中断されること |

**テスト手法**: `vi.stubGlobal("fetch", vi.fn())` で fetch をモック。タイムアウト/バックオフは `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` で検証。既存テストの `vi.mock`/`vi.fn` パターンと一貫性を保つ（msw は導入しない）。

**受け入れ基準**:
- [ ] `npx vitest run __tests__/unit/resilient-fetch.test.ts` 全テスト通過
- [ ] `npm run build` 成功

---

### 1c. useConnectionStatus の強化 + Realtime 再接続対応

**ファイル**: `components/connection-status.tsx`（既存ファイルを拡張）、`lib/connection-logic.ts`（新規。判定ロジックを純粋関数として分離し、ユニットテスト可能にする）

**現状との差分**:
- 現状: `failCountRef.current >= 2`（**2回連続**失敗）で isOffline=true
- 変更後: 直近3回の成功/失敗履歴に基づく3段階判定

| 項目 | 現状 | 変更後 |
|------|------|--------|
| オフライン判定 | 2回連続失敗で即判定 | 直近3回の履歴で3段階 |
| ポーリング間隔制御 | フック外（呼び出し元の setInterval） | フック内で指数バックオフ管理 |
| 復帰時の処理 | failCount=0, isOffline=false のみ | `onReconnect` コールバック（全データ再取得 + キュー flush トリガー用） |
| 切断時の処理 | isOffline=true のみ | `onDisconnect` コールバック（UI モード切替用） |

**接続品質の3段階**:

| 状態 | 条件 | 表示 |
|------|------|------|
| 正常 | バナー非表示の既定状態 | バナー非表示 |
| 不安定（黄色） | スタッフの能動的操作（試合開始・勝者設定等）で resilient-fetch のリトライが発生した場合のみ表示。バックグラウンドのポーリング失敗だけでは表示しない（オオカミ少年効果の回避）。リトライ成功後に自動で非表示に戻る | 「接続が不安定です」 |
| オフライン（赤） | `navigator.onLine === false`、またはポーリング + 操作の両方が連続失敗 | 「オフラインです」 |

**画面別ポーリング間隔**:

| 画面 | 現在の間隔 | バックオフ適用後 |
|------|:---------:|:-------------:|
| `/court/[court]` | 3秒 | 3→6→12→最大30秒 |
| `/live` | 5秒 | 5→10→20→最大30秒 |
| `/timer/[courtId]/control` | 10秒 | 10→20→最大30秒 |
| `/` (トップ) | 5秒 | 5→10→20→最大30秒 |

**Supabase Realtime 再接続対応**（`/live` ページ）:

Supabase Realtime は切断時に自動再接続するが、切断中のイベントは失われる。

```typescript
// 現状: .subscribe() にコールバックなし
// 変更後: ステータスコールバックで再接続・エラーハンドリング
channel.subscribe((status, err) => {
  if (status === 'SUBSCRIBED') {
    wrappedFetch(); // 再接続時にフルリフレッシュ
  }
  if (status === 'CLOSED' || status === 'TIMED_OUT') {
    console.warn(`Realtime ${status}`, err);
    // 指数バックオフで再購読（最大5回）
    setTimeout(() => channel.subscribe(/* 同じコールバック */), backoff);
  }
});
```

**`visibilitychange` 復帰時の安全策**:
- 端末スリープ復帰時に古い状態で操作されないよう、復帰時は「データを更新しています...」オーバーレイを表示 → データ再取得完了後に操作可能にする

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `lib/connection-logic.ts` | 新規 | 3段階判定・バックオフ計算の純粋関数（テスト容易性のため分離） |
| `components/connection-status.tsx` | 変更 | 3段階表示、バックオフ、コールバック。判定ロジックは `lib/connection-logic.ts` を使用 |
| `app/live/page.tsx` | 変更 | Realtime subscribe にステータスコールバック追加（CLOSED/TIMED_OUT の再購読含む） |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/unit/connection-logic.test.ts` | 直近3回全成功で「正常」、操作リトライ発生時に「不安定」、3回全失敗で「オフライン」 |
| `__tests__/unit/connection-logic.test.ts` | バックオフ間隔が正しく計算されること |
| `__tests__/unit/connection-logic.test.ts` | onReconnect コールバックが復帰時に呼ばれること |

> 判定ロジックを `lib/connection-logic.ts` に純粋関数として切り出すことで、React コンポーネントのテスト困難を回避する（`@testing-library/react` の導入は不要）。

**受け入れ基準**:
- [ ] `npx vitest run __tests__/unit/connection-logic.test.ts` 全テスト通過
- [ ] `/court/1` でネットワーク断 → 黄色バナー表示 → 赤バナー表示（段階的に変化）
- [ ] ネットワーク復帰時に全データが自動再取得される

---

### 1d. 各画面への resilient-fetch 適用 + 操作フィードバック UI

現在の `processingMatchIds` を拡張し、各操作に送信状態を持たせる。

| 状態 | UI 表現 | 条件 |
|------|---------|------|
| 送信中 | スピナー + ボタン disabled | API 呼び出し中（現状と同じ） |
| 送信完了 | 何も表示しない（「正常は無音」原則） | API レスポンス成功 |
| 送信失敗 | 赤バツ + エラーメッセージ | リトライ全失敗（Phase 2 でキュー保存に変更） |

> 「送信完了」の緑チェックは不要。正常時にいちいち通知すると「表示されなかった＝失敗？」という不安を生む。異常時のみ通知する。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/court/[court]/page.tsx` | 変更 | resilient-fetch 適用、フィードバック UI |
| `app/court/court-index-client.tsx` | 変更 | resilient-fetch 適用、フィードバック UI（統合コート画面でも試合操作が可能） |
| `app/timer/[courtId]/control/page.tsx` | 変更 | resilient-fetch 適用 + useConnectionStatus 統合（現在は未使用） |
| `app/live/page.tsx` | 変更 | バックオフ対応のポーリング間隔 |

**受け入れ基準**:
- [ ] コート画面で試合開始 → スピナー → 正常完了後は表示が消える（「正常は無音」原則）
- [ ] ネットワーク断で操作 → スピナー → リトライ → 赤バツ + エラーメッセージ
- [ ] `npm run build` 成功

---

### 1e. エントリーフォーム入力の自動保存

**ストレージ**: `sessionStorage`（タブを閉じたら消える。個人情報保護）

- 入力フィールドの `onChange` で sessionStorage に保存（デバウンス 500ms）
- ページリロード時に sessionStorage から復元
- 送信成功時に sessionStorage をクリア

> Phase 3 以降に依存せず、sessionStorage だけで完結するため Phase 1 で実装する。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/entry/[eventId]/page.tsx` | 変更 | sessionStorage 自動保存/復元 |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/e2e/entry-form-autosave.spec.ts` | 入力 → リロード → 復元されること |
| `__tests__/e2e/entry-form-autosave.spec.ts` | 送信成功後に sessionStorage がクリアされること |

**受け入れ基準**:
- [ ] エントリーフォームで入力 → リロード → 入力内容が復元される
- [ ] 送信成功後 → リロード → フォームが空の初期状態

---

## Phase S: サーバー側の基盤強化

> Phase 2 のオフラインキューが安全に動作するための前提条件
> **Phase 1 完了後、Phase 2 開始前に着手する**
> Phase S が未完了でも Phase 1 は独立してデプロイ可能
> **見積もり**: 1〜1.5 週間

### S-1. 冪等性キー

**対象**: 全 `PATCH /api/court/matches/{id}` アクション

**実装**:
- リクエストヘッダ `Idempotency-Key: <UUID>` を受け取る
- サーバーはこのキーを一時テーブル（`idempotency_keys`）に記録
- 同じキーのリクエストが来たら、前回のレスポンスを返す（再実行しない）
- キーの TTL: 24時間（大会終了後に自動削除）

**テーブル**:
```sql
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  response_status INTEGER NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

> マルチテナント化の際は `tenant_id` カラムの追加が必要になる可能性がある。現時点では不要。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `lib/idempotency.ts` | 新規 | 冪等性キーの管理ロジック |
| `app/api/court/matches/[id]/route.ts` | 変更 | 冪等性キーチェック追加 |
| `supabase/migrations/` | 新規 | idempotency_keys テーブル作成 |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/api/idempotency.test.ts` | 同一キーでの2回呼び出しが同じ結果を返すこと |
| `__tests__/api/idempotency.test.ts` | キーなしのリクエストが通常通り動作すること |

**受け入れ基準**:
- [ ] 同一 `Idempotency-Key` での2回目の PATCH が再実行されないこと
- [ ] `npx vitest run __tests__/api/idempotency.test.ts` 全テスト通過

---

### S-2. 楽観ロックの全アクション拡張

**現状**: `set_winner` と `finish_timer` のみ `matchUpdatedAt` チェック実装済み

**変更**:
- `/api/court/matches/[id]`: `start`, `replace`, `correct_winner` にも `matchUpdatedAt` チェックを追加
- `/api/admin/matches/[id]`: admin API にも `matchUpdatedAt` チェックを追加（現在は `body` を無検証で `update()` しており、コート画面のオフラインキューと競合するリスクがある）

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/api/court/matches/[id]/_handlers.ts` | 変更 | 全アクションに楽観ロック追加 |
| `app/api/admin/matches/[id]/route.ts` | 変更 | admin API にも楽観ロック追加 |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/api/court-matches-lock.test.ts` | 各アクションで古い `matchUpdatedAt` を送ると 409 が返ること |

**受け入れ基準**:
- [ ] 全 7 アクション（start, set_winner, correct_winner, finish_timer, replace, edit, swap_with）で楽観ロックが機能すること

---

### S-4. set_winner / finish_timer のトランザクション化

**現状**: match 更新 → 次ラウンド配置が逐次実行（トランザクションなし）

**リスク**: 途中でサーバーがクラッシュすると、match は done だが次ラウンドに選手が配置されない

**変更**: Supabase RPC（stored procedure）でアトミック実行する

> Phase 2 のキュー再送時に非トランザクションの set_winner が実行されると整合性リスクがあるため、Phase 2 開始前に実施する。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/api/court/matches/[id]/_handlers.ts` | 変更 | set_winner / finish_timer をトランザクション化 |
| `supabase/migrations/` | 新規 | RPC 作成 |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/api/court-matches-winner.test.ts` | 勝者設定後に次ラウンドに選手が配置されること（既存テストの拡張） |

**受け入れ基準**:
- [ ] set_winner が match 更新 + 次ラウンド配置をアトミックに実行すること

**ロールバック手順**:
- RPC に問題がある場合: RPC を DROP し、元の逐次実行コードに戻す（_handlers.ts を revert）

---

## Phase 2: 「操作が消えない」キューイング

> **目標**: ネットワーク断でも操作を永続保存し、復帰時に自動送信する
> **前提**: Phase 1 + Phase S 完了済み
> **見積もり**: 1.5〜2 週間
> 問題発生時は Vercel のインスタントロールバック機能で即座にデプロイを巻き戻す

### 2a. 操作キュー（IndexedDB）+ データキャッシュ

**ライブラリ**: `idb-keyval`（軽量 IndexedDB ラッパー）

> IndexedDB と idb-keyval の導入をデータキャッシュと同時に行い、依存追加とスキーマ設計を1回で済ませる。

**操作キューのデータ構造**:
```typescript
type CourtAction =
  | 'start' | 'set_winner' | 'replace' | 'edit'
  | 'swap_with' | 'correct_winner' | 'finish_timer';

interface QueuedOperation {
  id: string;                    // UUID（冪等性キー兼用）
  action: CourtAction;           // リテラル型ユニオンで型安全に
  endpoint: string;              // API URL
  method: 'PATCH';               // コート操作 API は全て PATCH
  payload: Record<string, unknown>;
  matchUpdatedAt?: string;       // 楽観ロック用タイムスタンプ
  createdAt: string;             // ISO timestamp
  tabId: string;                 // 発行元タブ識別子
  sequenceNum: number;           // FIFO 順序保証用（グローバル連番）
  status: 'pending' | 'sending' | 'conflict' | 'done';
}
```

> マルチテナント化の際は IndexedDB のストア名にテナント識別子プレフィックスを追加する余地を残す。

**データキャッシュ**:

ポーリング成功時に IndexedDB へデータを保存し、オフライン時はキャッシュから表示する。

| キー | データ | 用途 |
|------|--------|------|
| `court-data-{eventId}-{courtNum}` | tournaments, matches, fighters, dojos | コート画面のフォールバック |
| `live-data-{eventId}` | 全コートの CourtData[] | ライブ画面のフォールバック |

> キーに `eventId` を含めることで、同日に複数大会（午前/午後）を開催した場合のデータ混在を防ぐ。大会切替時に前回キャッシュは自動的に別キーになる。

**キャッシュ戦略**:
- ポーリング成功**かつデータに変化があった場合のみ** IndexedDB に書き込む（既存の `prevDataRef` の変化検知を活用。不要な write を回避）
- ポーリング失敗 → IndexedDB から読み出し + 「最終更新: HH:MM:SS」を表示
- ポーリング連続N回失敗（時刻ベースではなく失敗回数ベース）→ 「最終更新: HH:MM:SS（N回更新失敗）」と表示（端末時計のズレに影響されない）

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `package.json` | 変更 | `idb-keyval`, `fake-indexeddb`（devDependencies）追加 |
| `vitest.config.ts` | 変更 | `setupFiles` に `fake-indexeddb/auto` 追加（IndexedDB ポリフィル） |
| `lib/offline-queue.ts` | 新規 | IndexedDB キュー管理 + データキャッシュ |

> **テスト環境の前提条件**: Vitest は `happy-dom` 環境で動作し、IndexedDB API が存在しない。`fake-indexeddb` パッケージで IndexedDB をポリフィルし、`idb-keyval` がテスト環境でも動作するようにする。

**Safari Private Browse 対策**:
- IndexedDB への書き込みが `QuotaExceededError` で失敗した場合、「通常モードのブラウザで開いてください」とバナー表示する（フォールバック実装は不要。運営端末がプライベートブラウズで使われるケースはほぼない）

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/unit/offline-queue.test.ts` | enqueue/flush/remove/getPendingCount |
| `__tests__/unit/offline-queue.test.ts` | FIFO 順序が保証されること |
| `__tests__/unit/offline-queue.test.ts` | データキャッシュの保存（変化時のみ）・読み出し |
| `__tests__/unit/offline-queue.test.ts` | IndexedDB 不可時に QuotaExceededError をスローすること |

---

### 2b. キュー再送ロジック + タブ間排他

**トリガー**:
- `window.addEventListener('online', flush)` — ネットワーク復帰
- `document.addEventListener('visibilitychange', flush)` — タブ復帰時（visible かつ online）
- ポーリング成功時 — キューに未送信があれば flush

> Background Sync API は iOS Safari 未対応のため使用しない。上記の自前トリガーで全ブラウザ対応。

**再送ルール**:
1. **FIFO 順序を厳守**: `sequenceNum` 昇順で1件ずつシリアル実行
2. **操作間ディレイ**: 100〜200ms（サーバー負荷分散）
3. **端末間ジッター**: 初回 flush 前に 0〜3秒のランダム遅延（WiFi 復旧時のスパイク分散）
4. **送信前に認証チェック**: 軽量エンドポイントで Cookie の有効性を確認。401 なら全操作を一時停止し再ログインを促す
5. **各リクエストに `Idempotency-Key` ヘッダを付与**: キューの `id`（UUID）をそのまま使用

**エラー処理**:

| レスポンス | 処理 |
|-----------|------|
| 200 OK | `status: 'done'` → IndexedDB から削除 |
| 409 Conflict | `status: 'conflict'` → この操作をスキップ。**以降のキューも全て破棄**し、サーバーから全データ再取得（`load()`）。ユーザーに「サーバーと同期しました。一部の操作は他の端末で既に実行されていたためスキップされました」と通知 |
| 401 Unauthorized | 全操作を一時停止。再ログインダイアログを表示 |
| 5xx | リトライ（指数バックオフ、最大3回）。3回失敗 → `pending` に戻し次回 flush で再挑戦 |

**タブ間排他（Web Locks API）**:

```typescript
async function flush() {
  const doFlush = async () => { /* シリアル実行... */ };
  if (navigator.locks) {
    await navigator.locks.request('offline-queue-flush', doFlush);
  } else {
    await doFlush(); // Web Locks 未対応時は排他なし。冪等性キーで安全性を担保
  }
}
```

Web Locks API ブラウザサポート: Chrome 69+, Firefox 96+, Safari 15.4+。未対応デバイスでは冪等性キー（Phase S-1）だけで安全性を担保する。

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `lib/offline-queue.ts` | 変更 | flush ロジック、タブ間排他、エラー処理 |
| `lib/resilient-fetch.ts` | 変更 | `Idempotency-Key` ヘッダの自動付与、`onQueueFallback` コールバック統合 |
| `components/connection-status.tsx` | 変更 | onReconnect で flush をトリガー |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/unit/offline-queue.test.ts` | 409 時にキュー全破棄されること |
| `__tests__/unit/offline-queue.test.ts` | 401 時に flush が一時停止すること |
| `__tests__/unit/offline-queue.test.ts` | 5xx 時にリトライされること |
| `__tests__/e2e/offline-queue.spec.ts` | オフラインで操作 → オンライン復帰 → 自動送信されること |

---

### 2c. コート画面・タイマー画面へのキュー統合 + キュー状態バッジ

**統合ステータスバー**: 接続状態とキュー状態を1つのヘッダーバーに統合する（「見る場所は1か所」原則）

| 状態 | 表示 |
|------|------|
| 正常 + 未送信なし | 何も表示しない |
| 不安定 + 未送信なし | 黄色バー「ネットワークが不安定です」 |
| 未送信あり | オレンジバー「操作N件が送信待ちです。ネットワーク復旧後に自動送信します」 |
| オフライン | 赤バー「オフラインです。操作は保存済みです -- ネットワーク復旧後に自動送信します」 |
| 送信中 | 緑バー + 回転アイコン「送信中...」 |
| 競合発生 | 赤バー → **自動 `window.location.reload()`**。スタッフに手動操作を求めない。リロード中は「画面を更新しています...」表示 |

> 「不安定」バナーはバックグラウンドのポーリング失敗だけでは表示しない。スタッフが能動的に操作した時のリトライ発生時に初めて表示する（オオカミ少年効果の回避）。

**操作フローの変更**（Phase 1d のエラー表示をキュー保存に差し替え）:

```
[操作ボタン押下]
  ↓
[resilient-fetch で API 呼び出し]
  ├─ 成功 → 「送信完了」表示 → load() でデータ再取得
  ├─ リトライ中 → 「送信中」スピナー
  └─ 全リトライ失敗
       ↓
     [操作キューに enqueue]
       ↓
     [「送信待ち 🕐」アイコン + バッジ更新]
       ↓
     [オンライン復帰時に自動 flush]
       ↓
     [成功 → load() で全データ再取得]
```

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `components/queue-status-badge.tsx` | 新規 | 未送信件数バッジ |
| `app/court/[court]/page.tsx` | 変更 | キュー統合、送信待ち UI |
| `app/court/court-index-client.tsx` | 変更 | キュー統合（統合コート画面でも同様） |
| `app/timer/[courtId]/control/page.tsx` | 変更 | finish_timer / timer_logs のキュー化 |

**受け入れ基準**:
- [ ] オフラインで勝者設定 → 「送信待ち」表示 + バッジ「未送信: 1件」
- [ ] オンライン復帰 → 自動送信 → バッジ消滅 → データ再取得
- [ ] 2つのタブで同時にオンライン復帰しても、キューが二重送信されない（冪等性キーで保証）
- [ ] Vercel ロールバックでキュー統合前のバージョンに戻せること

**ロールバック手順**:
- 問題発生時: Vercel のインスタントロールバックでキュー統合前のデプロイに即座に戻す
- IndexedDB が破損した場合: DevTools > Application > IndexedDB からストアを手動削除

---

## Phase 3: 「操作結果が見える」楽観的更新（限定的）

> **目標**: 操作の即時フィードバックを改善する。安全なアクションのみ。
> **前提**: Phase 2 完了済み
> **見積もり**: 1.5〜2 週間

### 3a. 控えめな楽観的更新

**アクション別の対応方針**:

| アクション | 楽観的更新 | 理由 |
|-----------|:---------:|------|
| `start`（試合開始） | **しない** | 選手がコートに立ってから押す操作。2-3秒の遅延は許容範囲 |
| `set_winner`（勝者設定） | **控えめに** | 現在の match のみ「確定待ち」表示。次ラウンドは更新しない |
| `finish_timer`（タイマー結果） | **控えめに** | 同上 |
| `correct_winner`（勝者訂正） | **しない** | 次ラウンドの状態依存判定がオフラインで不可能 |
| `edit`（ラベル編集） | **する** | 単一フィールドの単純更新。安全 |
| `swap_with`（試合入替） | **しない** | 非アトミックな3ステップ更新 |
| `replace`（選手差替） | **しない** | 他端末との競合リスク |

**「控えめな楽観的更新」パターン**（`set_winner` / `finish_timer`）:

```
[勝者設定ボタン押下]
  ↓
[ローカル] 該当 match を「確定待ち ⏳」表示にする
  → match.status はローカルで "done" にしない
  → 次ラウンドの match は一切変更しない
  ↓
[API 呼び出し（resilient-fetch）]
  ├─ 成功 → load() で全データ再取得（サーバーが次ラウンド配置済み）
  ├─ リトライ中 → 「確定待ち ⏳」表示を維持
  └─ 全失敗 → キューに保存 → 「送信待ち 🕐」表示
```

**次ラウンドの安全弁**:
- **未送信の勝者設定がある試合の次ラウンド → 「試合開始」ボタンを無効化**
- 表示: 「前の試合結果を送信待ちです（N秒経過）」
- **30秒経過しても送信できない場合**: メッセージを変更 → 「ネットワークが復旧しません。本部に連絡してください」
- 理由: サーバーでの選手配置が完了していない状態で開始すると不整合が起きる
- 「しばらくお待ちください」のような曖昧な表現は使わない（UX原則）

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `app/court/[court]/page.tsx` | 変更 | 控えめな楽観的更新、次ラウンド開始ブロック |
| `app/court/court-index-client.tsx` | 変更 | 同上 |
| `app/timer/[courtId]/control/page.tsx` | 変更 | 控えめな楽観的更新 |

**テスト**:

| ファイル | 内容 |
|---------|------|
| `__tests__/unit/optimistic-update.test.ts` | 控えめな更新が次ラウンドの match に影響しないこと |
| `__tests__/unit/optimistic-update.test.ts` | 未送信キューがある試合の次ラウンドで start が無効化されること |

**受け入れ基準**:
- [ ] 勝者設定 → 即座に「確定待ち」表示 → サーバー応答後に正式な表示
- [ ] 未送信の勝者設定がある場合、次ラウンドの「試合開始」ボタンが disabled

---

### 3b. TTS 音声のプリキャッシュ

**既存の `prefetchTts()` 関数**（`lib/speech.ts`）を Cache API ベースに拡張する。

```
[現在の試合が進行中]
  ↓
[次の試合の matchStart テキストを生成]
  ↓
[POST /api/tts でプリフェッチ → Cache API に保存]
  ↓
[次の試合開始時 → Cache API から取得して再生]
  ↓
[Cache miss → 通常通り /api/tts を呼ぶ（フォールバック）]
```

**追加・変更ファイル**:

| ファイル | 操作 | 内容 |
|---------|------|------|
| `lib/speech.ts` | 変更 | 既存 prefetchTts を Cache API ベースに拡張 |

**受け入れ基準**:
- [ ] プリフェッチ済みの音声がオフラインでも再生できること

---

## Phase 4: 堅牢化（将来）

> Phase 1-3, S が安定稼働した後に検討
> 優先度は大会運営のフィードバックに基づいて決定する

| # | 施策 | 内容 |
|---|------|------|
| 4-1 | ポーリング間隔の動的調整 | `/live` の観客アクセス集中時に自動で間隔を広げる |
| 4-2 | ログアウト時のクリーンアップ | IndexedDB + localStorage + Cache Storage のアプリ関連データを全削除 |
| 4-3 | 操作音声フィードバック | 送信完了時と送信待ち時で異なる効果音（IT リテラシーの低いスタッフでも音で区別） |
| 4-4 | swap_with のトランザクション化 | Supabase RPC でアトミック実行（オフライン対応との依存が薄いため Phase 4 に延期） |
| 4-5 | データリセットUI | 管理画面に「ローカルデータリセット」ボタン（IndexedDB 破損時のリカバリー用） |
| 4-6 | 大会前の端末事前準備チェックリスト | 管理画面に SW キャッシュ構築完了を確認できる画面を追加 |
| 4-7 | ストレージ容量管理 | `navigator.storage.estimate()` で使用量チェック、`persist()` でキュー保護、TTS キャッシュの LRU eviction |

> **S-3 について**: 元計画にあった「swap_with のトランザクション化」はオフライン対応との依存が薄いため Phase 4-4 に移動した。番号は欠番。

---

## ストレージ選定基準

| データ | ストレージ | 理由 |
|--------|-----------|------|
| タイマー状態 | **localStorage（現状維持）** | 小さい、同期的読み取りが必要 |
| TTS 設定 | **localStorage（現状維持）** | 数十バイト |
| ウォッチリスト | **localStorage（現状維持）** | 小さい配列 |
| 操作キュー | **IndexedDB** | 構造化データ、トランザクション安全性 |
| ポーリングデータキャッシュ | **IndexedDB** | データ量が大きい |
| TTS 音声キャッシュ | **Cache API** | バイナリデータ、SW から直接アクセス可能 |
| エントリーフォーム自動保存 | **sessionStorage** | タブを閉じたら消える（個人情報保護） |

---

## MVP（大会が1週間以内に迫っている場合）

全 Phase の実装が間に合わない場合、以下の最小セットで最大効果を得る。

| # | 施策 | 工数 | 効果 |
|---|------|:----:|------|
| 1 | SW + PWA マニフェスト（1a） | 1-2日 | ページが開ける保証。最も致命的な問題の解消 |
| 2 | resilient-fetch（1b）の `/court/*` と `/timer/*/control` のみ適用 | 1日 | 操作の自動リトライ |
| 3 | useConnectionStatus 3段階化（1c） | 0.5日 | スタッフが接続状態を把握できる |

**MVP 合計**: 2.5〜3.5 日。Phase 2 以降は大会後に実施。

---

## 実装スケジュール

```
Week 1-2: Phase 1（1a〜1e）
  ├ コミット1: SW + PWA マニフェスト + offline ページ
  ├ コミット2: リトライ付き fetch
  ├ コミット3: useConnectionStatus 3段階化 + Realtime 再接続
  ├ コミット4: 各画面への適用 + フィードバック UI
  └ コミット5: エントリーフォーム自動保存

  → デプロイ後に SW 動作確認（本番環境で検証必須）
  
  到達状態: 「瞬断に耐えるアプリ」
  - ページリロードしても表示される
  - API 呼び出しが自動リトライされる
  - 操作の成否がスタッフに明確に伝わる

Week 3: Phase S（S-1, S-2, S-4）
  ├ コミット6: 冪等性キー
  ├ コミット7: 楽観ロック全アクション拡張
  └ コミット8: set_winner / finish_timer トランザクション化

  到達状態: Phase 2 の前提条件が整備済み

Week 4-5: Phase 2（2a〜2c）
  ├ コミット9: 操作キュー基盤 + データキャッシュ
  ├ コミット10: キュー再送 + タブ間排他
  └ コミット11: 画面統合 + バッジ

  到達状態: 「数分のオフラインに耐えるアプリ」
  - 操作が永続保存され、復帰時に自動送信
  - 未送信件数が可視化される
  - オフラインでもキャッシュデータを表示

Week 6-7: Phase 3（3a〜3b）
  ├ コミット12: 控えめな楽観的更新
  └ コミット13: TTS プリキャッシュ

  到達状態: 「操作体験が洗練されたアプリ」
  - 操作の即時フィードバック（控えめな楽観的更新）
  - TTS 音声がオフラインでも再生可能

以降: Phase 4（フィードバックに基づいて判断）
```

---

## リスクと対策

| リスク | 発生確率 | 影響 | 対策 |
|--------|:--------:|------|------|
| Serwist + Turbopack 非互換 | 高 | Phase 1a 遅延 | `@serwist/turbopack` + Route Handler 方式を採用。ダメなら Workbox 直接利用 |
| SW `controller` が初回ロードで null | 高 | SW 通信失敗 | `clients.claim()` + null ガード + `navigator.serviceWorker.ready` を await |
| SW が古いキャッシュを返し続ける（大会間デプロイ） | 中 | 古い JS が表示される | `skipWaiting()` + 新バージョン検知で自動リロード |
| iOS Safari の SW 挙動差異 | 中 | 一部端末で SW 不安定 | Phase 1a デプロイ後に iPad で動作確認 |
| Safari Private Browse で IndexedDB 不可 | 中 | キューが保存されない | 「通常モードで開いてください」バナー表示 |
| Web Locks API 未対応デバイス（iPadOS 15.4未満） | 低 | タブ間排他が効かない | `navigator.locks` 存在チェック + 冪等性キーで安全性担保 |
| admin API とコートキューの競合 | 中 | データ不整合 | admin API にも楽観ロック追加（Phase S-2）+ 運用ガイダンス |
| 操作キューの競合が多発 | 中 | スタッフの混乱 | 409 時の自動リロード + 冪等性キー |
| 復帰時のポーリングバースト（観客端末 50-100台） | 中 | Supabase 負荷 | `/live` の `online` イベント後に 0-5秒ジッター |
| オフライン時間が長すぎてキューが大量に溜まる | 低 | サーバー負荷 | ジッター + 操作間ディレイ + 件数上限（50件） |
| 端末ストレージ不足で IndexedDB/Cache eviction | 低 | キューやキャッシュ消失 | `QuotaExceededError` 時の警告表示 + TTS キャッシュサイズ上限 |
| 同日複数大会でキャッシュデータ混在 | 中 | 別大会のデータ表示 | IndexedDB キーに eventId を含める |
| Phase 2 のキュー機能に問題 | 中 | 操作の不整合 | Vercel インスタントロールバックで即座に巻き戻し |
| resilient-fetch リトライ中のページ遷移 | 高 | メモリリーク | AbortController + useEffect クリーンアップ |

---

## やらないこと（スコープ外）

| 項目 | 理由 |
|------|------|
| `/admin/*` のオフライン対応 | 事前準備用。大会中の利用頻度が低い |
| Background Sync API | iOS Safari 未対応。自前同期で代替 |
| クライアントでの次ラウンド選手配置 | サーバーロジックの正確な再現が困難。整合性リスクが高すぎる |
| IndexedDB の暗号化 | 管理端末は共有端末でない前提。ログアウト時のクリーンアップで対応 |
| WebSocket への完全移行 | 現在のポーリング + Realtime で実用上十分 |
