import type MarkdownIt from 'markdown-it';

export interface EnhancedApi {
  apply(md: MarkdownIt): void;
}

/** media/vendor/mermaid.min.js 載入後掛在 window 上的部分介面。 */
export interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}
