/** Validate hand-written guide provenance, not product behavior or deployments. No network I/O. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCUMENTS = ['guides/teams/admin-console.mdx', 'zh/guides/teams/admin-console.mdx'];
const REPOSITORIES = { admin: 'octo-admin', server: 'octo-server' };
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safePath = (s) => typeof s === 'string' && !path.isAbsolute(s) && !s.includes('\\') &&
  s.split('/').every((p) => p && p !== '.' && p !== '..');

export function loadGuideLock(root = ROOT) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'scripts/admin-guide-sources.json'), 'utf8'));
  if (lock.schema !== 1 || JSON.stringify(lock.documents) !== JSON.stringify(DOCUMENTS) ||
      Object.keys(lock.sources ?? {}).sort().join(',') !== 'admin,server')
    throw new Error('Invalid admin guide lock schema/documents/sources');
  for (const [id, repo] of Object.entries(REPOSITORIES)) {
    const s = lock.sources[id];
    if (s.repository !== `Mininglamp-OSS/${repo}` || s.directory !== `${repo}-guide` ||
        s.label !== (id === 'admin' ? 'Admin' : 'Server') || !/^v\d+\.\d+\.\d+$/.test(s.tag) ||
        !/^[a-f0-9]{40}$/.test(s.revision) || !s.files || !Object.keys(s.files).length)
      throw new Error(`Invalid guide source metadata: ${id}`);
    for (const [file, hash] of Object.entries(s.files))
      if (!safePath(file) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid guide input: ${file}`);
  }
  return lock;
}

export function verifyGuideDocuments({ root = ROOT, lock = loadGuideLock(root) } = {}) {
  for (const document of lock.documents) {
    const text = fs.readFileSync(path.join(root, document), 'utf8');
    for (const s of Object.values(lock.sources)) {
      // Keep the release label, tag URL and parenthesized SHA together in both languages.
      const assertion = `[${s.label} ${s.tag}](https://github.com/${s.repository}/releases/tag/${s.tag})`;
      if (!new RegExp(escape(assertion) + '\\s*[（(]`' + s.revision + '`[）)]').test(text))
        throw new Error(`${document}: missing or mismatched ${s.label} release assertion`);
      const seen = new Set();
      const urls = text.match(/https?:\/\/(?:github\.com|raw\.githubusercontent\.com)\/[^\s)<>"'`]+/gi) ?? [];
      for (const url of urls) {
        const parsed = new URL(url);
        if (!parsed.pathname.toLowerCase().startsWith(`/${s.repository.toLowerCase()}/`)) continue;
        // Reject alternate spellings/transports rather than silently ignoring extra source links.
        if (!url.startsWith(`https://github.com/${s.repository}/`))
          throw new Error(`${document}: noncanonical source reference: ${url}`);
        const suffix = url.slice(`https://github.com/${s.repository}/`.length);
        if (suffix.startsWith('releases/tag/')) {
          if (suffix !== `releases/tag/${s.tag}`) throw new Error(`${document}: release tag drift: ${url}`);
          continue;
        }
        if (!/^(blob|tree|raw)\//.test(suffix)) continue;
        const match = suffix.match(/^blob\/([a-f0-9]{40})\/([^#?]+)(?:#L(\d+)(?:-L(\d+))?)?$/);
        if (!match || match[1] !== s.revision || !Object.hasOwn(s.files, match[2]))
          throw new Error(`${document}: unlocked or mismatched source reference: ${url}`);
        seen.add(match[2]);
      }
      for (const file of Object.keys(s.files))
        if (!seen.has(file)) throw new Error(`${document}: missing source reference: ${file}`);
    }
    for (const sha of text.match(/\b[a-f0-9]{40}\b/g) ?? [])
      if (!Object.values(lock.sources).some((s) => s.revision === sha))
        throw new Error(`${document}: unexpected source SHA: ${sha}`);
  }
}

export function gitCommit(directory, ref) {
  return execFileSync('git', ['-C', directory, 'rev-parse', '--verify', `${ref}^{commit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function verifyGuideSources({ lock = loadGuideLock(), workspace = path.dirname(ROOT), resolveCommit = gitCommit } = {}) {
  for (const s of Object.values(lock.sources)) {
    const directory = path.join(workspace, s.directory);
    if (resolveCommit(directory, 'HEAD') !== s.revision) throw new Error(`${s.repository}: checkout SHA mismatch`);
    if (resolveCommit(directory, `refs/tags/${s.tag}`) !== s.revision)
      throw new Error(`${s.repository}: release tag peel mismatch`);
    for (const [file, expected] of Object.entries(s.files)) {
      const input = path.join(directory, file);
      if (!fs.existsSync(input)) throw new Error(`Missing guide input: ${file}`);
      if (createHash('sha256').update(fs.readFileSync(input)).digest('hex') !== expected)
        throw new Error(`Mismatched guide input bytes: ${file}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = loadGuideLock();
  if (process.argv.includes('--github-output')) {
    for (const [id, s] of Object.entries(lock.sources)) console.log(`${id}=${s.revision}`);
  } else {
    verifyGuideDocuments({ lock });
    if (!process.argv.includes('--documents-only')) verifyGuideSources({ lock });
    console.log(process.argv.includes('--documents-only') ? 'Guide document provenance verified (source checkouts not checked)' :
      'Guide documents, source bytes, checkout SHAs and release tag commits verified; product behavior and deployment not tested');
  }
}
