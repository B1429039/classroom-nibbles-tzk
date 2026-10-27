# 方案一：將 3D 遊戲畫面改為 2D 俯視畫面

## 使用者需求

降低 3D 透視、光影和模型角度造成的視覺差異，讓遊戲物件更容易辨識。

保留原本的：

- 蛇形機甲移動
- 碰撞規則
- 單字收集
- 道具與武器
- 打字測驗
- 關卡流程

只改變畫面的呈現方式。

## 修改檔案

- `src/core/Game.ts`
- 新增 `src/rendering/TwoDimensionalScene.ts`
- `src/styles/main.css`
- `src/ui/GameHud.ts`
- `src/rendering/PhaseThreeScene.ts`
- `src/rendering/SnakeView.ts`
- `src/rendering/TokenView.ts`
- `src/rendering/PowerUpView.ts`
- `src/rendering/BulletView.ts`
- `src/rendering/EnvironmentView.ts`
- `SPEC.md`
- `README.md`
- `CHANGELOG.md`

## 預估風險

高。

目前主程式與 Three.js 場景有直接關聯，改成 Canvas 2D 可能影響畫布尺寸、物件位置、動畫和測試。本次以新增 `TwoDimensionalScene` 並替換主程式的渲染入口處理，保留原有 gameplay 模組。

若限制在 60 分鐘內，建議先完成可操作的 2D 原型，不一次處理所有美術細節。

## 測試方式

- 測試 WASD 與方向鍵。
- 測試 `J`、Space、Shift、`P`。
- 測試字元收集、碰撞、道具與打字測驗。
- 測試不同桌面視窗大小。

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## 驗收標準

- 遊戲可以顯示為 2D 俯視畫面。
- 蛇、字元、道具、子彈和障礙物都能正常顯示。
- 原本的遊戲邏輯與操作方式不變。
- 不再依賴 3D 透視、光影或旋轉相機。
- 桌面瀏覽器中可以正常遊玩。

# 方案二：重新安排桌面版 HUD，避免資訊遮住遊戲畫面

## 使用者需求

操作說明、目標單字和遊戲資訊不應該蓋住主要遊戲區域。

## 建議配置

左側：操作說明  
中央：遊戲畫面  
右側：目標單字與任務資訊

左側放置：

- WASD／方向鍵
- J
- Shift
- Space
- P

右側放置：

- 目標單字
- 中文意思
- 收集進度
- 關卡與剩餘時間
- 蛇身長度
- 彈藥與道具狀態

這次不新增手機觸控按鈕，也不特別設計手機版上下排列。

## 修改檔案

- `src/ui/GameHud.ts`
- `src/ui/PinballTableOverlay.ts`
- `src/styles/main.css`
- `src/core/Game.ts`
- `src/rendering/PhaseThreeScene.ts` 或未來的 `src/rendering/TwoDScene.ts`
- `README.md`
- `SPEC.md`
- `CHANGELOG.md`

## 預估風險

中等。

主要風險是側欄可能壓縮中央遊戲區，或在較小的桌面視窗中發生內容重疊。

## 測試方式

- 使用桌面寬螢幕測試三欄配置。
- 測試目標單字、進度、時間和道具是否即時更新。
- 測試 HUD 是否遮住蛇、字元或障礙物。
- 測試鍵盤操作與打字測驗。

```bash
npm run typecheck
npm run test
npm run test:e2e
```

## 驗收標準

- 左側顯示操作說明。
- 右側顯示目標單字與任務資訊。
- 中央遊戲區不被文字或面板遮住。
- 原本鍵盤操作不變。
- 不新增手機專用控制。
- 一般小視窗下不出現嚴重重疊或無法操作的問題。

# 方案三：提高下一個目標字元的視覺對比度

## 使用者需求

保留原本按照拼字順序逐一提示的邏輯，只讓目前應收集的字元更容易辨認。

例如目標是 CAT：

開始：C 被強調  
收集 C：A 被強調  
收集 A：T 被強調

這不是修改拼字順序，而是改善提示的清楚程度。

## 建議的視覺提示

目前需要收集的字元可以使用：

- 高對比色
- 粗圓形框線
- 較大字體
- 輕微脈動或發光
- `aria-current="step"` 標記

已收集和還沒輪到的字元則降低視覺強度。

遊戲場中對應的字元也使用相同的外框或發光效果。

## 修改檔案

- `src/ui/GameHud.ts`
- `src/styles/main.css`
- `src/rendering/TokenView.ts`
- 未來的 `src/rendering/TwoDScene.ts`
- `src/gameplay/VocabularyGameplaySession.test.ts`
- 相關 E2E 測試檔案
- `README.md`
- `CHANGELOG.md`

通常不需要修改：

- `src/gameplay/VocabularyGameplaySession.ts`

因為目前的 progressIndex 和 nextToken 已經控制拼字順序。

## 預估風險

低。

主要是調整視覺樣式，不改變單字判定、收集順序或遊戲狀態。

## 測試方式

- 使用 CAT 確認提示仍依序為 C、A、T。
- 使用 LETTER 等重複字母單字確認順序正確。
- 確認同一時間只有目前字元被強調。
- 確認收集正確字元後，強調效果會移到下一個字元。
- 確認錯誤字元不會改變提示。

## 驗收標準

- 原本的拼字順序完全不變。
- 目前字元與其他字元有明顯視覺差異。
- 提示不只依賴顏色，也使用圓框、粗邊界或脈動。
- 右側目標單字區與遊戲場中的提示保持一致。
- 桌面瀏覽器中能清楚辨識目前應收集的字元。

# 建議優先順序

- 方案三：風險最低，最容易先驗證。
- 方案二：改善畫面資訊配置。
- 方案一：範圍最大，最後進行 2D 畫面替換。

以上是規劃整理，尚未開始實作。
