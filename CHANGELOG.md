# Changelog

本檔案記錄 markdooown 的版本變更，格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.4.1] - 2026-10-02

### Changed

- 標題列空間不夠時，檔名列改成優先保留檔案名稱：搜尋框先縮窄，再從目錄那段截斷（顯示成 `markdown-ext/docs/a-…/README.md`），檔名本身最後才截斷。先前是整串路徑從右邊截斷，檔名最先看不到。滑鼠停在檔名上仍可看到完整路徑。

## [0.4.0] - 2026-10-02

### Added

- 預覽內搜尋：標題列檔名右邊新增搜尋框，與 **自動刷新**、**預覽** 同一列，不多佔閱讀空間。
  - 不分大小寫，所有結果以編輯器的搜尋配色標示，目前那一筆另外加深，旁邊顯示「第幾筆／共幾筆」。
  - `Enter` 下一個、`Shift+Enter` 上一個（到底會繞回），也可以點 ↑ ↓；`Esc` 清除；焦點在面板內時按 `⌘F`／`Ctrl+F` 跳到搜尋框。
  - 結果在收合的 `<details>` 內會自動展開，在可橫向捲動的程式碼區塊或表格內會捲過去。
  - 預覽內容更新時保留關鍵字並重新比對，但不捲動畫面。注音、拼音組字中不比對。

## [0.3.0] - 2026-09-29

### Added

- 文件開頭的 YAML front matter（`---` 包住的 metadata）改畫成欄位表：鍵名一欄、值一欄，巢狀物件畫成內層表格、陣列畫成清單，網址可點。值只轉連結，不當 Markdown 解析，日期維持原字串。YAML 有語法錯誤時退回語法高亮的原文。先前會被當成分隔線加標題，整段擠成一行大字。

## [0.2.0] - 2026-09-21

### Removed

- 移除增強預覽：KaTeX 數學式、註腳與 Mermaid 圖表不再支援，相關相依套件（`@vscode/markdown-it-katex`、`katex`、`markdown-it-footnote`、`mermaid`）與隨附的字型、`media/vendor/` 靜態檔一併移除。標題列不再有 **預覽／增強預覽** 切換。

### Added

- 標題列新增 **自動刷新** 開關（預設關閉，選擇會記住），位置在 **預覽** 按鈕左邊。
  - 開啟：切換分頁與編輯時自動更新預覽，行為與先前相同。
  - 關閉：畫面停在最後一次的內容；分頁切走或檔案被改過時 **預覽** 按鈕轉為非 active，點一下才更新到目前分頁的內容。
- **預覽** 按鈕改為手動刷新，按鈕是否 active 代表畫面有沒有跟上目前的分頁。

### Changed

- 面板改為保留最後一次渲染的內容快照：webview 被回收後重新顯示、或文件已被 VS Code 回收，畫面都回得到原本那一份。
- 待機訊息顯示時標題列不再隱藏，按鈕維持可點。
- `scripts/install-local.sh` 新增 `--all-profiles`，一次安裝到本機所有 VS Code profile。

## [0.1.1] - 2026-09-19

### Security

安全性修正：

- 預覽前先用 DOMPurify 清洗 Markdown 輸出：移除 `<style>`、`<form>`、`<meta>`、`<base>`、`<iframe>`、`<object>`、`<embed>`、`<link>` 與內嵌 HTML 的 `style` 屬性，避免文件蓋住面板誘導點擊、偽造表單或導向其他頁面。表格對齊、標題錨點、KaTeX 排版不受影響。
- CSP 加上 `base-uri 'none'` 與 `form-action 'none'`。
- 預覽中的 `vscode:` 連結不再交給 VS Code 開啟；外部連結只接受 `http:`、`https:`、`mailto:`。
- 相對路徑連結只能開啟工作區資料夾內、或目前文件所在目錄之下的檔案，其餘顯示警告不開啟（例如 `../../../../etc/hosts`）。
- CSP nonce 改用 `crypto.randomBytes` 產生。
- `package.json` 明確宣告不支援受限模式（Restricted Mode）的工作區，行為與先前相同。

### Added

- 設定 `markdooown.allowRemoteImages`（預設開啟）：關閉後不載入 `https:` 遠端圖片，避免被當成追蹤像素。

## [0.1.0] - 2026-09-19

### Added

- 底部 Panel 的 **markdooown** 分頁，即時預覽目前作用中分頁的 Markdown 檔案；編輯時自動同步，同一份文件更新時保留捲動位置。
- 標題列的 **預覽／增強預覽** 切換按鈕，選擇會記住。
  - 預覽：CommonMark、GFM 表格、刪除線、自動連結、任務清單、標題錨點、程式碼語法高亮。
  - 增強預覽：另外支援 KaTeX 數學式（`$…$`、`$$…$$`、` ```math `）、註腳、Mermaid 圖表。增強用的套件只在切到增強預覽時載入，Mermaid 只在文件含有 mermaid 區塊時才載入。
- `.md` 以預覽模式（custom editor）開啟、或焦點在面板內時，照樣跟隨該檔案。
- 點擊連結：外部網址用瀏覽器開啟、相對路徑在編輯器開啟、`#錨點` 在預覽內捲動。
- 面板沒開就不啟動、不訂閱任何事件；面板收起即釋放所有訂閱並回收 webview。
