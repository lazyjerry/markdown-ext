import DOMPurify from 'dompurify';

import type { ClientMessage, HostMessage } from '../shared/protocol';
import { createRenderer, resolveResource } from './render';
import { createSafeRender } from './sanitize';

declare function acquireVsCodeApi(): { postMessage(message: ClientMessage): void };

type RenderMessage = Extract<HostMessage, { type: 'render' }>;

const vscode = acquireVsCodeApi();
const fileLabel = document.getElementById('file')!;
const content = document.getElementById('content')!;
const autoButton = document.getElementById('auto') as HTMLButtonElement;
const refreshButton = document.getElementById('refresh') as HTMLButtonElement;

const md = createRenderer();
const safeRender = createSafeRender(DOMPurify);

const IDLE_TEXT: Record<'none' | 'notMarkdown', string> = {
  none: '開啟 Markdown 檔案即可在這裡預覽。',
  notMarkdown: '目前的檔案不是 Markdown，預覽已暫停。',
};

let autoRefresh = false;
let shownDocKey: string | null = null;
let pending: HostMessage | null = null;
let frame = 0;

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  // 狀態訊息不進渲染佇列：它跟畫面內容無關，被合併掉按鈕就不會更新。
  if (event.data.type === 'status') {
    showStatus(event.data.autoRefresh, event.data.stale);
    return;
  }
  pending = event.data;
  requestFlush();
});

// 同一幀內來了多則只畫最後一則，避免快速切檔或打字時重複渲染。
function requestFlush(): void {
  if (!frame) {
    frame = requestAnimationFrame(flush);
  }
}

function flush(): void {
  frame = 0;
  const message = pending;
  pending = null;
  if (!message || message.type === 'status') {
    return;
  }
  if (message.type === 'idle') {
    shownDocKey = null;
    fileLabel.textContent = '';
    content.replaceChildren(
      Object.assign(document.createElement('p'), { className: 'placeholder', textContent: IDLE_TEXT[message.reason] }),
    );
    return;
  }
  render(message);
}

function render(message: RenderMessage): void {
  const scroller = document.scrollingElement ?? document.documentElement;
  const sameDoc = shownDocKey === message.docKey;
  const scrollTop = scroller.scrollTop;

  fileLabel.textContent = message.fileName;
  fileLabel.title = message.fileName;
  content.replaceChildren(safeRender(md, message.text));
  for (const img of content.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (src) {
      img.setAttribute('src', resolveResource(src, message.baseUri));
    }
  }

  shownDocKey = message.docKey;
  scroller.scrollTop = sameDoc ? scrollTop : 0;
}

/** 「預覽」在內容跟得上目前分頁時才是 active；過時就暗下來，點一下才更新。 */
function showStatus(auto: boolean, stale: boolean): void {
  autoRefresh = auto;
  setActive(autoButton, auto);
  setActive(refreshButton, !stale);
}

function setActive(button: HTMLButtonElement, active: boolean): void {
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}

autoButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'setAutoRefresh', value: !autoRefresh });
});

refreshButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'refresh' });
});

document.addEventListener('click', (event) => {
  const anchor = (event.target as Element | null)?.closest('a');
  const href = anchor?.getAttribute('href');
  if (!anchor || !href) {
    return;
  }
  event.preventDefault();
  if (href.startsWith('#')) {
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // 保留原字串
    }
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    return;
  }
  vscode.postMessage({ type: 'openLink', href });
});

vscode.postMessage({ type: 'ready' });
