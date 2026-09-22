export type HostMessage =
  | {
      type: 'render';
      /** 同一份文件的後續更新要保留捲動位置，換文件才回到頂端。 */
      docKey: string;
      fileName: string;
      text: string;
      /** 文件所在目錄的 webview URI（結尾含 /），用來解析圖片等相對路徑。 */
      baseUri: string;
    }
  | { type: 'idle'; reason: 'none' | 'notMarkdown' }
  /** 兩顆按鈕的狀態；`stale` 表示畫面上的內容已經不是目前分頁該顯示的內容。 */
  | { type: 'status'; autoRefresh: boolean; stale: boolean };

export type ClientMessage =
  | { type: 'ready' }
  | { type: 'openLink'; href: string }
  | { type: 'refresh' }
  | { type: 'setAutoRefresh'; value: boolean };

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const msg = value as { type?: unknown; href?: unknown; value?: unknown };
  return (
    msg.type === 'ready' ||
    msg.type === 'refresh' ||
    (msg.type === 'openLink' && typeof msg.href === 'string') ||
    (msg.type === 'setAutoRefresh' && typeof msg.value === 'boolean')
  );
}
