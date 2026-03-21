# Sidebar Arc-Style 重設計

> 日期：2026-03-17
> 狀態：規劃完成，待實作

---

## 一、設計目標

參考 Arc 瀏覽器 sidebar 佈局，將工作區資料夾與 session 整合成**一條連續可 scroll 的清單**，消除現有的「header 大按鈕 + RECENT 標題 + 列表」三段式切割感。

---

## 二、對應關係

| Arc | 本 app |
|-----|--------|
| Space folder（購物、remains） | 工作區（Workspace） |
| Tab inside folder | 工作區內的 session |
| `+ New Tab`（folder 內底部） | `＋ 新增對話`（folder 內底部） |
| Unfoldered tabs（folder 外） | 獨立 session（workspace_id = null） |
| `+ New Tab`（全域，最底部） | `＋ New session`（sidebar 底部固定） |

---

## 三、Layout

```
┌─────────────────────────┐
│                         │  ← 可 scroll（flex: 1）
│  📁 Data / MLE / Arch   │  workspace folder（closed ▶）
│                         │
│  📂 General      ▼      │  workspace folder（open）
│     🤖 Session A        │    ↳ 縮排 session（agent emoji 當 icon）
│     🧠 Session B        │
│     ─────────────────   │    ↳ 細分隔線
│     ＋ 新增對話         │    ↳ 新增按鈕
│                         │
│  ＋ 新增工作區          │  ← 最後工作區下面
│  ─────────────────────  │  ← 分隔線（有 workspace 才顯示）
│  🗒 Session C（獨立）   │  無工作區的 session
│  🗒 Session D（獨立）   │
│                         │
├─────────────────────────┤  ← 固定 footer
│  📂 General（當前）     │  選中工作區時顯示 badge（可點 ✕ 取消）
│  ＋ New session         │  全域新增
│  ⚙ 設定                │
└─────────────────────────┘
```

---

## 四、視覺細節

### Folder（工作區）
- **Close 狀態**：灰色資料夾圖示 + 名稱（正常字重）+ ▶（右側小箭頭）
- **Open 狀態**：藍色/accent 色開放資料夾圖示 + 名稱（稍粗字重）+ ▼
- **選中 + Open**：folder 名稱為 accent color，背景略微提亮
- 點資料夾名稱 → `selectWorkspace(id)` + 展開 + 跳到 Welcome（標題換為工作區名）
- 點 ▶/▼ arrow → **只** toggle 展開/收合，不切換 selectedWorkspace

### Session item（folder 內）
- 縮排 24px
- 左側小點或 agent emoji（取第一個發言 agent 的 emoji，否則 🗒）
- 文字 truncate
- hover 顯示下載/刪除按鈕

### `＋ 新增對話`（folder 內）
- 位置：folder 內容最後，細線分隔線上方
- 點擊 → `selectWorkspace(id)` + `showWelcome()`
- 樣式：淡色 `+`，hover 變 accent

### `＋ 新增工作區`（全域）
- 位置：所有 workspace folder 後、分隔線前
- 樣式：同 `＋ 新增對話`，但縮排 0
- 點擊 → 開啟 settings 工作區 tab 並自動打開新增表單

### 分隔線
- 只有「有 workspace」且「有獨立 session」時才顯示
- 高度 1px，顏色 var(--border)，margin 6px 4px

### Footer（固定）
- `ws-context` badge：選中工作區時顯示名稱 + ✕；否則隱藏
- `＋ New session`：全域新增，`showWelcome()`
- `⚙ 設定`：開設定 overlay

---

## 五、展開/收合狀態

- **預設**：所有 workspace folder 預設展開
- **State**：`openFolders = new Set()`，儲存已展開的 workspace id
- **Toggle**：只有點 arrow 才 toggle；點 folder 名稱 → 強制展開（不收合）
- **Persist**：不需要跨頁持久（reload 後全部展開即可）

---

## 六、要改的地方

### CSS
- `.ws-folder-header`：open/closed 兩種狀態（icon 顏色、字重）
- `.ws-folder-toggle`：只有 arrow，用 CSS `transform: rotate` 切換
- `.ws-new-session-btn`：folder 內底部按鈕（帶細線）
- `.ws-add-row`：全域新增工作區按鈕
- `.ws-divider`：工作區 / 獨立 session 分隔線

### JS — `loadSessions()`
完整重寫 folder render：
1. 遍歷 `workspaceData`，每個 workspace 建立 folder element
2. 若 `openFolders.has(ws.id)` → render session list + `＋ 新增對話`
3. 若收合 → 只顯示 header
4. 最後 render `＋ 新增工作區` 按鈕
5. 若有獨立 session → render 分隔線 + session list

### JS — `selectWorkspace(id)`
- 若 `id !== null` → `openFolders.add(id)`（強制展開）
- 更新 ws-context badge
- 呼叫 `showWelcome()`
- 呼叫 `loadSessions()`（重繪，更新 selected 高亮）

### JS — `toggleWsFolder(wsId)`
- Toggle `openFolders.has(wsId)`
- 呼叫 `loadSessions()`

### HTML Sidebar
```html
<div id="sidebar">
  <div id="session-list"></div>   <!-- 唯一的 scroll 區域 -->
  <div id="sidebar-footer">
    <div id="ws-context">...</div>
    <button id="new-session-btn">＋ New session</button>
    <button id="settings-btn">⚙ 設定</button>
  </div>
</div>
```

---

## 七、不在這次範圍內

- Session icon 顯示真實 agent emoji（目前用 🗒 placeholder）→ 後續優化
- Folder 拖拉排序
- Session 在 folder 之間移動（drag-drop）
- 工作區顏色自定義

---

## 八、實作順序

1. CSS 全部寫好（folder open/closed、indent、按鈕樣式）
2. `loadSessions()` 重寫（含 `openFolders` state）
3. `selectWorkspace()` / `toggleWsFolder()` 更新
4. Sidebar HTML 簡化
5. 測試 + commit
