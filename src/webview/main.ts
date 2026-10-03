import DOMPurify from 'dompurify';

import type { ClientMessage, HostMessage } from '../shared/protocol';
import { createRenderer, resolveResource } from './render';
import { createSafeRender } from './sanitize';
import { findRanges } from './search';

declare function acquireVsCodeApi(): { postMessage(message: ClientMessage): void };

type RenderMessage = Extract<HostMessage, { type: 'render' }>;

const vscode = acquireVsCodeApi();
const fileLabel = document.getElementById('file')!;
const fileDir = document.getElementById('file-dir')!;
const fileBase = document.getElementById('file-base')!;
const content = document.getElementById('content')!;
const autoButton = document.getElementById('auto') as HTMLButtonElement;
const refreshButton = document.getElementById('refresh') as HTMLButtonElement;
const bar = document.getElementById('bar')!;
const queryInput = document.getElementById('query') as HTMLInputElement;
const countLabel = document.getElementById('count')!;
const prevButton = document.getElementById('prev') as HTMLButtonElement;
const nextButton = document.getElementById('next') as HTMLButtonElement;

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
    showFileName('');
    content.replaceChildren(
      Object.assign(document.createElement('p'), { className: 'placeholder', textContent: IDLE_TEXT[message.reason] }),
    );
    runSearch(false);
    return;
  }
  render(message);
}

function render(message: RenderMessage): void {
  const scroller = document.scrollingElement ?? document.documentElement;
  const sameDoc = shownDocKey === message.docKey;
  const scrollTop = scroller.scrollTop;

  showFileName(message.fileName);
  content.replaceChildren(safeRender(md, message.text));
  for (const img of content.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (src) {
      img.setAttribute('src', resolveResource(src, message.baseUri));
    }
  }

  shownDocKey = message.docKey;
  scroller.scrollTop = sameDoc ? scrollTop : 0;
  runSearch(false);
}

/** 分隔符號放在檔名那段，目錄被截斷時顯示成 `…/README.md`。 */
function showFileName(fileName: string): void {
  const cut = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  fileDir.textContent = fileName.slice(0, Math.max(cut, 0));
  fileBase.textContent = fileName.slice(Math.max(cut, 0));
  fileLabel.title = fileName;
  // 量文字本身含小數的寬度再進位；用 scrollWidth 會捨去小數，檔名被誤截。
  const range = document.createRange();
  range.selectNodeContents(fileBase);
  fileLabel.style.setProperty('--base-width', `${Math.ceil(range.getBoundingClientRect().width)}px`);
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

// 搜尋結果用 CSS Custom Highlight API 上色，不動 DOM，渲染、清洗與捲動保留都不受影響。
const hitHighlight = new Highlight();
const currentHighlight = new Highlight();
currentHighlight.priority = 1;
CSS.highlights.set('markdooown-search', hitHighlight);
CSS.highlights.set('markdooown-search-current', currentHighlight);

let hits: Range[] = [];
let current = -1;

/** 依關鍵字重新比對。內容更新時 `reveal` 為 false：只更新標示、不捲動，打字時畫面才不會跳走。 */
function runSearch(reveal: boolean): void {
  hits = findRanges(content, queryInput.value);
  current = hits.length === 0 ? -1 : reveal ? 0 : Math.min(Math.max(current, 0), hits.length - 1);
  paintSearch(reveal);
}

function stepSearch(delta: number): void {
  if (hits.length > 0) {
    current = (current + delta + hits.length) % hits.length;
    paintSearch(true);
  }
}

function paintSearch(reveal: boolean): void {
  hitHighlight.clear();
  currentHighlight.clear();
  hits.forEach((range) => hitHighlight.add(range));
  if (current >= 0) {
    currentHighlight.add(hits[current]);
  }
  countLabel.textContent = !queryInput.value ? '' : hits.length ? `${current + 1}/${hits.length}` : '無結果';
  prevButton.disabled = nextButton.disabled = hits.length === 0;
  if (reveal && current >= 0) {
    revealRange(hits[current]);
  }
}

function revealRange(range: Range): void {
  const el = range.startContainer.parentElement;
  // 收合的 <details> 內容看不到，先展開；結果在 summary 上就不用展開。
  for (let details = el?.closest('details'); details; details = details.parentElement?.closest('details')) {
    if (!details.querySelector(':scope > summary')?.contains(el)) {
      details.open = true;
    }
  }
  // 程式碼區塊與表格可以橫向捲動，結果在可視範圍外就捲過去。
  const box = el?.closest('pre, table');
  if (box) {
    const r = range.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.left < b.left || r.right > b.right) {
      box.scrollLeft += r.left - b.left - b.width / 2;
    }
  }
  // 頂列是 sticky，結果被它蓋住也算看不到；捲到頂列以下的可視區中央。
  const r = range.getBoundingClientRect();
  const top = bar.getBoundingClientRect().bottom;
  if (r.top < top || r.bottom > window.innerHeight) {
    const scroller = document.scrollingElement ?? document.documentElement;
    scroller.scrollTop += r.top - (top + window.innerHeight) / 2;
  }
}

queryInput.addEventListener('input', (event) => {
  // 注音、拼音組字中不比對，等 compositionend 再算。
  if (!(event as InputEvent).isComposing) {
    runSearch(true);
  }
});

queryInput.addEventListener('compositionend', () => runSearch(true));

queryInput.addEventListener('keydown', (event) => {
  if (event.isComposing) {
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    stepSearch(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    queryInput.value = '';
    runSearch(false);
  }
});

prevButton.addEventListener('click', () => stepSearch(-1));
nextButton.addEventListener('click', () => stepSearch(1));

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    queryInput.focus();
    queryInput.select();
  }
});

vscode.postMessage({ type: 'ready' });
