import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadGuideLock, verifyGuideDocuments, verifyGuideSources } from './admin-guide-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = loadGuideLock(ROOT);
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-guide-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function documents(t) {
  const root = temporary(t);
  for (const document of lock.documents) {
    fs.mkdirSync(path.dirname(path.join(root, document)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, document), path.join(root, document));
  }
  return root;
}
function mutate(root, document, change) {
  const file = path.join(root, document);
  const original = fs.readFileSync(file, 'utf8');
  const updated = change(original);
  assert.notEqual(updated, original, 'fixture mutation must change the document');
  fs.writeFileSync(file, updated);
}

test('current bilingual guide has all locked release and source references', () => {
  verifyGuideDocuments({ root: ROOT, lock });
});
for (const document of lock.documents) {
  for (const [id, s] of Object.entries(lock.sources)) {
    const file = Object.keys(s.files)[0];
    const url = `https://github.com/${s.repository}/blob/${s.revision}/${file}`;
    // Append links: all required canonical references remain present, so they cannot mask extras.
    const extraLinks = {
      'raw mutable source': `https://raw.githubusercontent.com/${s.repository}/main/${file}`,
      'raw locked source': `https://raw.githubusercontent.com/${s.repository}/${s.revision}/${file}`,
      'HTTP blob source': url.replace('https:', 'http:'),
      'HTTP tree source': url.replace('https:', 'http:').replace('/blob/', '/tree/'),
      'HTTP raw source': url.replace('https:', 'http:').replace('/blob/', '/raw/'),
      'GitHub raw source': url.replace('/blob/', '/raw/'),
      'extra unlocked file': url.replace(file, 'unreviewed.ts'),
      'extra malformed ref': url.replace(s.revision, 'main'),
    };
    for (const [name, extra] of Object.entries(extraLinks)) test(`${document}: ${id} rejects appended ${name}`, (t) => {
      const root = documents(t);
      mutate(root, document, (text) => `${text}\n[Extra source](${extra})\n`);
      assert.throws(() => verifyGuideDocuments({ root, lock }), /source reference/);
    });
    const mutations = {
      'release SHA drift': (text) => text.replace(s.revision, '0'.repeat(40)),
      'release tag drift': (text) => text.replaceAll(s.tag, 'v99.0.0'),
      'missing reference': (text) => text.replace(url, '/missing-source'),
      'unlocked file': (text) => text.replace(url, url.replace(file, 'unreviewed.ts')),
      'mismatched reference SHA': (text) => text.replace(url, url.replace(s.revision, '0'.repeat(40))),
      'mutable reference': (text) => text.replace(url, url.replace(s.revision, 'main')),
      'tree reference': (text) => text.replace(url, url.replace('/blob/', '/tree/')),
    };
    for (const [name, change] of Object.entries(mutations)) test(`${document}: ${id} rejects ${name}`, (t) => {
      const root = documents(t);
      mutate(root, document, change);
      assert.throws(() => verifyGuideDocuments({ root, lock }), /release assertion|source reference|source SHA|tag drift/);
    });
  }
}

test('malformed lock cannot remove a language or weaken a source revision', (t) => {
  const root = temporary(t);
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const change of [
    (l) => l.documents.pop(),
    (l) => { l.sources.admin.revision = 'main'; },
    (l) => { l.sources.server.files = {}; },
    (l) => { l.sources.admin.files['../secret'] = '0'.repeat(64); },
  ]) {
    const copy = structuredClone(lock); change(copy);
    fs.writeFileSync(path.join(root, 'scripts/admin-guide-sources.json'), JSON.stringify(copy));
    assert.throws(() => loadGuideLock(root), /Invalid/);
  }
});

function source(t, annotated = true) {
  const workspace = temporary(t), directory = 'source';
  const root = path.join(workspace, directory);
  fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c',
    'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  fs.writeFileSync(path.join(root, 'source.txt'), 'reviewed source\n');
  git('add', 'source.txt'); git('commit', '--quiet', '-m', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  if (annotated) git('tag', '-a', 'v1.0.0', '-m', 'release'); else git('tag', 'v1.0.0');
  const files = { 'source.txt': createHash('sha256').update('reviewed source\n').digest('hex') };
  return { workspace, root, git, lock: { sources: { fixture: { directory, repository: 'fixture/source', revision, tag: 'v1.0.0', files } } } };
}
for (const annotated of [true, false]) test(`validates ${annotated ? 'annotated' : 'lightweight'} release tag against actual Git commit`, (t) => {
  verifyGuideSources(source(t, annotated));
});
for (const mode of ['missing file', 'changed bytes', 'wrong HEAD', 'tag peel mismatch', 'missing tag']) test(`source checkout rejects ${mode}`, (t) => {
  const fixture = source(t);
  const file = path.join(fixture.root, 'source.txt');
  if (mode === 'missing file') fs.unlinkSync(file);
  if (mode === 'changed bytes') fs.writeFileSync(file, 'changed');
  if (mode === 'wrong HEAD' || mode === 'tag peel mismatch') {
    fixture.git('commit', '--quiet', '--allow-empty', '-m', 'another commit');
    if (mode === 'tag peel mismatch') {
      fixture.git('tag', '-f', '-a', 'v1.0.0', '-m', 'moved release');
      fixture.git('checkout', '--quiet', fixture.lock.sources.fixture.revision);
    }
  }
  if (mode === 'missing tag') fixture.git('tag', '-d', 'v1.0.0');
  assert.throws(() => verifyGuideSources(fixture), /Missing guide input|Mismatched guide input|checkout SHA mismatch|tag peel mismatch|Command failed/);
});
