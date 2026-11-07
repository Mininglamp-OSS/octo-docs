/** Fixed reference inputs and explicitly reviewed coverage; never fetches upstream. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOCS_ROOT, WORKSPACE, HTTP_METHODS, readJson } from './_lib.mjs';

const REPOSITORIES = { cli: 'octo-cli', auth: 'octo-auth', server: 'octo-server' };
export function loadSourceLock(root = DOCS_ROOT) {
  const lock = readJson(path.join(root, 'scripts/reference-sources.json'));
  if (lock.schema !== 1) throw new Error('Unsupported reference source lock schema');
  for (const [id, directory] of Object.entries(REPOSITORIES)) {
    const src = lock.sources?.[id];
    if (src?.repository !== `Mininglamp-OSS/${directory}` || src.directory !== directory ||
        typeof src.revision !== 'string' || src.revision.length !== 40 ||
        !/^[a-f0-9]{40}$/.test(src.revision) || typeof src.label !== 'string' || !src.label)
      throw new Error(`Invalid fixed source metadata: ${id}`);
    if (id === 'auth') {
      if (src.tag !== null || src.label !== 'contract snapshot (no release tag claimed)')
        throw new Error('Auth source must explicitly remain a tagless contract snapshot');
    } else if (typeof src.tag !== 'string' || src.tag.trim() !== src.tag ||
        !/^v\d+\.\d+\.\d+$/.test(src.tag) || src.label !== src.tag) {
      throw new Error(`Invalid release tag/label: ${id}`);
    }
    if (!src.files || !Object.keys(src.files).length) throw new Error(`Empty source file set: ${id}`);
    for (const [file, digest] of Object.entries(src.files)) {
      if (path.isAbsolute(file) || file.includes('\\') || file.split('/').some((p) => !p || p === '..') ||
          !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid locked input: ${id}/${file}`);
    }
  }
  if (!lock.operations || !Object.keys(lock.operations).length) throw new Error('Empty documented operation set');
  for (const [domain, ids] of Object.entries(lock.operations)) {
    if (!/^[a-z][a-z0-9-]*$/.test(domain) || !Array.isArray(ids) || !ids.length ||
        new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !id.startsWith(domain + '.')) ||
        !lock.sources.cli.files[`internal/registry/specs/${domain}.json`])
      throw new Error(`Invalid documented operation set: ${domain}`);
  }
  const cliFiles = Object.keys(lock.sources.cli.files).sort();
  if (JSON.stringify(cliFiles) !== JSON.stringify(Object.keys(lock.operations).map((n) => `internal/registry/specs/${n}.json`).sort()))
    throw new Error('CLI file set must exactly match documented domains');
  return lock;
}

export function gitCommit(directory, ref) {
  return execFileSync('git', ['-C', directory, 'rev-parse', '--verify', `${ref}^{commit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function verifySource(id, { lock = loadSourceLock(), workspace = WORKSPACE } = {}) {
  const source = lock.sources[id];
  if (!source) throw new Error(`Unknown source: ${id}`);
  const directory = path.join(workspace, source.directory);
  if (gitCommit(directory, 'HEAD') !== source.revision)
    throw new Error(`${source.repository}: checkout SHA mismatch`);
  if (source.tag !== null && gitCommit(directory, `refs/tags/${source.tag}`) !== source.revision)
    throw new Error(`${source.repository}: release tag peel mismatch`);
  for (const [file, expected] of Object.entries(source.files)) {
    const input = path.join(workspace, source.directory, file);
    if (!fs.existsSync(input)) throw new Error(`Missing locked input: ${id}/${file}`);
    const actual = createHash('sha256').update(fs.readFileSync(input)).digest('hex');
    if (actual !== expected) throw new Error(`${file} differs from pinned ${source.label} (${source.revision}); check out the locked source before generating`);
  }
  return source;
}

export function sourceUrl(id, file) {
  const src = loadSourceLock().sources[id];
  return `https://github.com/${src.repository}/blob/${src.revision}/${file}`;
}
export function sourceLabel(id) {
  const src = loadSourceLock().sources[id];
  return `${src.label} (${src.revision})`;
}
export function sourceDescription(id, file) {
  const src = loadSourceLock().sources[id];
  return `${src.directory}/${file} @ ${src.label} (${src.revision})`;
}

export function scopeSpec(domain, spec, ids) {
  if (spec['x-octo-disabled']) throw new Error(`Documented domain is disabled: ${domain}`);
  const remaining = new Set(ids), paths = {};
  for (const [route, item] of Object.entries(spec.paths || {})) {
    const kept = { ...item }; let count = 0;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || !ids.includes(op.operationId)) { delete kept[method]; continue; }
      if (!remaining.delete(op.operationId)) throw new Error(`Duplicate documented operation: ${op.operationId}`);
      count++;
    }
    if (count) paths[route] = kept;
  }
  if (remaining.size) throw new Error(`Documented operation missing from ${domain}: ${[...remaining].join(', ')}`);
  return { ...spec, paths };
}

export function readLockedSpecs({ lock = loadSourceLock(), workspace = WORKSPACE } = {}) {
  verifySource('cli', { lock, workspace }); // All locked CLI bytes checked before any page is emitted.
  return Object.fromEntries(Object.entries(lock.operations).map(([name, ids]) => [name,
    scopeSpec(name, readJson(path.join(workspace, lock.sources.cli.directory, `internal/registry/specs/${name}.json`)), ids)]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = loadSourceLock();
  if (process.argv.includes('--github-output')) {
    for (const id of Object.keys(REPOSITORIES)) console.log(`${id}=${lock.sources[id].revision}`);
  } else {
    for (const id of Object.keys(REPOSITORIES)) verifySource(id, { lock });
    console.log('Locked reference inputs, checkout SHAs and release tag commits verified (auth is tagless)');
  }
}
