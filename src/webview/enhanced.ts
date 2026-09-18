import type { EnhancedApi } from './enhancedApi';
import { applyEnhancedPlugins } from './enhancedPlugins';

// 獨立 bundle，只在切到增強預覽時才由 main.js 載入；markdown-it 本體沿用主 bundle 的實例。
const api: EnhancedApi = {
  apply(md) {
    applyEnhancedPlugins(md);
  },
};

(window as unknown as { markdooownEnhanced: EnhancedApi }).markdooownEnhanced = api;
