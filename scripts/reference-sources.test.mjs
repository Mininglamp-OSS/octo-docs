import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadSourceLock, readLockedSpecs, scopeSpec, verifySource } from './reference-sources.mjs';
const scripts = path.dirname(fileURLToPath(import.meta.url));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const git = (directory, ...args) => execFileSync('git', ['-C', directory,
  '-c', 'user.name=Source fixture', '-c', 'user.email=source-fixture@example.invalid',
  '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-reference-lock-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const docs = path.join(workspace, 'octo-docs'); fs.mkdirSync(path.join(docs, 'scripts'), { recursive: true });
  for (const file of ['_lib.mjs', 'reference-sources.mjs', 'gen-cli.mjs', 'operation-notes.mjs']) fs.copyFileSync(path.join(scripts, file), path.join(docs, 'scripts', file));
  const lock = loadSourceLock(); lock.operations = { message: ['message.send'], thread: ['thread.list'] }; lock.sources.cli.files = {};
  const dir = path.join(workspace, 'octo-cli/internal/registry/specs'); fs.mkdirSync(dir, { recursive: true });
  const specs = { message: { paths: { '/send': { post: { operationId: 'message.send' } }, '/outside': { post: { operationId: 'message.unreviewed' } } } }, thread: { paths: { '/threads': { get: { operationId: 'thread.list' } } } }, future: { paths: { '/new': { get: { operationId: 'future.unreleased' } } } } };
  for (const [name, spec] of Object.entries(specs)) {
    const raw = JSON.stringify(spec); fs.writeFileSync(path.join(dir, name + '.json'), raw);
    if (lock.operations[name]) lock.sources.cli.files[`internal/registry/specs/${name}.json`] = hash(raw);
  }
  const repository = path.join(workspace, 'octo-cli');
  git(repository, 'init', '-q'); git(repository, 'add', '.'); git(repository, 'commit', '-qm', 'fixture');
  lock.sources.cli.revision = git(repository, 'rev-parse', 'HEAD');
  git(repository, 'tag', '-a', lock.sources.cli.tag, '-m', 'fixture release');
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

for (const id of ['cli', 'server']) {
  for (const tag of [undefined, null, 'main', '../escape', 'v1.2.3\n', 'v1.2.3;echo unsafe', ['v1.2.3']]) {
    test(`${id} rejects invalid or missing release tag ${JSON.stringify(tag)}`, (t) => {
      const f = fixture(t); f.lock.sources[id].tag = tag; f.save();
      assert.throws(() => loadSourceLock(f.docs), /Invalid release tag\/label/);
    });
  }
  test(`${id} rejects a release label that disagrees with its tag`, (t) => {
    const f = fixture(t); f.lock.sources[id].label = 'v99.0.0'; f.save();
    assert.throws(() => loadSourceLock(f.docs), /Invalid release tag\/label/);
  });
}
for (const [tag, label] of [[undefined, 'contract snapshot (no release tag claimed)'],
  ['v1.0.0', 'v1.0.0'], [null, 'v1.0.0']]) {
  test(`auth rejects a missing tagless marker or release claim ${JSON.stringify([tag, label])}`, (t) => {
    const f = fixture(t); Object.assign(f.lock.sources.auth, { tag, label }); f.save();
    assert.throws(() => loadSourceLock(f.docs), /explicitly remain a tagless contract snapshot/);
  });
}
for (const revision of ['a'.repeat(40) + '\n', ['a'.repeat(40)]]) {
  test(`source revision rejects non-exact SHA ${JSON.stringify(revision)}`, (t) => {
    const f = fixture(t); f.lock.sources.cli.revision = revision; f.save();
    assert.throws(() => loadSourceLock(f.docs), /Invalid fixed source metadata/);
  });
}

function sourceFixture(t, id, annotated = true) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-source-tag-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const lock = loadSourceLock(); const source = lock.sources[id];
  const directory = path.join(workspace, source.directory); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'input.txt'), 'locked input');
  source.files = { 'input.txt': hash('locked input') };
  git(directory, 'init', '-q'); git(directory, 'add', '.'); git(directory, 'commit', '-qm', 'locked fixture');
  source.revision = git(directory, 'rev-parse', 'HEAD');
  if (source.tag !== null) git(directory, 'tag', ...(annotated ? ['-a', source.tag, '-m', 'release'] : [source.tag]));
  return { directory, source, check: () => verifySource(id, { lock, workspace }) };
}
for (const id of ['cli', 'server']) {
  for (const annotated of [true, false]) {
    test(`${id} accepts a real ${annotated ? 'annotated' : 'lightweight'} tag at the pinned HEAD`, (t) => {
      const f = sourceFixture(t, id, annotated); assert.equal(f.check(), f.source);
    });
  }
  test(`${id} rejects missing release tags, including a same-named branch`, (t) => {
    const f = sourceFixture(t, id); git(f.directory, 'tag', '-d', f.source.tag);
    git(f.directory, 'branch', f.source.tag);
    assert.throws(f.check, /Command failed/);
  });
  test(`${id} rejects a release tag at another commit even with matching input bytes`, (t) => {
    const f = sourceFixture(t, id); const old = f.source.revision;
    git(f.directory, 'commit', '--allow-empty', '-qm', 'another revision');
    git(f.directory, 'tag', '-f', f.source.tag);
    git(f.directory, 'checkout', '-q', '--detach', old);
    assert.throws(f.check, /release tag peel mismatch/);
  });
}
for (const id of ['cli', 'auth', 'server']) {
  test(`${id} rejects a different checkout HEAD even with matching input bytes`, (t) => {
    const f = sourceFixture(t, id); git(f.directory, 'commit', '--allow-empty', '-qm', 'wrong HEAD');
    assert.throws(f.check, /checkout SHA mismatch/);
  });
}
test('auth accepts a real pinned checkout with no tags and explicitly claims no release', (t) => {
  const f = sourceFixture(t, 'auth'); assert.equal(git(f.directory, 'tag', '--list'), '');
  assert.equal(f.source.tag, null); assert.equal(f.check(), f.source);
});
test('CLI generation rejects a mismatched release tag before writing either language', (t) => {
  const f = fixture(t); const directory = path.join(f.workspace, 'octo-cli');
  const old = f.lock.sources.cli.revision;
  git(directory, 'commit', '--allow-empty', '-qm', 'different release');
  git(directory, 'tag', '-f', f.lock.sources.cli.tag); git(directory, 'checkout', '-q', '--detach', old);
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /release tag peel mismatch/);
  assert.equal(fs.existsSync(path.join(f.docs, 'reference')), false);
  assert.equal(fs.existsSync(path.join(f.docs, 'zh/reference')), false);
});
