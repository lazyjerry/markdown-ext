import * as assert from 'node:assert/strict';

import markdownItKatex from '@vscode/markdown-it-katex';
import footnote from 'markdown-it-footnote';

import { createRenderer } from '../../src/webview/render';

// 與 src/webview/enhanced.ts 相同的外掛組合；那支是瀏覽器 bundle 入口，會碰 window，不能直接在 node 載入。
suite('enhanced render', () => {
  const md = createRenderer();
  md.use(markdownItKatex, { enableFencedBlocks: true, throwOnError: false });
  md.use(footnote);

  test('行內與區塊數學式', () => {
    assert.match(md.render('$a^2$\n'), /class="katex"/);
    assert.match(md.render('$$\n\\sum_i x_i\n$$\n'), /katex-display/);
  });

  test('註腳', () => {
    const html = md.render('文字[^1]\n\n[^1]: 說明\n');
    assert.match(html, /class="footnote-ref"/);
    assert.match(html, /class="footnotes"/);
  });

  test('mermaid 區塊保留原始碼供 webview 轉圖', () => {
    assert.match(md.render('```mermaid\ngraph TD; A-->B\n```\n'), /<code class="language-mermaid">graph TD; A--&gt;B/);
  });

  test('基本渲染器不受影響', () => {
    assert.doesNotMatch(createRenderer().render('$a$\n'), /katex/);
  });
});
