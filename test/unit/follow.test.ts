import * as assert from 'node:assert/strict';

import { decideFollow, isPreviewStale } from '../../src/core/follow';

const tab = (path: string, languageId?: string, scheme = 'file') => ({ scheme, path, languageId });

suite('decideFollow', () => {
  test('Markdown 檔案 → show（已載入看 languageId）', () => {
    assert.equal(decideFollow(tab('/a/README.md', 'markdown')), 'show');
    assert.equal(decideFollow(tab('Untitled-1', 'markdown', 'untitled')), 'show');
  });

  test('以預覽模式開啟、文件未載入 → 依副檔名 show', () => {
    assert.equal(decideFollow(tab('/a/README.md')), 'show');
    assert.equal(decideFollow(tab('/a/NOTES.MARKDOWN')), 'show');
  });

  test('非 Markdown 檔案 → idle，停止追蹤', () => {
    assert.equal(decideFollow(tab('/a/b.ts', 'typescript')), 'idle');
    assert.equal(decideFollow(tab('/a/logo.png')), 'idle');
  });

  test('languageId 優先於副檔名', () => {
    assert.equal(decideFollow(tab('/a/notes.txt', 'markdown')), 'show');
    assert.equal(decideFollow(tab('/a/x.md', 'plaintext')), 'idle');
  });

  test('沒有對應檔案的分頁（設定、webview）→ keep，不能清掉預覽', () => {
    assert.equal(decideFollow(undefined), 'keep');
  });

  test('非檔案類 scheme → keep', () => {
    assert.equal(decideFollow(tab('/x.md', 'markdown', 'git')), 'keep');
    assert.equal(decideFollow(tab('extension-output', 'Log', 'output')), 'keep');
  });
});

suite('isPreviewStale', () => {
  const A = 'file:///a/README.md';
  const B = 'file:///a/NOTES.md';

  test('切到另一份 Markdown → 過時', () => {
    assert.equal(isPreviewStale('show', B, A, false), true);
    assert.equal(isPreviewStale('show', A, A, false), false);
  });

  test('顯示中的文件被改過 → 過時', () => {
    assert.equal(isPreviewStale('show', A, A, true), true);
    assert.equal(isPreviewStale('keep', undefined, A, true), true);
  });

  test('分頁沒有對應檔案且沒改過 → 不算過時', () => {
    assert.equal(isPreviewStale('keep', undefined, A, false), false);
  });

  test('切到非 Markdown → 過時，已經在待機就不是', () => {
    assert.equal(isPreviewStale('idle', 'file:///a/b.ts', A, false), true);
    assert.equal(isPreviewStale('idle', 'file:///a/b.ts', null, false), false);
  });

  test('還沒顯示過任何東西 → 過時', () => {
    assert.equal(isPreviewStale('show', A, undefined, false), true);
    assert.equal(isPreviewStale('idle', 'file:///a/b.ts', undefined, false), true);
  });
});
