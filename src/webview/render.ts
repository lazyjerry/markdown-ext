import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';

// 直接 import markdown-it/lib/* 的型別會在 CommonJS 解析下拿到另一份宣告而不相容，改從公開 API 推導。
type StateCore = Parameters<Parameters<MarkdownIt['core']['ruler']['push']>[1]>[0];
type Token = StateCore['tokens'][number];

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
  md.core.ruler.push('markdooown_heading_ids', headingIds);
  md.core.ruler.push('markdooown_task_lists', taskLists);
  return md;
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
