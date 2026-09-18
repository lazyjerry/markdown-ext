import type MarkdownIt from 'markdown-it';

// 與 render.ts 分開：enhanced.js 也要用，render.ts 會把 highlight.js 與 markdown-it 本體帶進那份 bundle。
type RenderRule = NonNullable<MarkdownIt['renderer']['rules'][string]>;
type Token = Parameters<RenderRule>[0][number];

/** 清洗後由 sanitize.ts 換回原始輸出的佔位元素。 */
export const TRUSTED_TAG = 'markdooown-trusted';

/** md.render 的 env 帶 `trusted` 陣列時，trustRules 標記的規則輸出會收進陣列、改輸出佔位元素。 */
export interface TrustedEnv {
  trusted?: string[];
}

/**
 * KaTeX 的排版靠 inline style，整份清洗會把它剝掉；它的輸出由 KaTeX 自己跳脫（未開 trust），
 * 所以只讓這些規則繞過清洗。`when` 用來限縮到規則裡的部分 token（例如只有 math 的 fence）。
 */
export function trustRules(md: MarkdownIt, names: string[], when?: (token: Token) => boolean): void {
  for (const name of names) {
    const original = md.renderer.rules[name];
    if (!original) {
      continue;
    }
    const wrapped: RenderRule = (tokens, idx, options, env: TrustedEnv | undefined, self) => {
      const html = original(tokens, idx, options, env, self);
      if (!env?.trusted || (when && !when(tokens[idx]))) {
        return html;
      }
      env.trusted.push(html);
      return `<${TRUSTED_TAG} data-i="${env.trusted.length - 1}"></${TRUSTED_TAG}>`;
    };
    md.renderer.rules[name] = wrapped;
  }
}
