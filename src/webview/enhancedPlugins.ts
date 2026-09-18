import markdownItKatex from '@vscode/markdown-it-katex';
import type MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';

import { trustRules } from './trusted';

/** 與 enhanced.ts 分開：那支是會碰 window 的瀏覽器入口，單元測試要能直接套用同一組外掛。 */
export function applyEnhancedPlugins(md: MarkdownIt): void {
  md.use(markdownItKatex, { enableFencedBlocks: true, throwOnError: false });
  md.use(footnote);
  trustRules(md, ['math_inline', 'math_inline_block', 'math_inline_bare_block', 'math_block']);
  trustRules(md, ['fence'], (token) => token.info.trim().toLowerCase() === 'math');
}
