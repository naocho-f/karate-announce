# WebアプリからClaude Agent SDKを統合してコード修正を自動化するシステム — 実装仕様書

## 1. プロジェクト概要

### 目的
自作のWebアプリのUI上にあるボタンをクリックすることで、バックエンドからClaude Agent SDK（旧称 Claude Code SDK）を呼び出し、事前に定義したフローに沿ってコードの修正・リファクタリング・テスト実行などを自動で行うシステムを構築する。

### 基本アーキテクチャ

```
┌──────────────────┐     WebSocket / HTTP     ┌────────────────────────┐
│  フロントエンド    │ ◄──────────────────────► │  バックエンド (API)      │
│  (React等)       │                          │  (FastAPI / Express)    │
│                  │                          │                        │
│  - フロー選択UI   │                          │  - Claude Agent SDK     │
│  - 実行ボタン     │                          │  - 権限制御ロジック       │
│  - 承認ダイアログ  │                          │  - ジョブ管理            │
│  - ログ表示       │                          │  - WebSocket通信         │
└──────────────────┘                          └───────────┬────────────┘
                                                          │
                                                          ▼
                                                ┌──────────────────┐
                                                │  対象プロジェクト   │
                                                │  (ローカルリポ)     │
                                                └──────────────────┘
```

---

## 2. 技術スタック

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | React / Next.js / 任意 | WebSocket対応が必要 |
| バックエンド | **Python (FastAPI)** を推奨 | Claude Agent SDK (Python) との親和性が高い |
| Agent SDK | `claude-agent-sdk` (Python) | `pip install claude-agent-sdk` |
| リアルタイム通信 | WebSocket | ストリーミング出力・承認リクエストの双方向通信 |
| 認証 | Anthropic API Key | 環境変数 `ANTHROPIC_API_KEY` |

> **Note**: TypeScript SDK (`@anthropic-ai/claude-agent-sdk`)も利用可能。バックエンドがNode.js/Expressの場合はそちらを使う。

---

## 3. Claude Agent SDK の基本的な使い方

### 3.1 最小構成

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def run_agent(prompt: str, project_dir: str):
    async for message in query(
        prompt=prompt,
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Bash", "Glob", "Grep"],
            cwd=project_dir,
        ),
    ):
        if hasattr(message, "result"):
            return message.result
```

### 3.2 主要なビルトインツール

| ツール名 | 機能 | リスク |
|---------|------|-------|
| `Read` | ファイル読み取り | 低 |
| `Glob` | ファイルパターン検索 | 低 |
| `Grep` | テキスト検索 | 低 |
| `Edit` | ファイルの部分編集 | 中 |
| `Write` | ファイルの新規作成・上書き | 中 |
| `MultiEdit` | 複数箇所の同時編集 | 中 |
| `Bash` | シェルコマンド実行 | **高** |

---

## 4. 権限制御（Permission System）

### 4.1 処理順序

SDKの権限チェックは以下の順序で評価される:

```
PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules
→ Permission Mode Check → canUseTool Callback → PostToolUse Hook
```

### 4.2 Permission Mode 一覧

| モード | 動作 | ユースケース |
|--------|------|-------------|
| `default` | 全ツールが `canUseTool` コールバック経由で承認を求める | ユーザー確認が必要な場合 |
| `acceptEdits` | Edit/Write/MultiEdit を自動承認、Bashなどは確認 | 一般的な開発フロー |
| `bypassPermissions` | 全ツール自動承認（確認なし） | 完全自動化・CI/CD向け。**要注意** |
| `plan` | Claudeが計画を提示 → ユーザー承認後に実行 | 慎重な操作向け |
| `dontAsk` (TS only) | allowed_tools以外は全拒否（コールバック不要） | ロックダウン環境 |

### 4.3 推奨構成：ハイブリッドアプローチ

```python
from claude_agent_sdk import (
    query, ClaudeAgentOptions,
    PermissionResultAllow, PermissionResultDeny
)

async def permission_handler(tool_name: str, tool_input: dict, context):
    """
    Read/Glob/Grep → 自動許可
    Edit/Write      → 自動許可 (acceptEditsモード相当)
    Bash            → 内容に応じて判断
    """
    # 読み取り系は常に許可
    if tool_name in ["Read", "Glob", "Grep"]:
        return PermissionResultAllow()

    # 危険なコマンドは即拒否
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        dangerous_patterns = ["rm -rf", "sudo", "curl | bash", "> /dev/"]
        if any(p in command for p in dangerous_patterns):
            return PermissionResultDeny(message=f"危険なコマンドを検出: {command}")

        # その他のBashコマンドはWebアプリ経由でユーザーに確認
        # → WebSocketで承認リクエストをフロントに送り、応答を待つ
        approved = await request_user_approval(
            tool_name=tool_name,
            detail=command,
        )
        if approved:
            return PermissionResultAllow()
        else:
            return PermissionResultDeny(message="ユーザーが拒否しました")

    # Edit系はデフォルト許可
    return PermissionResultAllow()
```

### 4.4 AskUserQuestion（Claude側からの質問）

Claudeがタスク遂行中にユーザーに質問したい場合（例：「TypeScriptとPythonどちらで実装しますか？」）、`AskUserQuestion` ツールが発火する。これも `canUseTool` コールバックで受け取れる。

```python
async def permission_handler(tool_name, tool_input, context):
    if tool_name == "AskUserQuestion":
        questions = tool_input.get("questions", [])
        # フロントエンドに質問を転送し、ユーザーの回答を待つ
        answers = await forward_questions_to_frontend(questions)
        return PermissionResultAllow(
            updated_input={**tool_input, "answers": answers}
        )
    # ... 他のツール処理
```

---

## 5. 事前定義フロー（ワークフロー）

### 5.1 フローの定義方法

フローはプロンプトテンプレートとして管理する。各フローに名前・説明・プロンプト・許可ツール・権限モードを持たせる。

```python
from dataclasses import dataclass

@dataclass
class WorkflowDefinition:
    id: str
    name: str            # UI表示用
    description: str     # UI表示用
    prompt_template: str # プロンプトテンプレート（{target_file}等のプレースホルダー可）
    allowed_tools: list[str]
    permission_mode: str  # "default" | "acceptEdits" | "bypassPermissions"
    requires_approval: bool  # Bashコマンド等でユーザー確認が必要か


# フロー定義の例
WORKFLOWS = {
    "lint_fix": WorkflowDefinition(
        id="lint_fix",
        name="Lint修正",
        description="ESLint/Pylintのエラーを自動修正する",
        prompt_template=(
            "プロジェクトディレクトリ内でLinterを実行し、"
            "検出されたエラーを全て修正してください。"
            "修正後に再度Linterを実行し、エラーが0になることを確認してください。"
        ),
        allowed_tools=["Read", "Edit", "MultiEdit", "Bash", "Glob", "Grep"],
        permission_mode="acceptEdits",
        requires_approval=False,
    ),
    "refactor": WorkflowDefinition(
        id="refactor",
        name="リファクタリング",
        description="指定ファイルをリファクタリングする",
        prompt_template=(
            "以下のファイルをリファクタリングしてください: {target_file}\n\n"
            "リファクタリングの方針:\n"
            "- 関数の責務を単一にする\n"
            "- 重複コードを共通化する\n"
            "- 型アノテーションを追加する\n"
            "- 変更後にテストが通ることを確認する"
        ),
        allowed_tools=["Read", "Edit", "MultiEdit", "Bash", "Glob", "Grep"],
        permission_mode="acceptEdits",
        requires_approval=True,  # テスト実行時にBash確認
    ),
    "test_fix": WorkflowDefinition(
        id="test_fix",
        name="テスト修正",
        description="テストを実行し、失敗しているテストを修正する",
        prompt_template=(
            "以下の手順で進めてください:\n"
            "1. テストスイートを実行して失敗しているテストを特定する\n"
            "2. 失敗の原因を分析する\n"
            "3. テストコードまたはプロダクションコードを修正する\n"
            "4. テストを再実行して全てパスすることを確認する\n"
            "テスト実行コマンド: {test_command}"
        ),
        allowed_tools=["Read", "Edit", "MultiEdit", "Bash", "Glob", "Grep"],
        permission_mode="acceptEdits",
        requires_approval=True,
    ),
    "code_review": WorkflowDefinition(
        id="code_review",
        name="コードレビュー",
        description="コードを読み取り、レビューコメントを返す（変更なし）",
        prompt_template=(
            "以下のファイルをレビューしてください: {target_file}\n\n"
            "以下の観点でチェックし、問題点と改善提案をまとめてください:\n"
            "- バグの可能性\n"
            "- セキュリティリスク\n"
            "- パフォーマンス問題\n"
            "- 可読性・保守性\n\n"
            "コードの修正は行わず、レビューコメントのみ出力してください。"
        ),
        allowed_tools=["Read", "Glob", "Grep"],  # 読み取りのみ
        permission_mode="default",
        requires_approval=False,
    ),
}
```

### 5.2 カスタムフロー

ユーザーがUIからプロンプトと設定を自由に入力してフローを作成・保存できるようにすることも推奨。DBに保存すれば再利用可能。

---

## 6. バックエンド実装

### 6.1 FastAPI サーバー構成

```
backend/
├── main.py              # FastAPIエントリポイント
├── workflows.py         # フロー定義
├── agent_runner.py      # Claude Agent SDK呼び出しロジック
├── websocket_manager.py # WebSocket接続管理
├── models.py            # リクエスト/レスポンス型定義
└── config.py            # 環境変数・設定
```

### 6.2 エントリポイント（main.py）

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

app = FastAPI()

class WorkflowRequest(BaseModel):
    workflow_id: str
    project_dir: str
    params: dict = {}  # target_file, test_command 等

@app.websocket("/ws/agent/{client_id}")
async def agent_websocket(websocket: WebSocket, client_id: str):
    await websocket.accept()
    manager = WebSocketManager(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start_workflow":
                # ワークフロー実行開始
                request = WorkflowRequest(**data["payload"])
                await run_workflow(request, manager)

            elif action == "approval_response":
                # ユーザーの承認/拒否の応答
                manager.resolve_approval(
                    request_id=data["request_id"],
                    approved=data["approved"],
                )

            elif action == "question_response":
                # AskUserQuestionへの回答
                manager.resolve_question(
                    request_id=data["request_id"],
                    answers=data["answers"],
                )

    except WebSocketDisconnect:
        pass
```

### 6.3 Agent実行ロジック（agent_runner.py）

```python
import asyncio
import uuid
from claude_agent_sdk import (
    query, ClaudeAgentOptions,
    PermissionResultAllow, PermissionResultDeny,
    AssistantMessage, ResultMessage
)
from workflows import WORKFLOWS

async def run_workflow(request: WorkflowRequest, ws_manager: WebSocketManager):
    workflow = WORKFLOWS[request.workflow_id]

    # プロンプトテンプレートにパラメータを埋め込む
    prompt = workflow.prompt_template.format(**request.params)

    # 権限ハンドラを生成
    permission_handler = create_permission_handler(workflow, ws_manager)

    # Agent SDK実行
    try:
        await ws_manager.send_event("workflow_started", {
            "workflow_id": workflow.id,
            "workflow_name": workflow.name,
        })

        async for message in query(
            prompt=prompt,
            options=ClaudeAgentOptions(
                allowed_tools=workflow.allowed_tools,
                permission_mode=workflow.permission_mode,
                cwd=request.project_dir,
                can_use_tool=permission_handler,
            ),
        ):
            # ストリーミングでフロントにメッセージを転送
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if hasattr(block, "text"):
                        await ws_manager.send_event("agent_text", {
                            "text": block.text,
                        })
                    elif hasattr(block, "name"):
                        await ws_manager.send_event("tool_use", {
                            "tool": block.name,
                            "input": getattr(block, "input", {}),
                        })

            elif isinstance(message, ResultMessage):
                await ws_manager.send_event("workflow_completed", {
                    "result": getattr(message, "subtype", "success"),
                })

    except Exception as e:
        await ws_manager.send_event("workflow_error", {
            "error": str(e),
        })


def create_permission_handler(workflow, ws_manager):
    async def handler(tool_name: str, tool_input: dict, context):
        # 読み取り系は常に許可
        if tool_name in ["Read", "Glob", "Grep"]:
            return PermissionResultAllow()

        # AskUserQuestion → フロントに転送
        if tool_name == "AskUserQuestion":
            questions = tool_input.get("questions", [])
            request_id = str(uuid.uuid4())
            answers = await ws_manager.request_question_answer(
                request_id=request_id,
                questions=questions,
            )
            return PermissionResultAllow(
                updated_input={**tool_input, "answers": answers}
            )

        # Bashコマンドの承認
        if tool_name == "Bash" and workflow.requires_approval:
            command = tool_input.get("command", "")

            # 危険パターンは即拒否
            dangerous = ["rm -rf /", "sudo rm", ":(){ :|:& };:"]
            if any(d in command for d in dangerous):
                return PermissionResultDeny(message="危険なコマンドをブロックしました")

            # ユーザーに確認
            request_id = str(uuid.uuid4())
            approved = await ws_manager.request_approval(
                request_id=request_id,
                tool_name=tool_name,
                detail=command,
            )
            if approved:
                return PermissionResultAllow()
            else:
                return PermissionResultDeny(message="ユーザーが拒否しました")

        return PermissionResultAllow()

    return handler
```

### 6.4 WebSocket管理（websocket_manager.py）

```python
import asyncio

class WebSocketManager:
    def __init__(self, websocket):
        self.websocket = websocket
        self._pending_approvals: dict[str, asyncio.Future] = {}
        self._pending_questions: dict[str, asyncio.Future] = {}

    async def send_event(self, event_type: str, data: dict):
        await self.websocket.send_json({
            "type": event_type,
            **data,
        })

    async def request_approval(self, request_id: str, tool_name: str, detail: str) -> bool:
        """フロントに承認リクエストを送り、応答を待つ"""
        future = asyncio.get_event_loop().create_future()
        self._pending_approvals[request_id] = future

        await self.send_event("approval_request", {
            "request_id": request_id,
            "tool_name": tool_name,
            "detail": detail,
        })

        # ユーザーの応答を待つ（タイムアウト付き）
        try:
            return await asyncio.wait_for(future, timeout=300)  # 5分
        except asyncio.TimeoutError:
            return False  # タイムアウト時は拒否
        finally:
            self._pending_approvals.pop(request_id, None)

    def resolve_approval(self, request_id: str, approved: bool):
        """フロントからの承認応答を処理"""
        future = self._pending_approvals.get(request_id)
        if future and not future.done():
            future.set_result(approved)

    async def request_question_answer(self, request_id: str, questions: list) -> dict:
        """Claudeからの質問をフロントに転送し、回答を待つ"""
        future = asyncio.get_event_loop().create_future()
        self._pending_questions[request_id] = future

        await self.send_event("question_request", {
            "request_id": request_id,
            "questions": questions,
        })

        try:
            return await asyncio.wait_for(future, timeout=300)
        except asyncio.TimeoutError:
            return {}
        finally:
            self._pending_questions.pop(request_id, None)

    def resolve_question(self, request_id: str, answers: dict):
        future = self._pending_questions.get(request_id)
        if future and not future.done():
            future.set_result(answers)
```

---

## 7. フロントエンド実装

### 7.1 WebSocketメッセージ仕様

#### クライアント → サーバー

```jsonc
// ワークフロー実行開始
{
  "action": "start_workflow",
  "payload": {
    "workflow_id": "refactor",
    "project_dir": "/home/user/my-project",
    "params": {
      "target_file": "src/auth.py"
    }
  }
}

// 承認応答
{
  "action": "approval_response",
  "request_id": "uuid-xxx",
  "approved": true
}

// 質問への回答
{
  "action": "question_response",
  "request_id": "uuid-xxx",
  "answers": {
    "どのテストフレームワークを使いますか？": "pytest"
  }
}
```

#### サーバー → クライアント

```jsonc
// ワークフロー開始通知
{ "type": "workflow_started", "workflow_id": "refactor", "workflow_name": "リファクタリング" }

// Claudeのテキスト出力（ストリーミング）
{ "type": "agent_text", "text": "auth.pyを分析しています..." }

// ツール使用通知
{ "type": "tool_use", "tool": "Edit", "input": { "file_path": "src/auth.py", ... } }

// 承認リクエスト（ダイアログ表示が必要）
{
  "type": "approval_request",
  "request_id": "uuid-xxx",
  "tool_name": "Bash",
  "detail": "pytest tests/ -v"
}

// Claudeからの質問（選択肢UI表示が必要）
{
  "type": "question_request",
  "request_id": "uuid-xxx",
  "questions": [
    {
      "question": "どのテストフレームワークを使いますか？",
      "options": [
        { "label": "pytest", "description": "Python標準的なテストフレームワーク" },
        { "label": "unittest", "description": "Python組み込みのテストライブラリ" }
      ]
    }
  ]
}

// 完了
{ "type": "workflow_completed", "result": "success" }

// エラー
{ "type": "workflow_error", "error": "エラーメッセージ" }
```

### 7.2 フロントのUI要素

1. **フロー選択画面** — 定義済みワークフローの一覧をカード形式で表示。各カードに名前・説明・実行ボタン
2. **パラメータ入力** — フローに必要なパラメータ（ファイルパス、テストコマンド等）の入力フォーム
3. **実行ログ表示** — `agent_text` と `tool_use` をリアルタイムで表示するログパネル
4. **承認ダイアログ** — `approval_request` 受信時にモーダル表示。コマンド内容を表示し「許可」「拒否」ボタン
5. **質問ダイアログ** — `question_request` 受信時に選択肢UIを表示
6. **ステータス表示** — 実行中 / 承認待ち / 完了 / エラー

---

## 8. セキュリティ考慮事項

### 8.1 必須対策

- **APIキーはバックエンド側の環境変数のみで管理**。フロントに露出させない
- **`project_dir` のバリデーション** — 許可されたディレクトリ以外を指定できないようにする（パストラバーサル防止）
- **危険コマンドのブロックリスト** — `rm -rf /`, `sudo`, `curl | sh` 等を `canUseTool` で拒否
- **タイムアウト設定** — 承認待ちとジョブ実行の両方にタイムアウトを設ける
- **同時実行制限** — 同一プロジェクトへの並列実行を防ぐ（ファイル競合防止）

### 8.2 推奨対策

- Git worktree / ブランチを自動作成してからフローを実行し、変更を隔離する
- 実行前に `git stash` or `git checkout -b agent/task-xxx` で安全ネットを張る
- サンドボックス環境での実行（Docker等）
- 実行ログの永続化（監査用）

---

## 9. 拡張案

| 機能 | 説明 |
|------|------|
| **Hooks** | `PreToolUse` / `PostToolUse` フックでSlack通知やログ記録を挟む |
| **カスタムツール** | `@tool` デコレータで独自ツール（デプロイ、DB操作等）を定義しClaude に提供 |
| **マルチエージェント** | サブエージェントを使い「レビュー担当」「修正担当」「テスト担当」を分離 |
| **構造化出力** | `--output-format json --json-schema` でClaude の出力をスキーマに従わせる |
| **File Checkpointing** | SDKのファイルチェックポイント機能で変更前の状態を自動バックアップ・ロールバック可能に |
| **セッション管理** | V2 Session API（`unstable_v2_*`）でマルチターン会話とセッション永続化 |

---

## 10. セットアップ手順

```bash
# 1. Claude Agent SDK (Python) インストール
pip install claude-agent-sdk

# 2. APIキー設定
export ANTHROPIC_API_KEY="sk-ant-xxxxx"

# 3. バックエンド依存関係
pip install fastapi uvicorn websockets

# 4. 起動
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 11. 参考リンク

- Agent SDK 公式ドキュメント: https://platform.claude.com/docs/en/agent-sdk/overview
- クイックスタート: https://platform.claude.com/docs/en/agent-sdk/quickstart
- 権限制御: https://platform.claude.com/docs/en/agent-sdk/permissions
- ユーザー承認・入力: https://platform.claude.com/docs/en/agent-sdk/user-input
- カスタムツール: https://platform.claude.com/docs/en/agent-sdk/custom-tools
- Python SDK リファレンス: https://platform.claude.com/docs/en/agent-sdk/python
- デモリポジトリ (React+Express例あり): https://github.com/anthropics/claude-agent-sdk-demos
