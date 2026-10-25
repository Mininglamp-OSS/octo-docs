import assert from 'node:assert/strict';
import test from 'node:test';
import { operationNote } from './operation-notes.mjs';

test('HTML deletion policy stays distinct from response and unverified enforcement in both languages', () => {
  const en = operationNote('html.rm', 'en');
  const zh = operationNote('html.rm', 'zh');
  assert.match(en, /Bots must not invoke/);
  assert.match(en, /`200 Deleted` response schema/);
  assert.match(en, /does not establish that Bot requests always return HTTP 403/);
  assert.match(en, /enforcement has not been verified/);
  assert.match(en, /stop without retrying or changing identity\/Space/);
  assert.match(zh, /Bot 不得调用/);
  assert.match(zh, /`200 Deleted` 响应 schema/);
  assert.match(zh, /不能证明 Bot 请求必定返回 HTTP 403/);
  assert.match(zh, /未验证 HTML 服务/);
  assert.match(zh, /不重试或切换身份\/Space/);
});

test('the HTML clarification is not applied to docs.delete or other operations', () => {
  for (const id of ['docs.delete', 'html.publish', 'file.upload']) {
    assert.equal(operationNote(id, 'en'), '');
    assert.equal(operationNote(id, 'zh'), '');
  }
});

test('a source revision change or missing translation requires review rather than stale output', () => {
  assert.throws(() => operationNote('html.rm', 'en', '0'.repeat(40)), /Review html.rm/);
  assert.throws(() => operationNote('html.rm', 'missing'), /Missing html.rm note translation/);
});
