import * as assert from 'node:assert/strict';

import { createRenderer, resolveResource, slugify } from '../../src/webview/render';

suite('render', () => {
  const md = createRenderer();

  test('任務清單轉成 checkbox', () => {
    const html = md.render('- [ ] todo\n- [x] done\n- normal\n');
    assert.match(html, /<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled> todo/);
    assert.match(html, /disabled checked> done/);
    assert.match(html, /<li>normal<\/li>/);
  });

  test('標題帶錨點 id，重複標題加序號', () => {
    const html = md.render('# 安裝 Setup\n\n## FAQ\n\n## FAQ\n');
    assert.match(html, /<h1 id="安裝-setup">/);
    assert.match(html, /<h2 id="faq">/);
    assert.match(html, /<h2 id="faq-1">/);
  });

  test('已知語言做語法高亮，未知語言只跳脫', () => {
    assert.match(md.render('```ts\nconst a = 1;\n```\n'), /hljs-keyword/);
    assert.match(md.render('```nope\n<b>\n```\n'), /&lt;b&gt;/);
  });

  test('表格與刪除線', () => {
    const html = md.render('| a | b |\n|---|---|\n| 1 | ~~2~~ |\n');
    assert.match(html, /<table>/);
    assert.match(html, /<s>2<\/s>/);
  });

  test('slugify 去除標點', () => {
    assert.equal(slugify('Hello, World!'), 'hello-world');
  });

  test('resolveResource 只解析相對路徑', () => {
    const base = 'https://file+.vscode-resource.vscode-cdn.net/Users/me/docs/';
    assert.equal(resolveResource('img/a b.png', base), `${base}img/a%20b.png`);
    assert.equal(resolveResource('../x.png', base), 'https://file+.vscode-resource.vscode-cdn.net/Users/me/x.png');
    assert.equal(resolveResource('https://e.com/a.png', base), 'https://e.com/a.png');
    assert.equal(resolveResource('data:image/png;base64,AA', base), 'data:image/png;base64,AA');
    assert.equal(resolveResource('/abs.png', base), '/abs.png');
    assert.equal(resolveResource('a.png', ''), 'a.png');
  });

  test('開頭的 YAML front matter 畫成欄位表，巢狀物件與網址可讀', () => {
    const html = md.render('---\nticket: HRM-1\ndate: 2026-09-29\nrefs:\n  spec: https://example.com/a\ntags: [a, b]\n---\n\n# Title\n');
    assert.match(html, /^<table class="front-matter"><tbody><tr><th>ticket<\/th><td>HRM-1<\/td><\/tr>/);
    assert.match(html, /<th>date<\/th><td>2026-09-29<\/td>/);
    assert.match(html, /<table class="front-matter-nested"><tbody><tr><th>spec<\/th><td><a href="https:\/\/example.com\/a">/);
    assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
    assert.match(html, /<h1 id="title">Title<\/h1>/);
    assert.doesNotMatch(html, /<h2|<hr/);
  });

  test('front matter 的值會跳脫，不當 Markdown 或 HTML', () => {
    const html = md.render('---\ntitle: "<b>x</b> *y*"\n---\n');
    assert.match(html, /<td>&lt;b&gt;x&lt;\/b&gt; \*y\*<\/td>/);
  });

  test('YAML 解析失敗退回高亮原文', () => {
    assert.match(md.render('---\na: [1\n---\n'), /<pre class="front-matter-raw"><code class="language-yaml">/);
  });

  test('不在第一行的 --- 照常是分隔線', () => {
    const html = md.render('text\n\n---\na: 1\n---\n');
    assert.doesNotMatch(html, /front-matter/);
    assert.match(html, /<hr>/);
  });
});
