import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { flagsFor } from './gen-cli.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));

test('query/header and JSON body flags use dashes; explicit aliases and camelCase survive', () => {
  const op = {
    parameters: [
      { name: 'channel_id', in: 'query', schema: { type: 'string' } },
      { name: 'If-Match', in: 'header', 'x-octo-flag': 'base-version', schema: { type: 'string' } },
      { name: 'fileSize', in: 'query', schema: { type: 'integer' } },
      { name: 'ignored_path', in: 'path', schema: { type: 'string' } },
    ],
    requestBody: { content: { 'application/json': { schema: {
      type: 'object', properties: {
        on_behalf_of: { type: 'string' },
        channel_id: { type: 'string', 'x-octo-flag': 'chat-id' },
        camelCase: { type: 'string' },
        payload: { type: 'object' },
      },
    } } } },
  };
  assert.deepEqual(flagsFor(op, {}).map((f) => f.flag), ['--channel-id', '--base-version', '--fileSize', '--on-behalf-of', '--chat-id', '--camelCase', '--data']);
});

test('multipart upload requires --file, skips binary property aliases, and preserves form fields', () => {
  const op = { 'x-octo-multipart': true, requestBody: { content: { 'multipart/form-data': { schema: {
    type: 'object', required: ['file'], properties: {
      file: { type: 'string', format: 'binary', 'x-octo-flag': 'wrong-file-alias' },
      storage_path: { type: 'string' },
    },
  } } } } };
  const flags = flagsFor(op, {});
  assert.deepEqual(flags.map((f) => f.flag), ['--file', '--storage-path']);
  assert.equal(flags[0].required, true);
});

function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-cli-docs-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const docs = path.join(tmp, 'octo-docs');
  fs.mkdirSync(path.join(docs, 'scripts'), { recursive: true });
  for (const name of ['gen-cli.mjs', '_lib.mjs', 'reference-sources.mjs']) fs.copyFileSync(path.join(scripts, name), path.join(docs, 'scripts', name));
  const specDir = path.join(tmp, 'octo-cli/internal/registry/specs');
  fs.mkdirSync(specDir, { recursive: true });
  const lock = JSON.parse(fs.readFileSync(path.join(scripts, 'reference-sources.json')));
  lock.operations = { message: ['message.send'], file: ['file.upload'] };
  lock.sources.cli.files = {};
  const specs = {
    message: { paths: { '/send': { post: { operationId: 'message.send', parameters: [{ in: 'query', name: 'channel_id', schema: { type: 'string' } }] } }, '/outside-scope': { get: { operationId: 'message.other' } } } },
    file: { paths: { '/upload': { post: { operationId: 'file.upload', 'x-octo-multipart': true, requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } } } } } },
    thread: { paths: {} },
  };
  for (const [name, spec] of Object.entries(specs)) {
    const content = JSON.stringify(spec);
    fs.writeFileSync(path.join(specDir, `${name}.json`), content);
    if (name in lock.operations) lock.sources.cli.files[`internal/registry/specs/${name}.json`] = createHash('sha256').update(content).digest('hex');
  }
  fs.writeFileSync(path.join(docs, 'scripts/reference-sources.json'), JSON.stringify(lock));
  return { docs, specDir, run: (...args) => spawnSync(process.execPath, [path.join(docs, 'scripts/gen-cli.mjs'), ...args], { encoding: 'utf8' }) };
}

test('selected regeneration preserves other domains/index and checks both languages for drift', (t) => {
  const f = fixture(t);
  assert.equal(f.run('--domains', 'message,file').status, 0);
  for (const lang of ['', 'zh/']) {
    const message = fs.readFileSync(path.join(f.docs, lang, 'reference/cli/message.mdx'), 'utf8');
    const file = fs.readFileSync(path.join(f.docs, lang, 'reference/cli/file.mdx'), 'utf8');
    assert.match(message, /--channel-id/);
    assert.doesNotMatch(message, /message other/);
    assert.match(message, /d564a63bbd8ec2dd4305a40a64fe0179ca9c667f/);
    assert.match(file, /\| `--file` \| string \| ✓ \|/);
    assert.equal(fs.existsSync(path.join(f.docs, lang, 'reference/octo-cli.mdx')), false);
    assert.equal(fs.existsSync(path.join(f.docs, lang, 'reference/cli/thread.mdx')), false);
  }
  assert.equal(f.run('--domains', 'message,file', '--check').status, 0);
  fs.appendFileSync(path.join(f.docs, 'zh/reference/cli/file.mdx'), '\nmissing translation drift\n');
  assert.equal(f.run('--domains', 'message,file', '--check').status, 1);
});

test('changed upstream input fails before any output; release preparation is not a new reference', (t) => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.specDir, 'message.json'), '\n');
  const result = f.run('--domains', 'message,file');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from pinned v0.18.0/);
  assert.equal(fs.existsSync(path.join(f.docs, 'reference')), false);
});
