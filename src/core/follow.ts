/** 決定預覽面板該怎麼回應「作用中分頁改變」，與 vscode API 解耦以便單元測試。 */

/**
 * 作用中分頁指向的資源。以分頁而不是 activeTextEditor 判斷，因為：
 * - .md 以預覽模式（custom editor）開啟時沒有 TextEditor；
 * - 焦點移進 webview／面板時 activeTextEditor 會變成 undefined，但作用中分頁不變。
 */
export interface TabTarget {
  scheme: string;
  path: string;
  /** 文件已載入時才有；沒載入就依副檔名判斷，避免為了判斷而讀進任意大檔。 */
  languageId?: string;
}

/**
 * - `show`：切到這份 Markdown。
 * - `keep`：沿用目前預覽（分頁沒有對應檔案，例如設定頁、終端機分頁、內建預覽的 webview）。
 * - `idle`：使用者換到非 Markdown 的檔案，預覽停下來、不再追蹤任何文件。
 */
export type FollowAction = 'show' | 'keep' | 'idle';

/** 輸出面板、git 比對來源等也會以文件出現，但它們不是使用者在看的檔案。 */
const DOCUMENT_SCHEMES = new Set(['file', 'untitled', 'vscode-remote', 'vscode-vfs']);
const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|mkdn)$/i;

export function decideFollow(target: TabTarget | undefined): FollowAction {
  if (!target || !DOCUMENT_SCHEMES.has(target.scheme)) {
    return 'keep';
  }
  if (target.languageId) {
    return target.languageId === 'markdown' ? 'show' : 'idle';
  }
  return MARKDOWN_EXT.test(target.path) ? 'show' : 'idle';
}
