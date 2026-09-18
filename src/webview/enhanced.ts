import markdownItKatex from '@vscode/markdown-it-katex';
import footnote from 'markdown-it-footnote';

import type { EnhancedApi } from './enhancedApi';

// 獨立 bundle，只在切到增強預覽時才由 main.js 載入；markdown-it 本體沿用主 bundle 的實例。
const api: EnhancedApi = {
  apply(md) {
    md.use(markdownItKatex, { enableFencedBlocks: true, throwOnError: false });
    md.use(footnote);
  },
};

(window as unknown as { markdooownEnhanced: EnhancedApi }).markdooownEnhanced = api;
