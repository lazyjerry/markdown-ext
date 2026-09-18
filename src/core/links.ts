export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; id: string }
  | { kind: 'file'; path: string; fragment: string | null };

const EXTERNAL = /^(https?:|mailto:|vscode:)/i;
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
