export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; id: string }
  | { kind: 'file'; path: string; fragment: string | null };

// vscode: 會交給其他擴充的 URI handler 執行動作，文件內容不可信，不放行。
const EXTERNAL = /^(https?:|mailto:)/i;
/** 帶 scheme 但不是上面那幾種（javascript:、data: 等）一律不處理。 */
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** 分類預覽中被點擊的連結；相對路徑回傳解碼後的路徑，由呼叫端對文件目錄解析。 */
export function classifyLink(href: string): LinkTarget | null {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }
  if (EXTERNAL.test(trimmed)) {
    return { kind: 'external', url: trimmed };
  }
  if (ANY_SCHEME.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith('#')) {
    return { kind: 'anchor', id: safeDecode(trimmed.slice(1)) };
  }
  const hashAt = trimmed.indexOf('#');
  const rawPath = (hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed).split('?')[0];
  const fragment = hashAt >= 0 ? safeDecode(trimmed.slice(hashAt + 1)) : null;
  return { kind: 'file', path: safeDecode(rawPath), fragment };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `target` 等於 `base` 或位於其下；兩者都要是正規化後（已解析 `..`）的 URI 字串。 */
export function isWithin(target: string, base: string): boolean {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return target === base || target.startsWith(prefix);
}
