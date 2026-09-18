# Changelog

本檔案記錄 markdooown 的版本變更，格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.1.0] - 2026-09-19

### Added

- 底部 Panel 的 **markdooown** 分頁，即時預覽目前作用中分頁的 Markdown 檔案；編輯時自動同步，同一份文件更新時保留捲動位置。
- 標題列的 **預覽／增強預覽** 切換按鈕，選擇會記住。
  - 預覽：CommonMark、GFM 表格、刪除線、自動連結、任務清單、標題錨點、程式碼語法高亮。
  - 增強預覽：另外支援 KaTeX 數學式（`$…$`、`$$…$$`、` ```math `）、註腳、Mermaid 圖表。增強用的套件只在切到增強預覽時載入，Mermaid 只在文件含有 mermaid 區塊時才載入。
- `.md` 以預覽模式（custom editor）開啟、或焦點在面板內時，照樣跟隨該檔案。
- 點擊連結：外部網址用瀏覽器開啟、相對路徑在編輯器開啟、`#錨點` 在預覽內捲動。
- 面板沒開就不啟動、不訂閱任何事件；面板收起即釋放所有訂閱並回收 webview。
