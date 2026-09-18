import * as assert from 'node:assert/strict';

import { classifyLink } from '../../src/core/links';

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
});
