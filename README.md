# markdooown

在 VS Code 底部面板即時預覽目前開啟的 Markdown 檔案，可切換一般預覽與增強預覽。

原始碼：<https://github.com/lazyjerry/markdown-ext>

## 使用方式

1. 開啟任一 `.md` 檔案（文字編輯或預覽模式都可以）。
2. 在底部 Panel 點 **markdooown** 分頁（開啟書本的圖示），或執行指令 `markdooown: Show Preview Panel`。
3. 用標題列右側的按鈕切換 **預覽**／**增強預覽**，選擇會記住。

## 行為

- 跟隨目前作用中的分頁；`.md` 以預覽模式開啟、或焦點移到面板內時，都照樣顯示該檔案。
- 編輯時同步更新（約 120ms 合併一次，超過 20 萬字元的檔案放寬為 400ms），同一份文件更新時保留捲動位置。
- 切到非 Markdown 檔案：預覽暫停，不追蹤任何文件。
- 點擊連結：外部網址用瀏覽器開啟；相對路徑的檔案在編輯器開啟（開的是 `.md` 就會接著預覽它）；`#錨點` 在預覽內捲動。

## 兩種模式

| | 預覽 | 增強預覽 |
|---|---|---|
| CommonMark、GFM 表格、刪除線、自動連結 | ✓ | ✓ |
| 任務清單、標題錨點、程式碼語法高亮 | ✓ | ✓ |
| 內嵌 HTML（腳本一律被 CSP 擋下）、相對路徑圖片 | ✓ | ✓ |
| KaTeX 數學式：`$…$`、`$$…$$`、` ```math ` | | ✓ |
| 註腳 `[^1]` | | ✓ |
| Mermaid 圖表 ` ```mermaid ` | | ✓ |

## 效能

- 只在面板被開啟（或執行指令）時才啟動擴充，平時不載入。
- 面板可見才訂閱分頁切換與文件變更事件；面板收起即全部釋放，不做任何更新。
- 未設定 `retainContextWhenHidden`，面板收起後 webview 會被回收。
- Markdown 解析在 webview 內進行，extension host 只傳文字。
- 增強預覽的套件（KaTeX、註腳，約 270KB）只在切到增強預覽時載入；Mermaid（約 5MB）只在文件真的含有 mermaid 區塊時才載入，未改動的圖表沿用快取不重畫。

## 開發

```bash
npm install
npm run check                      # lint + build + 單元測試
./scripts/install-local.sh         # 打包並安裝到本機 VS Code
./scripts/install-local.sh --fast  # 跳過 lint 與測試
./scripts/publish.sh patch         # 發布階段一：bump 版本、搬移 CHANGELOG
./scripts/publish.sh               # 發布階段二：檢查、打包、稽核、上傳 Marketplace
```

## 授權

[Apache-2.0](LICENSE)
