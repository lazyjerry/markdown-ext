import type { DOMPurify } from 'dompurify';
import type MarkdownIt from 'markdown-it';

import type { TrustedEnv } from './trusted';
import { TRUSTED_TAG } from './trusted';

const CONFIG = {
  // style／style 屬性可蓋住面板做點擊劫持（CSP 必須放行 inline 樣式給 Mermaid），form、meta、base 可偽造表單或導向。
  FORBID_TAGS: ['style', 'form', 'meta', 'base', 'iframe', 'object', 'embed', 'link'],
  FORBID_ATTR: ['style'],
  ADD_TAGS: [TRUSTED_TAG],
  RETURN_DOM_FRAGMENT: true as const,
};

/** markdown-it 的表格對齊只會產生這種 style，放行它不會帶進定位或尺寸。 */
const TABLE_ALIGN = /^text-align:\s*(left|right|center);?$/i;
const HEADING = /^h[1-6]$/;

/** 回傳的函式把 Markdown 渲染成已清洗的 DOM 片段；hook 掛在傳入的 DOMPurify 實例上，一個實例只呼叫一次。 */
export function createSafeRender(purify: DOMPurify): (md: MarkdownIt, text: string) => DocumentFragment {
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    const tag = node.nodeName.toLowerCase();
    if (data.attrName === 'style' && (tag === 'th' || tag === 'td') && TABLE_ALIGN.test(data.attrValue)) {
      data.forceKeepAttr = true;
    }
    // 標題錨點像 title、images 會撞到 document 屬性，被防 DOM clobbering 的規則移除，錨點連結就失效；
    // 標題元素的 id 只會成為 window 具名屬性，main.js 讀的 window 屬性都由自己的腳本賦值。
    if (data.attrName === 'id' && HEADING.test(tag)) {
      data.forceKeepAttr = true;
    }
  });

  return (md, text) => {
    const env: TrustedEnv = { trusted: [] };
    const fragment = purify.sanitize(md.render(text, env), CONFIG);
    for (const slot of fragment.querySelectorAll(TRUSTED_TAG)) {
      // 原文手寫的佔位元素最多只能換出同一份文件自己的 KaTeX 輸出。
      const html = env.trusted![Number(slot.getAttribute('data-i') ?? NaN)];
      if (html === undefined) {
        slot.remove();
        continue;
      }
      const template = slot.ownerDocument.createElement('template');
      template.innerHTML = html;
      slot.replaceWith(template.content);
    }
    return fragment;
  };
}
