Feature: Space Mode 基本互動

  Scenario: 進入 Space mode
    Given 使用者開啟首頁
    When 使用者按下 Cmd+4
    Then 應該看到 Space mode 的 canvas

  Scenario: 走近 Agent 顯示預覽
    Given 使用者在 Space mode
    When 使用者走到 Agent 附近
    Then 應該看到 Agent 預覽卡片

  Scenario: 切換到 Chat mode
    Given 使用者在 Space mode
    When 使用者按下 Cmd+1
    Then 應該切換到 Chat mode
