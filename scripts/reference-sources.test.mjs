import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadSourceLock, readLockedSpecs, scopeSpec } from './reference-sources.mjs';
const scripts = path.dirname(fileURLToPath(import.meta.url));
const hash = (s) => createHash('sha256').update(s).digest('hex');
function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-reference-lock-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const docs = path.join(workspace, 'octo-docs'); fs.mkdirSync(path.join(docs, 'scripts'), { recursive: true });
  for (const file of ['_lib.mjs', 'reference-sources.mjs', 'gen-cli.mjs']) fs.copyFileSync(path.join(scripts, file), path.join(docs, 'scripts', file));
  const lock = loadSourceLock(); lock.operations = { message: ['message.send'], thread: ['thread.list'] }; lock.sources.cli.files = {};
  const dir = path.join(workspace, 'octo-cli/internal/registry/specs'); fs.mkdirSync(dir, { recursive: true });
  const specs = { message: { paths: { '/send': { post: { operationId: 'message.send' } }, '/outside': { post: { operationId: 'message.unreviewed' } } } }, thread: { paths: { '/threads': { get: { operationId: 'thread.list' } } } }, future: { paths: { '/new': { get: { operationId: 'future.unreleased' } } } } };
  for (const [name, spec] of Object.entries(specs)) {
    const raw = JSON.stringify(spec); fs.writeFileSync(path.join(dir, name + '.json'), raw);
    if (lock.operations[name]) lock.sources.cli.files[`internal/registry/specs/${name}.json`] = hash(raw);
  }
  const save = () => fs.writeFileSync(path.join(docs, 'scripts/reference-sources.json'), JSON.stringify(lock)); save();
  return { workspace, docs, dir, lock, save, run: (...args) => spawnSync(process.execPath, [path.join(docs, 'scripts/gen-cli.mjs'), ...args], { encoding: 'utf8' }) };
}

test('locked scope preserves only reviewed operations/domains in both languages', (t) => {
  const f = fixture(t); assert.equal(f.run().status, 0);
  for (const prefix of ['', 'zh/']) {
    const s = fs.readFileSync(path.join(f.docs, prefix, 'reference/cli/message.mdx'), 'utf8');
    assert.match(s, /message send/); assert.doesNotMatch(s, /unreviewed/);
    assert.equal(fs.existsSync(path.join(f.docs, prefix, 'reference/cli/future.mdx')), false);
  }
  assert.equal(f.run('--check').status, 0);
});
test('mutating even an unselected locked source fails before any output', (t) => {
  const f = fixture(t); fs.appendFileSync(path.join(f.dir, 'thread.json'), '\n');
  const r = f.run('--domains', 'message'); assert.notEqual(r.status, 0); assert.match(r.stderr, /differs from pinned/);
  assert.equal(fs.existsSync(path.join(f.docs, 'reference')), false);
});
test('missing locked input fails before any output', (t) => {
  const f = fixture(t); fs.unlinkSync(path.join(f.dir, 'thread.json'));
  const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /Missing locked input/);
  assert.equal(fs.existsSync(path.join(f.docs, 'reference')), false);
});
test('a missing reviewed operation is not silently filtered away', (t) => {
  const f = fixture(t); f.lock.operations.message = ['message.missing']; f.save();
  const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /Documented operation missing/);
  assert.equal(fs.existsSync(path.join(f.docs, 'reference')), false);
});
test('translated output drift is detected without rewriting it', (t) => {
  const f = fixture(t); assert.equal(f.run().status, 0);
  const p = path.join(f.docs, 'zh/reference/cli/message.mdx'); fs.appendFileSync(p, '\ntranslation drift\n');
  const before = fs.readFileSync(p, 'utf8'); assert.equal(f.run('--check').status, 1); assert.equal(fs.readFileSync(p, 'utf8'), before);
});
test('source metadata rejects floating refs and paths outside the source tree', (t) => {
  const f = fixture(t); f.lock.sources.cli.revision = 'main'; f.save(); assert.throws(() => loadSourceLock(f.docs), /Invalid fixed source metadata/);
  f.lock.sources.cli.revision = 'd564a63bbd8ec2dd4305a40a64fe0179ca9c667f'; f.lock.sources.auth.files = { '../escape': '0'.repeat(64) }; f.save();
  assert.throws(() => loadSourceLock(f.docs), /Invalid locked input/);
});
test('disabled/duplicate contracts fail and scope filtering does not mutate input', () => {
  assert.throws(() => scopeSpec('message', { 'x-octo-disabled': true }, ['message.send']), /disabled/);
  const spec = { paths: { '/a': { get: { operationId: 'message.send' } }, '/b': { post: { operationId: 'message.send' } } } };
  assert.throws(() => scopeSpec('message', spec, ['message.send']), /Duplicate/);
  const single = { paths: { '/a': { get: { operationId: 'message.send' }, delete: { operationId: 'message.unreviewed' } } } };
  const before = JSON.stringify(single); assert.ok(scopeSpec('message', single, ['message.send']).paths['/a'].get); assert.equal(JSON.stringify(single), before);
});
test('GitHub revision output and workflow use exact refs, not default-branch clones', () => {
  const r = spawnSync(process.execPath, [path.join(scripts, 'reference-sources.mjs'), '--github-output'], { encoding: 'utf8' });
  assert.equal(r.status, 0); assert.match(r.stdout, /^cli=[a-f0-9]{40}\nauth=[a-f0-9]{40}\nserver=[a-f0-9]{40}\n$/);
  const workflow = fs.readFileSync(path.join(scripts, '../.github/workflows/docs.yml'), 'utf8');
  for (const id of ['cli', 'auth', 'server']) assert.ok(workflow.includes(`ref: \${{ steps.sources.outputs.${id} }}`));
  assert.doesNotMatch(workflow, /git clone/); assert.match(workflow, /npm ci/);
});
