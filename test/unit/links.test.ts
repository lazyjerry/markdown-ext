import * as assert from 'node:assert/strict';

import { classifyLink, isWithin } from '../../src/core/links';

suite('classifyLink', () => {
  test('外部連結', () => {
    assert.deepEqual(classifyLink('https://example.com/a'), { kind: 'external', url: 'https://example.com/a' });
    assert.deepEqual(classifyLink('mailto:a@b.c'), { kind: 'external', url: 'mailto:a@b.c' });
  });

  test('頁內錨點會解碼', () => {
    assert.deepEqual(classifyLink('#%E5%AE%89%E8%A3%9D'), { kind: 'anchor', id: '安裝' });
  });

  test('相對檔案路徑拆出 fragment、去掉 query', () => {
    assert.deepEqual(classifyLink('docs/my%20file.md?x=1#usage'), {
      kind: 'file',
      path: 'docs/my file.md',
      fragment: 'usage',
    });
  });

  test('危險或未知 scheme 不處理', () => {
    assert.equal(classifyLink('javascript:alert(1)'), null);
    assert.equal(classifyLink('data:text/html,x'), null);
    assert.equal(classifyLink('  '), null);
  });

  test('vscode: 不當外部連結開啟', () => {
    assert.equal(classifyLink('vscode:extension/evil.ext'), null);
    assert.equal(classifyLink('VSCODE://vscode.git/clone?url=x'), null);
  });
});

suite('isWithin', () => {
  const base = 'file:///Users/me/repo';

  test('同目錄、子目錄都算在內', () => {
    assert.equal(isWithin('file:///Users/me/repo', base), true);
    assert.equal(isWithin('file:///Users/me/repo/docs/a.md', base), true);
    assert.equal(isWithin('file:///Users/me/repo/docs/a.md', `${base}/`), true);
  });

  test('上層、根目錄與同前綴的兄弟目錄不算', () => {
    assert.equal(isWithin('file:///Users/me/a.md', base), false);
    assert.equal(isWithin('file:///etc/hosts', base), false);
    assert.equal(isWithin('file:///Users/me/repo-evil/a.md', base), false);
  });
});
