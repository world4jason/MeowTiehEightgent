# Phase 4 Implementation Plan — Cleanup + Full Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清除所有 Paperclip 殘留、完整 Docker Compose、Chat 功能補齊、雙後端整合、Settings > Agents 統一視圖

**Architecture:**
- Chat Server（Python :8000）繼續管理 filesystem agents，新增 `/api/chat/agents` endpoint
- Cowork Server（Node.js :3100）管理 DB agents，維持現有 `/api/companies/:id/agents`
- UI：Settings > Agents 同時呼叫兩端，合併顯示 Chat + Cowork agents
- Docker Compose：db + chat + cowork + ui 四個容器，一鍵啟動

**Tech Stack:** Python/FastAPI, Node.js/Hono, React 19, Vite, PostgreSQL, Docker

---

## Task 1：清除剩餘 Paperclip 殘留

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1.1: 修正 server/package.json 的 homepage/bugs/repository URL**

```json
"homepage": "https://github.com/world4jason/MeowTiehEightgent",
"bugs": {
  "url": "https://github.com/world4jason/MeowTiehEightgent/issues"
},
"repository": {
  "type": "git",
  "url": "https://github.com/world4jason/MeowTiehEightgent",
  "directory": "server"
}
```

- [ ] **Step 1.2: 驗證零殘留**

```bash
git grep -rni "paperclip" -- \
  ':!pnpm-lock.yaml' ':!ui/pnpm-lock.yaml' \
  ':!server/package.json' ':!packages/adapters/*/package.json' \
  ':!server/src/adapters/registry.ts' \
  ':!docs/superpowers/' ':!ui/packages/' \
  2>/dev/null | grep -v "hermes-paperclip-adapter"
```

Expected: 0 output lines

- [ ] **Step 1.3: Commit**

```bash
git add server/package.json
git commit -m "fix(branding): correct server/package.json repo URLs to MeowTiehEightgent"
```

---

## Task 2：Docker Compose 完整化

**Files:**
- Modify: `docker-compose.yml`
- Create: `Dockerfile.chat`
- Create: `Dockerfile.cowork`
- Create: `ui/Dockerfile`
- Create: `.env.docker.example`
- Create: `scripts/wait-for-it.sh`

### 2A：Python Chat Server Dockerfile

- [ ] **Step 2A.1: 建立 `Dockerfile.chat`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2A.2: 確認 requirements.txt 存在且完整**

```bash
pip list --format=freeze | grep -E "fastapi|uvicorn|websockets|pillow|aiofiles"
```

如果 requirements.txt 不完整，執行：
```bash
pip freeze > requirements.txt
```

### 2B：Node.js Cowork Server Dockerfile

- [ ] **Step 2B.1: 建立 `Dockerfile.cowork`**

```dockerfile
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY server/ ./server/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meowtieheightgent/db generate
EXPOSE 3100
CMD ["pnpm", "--filter", "@meowtieheightgent/server", "dev"]
```

### 2C：UI Dockerfile（dev + prod）

- [ ] **Step 2C.1: 建立 `ui/Dockerfile`**

```dockerfile
# Dev stage
FROM node:20-alpine AS dev
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# Prod build stage
FROM dev AS builder
RUN pnpm build

# Prod serve stage
FROM nginx:alpine AS prod
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 2D：更新 docker-compose.yml

- [ ] **Step 2D.1: 修改 `docker-compose.yml` 加入所有服務**

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-mth}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mth}
      POSTGRES_DB: ${POSTGRES_DB:-mth}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-mth} -d ${POSTGRES_DB:-mth}"]
      interval: 2s
      timeout: 5s
      retries: 30
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  chat:
    build:
      context: .
      dockerfile: Dockerfile.chat
    ports:
      - "${CHAT_PORT:-8000}:8000"
    volumes:
      - ./agents:/app/agents
      - ./skills:/app/skills
      - ./workspaces:/app/workspaces
      - ./config.json:/app/config.json
    environment:
      - PYTHONUNBUFFERED=1
    restart: unless-stopped

  cowork:
    build:
      context: .
      dockerfile: Dockerfile.cowork
    ports:
      - "${COWORK_PORT:-3100}:3100"
    depends_on:
      db:
        condition: service_healthy
    environment:
      - DATABASE_URL=${DATABASE_URL:-postgres://mth:mth@db:5432/mth}
      - PORT=3100
      - SERVE_UI=false
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-change-me-in-production}
      - MTH_DEPLOYMENT_MODE=${MTH_DEPLOYMENT_MODE:-local}
    volumes:
      - ./agents:/app/agents:ro
      - ./skills:/app/skills:ro
    restart: unless-stopped

  ui:
    build:
      context: ./ui
      dockerfile: Dockerfile
      target: dev
    ports:
      - "${UI_PORT:-5173}:5173"
    depends_on:
      - chat
      - cowork
    environment:
      - VITE_CHAT_URL=http://localhost:${CHAT_PORT:-8000}
      - VITE_COWORK_URL=http://localhost:${COWORK_PORT:-3100}
    volumes:
      - ./ui/src:/app/src
      - ./ui/public:/app/public
    restart: unless-stopped

volumes:
  pgdata:
```

### 2E：環境變數範本

- [ ] **Step 2E.1: 建立 `.env.docker.example`**

```bash
# Database
POSTGRES_USER=mth
POSTGRES_PASSWORD=mth
POSTGRES_DB=mth
POSTGRES_PORT=5432

# Services
CHAT_PORT=8000
COWORK_PORT=3100
UI_PORT=5173

# Cowork Server
DATABASE_URL=postgres://mth:mth@db:5432/mth
BETTER_AUTH_SECRET=change-me-32-chars-minimum
MTH_DEPLOYMENT_MODE=local
SERVE_UI=false
```

- [ ] **Step 2F: Smoke test**

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build -d
docker compose ps
curl http://localhost:8000/health
curl http://localhost:3100/api/health
```

Expected: both health endpoints return 200

- [ ] **Step 2G: Commit**

```bash
git add docker-compose.yml Dockerfile.chat Dockerfile.cowork ui/Dockerfile .env.docker.example
git commit -m "feat(docker): complete docker-compose with chat + cowork + ui + db"
```

---

## Task 3：修復 Think Mode Bug

**Files:**
- Modify: `app.py`
- Modify: `agents/claude/config.json` (and any claude-based agent configs)

- [ ] **Step 3.1: 找到 `--extended-thinking` 的使用位置**

```bash
grep -n "extended-thinking\|effort max\|supports_thinking" app.py
```

- [ ] **Step 3.2: 修正 flag**

在 app.py 中，找到 think mode 觸發 subprocess 的地方：
- 將 `"--extended-thinking"` 改為 `"--effort", "max"`（Claude CLI 正確格式）

- [ ] **Step 3.3: 補齊 agent config**

在每個 claude-based agent 的 config.json 加入：
```json
{
  "supports_thinking": true
}
```

對 Gemini agent，think mode = 改用 `gemini-2.5-pro` model（不是 flag）

- [ ] **Step 3.4: 驗證**

啟動 chat server，開一個 Claude agent，切換到 think mode，確認 subprocess 收到 `--effort max`

- [ ] **Step 3.5: Commit**

```bash
git add app.py agents/*/config.json
git commit -m "fix(chat): correct think mode flag --effort max, add supports_thinking to claude agents"
```

---

## Task 4：History 自動壓縮（Sliding Window）

**Files:**
- Modify: `app.py`（或新建 `chat/history.py`）

**設計：**
```
MAX_HISTORY_ROUNDS = 30  (可在 config.json 設定)
當 history 超過 MAX_HISTORY_ROUNDS 輪時：
  保留最近 MAX_HISTORY_ROUNDS 輪
  丟棄更早的（不做 summarization，Phase 2 再加）
```

- [ ] **Step 4.1: 找到 history 傳遞給 subprocess 的位置**

```bash
grep -n "history\|messages\|context" app.py | grep -v "#" | head -30
```

- [ ] **Step 4.2: 實作 sliding window**

```python
def apply_sliding_window(history: list, max_rounds: int = 30) -> list:
    """Keep only the most recent max_rounds conversation rounds."""
    if len(history) <= max_rounds:
        return history
    return history[-max_rounds:]
```

在 subprocess 呼叫前套用：
```python
history_to_send = apply_sliding_window(session_history, max_rounds=config.get("max_history_rounds", 30))
```

- [ ] **Step 4.3: 加入 config 支援**

在 `config.json` schema 加入 `max_history_rounds`（預設 30）

- [ ] **Step 4.4: 寫 test**

```python
def test_sliding_window_truncates():
    history = [{"role": "user", "content": f"msg{i}"} for i in range(50)]
    result = apply_sliding_window(history, max_rounds=30)
    assert len(result) == 30
    assert result[-1]["content"] == "msg49"

def test_sliding_window_passthrough():
    history = [{"role": "user", "content": "only one"}]
    result = apply_sliding_window(history, max_rounds=30)
    assert result == history
```

- [ ] **Step 4.5: Commit**

```bash
git commit -m "feat(chat): sliding window history compression (default 30 rounds)"
```

---

## Task 5：Token 追蹤

**Files:**
- Modify: `app.py`
- Modify: `ui/src/chat/MessageList.tsx` 或 `SessionSidebar.tsx`（加 token badge）

**設計：**
```
stream-json 模式：每次 subprocess 結束後解析最後一行 JSON
Claude: {"type":"result","usage":{"input_tokens":N,"output_tokens":N}}
Gemini: {"usage_metadata":{"prompt_token_count":N,"candidates_token_count":N}}
Codex:  解析 --json 輸出的 token 欄位

累計：per-agent per-session token 計數
儲存：session_data["token_usage"][agent_name] = {"input": N, "output": N}
API：GET /sessions/{id}/tokens 回傳 token summary
WS：session 結束時發送 token_summary 事件
```

- [ ] **Step 5.1: 新增 `--output-format stream-json` flag**

```python
# Claude subprocess args
args = [claude_cli, "--output-format", "stream-json", ...]
```

- [ ] **Step 5.2: 解析 token 資訊**

```python
def parse_token_usage(output_lines: list[str], model_type: str) -> dict:
    """Parse final JSON line from stream-json output for token counts."""
    for line in reversed(output_lines):
        try:
            data = json.loads(line)
            if model_type == "claude":
                if data.get("type") == "result":
                    usage = data.get("usage", {})
                    return {"input": usage.get("input_tokens", 0), "output": usage.get("output_tokens", 0)}
            elif model_type == "gemini":
                meta = data.get("usage_metadata", {})
                if meta:
                    return {"input": meta.get("prompt_token_count", 0), "output": meta.get("candidates_token_count", 0)}
        except (json.JSONDecodeError, KeyError):
            continue
    return {"input": 0, "output": 0}
```

- [ ] **Step 5.3: 累計並儲存**

在每次 agent 回應後，累計至 session_data

- [ ] **Step 5.4: WebSocket 事件 `token_update`**

```json
{
  "type": "token_update",
  "agent": "claude",
  "session_id": "xxx",
  "usage": {"input": 1234, "output": 567},
  "cumulative": {"input": 5000, "output": 2000}
}
```

- [ ] **Step 5.5: UI — Members panel token badge**

在 Members panel 每個 agent 名稱旁顯示累計 token（格式：`1.2k`）

- [ ] **Step 5.6: Commit**

```bash
git commit -m "feat(chat): token tracking via stream-json, per-agent cumulative display"
```

---

## Task 6：Python Chat Server — Chat Agents API

**目的：** 讓 UI 能透過 REST 查詢 Chat 側的 agents（filesystem-based）

**Files:**
- Modify: `app.py`（或新建 `chat/routes/agents.py`）

**新增 endpoint：**
```
GET  /api/chat/agents          → 列出所有 agents/*/config.json
GET  /api/chat/agents/{name}   → 單一 agent 詳情
```

**Response schema（與 Cowork agents 對齊的最小欄位）：**
```json
{
  "source": "chat",
  "id": "claude",
  "name": "claude",
  "emoji": "🤖",
  "color": "#7c3aed",
  "model": "claude-opus-4-5",
  "description": "General assistant",
  "agent_md_preview": "You are...(first 200 chars)",
  "memory_files": ["MEMORY.md", "memory/2026-03-21.md"],
  "skills": ["mth", "brainstorming"]
}
```

- [ ] **Step 6.1: 寫 `GET /api/chat/agents`**

```python
@app.get("/api/chat/agents")
async def list_chat_agents():
    registry = get_agent_registry()
    agents = []
    for name, config in registry.items():
        if name.startswith("_"):  # skip _default template
            continue
        agents.append({
            "source": "chat",
            "id": name,
            "name": name,
            "emoji": config.get("emoji", "🤖"),
            "color": config.get("color", "#666"),
            "model": config.get("model", ""),
            "description": config.get("description", ""),
        })
    return {"agents": agents}
```

- [ ] **Step 6.2: 寫 `GET /api/chat/agents/{name}`**

包含：config 全部欄位 + AGENT.md 前 500 字 + memory 檔案列表

- [ ] **Step 6.3: 加 CORS（已有，確認 `/api/chat/*` 也在允許範圍）**

- [ ] **Step 6.4: 寫測試**

```python
from fastapi.testclient import TestClient
from app import app

def test_list_chat_agents():
    client = TestClient(app)
    resp = client.get("/api/chat/agents")
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data
    assert all(a["source"] == "chat" for a in data["agents"])
```

- [ ] **Step 6.5: Commit**

```bash
git commit -m "feat(chat): GET /api/chat/agents endpoint for unified agent view"
```

---

## Task 7：Settings > Agents 統一視圖

**目的：** 一個頁面同時顯示 Chat agents（filesystem）和 Cowork agents（DB），清楚標示來源

**Files:**
- Create: `ui/src/pages/settings/SettingsAgents.tsx`
- Create: `ui/src/api/chatAgents.ts`
- Modify: `ui/src/App.tsx`（加路由）

**設計（UI 兩 section）：**
```
Settings > Agents

┌─ Chat Agents ─────────────────────────────────┐
│  🤖 claude    claude-opus-4-5    [Chat 標籤]   │
│  ✨ gemini    gemini-2.5-pro     [Chat 標籤]   │
└───────────────────────────────────────────────┘

┌─ Cowork Agents ───────────────────────────────┐
│  💼 Backend Dev    claude_local  [Cowork 標籤] │
│  🎨 UI Agent       codex_local   [Cowork 標籤] │
└───────────────────────────────────────────────┘
```

- [ ] **Step 7.1: 建立 `ui/src/api/chatAgents.ts`**

```typescript
const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";

export interface ChatAgent {
  source: "chat";
  id: string;
  name: string;
  emoji: string;
  color: string;
  model: string;
  description: string;
}

export async function listChatAgents(): Promise<ChatAgent[]> {
  const res = await fetch(`${CHAT_URL}/api/chat/agents`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.agents ?? [];
}
```

- [ ] **Step 7.2: 建立 `ui/src/pages/settings/SettingsAgents.tsx`**

```tsx
import { useEffect, useState } from "react";
import { listChatAgents, type ChatAgent } from "@/api/chatAgents";
import { useAgents } from "@/api/agents";  // existing Cowork agents hook

export function SettingsAgents() {
  const [chatAgents, setChatAgents] = useState<ChatAgent[]>([]);
  const coworkAgents = useAgents();  // from existing Cowork API

  useEffect(() => {
    listChatAgents().then(setChatAgents);
  }, []);

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold">Agents</h1>

      {/* Chat Agents Section */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Chat Agents</h2>
        <div className="grid gap-2">
          {chatAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} badge="Chat" badgeColor="blue" />
          ))}
        </div>
      </section>

      {/* Cowork Agents Section */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Cowork Agents</h2>
        <div className="grid gap-2">
          {coworkAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} badge="Cowork" badgeColor="violet" />
          ))}
        </div>
      </section>
    </div>
  );
}
```

`AgentCard` 顯示：emoji + name + model/adapterType + source badge

- [ ] **Step 7.3: 在 App.tsx 加路由**

在 `/instance/settings/` 下加入：
```tsx
{ path: "agents", element: <SettingsAgents /> }
```

在 settings sidebar/nav 加入 "Agents" 連結

- [ ] **Step 7.4: 寫測試**

```typescript
// src/pages/settings/__tests__/SettingsAgents.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/api/chatAgents", () => ({
  listChatAgents: vi.fn().mockResolvedValue([
    { source: "chat", id: "claude", name: "claude", emoji: "🤖", color: "#7c3aed", model: "claude-opus-4-5", description: "" }
  ])
}));

it("shows chat and cowork sections", async () => {
  render(<SettingsAgents />);
  await waitFor(() => screen.getByText("Chat Agents"));
  expect(screen.getByText("claude")).toBeInTheDocument();
  expect(screen.getByText("Cowork Agents")).toBeInTheDocument();
});
```

- [ ] **Step 7.5: Commit**

```bash
git add ui/src/pages/settings/SettingsAgents.tsx ui/src/api/chatAgents.ts ui/src/App.tsx
git commit -m "feat(ui): Settings > Agents unified view (Chat + Cowork agents)"
```

---

## Task 8：最終整合驗證

- [ ] **Step 8.1: 全端測試**

```bash
# UI tests
cd ui && npx vitest run

# Server tests
cd server && pnpm vitest run

# Python tests (if any)
cd .. && python -m pytest tests/ -v 2>/dev/null || echo "no pytest"
```

Expected: UI 164+ tests pass, Server 428+ tests pass

- [ ] **Step 8.2: Docker 整合測試**

```bash
docker compose up --build -d
sleep 15
curl http://localhost:8000/health
curl http://localhost:3100/api/health
curl http://localhost:8000/api/chat/agents
```

- [ ] **Step 8.3: 手動驗證 Settings > Agents**

瀏覽器開 http://localhost:5173 → Settings → Agents
確認：Chat agents 和 Cowork agents 都顯示

- [ ] **Step 8.4: 最終 paperclip 清零驗證**

```bash
git grep -rni "paperclip" -- \
  ':!pnpm-lock.yaml' ':!ui/pnpm-lock.yaml' \
  ':!server/package.json' ':!packages/adapters/*/package.json' \
  ':!server/src/adapters/registry.ts' \
  ':!docs/superpowers/' ':!ui/packages/' \
  2>/dev/null | grep -v "hermes-paperclip-adapter"
```

Expected: 0 lines

- [ ] **Step 8.5: 最終 commit + push + PR**

```bash
git add -A
git commit -m "chore: Phase 4 complete — cleanup + docker + chat features + unified agents"
git push
gh pr create --title "feat: Phase 4 — cleanup, full Docker, chat features, unified agents view" --body "..."
```

---

## 完成標準

| 項目 | 驗收標準 |
|------|----------|
| Paperclip 清除 | `git grep paperclip` 零輸出（除豁免清單）|
| Docker | `docker compose up` → 四個容器全健康 |
| Think mode | Claude agent 在 think mode 下 subprocess 收到 `--effort max` |
| History | 超過 30 輪時自動截斷，不丟前段完整對話 |
| Token | Session 成員旁顯示累計 token；WS 有 `token_update` 事件 |
| Chat Agents API | `GET /api/chat/agents` 200 回應，含所有 agents/ 資料夾 |
| Settings > Agents | 頁面同時顯示 Chat（blue badge）+ Cowork（violet badge）agents |
| 測試 | UI 164+ / Server 428+ 全過 |
