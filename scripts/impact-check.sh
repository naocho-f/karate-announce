#!/bin/sh
# impact-check.sh — 変更ファイルの影響範囲を列挙する
#
# 使い方:
#   scripts/impact-check.sh                  # ステージ済みファイルを対象
#   scripts/impact-check.sh lib/speech.ts    # 指定ファイルを対象
#
# Step 5（セルフレビュー）で実行し、列挙されたファイルを全て確認してから
# コミットに進む。

set -e
cd "$(git rev-parse --show-toplevel)"

# ── 対象ファイル取得 ──
if [ $# -gt 0 ]; then
  CHANGED="$*"
else
  CHANGED=$(git diff --cached --name-only 2>/dev/null)
  if [ -z "$CHANGED" ]; then
    CHANGED=$(git diff --name-only 2>/dev/null)
  fi
fi

if [ -z "$CHANGED" ]; then
  echo "変更ファイルがありません。"
  exit 0
fi

# ── 結果格納（重複排除） ──
SPECS=""
TESTS=""
CALLERS=""
IMPLS=""

add_spec()  { echo "$1" | while read -r f; do [ -n "$f" ] && [ -f "$f" ] && SPECS="$SPECS $f"; done; SPECS=$(echo "$SPECS" | tr ' ' '\n' | sort -u | tr '\n' ' '); }
add_test()  { echo "$1" | while read -r f; do [ -n "$f" ] && [ -f "$f" ] && TESTS="$TESTS $f"; done; TESTS=$(echo "$TESTS" | tr ' ' '\n' | sort -u | tr '\n' ' '); }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  影響範囲チェック (impact-check)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "【変更ファイル】"
for f in $CHANGED; do
  echo "  $f"
done

# ── 関連ファイル探索 ──

RELATED_SPECS=""
RELATED_TESTS=""
RELATED_CALLERS=""
RELATED_IMPLS=""

for f in $CHANGED; do
  basename=$(basename "$f" | sed 's/\.[^.]*$//')

  # lib/ の変更 → 呼び出し元・テスト・仕様書
  case "$f" in
    lib/*)
      # 呼び出し元（app/, components/）
      callers=$(grep -rl "from.*@/lib/${basename}" app/ components/ 2>/dev/null || true)
      [ -n "$callers" ] && RELATED_CALLERS="$RELATED_CALLERS
$callers"

      # テスト
      for t in __tests__/unit/${basename}.test.ts __tests__/unit/${basename}.test.tsx; do
        [ -f "$t" ] && RELATED_TESTS="$RELATED_TESTS
$t"
      done

      # 仕様書（ファイル名から推定）
      for spec in docs/*_SPEC.md; do
        [ -f "$spec" ] && grep -ql "$basename" "$spec" 2>/dev/null && RELATED_SPECS="$RELATED_SPECS
$spec"
      done
      ;;
  esac

  # app/api/ の変更 → テスト・呼び出し元・仕様書
  case "$f" in
    app/api/*)
      # テスト: import パスで検索（@/app/api/... を参照しているテスト）
      import_path=$(echo "$f" | sed 's|\.ts$||;s|/route$||')
      for t in __tests__/api/*.test.ts; do
        [ -f "$t" ] && grep -ql "@/$import_path\|@/${import_path}/route" "$t" 2>/dev/null && RELATED_TESTS="$RELATED_TESTS
$t"
      done
      # テスト: URL パターンでも検索（/api/admin/events 等）
      api_url=$(echo "$f" | sed 's|app/api|/api|;s|/route\.ts||;s|/_handlers\.ts||')
      api_url_clean=$(echo "$api_url" | sed 's/\[.*\]//g;s|/$||')
      for t in __tests__/api/*.test.ts; do
        [ -f "$t" ] && grep -ql "$api_url_clean" "$t" 2>/dev/null && RELATED_TESTS="$RELATED_TESTS
$t"
      done

      # fetch で呼んでいる画面
      url_pattern=$(echo "$f" | sed 's|app/api|/api|;s|/route\.ts||;s|\[.*\]|[^"]*|g')
      callers=$(grep -rl "$url_pattern" app/ components/ 2>/dev/null || true)
      [ -n "$callers" ] && RELATED_CALLERS="$RELATED_CALLERS
$callers"

      # 仕様書: APIパスのキーワードで検索
      for spec in docs/*_SPEC.md; do
        [ -f "$spec" ] && grep -ql "$api_url_clean" "$spec" 2>/dev/null && RELATED_SPECS="$RELATED_SPECS
$spec"
      done
      ;;
  esac

  # app/ ページの変更 → 仕様書
  case "$f" in
    app/court/*|app/entry/*|app/live/*|app/timer/*|app/admin/*)
      for spec in docs/*_SPEC.md; do
        [ -f "$spec" ] && {
          # ページパスが仕様書内で参照されているか
          page_path=$(echo "$f" | sed 's|/page\.tsx||;s|/\[.*\]||g;s|app/||')
          grep -ql "$page_path" "$spec" 2>/dev/null && RELATED_SPECS="$RELATED_SPECS
$spec"
        }
      done
      ;;
  esac

  # components/ の変更 → 呼び出し元・テスト
  case "$f" in
    components/*)
      callers=$(grep -rl "from.*@/components/${basename}" app/ components/ 2>/dev/null || true)
      [ -n "$callers" ] && RELATED_CALLERS="$RELATED_CALLERS
$callers"
      for t in __tests__/unit/${basename}.test.ts __tests__/unit/${basename}.test.tsx; do
        [ -f "$t" ] && RELATED_TESTS="$RELATED_TESTS
$t"
      done
      ;;
  esac

  # docs/ 仕様書の変更 → 対応する実装・テスト
  case "$f" in
    docs/*_SPEC.md)
      spec_key=$(basename "$f" | sed 's/_SPEC\.md//' | tr '[:upper:]' '[:lower:]')
      # 実装ファイル
      for impl in lib/${spec_key}*.ts lib/${spec_key}*.tsx; do
        [ -f "$impl" ] && RELATED_IMPLS="$RELATED_IMPLS
$impl"
      done
      # テスト
      for t in __tests__/unit/${spec_key}*.test.ts __tests__/api/${spec_key}*.test.ts; do
        [ -f "$t" ] && RELATED_TESTS="$RELATED_TESTS
$t"
      done
      ;;
  esac

  # テストの変更 → テスト対象の実装
  case "$f" in
    __tests__/unit/*.test.ts)
      test_key=$(basename "$f" | sed 's/\.test\.ts//')
      for impl in lib/${test_key}.ts lib/${test_key}.tsx; do
        [ -f "$impl" ] && RELATED_IMPLS="$RELATED_IMPLS
$impl"
      done
      ;;
    __tests__/api/*.test.ts)
      # テスト内で import しているルートを探す
      imports=$(grep -oh 'import.*@/app/api/[^"]*' "$f" 2>/dev/null | sed 's/.*@\///' || true)
      [ -n "$imports" ] && RELATED_IMPLS="$RELATED_IMPLS
$imports"
      ;;
  esac

  # supabase/migrations/ の変更 → RPC 呼び出し元
  case "$f" in
    supabase/migrations/*.sql)
      funcs=$(grep -oE 'FUNCTION\s+\w+' "$f" 2>/dev/null | sed 's/FUNCTION //' || true)
      for func in $funcs; do
        callers=$(grep -rl "rpc(\"${func}\"" app/ lib/ 2>/dev/null || true)
        [ -n "$callers" ] && RELATED_CALLERS="$RELATED_CALLERS
$callers"
      done
      ;;
  esac
done

# ── 結果表示（変更ファイル自身を除外） ──

print_section() {
  label="$1"
  files="$2"
  if [ -n "$files" ]; then
    unique=$(echo "$files" | tr ' ' '\n' | grep -v '^$' | sort -u)
    # 変更ファイル自身を除外
    filtered=""
    for uf in $unique; do
      is_changed=false
      for cf in $CHANGED; do
        [ "$uf" = "$cf" ] && is_changed=true
      done
      $is_changed || filtered="$filtered
$uf"
    done
    filtered=$(echo "$filtered" | grep -v '^$' || true)
    if [ -n "$filtered" ]; then
      echo ""
      echo "【${label}】"
      echo "$filtered" | while read -r line; do
        [ -n "$line" ] && echo "  → $line"
      done
    fi
  fi
}

print_section "確認すべき仕様書" "$RELATED_SPECS"
print_section "確認すべきテスト" "$RELATED_TESTS"
print_section "影響を受ける画面・コンポーネント" "$RELATED_CALLERS"
print_section "確認すべき実装" "$RELATED_IMPLS"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 何も関連がなければ警告
total="$RELATED_SPECS$RELATED_TESTS$RELATED_CALLERS$RELATED_IMPLS"
if [ -z "$(echo "$total" | tr -d '[:space:]')" ]; then
  echo "⚠ 関連ファイルが検出されませんでした。手動で影響範囲を確認してください。"
fi
