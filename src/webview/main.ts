import type MarkdownIt from 'markdown-it';

import type { ClientMessage, HostMessage, PreviewMode } from '../shared/protocol';
import type { EnhancedApi, MermaidApi } from './enhancedApi';
import { createRenderer, resolveResource } from './render';

declare function acquireVsCodeApi(): { postMessage(message: ClientMessage): void };

type RenderMessage = Extract<HostMessage, { type: 'render' }>;

const vscode = acquireVsCodeApi();
// 後續動態載入的 script 要帶同一個 nonce 才過得了 CSP。
const nonce = (document.currentScript as HTMLScriptElement | null)?.nonce ?? '';
const assets = document.body.dataset;
const fileLabel = document.getElementById('file')!;
const content = document.getElementById('content')!;
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('#bar [data-mode]')];

const basicMd = createRenderer();
let enhancedMd: MarkdownIt | null = null;
let enhancedLoading: Promise<void> | null = null;
let mermaidLoading: Promise<MermaidApi | null> | null = null;
/** 以「主題＋原始碼」為鍵；打字時沒改到的圖表直接沿用 SVG，不重跑 Mermaid。 */
const mermaidCache = new Map<string, string>();
let mermaidSeq = 0;

const IDLE_TEXT: Record<'none' | 'notMarkdown', string> = {
  none: '開啟 Markdown 檔案即可在這裡預覽。',
  notMarkdown: '目前的檔案不是 Markdown，預覽已暫停。',
};

let shownDocKey: string | null = null;
let lastRender: RenderMessage | null = null;
let pending: HostMessage | null = null;
let frame = 0;

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
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
  if (!message) {
    return;
  }
  if (message.type === 'idle') {
    shownDocKey = null;
    lastRender = null;
    fileLabel.textContent = '';
    document.body.classList.add('idle');
    content.replaceChildren(
      Object.assign(document.createElement('p'), { className: 'placeholder', textContent: IDLE_TEXT[message.reason] }),
    );
    return;
  }
  render(message);
}

function render(message: RenderMessage): void {
  lastRender = message;
  document.body.classList.remove('idle');
  showMode(message.mode);

  const md = message.mode === 'enhanced' ? ensureEnhanced() : basicMd;
  const scroller = document.scrollingElement ?? document.documentElement;
  const sameDoc = shownDocKey === message.docKey;
  const scrollTop = scroller.scrollTop;

  fileLabel.textContent = message.fileName;
  fileLabel.title = message.fileName;
  content.innerHTML = md.render(message.text);
  for (const img of content.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (src) {
      img.setAttribute('src', resolveResource(src, message.baseUri));
    }
  }
  if (md === enhancedMd) {
    void renderMermaid();
  }

  shownDocKey = message.docKey;
  scroller.scrollTop = sameDoc ? scrollTop : 0;
}

function showMode(mode: PreviewMode): void {
  for (const button of modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

/** 增強套件還沒載入時先用基本渲染頂著，載入完成後重畫最後一則。 */
function ensureEnhanced(): MarkdownIt {
  if (enhancedMd) {
    return enhancedMd;
  }
  if (!enhancedLoading) {
    enhancedLoading = Promise.all([loadScript(assets.enhancedSrc), loadStyle(assets.katexCss)])
      .then(() => {
        const api = (window as unknown as { markdooownEnhanced?: EnhancedApi }).markdooownEnhanced;
        if (!api) {
          throw new Error('enhanced.js 沒有註冊 API');
        }
        const md = createRenderer();
        api.apply(md);
        enhancedMd = md;
        if (lastRender?.mode === 'enhanced' && !pending) {
          pending = lastRender;
          requestFlush();
        }
      })
      .catch((error: unknown) => {
        enhancedLoading = null;
        console.error('markdooown: 增強預覽載入失敗', error);
      });
  }
  return basicMd;
}

async function renderMermaid(): Promise<void> {
  const blocks = [...content.querySelectorAll<HTMLElement>('pre > code.language-mermaid')];
  if (blocks.length === 0) {
    return;
  }
  const mermaid = await loadMermaid();
  if (!mermaid) {
    return;
  }
  const theme = document.body.classList.contains('vscode-light') ? 'default' : 'dark';
  for (const code of blocks) {
    const pre = code.parentElement!;
    if (!pre.isConnected) {
      continue; // 等待期間內容已被下一次渲染換掉
    }
    const source = code.textContent ?? '';
    const key = `${theme}\n${source}`;
    let svg = mermaidCache.get(key);
    if (svg === undefined) {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
        svg = (await mermaid.render(`markdooown-mermaid-${++mermaidSeq}`, source)).svg;
        mermaidCache.set(key, svg);
      } catch (error) {
        pre.classList.add('mermaid-error');
        pre.title = `Mermaid 語法錯誤：${error instanceof Error ? error.message : String(error)}`;
        continue;
      }
    }
    if (pre.isConnected) {
      const figure = document.createElement('div');
      figure.className = 'mermaid-diagram';
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    }
  }
}

function loadMermaid(): Promise<MermaidApi | null> {
  mermaidLoading ??= loadScript(assets.mermaidSrc)
    .then(() => (window as unknown as { mermaid?: MermaidApi }).mermaid ?? null)
    .catch((error: unknown) => {
      mermaidLoading = null;
      console.error('markdooown: Mermaid 載入失敗', error);
      return null;
    });
  return mermaidLoading;
}

function loadScript(src: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('缺少 script 位址'));
      return;
    }
    const script = document.createElement('script');
    script.nonce = nonce;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`無法載入 ${src}`));
    document.head.appendChild(script);
  });
}

function loadStyle(href: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!href) {
      reject(new Error('缺少 stylesheet 位址'));
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`無法載入 ${href}`));
    document.head.appendChild(link);
  });
}

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as PreviewMode;
    showMode(mode);
    vscode.postMessage({ type: 'setMode', mode });
  });
}

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
