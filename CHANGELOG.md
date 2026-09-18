# Changelog

本檔案記錄 markdooown 的版本變更，格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

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
