import * as assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

import { findMatches, findRanges } from '../../src/webview/search';

suite('search', () => {
  suite('findMatches', () => {
    test('不分大小寫，回傳所有不重疊的位置', () => {
      assert.deepEqual(findMatches('Foo foo FOO', 'foo'), [
        { start: 0, end: 3 },
        { start: 4, end: 7 },
        { start: 8, end: 11 },
      ]);
      assert.deepEqual(findMatches('aaaa', 'aa'), [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
      ]);
    });

    test('regex 字元當字面比對', () => {
      assert.deepEqual(findMatches('a.b axb (c)', 'a.b'), [{ start: 0, end: 3 }]);
      assert.deepEqual(findMatches('a.b axb (c)', '(c)'), [{ start: 8, end: 11 }]);
      assert.deepEqual(findMatches('x\\y', '\\'), [{ start: 1, end: 2 }]);
    });

    test('空關鍵字與找不到都回空陣列', () => {
      assert.deepEqual(findMatches('abc', ''), []);
      assert.deepEqual(findMatches('abc', '搜尋'), []);
    });
  });

  suite('findRanges', () => {
    const { window } = new JSDOM('<!DOCTYPE html><body></body>');

    function root(html: string): HTMLElement {
      const div = window.document.createElement('div');
      div.innerHTML = html;
      return div;
    }

    test('單一文字節點內的結果', () => {
      const ranges = findRanges(root('<p>預覽中搜尋，再搜尋一次</p>'), '搜尋');
      assert.deepEqual(
        ranges.map((r) => r.toString()),
        ['搜尋', '搜尋'],
      );
    });

    test('跨行內元素的字串也找得到', () => {
      const el = root('<p>foo <strong>bar</strong> baz</p>');
      const [range] = findRanges(el, 'o bar b');
      assert.equal(range.toString(), 'o bar b');
      assert.equal(range.startContainer.textContent, 'foo ');
      assert.equal(range.endContainer.textContent, ' baz');
    });

    test('結果剛好落在節點邊界', () => {
      const ranges = findRanges(root('<p><em>ab</em>cd</p>'), 'cd');
      assert.equal(ranges.length, 1);
      assert.equal(ranges[0].startContainer.textContent, 'cd');
      assert.equal(ranges[0].startOffset, 0);
    });

    test('空關鍵字不比對', () => {
      assert.deepEqual(findRanges(root('<p>abc</p>'), ''), []);
    });
  });
});
