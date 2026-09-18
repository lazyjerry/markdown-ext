/** `basic` 只做 CommonMark＋GFM；`enhanced` 另載入數學式、註腳、Mermaid。 */
export type PreviewMode = 'basic' | 'enhanced';

export type HostMessage =
  | {
      type: 'render';
      /** 同一份文件的後續更新要保留捲動位置，換文件才回到頂端。 */
      docKey: string;
      fileName: string;
      text: string;
      /** 文件所在目錄的 webview URI（結尾含 /），用來解析圖片等相對路徑。 */
      baseUri: string;
      mode: PreviewMode;
    }
  | { type: 'idle'; reason: 'none' | 'notMarkdown' };

export type ClientMessage =
  | { type: 'ready' }
  | { type: 'openLink'; href: string }
  | { type: 'setMode'; mode: PreviewMode };

export function isPreviewMode(value: unknown): value is PreviewMode {
  return value === 'basic' || value === 'enhanced';
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const msg = value as { type?: unknown; href?: unknown; mode?: unknown };
  return (
    msg.type === 'ready' ||
    (msg.type === 'openLink' && typeof msg.href === 'string') ||
    (msg.type === 'setMode' && isPreviewMode(msg.mode))
  );
}
