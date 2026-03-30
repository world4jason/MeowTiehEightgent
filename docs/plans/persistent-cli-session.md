# Plan: Persistent CLI Session（pexpect 持久連線）

**Date:** 2026-03-30
**Status:** Planned — 下一個 phase
**Priority:** 高（直接影響回應速度）

---

## 問題

每次 agent 回應都 spawn 新 CLI process → 初始化 → 回答 → 結束。
- Claude: ~6s（大部分是啟動）
- Gemini: ~14-27s（extension loading + 初始化）
- 每輪都重複付啟動成本

## 方案

用 `pexpect.spawn()` 保持 CLI session 活著，送 prompt 進去讀回應出來。

```python
import pexpect

class CLISession:
    def __init__(self, cmd):
        self.child = pexpect.spawn(cmd, encoding='utf-8', timeout=None)
        self.child.expect(['How can I help', '╭─', '>'])  # 等初始化完成

    def send(self, prompt):
        self.child.sendline(prompt)
        self.child.expect(['╭─', '> '], timeout=None)
        return clean_ansi(self.child.before)

    def close(self):
        self.child.sendline('/exit')
        self.child.close()
```

## 預期效果

| | 現在 | 持久 session |
|---|---|---|
| Claude 回應 | ~6s | ~2-3s |
| Gemini 回應 | ~14-27s | ~3-5s |
| 啟動成本 | 每輪 | 只付一次 |

## 架構影響（大改）

### build_prompt() 重設計

持久 session 意味著 CLI 自己管理對話歷史。不再需要每輪塞全部 context。

| 元素 | 現在（每輪送） | 持久 session |
|------|-------------|-------------|
| Agent Identity | 每輪重複注入（AGENT.md + IDENTITY.md + SOUL.md） | 啟動時設一次（或靠 CLI 的 CLAUDE.md） |
| History | 我們組裝 history_text，每輪送 | CLI 自己記住，不送 |
| Skills | 每輪注入名稱+描述 | 啟動時設一次 |
| Memory | 每輪注入 recent facts + entities | 需要時注入（新 session 開始時） |
| Kanban | 每輪注入 | 狀態改變時才送 |
| 新訊息 | 包在完整 prompt 裡 | 只送這輪的新文字 |

### 需要處理的問題

1. **雙層 context 衝突** — CLI 有自己的 system prompt（CLAUDE.md），我們也有 build_prompt。需要決定誰管 context
2. **Session 生命週期** — CLI session 掛了怎麼辦（OOM、timeout、crash）→ 自動重啟
3. **多 agent 並行** — 每個 agent 一個持久 session，需要 session pool 管理
4. **Output parsing** — 互動模式的輸出帶 ANSI codes、prompt chars（`╭─`、`>`），需要 clean
5. **Stream 支援** — 現在用 stdout readline 做 streaming，pexpect 需要不同的讀取方式
6. **Gemini 的 extension** — 互動模式下 Gemini 會載 extension，可能影響行為
7. **Token tracking** — `--output-format stream-json` 在互動模式不適用，需要其他方式追蹤 token

### 實作步驟（草案）

#### Phase 1: PoC — 單一 agent 持久 session
1. 新增 `core/cli_session.py` — `CLISession` class
2. 支援 claude 互動模式
3. 測量延遲改善
4. 處理 ANSI 清理

#### Phase 2: 整合到 WS handler
1. Session pool（per agent，lazy init）
2. `stream_agent()` 改用 CLISession
3. 處理 session 掛掉 → 自動 respawn

#### Phase 3: build_prompt 重設計
1. 拆成 `init_prompt()`（啟動時一次）+ `turn_prompt()`（每輪只送新訊息）
2. History 委託給 CLI 管理
3. Memory/Kanban 改成 delta injection（只送變化）

#### Phase 4: 全 CLI 支援
1. Gemini 互動模式
2. Codex 互動模式
3. 統一的 CLISession interface

## 替代方案

| 方案 | 優點 | 缺點 |
|------|------|------|
| **pexpect 持久 session（本方案）** | 最快改善延遲，不需 API key | 複雜度高，雙層 context |
| **直接 API（Anthropic SDK）** | 完全控制，無 CLI overhead | 需要 API key，不同計費 |
| **Claude Code SDK（Agent SDK）** | 官方方案，structured output | 可能還不成熟 |

## 依賴

- `pexpect` Python package（`pip install pexpect`）
- 各 CLI 的互動模式 prompt pattern（需要調研每個 CLI 的 prompt 格式）
