import assert from 'node:assert/strict';
import test from 'node:test';
import { flagsFor } from './gen-cli.mjs';

test('released query/header and body flag spelling preserves aliases and camelCase', () => {
  const op = {
    parameters: [
      { name: 'channel_id', in: 'query', schema: { type: 'string' } },
      { name: 'If-Match', in: 'header', 'x-octo-flag': 'base-version', schema: { type: 'string' } },
      { name: 'fileSize', in: 'query', schema: { type: 'integer' } },
      { name: 'ignored_path', in: 'path', schema: { type: 'string' } },
    ],
    requestBody: { content: { 'application/json': { schema: {
      type: 'object', properties: {
        idempotency_key: { type: 'string' },
        on_behalf_of: { type: 'string' },
        channel_id: { type: 'string', 'x-octo-flag': 'chat-id' },
        camelCase: { type: 'string' },
        payload: { type: 'object' },
      },
    } } } },
  };
  assert.deepEqual(flagsFor(op, {}).map((f) => f.flag), [
    '--channel-id', '--base-version', '--fileSize', '--idempotency-key',
    '--on-behalf-of', '--chat-id', '--camelCase', '--data',
  ]);
});
