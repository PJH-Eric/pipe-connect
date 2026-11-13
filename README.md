# 水管接通（Pipe Connect）

3D 旋轉水管益智遊戲。點一下水管轉 90 度，把水從水源送到每一節水管、沒有任何地方漏水就過關。
純前端單機遊戲，沒有電腦對手也沒有線上對戰，進度存在瀏覽器本機。

## 模式

| 模式 | 內容 |
| --- | --- |
| 闖關 | 幼幼／簡單／普通／困難／神話 五種難度各 100 關，依序解鎖，每關 1～3 星 |
| 隨機 | 選難度後出一題全新的盤面，記錄各難度最快時間 |
| 每日挑戰 | 台北時間午夜換題，五個難度各一題，所有人同一題；有連續天數與月曆 |

## 規則重點

- 每節水管只能原地順時針旋轉；十字不用轉。
- 過關條件：所有開口都接上（沒有漏水）、每節水管都有水、不同顏色的水沒有混在一起。
- 進階機關只在較高難度出現：
  - **鎖住的水管**：轉不動，但方向一定正確，可當線索。
  - **多種顏色的水**：多個水源各自一種顏色，不能互相接通（水源頂上另有形狀可區分）。
  - **邊緣相通的盤面**：左右、上下邊緣相通。
- 評星：過關 1 星；步數 ≤ 標準步數 ×1.6 得 2 星；步數 ≤ ×1.2、在目標時間（每格 4 秒）內且沒用提示得 3 星。幼幼一律 3 星。
- 提示次數：幼幼不限、簡單 5、普通 3、困難 2、神話 1。提示會把一節水管轉正並鎖住。
- 復原不會退回步數。

| 難度 | 盤面 | 顏色 | 邊緣相通 |
| --- | --- | --- | --- |
| 幼幼 | 3×3～5×5 | 1 | 否 |
| 簡單 | 5×5～7×7 | 1 | 否 |
| 普通 | 7×7～9×9 | 第 51 關起 2 色 | 否 |
| 困難 | 9×9～10×10 | 2～3 色 | 第 61 關起 |
| 神話 | 11×11～12×12 | 3～4 色 | 全部 |

## 操作

- 觸控：點水管旋轉、單指拖曳轉視角、兩指縮放與平移。
- 滑鼠：左鍵點擊旋轉、拖曳轉視角、滾輪縮放、右鍵拖曳平移。
- 鍵盤：方向鍵移動、空白鍵旋轉、Z 復原、H 提示、＋－縮放、0 視角復位、Esc 暫停。

## 本機執行

需要 Node.js 26.12.1 以上（只用來開本機靜態伺服器，沒有任何 npm 依賴）。

```
啟動遊戲.bat        # Windows 直接點兩下
npm start           # 或手動啟動，開 http://localhost:3230
```

遊戲使用 ES 模組，不能直接用 `file://` 開 `public/index.html`。

## 測試

```
npm test                       # 規則、對局、進度、語系測試
npm run test:browser           # 無頭瀏覽器：完整玩一局＋各尺寸破版檢查（需要 playwright）
node scripts/browser-check.mjs --shots   # 同上並輸出截圖到 screenshots/
```

`browser-check` 不把 playwright 列為專案依賴；可用 `PLAYWRIGHT_PATH`、`CHROME_PATH` 指定位置，找不到就略過。

## 專案結構

```
public/
  index.html、css/style.css
  js/core/        規則核心（不碰畫面）：rules、generator、levels、session、progress、rng
  js/scene.js     Three.js 3D 盤面
  js/ui/          自繪元件（kit）、圖示、各畫面、遊戲畫面
  js/locales.js   繁中／簡中／English
  js/vendor/      three.module.min.js（MIT）
tests/verify.js   規則測試
scripts/          SEO 注入、瀏覽器巡檢、分享圖產生
```

## 部署

推到 GitHub 的 `main` 後，`.github/workflows/pages.yml` 會跑測試、注入 GA4 與 SEO，再把 `public/` 佈署到 GitHub Pages
（預期網址 `https://pjh-eric.github.io/pipe-connect/`）。不需要遊戲伺服器，也沒有要設定的 repository variable。

## 授權

- Three.js：MIT License（`public/js/vendor/three.module.min.js`）。
- 音效與背景音樂由程式即時合成，沒有外部音檔；圖示與美術為本專案自繪。
