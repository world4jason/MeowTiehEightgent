# Known Issues / Bug Notes

## Gemini 截斷（SubprocessTimeoutError）

**現象**：Gemini 在聊天室有時產出部分內容後出現「⚠ 截斷」badge。

**根因**：Gemini CLI 內部呼叫 `generalist` tool（或其他耗時 tool）時，stdout 數分鐘沒有新 JSONL 行輸出，觸發 `idle_timeout_seconds`。

**已知**：Gemini CLI 本身偶爾卡 3-5 分鐘。

**修正**：`idle_timeout_seconds` 從 120s 改為 600s（2026-03-20）。

**診斷方式**：`/tmp/agent_crash.log` 會記錄 IDLE TIMEOUT / EXCEPTION / exit code。

---

## uvicorn 啟動方式

`python3 app.py` 直接跑不起 server（沒有 `if __name__ == '__main__'` block）。

正確啟動：`uvicorn app:app --host 0.0.0.0 --port 8000`
