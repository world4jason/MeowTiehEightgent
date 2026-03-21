# Message Queue — 設計規格

> 日期：2026-03-17
> 狀態：已實作

---

## 一、問題背景

Multi-agent 聊天室裡，agent 回覆需要 10–30 秒。
原本的做法：人類輸入的訊息**立刻送出** → backend 塞進 `pending_humans[]` → agent 跑完才處理。

這帶來兩個問題：
1. 訊息一送就定了，無法修改
2. stop 按鈕必須等 N 個 re-queued human 事件跑完才能生效（已修）

---

## 二、現在的設計：Client-side Queue

```
Human 輸入訊息
        │
        ▼
  thinkingEl 存在？（有 agent 正在回覆）
        │
   Yes ─┤──── push to msgQueue[]
        │     addMessage(..., queued=true)   ← 顯示 "queued" bubble
        │     renderQueuePanel()             ← 顯示 queue 面板
        │     return                         ← 不送 WS
        │
   No ──┴──── ws.send({type:'human'})        ← 直接送出
              addMessage(..., queued=false)
```

---

## 三、Queue Panel UI

```
┌─────────────────────────────────────────────┐
│ ↓ 2 Queued                                  │
│  ○  @claude 談等等為啥是兩個？     ✏  ✕    │
│  ○  gogo                          ✏  ↑  ✕  │
└─────────────────────────────────────────────┘
```

| 按鈕 | 行為 |
|------|------|
| ✏   | `prompt()` 編輯文字，同步更新已顯示的 bubble |
| ↑   | swap 陣列順序（bubble 位置不變，送出順序改變）|
| ✕   | 從 msgQueue[] 移除 + 從 DOM 移除 bubble |

---

## 四、自動送出時機

```
Backend  →  message_end
Frontend →  finalizeStreamingMessage()  → render markdown
         →  flushMsgQueue()
                │
                ├── msgQueue 為空？→ 結束
                │
                └── 取 msgQueue[0]
                      ├── 更新 bubble（移除 queued 樣式）
                      ├── renderQueuePanel()（更新計數）
                      └── ws.send({type:'human', text})  ← 現在才真的送
```

---

## 五、完整時序範例

```
t=0s   User: "你們討論台股"           → ws.send 立即送出（沒有 agent 在跑）
t=0s   Backend: thinking (claude)
t=0s   Frontend: addThinking()

t=5s   User: "@claude 你怎麼看 HBM？" → thinkingEl 存在 → 進 queue[0]
t=7s   User: "gogo"                   → 進 queue[1]

       Queue panel:
         ↓ 2 Queued
         ○  @claude 你怎麼看 HBM？   ✏  ✕
         ○  gogo                     ✏  ↑  ✕

t=22s  Backend: message_end (claude 回完了)
       Frontend: finalizeStreamingMessage() → render markdown
       Frontend: flushMsgQueue()
         → pop queue[0]: "@claude 你怎麼看 HBM？"
         → bubble 移除 queued 樣式
         → ws.send({type:'human', text: "@claude 你怎麼看 HBM？"})

       Queue panel:
         ↓ 1 Queued
         ○  gogo                     ✏  ✕

t=22s  Backend: thinking (claude，因為 @claude mention)
       ...
t=40s  Backend: message_end
       Frontend: flushMsgQueue()
         → pop queue[0]: "gogo"
         → ws.send(...)
```

---

## 六、與 Backend 的關係

| 機制 | 用途 |
|------|------|
| Frontend `msgQueue[]` | Client-side buffer，可編輯/刪除，agent 跑完才送 |
| Backend `pending_humans[]` | 已送到 WS 後、在 streaming 期間到達的訊息（例如從另一個頁面送進來）|

兩者共存但通常不會同時觸發：正常使用下 frontend 先 buffer，送出時 agent 已跑完，backend 會直接在下一輪處理，不會進 `pending_humans`。

---

## 七、Stop 行為

- Stop 時 queue 不自動清除
- 使用者可以手動 ✕ 刪掉，或繼續下一次 session 時這些訊息會被保留
- 目前 queue 不跨 reload 持久化（reload = 清空）

---

## 八、未來可做

- Queue 項目拖拉排序
- 每個 queue 項目可附加不同 attachments
- Queue 狀態 persist 到 localStorage
