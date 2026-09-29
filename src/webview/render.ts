import hljs from 'highlight.js/lib/common';
import { CORE_SCHEMA, load } from 'js-yaml';
import MarkdownIt from 'markdown-it';

// 直接 import markdown-it/lib/* 的型別會在 CommonJS 解析下拿到另一份宣告而不相容，改從公開 API 推導。
type StateCore = Parameters<Parameters<MarkdownIt['core']['ruler']['push']>[1]>[0];
type Token = StateCore['tokens'][number];
type StateBlock = Parameters<Parameters<MarkdownIt['block']['ruler']['before']>[2]>[0];

/** 接近 GitHub 的錨點規則：保留文字（含 CJK）、數字、底線與連字號，空白轉連字號。 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function createRenderer(): MarkdownIt {
  const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code, lang) {
      const language = lang.trim().split(/\s+/)[0]?.toLowerCase();
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      }
      return md.utils.escapeHtml(code);
    },
  });
  md.block.ruler.before('table', 'markdooown_front_matter', frontMatter);
  md.renderer.rules.markdooown_front_matter = (tokens, idx) => renderFrontMatter(md, tokens[idx].content);
  md.core.ruler.push('markdooown_heading_ids', headingIds);
  md.core.ruler.push('markdooown_task_lists', taskLists);
  return md;
}

const FENCE_OPEN = /^---[ \t]*$/;
const FENCE_CLOSE = /^(---|\.\.\.)[ \t]*$/;

/** 只認文件第一行的 `---`，否則會把一般的分隔線加 setext 標題誤判成 front matter。 */
function frontMatter(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine !== 0 || state.sCount[0] !== 0 || !FENCE_OPEN.test(lineText(state, 0))) {
    return false;
  }
  let close = 1;
  while (close < endLine && !FENCE_CLOSE.test(lineText(state, close))) {
    close++;
  }
  if (close >= endLine) {
    return false;
  }
  if (!silent) {
    const token = state.push('markdooown_front_matter', '', 0);
    token.content = state.getLines(1, close, 0, true);
    token.map = [0, close + 1];
    token.block = true;
  }
  state.line = close + 1;
  return true;
}

function lineText(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

/** 解析成物件就畫成欄位表；YAML 有錯或不是物件就退回高亮的原文，不讓內容消失。 */
export function renderFrontMatter(md: MarkdownIt, source: string): string {
  let data: unknown;
  try {
    // CORE_SCHEMA 讓日期留在字串，不被轉成 Date 後以時區格式顯示。
    data = load(source, { schema: CORE_SCHEMA });
  } catch {
    data = undefined;
  }
  if (!isPlainObject(data)) {
    if (data === undefined && source.trim() === '') {
      return '';
    }
    return `<pre class="front-matter-raw"><code class="language-yaml">${md.options.highlight?.(source, 'yaml', '') ?? md.utils.escapeHtml(source)}</code></pre>\n`;
  }
  return `${yamlTable(md, data, 'front-matter')}\n`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function yamlTable(md: MarkdownIt, data: Record<string, unknown>, className: string): string {
  const rows = Object.entries(data)
    .map(([key, value]) => `<tr><th>${md.utils.escapeHtml(key)}</th><td>${yamlValue(md, value)}</td></tr>`)
    .join('');
  return `<table class="${className}"><tbody>${rows}</tbody></table>`;
}

function yamlValue(md: MarkdownIt, value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? '' : `<ul>${value.map((item) => `<li>${yamlValue(md, item)}</li>`).join('')}</ul>`;
  }
  if (isPlainObject(value)) {
    return yamlTable(md, value, 'front-matter-nested');
  }
  return value === null || value === undefined ? '' : linkifyText(md, String(value));
}

/** 值只轉網址，不當 Markdown 解析：`*`、`_` 在 metadata 裡多半是字面意思。 */
function linkifyText(md: MarkdownIt, text: string): string {
  const matches = md.linkify.match(text) ?? [];
  let html = '';
  let last = 0;
  for (const match of matches) {
    html += md.utils.escapeHtml(text.slice(last, match.index));
    const href = md.normalizeLink(match.url);
    if (md.validateLink(href)) {
      html += `<a href="${md.utils.escapeHtml(href)}">${md.utils.escapeHtml(md.normalizeLinkText(match.url))}</a>`;
    } else {
      html += md.utils.escapeHtml(match.raw);
    }
    last = match.lastIndex;
  }
  return html + md.utils.escapeHtml(text.slice(last));
}

function inlineText(token: Token | undefined): string {
  return (token?.children ?? [])
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('');
}

function headingIds(state: StateCore): void {
  const seen = new Map<string, number>();
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') {
      continue;
    }
    const base = slugify(inlineText(tokens[i + 1]));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    tokens[i].attrSet('id', count === 0 ? base : `${base}-${count}`);
  }
}

const TASK_PREFIX = /^\[([ xX])\][ \t]/;

function taskLists(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (
      inline.type !== 'inline' ||
      tokens[i - 1].type !== 'paragraph_open' ||
      tokens[i - 2].type !== 'list_item_open'
    ) {
      continue;
    }
    const first = inline.children?.[0];
    const match = first?.type === 'text' ? TASK_PREFIX.exec(first.content) : null;
    if (!first || !match) {
      continue;
    }
    first.content = first.content.slice(match[0].length);
    const checkbox = new state.Token('html_inline', '', 0);
    checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" disabled${match[1] === ' ' ? '' : ' checked'}> `;
    inline.children!.unshift(checkbox);
    tokens[i - 2].attrJoin('class', 'task-list-item');
  }
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** 相對路徑的圖片對文件目錄解析；絕對 URL、data:、協定相對與根路徑不動。 */
export function resolveResource(src: string, baseUri: string): string {
  if (!baseUri || !src || HAS_SCHEME.test(src) || src.startsWith('/') || src.startsWith('#')) {
    return src;
  }
  try {
    return new URL(src, baseUri).href;
  } catch {
    return src;
  }
}
