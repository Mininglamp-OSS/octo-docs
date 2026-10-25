import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = path.dirname(fileURLToPath(import.meta.url));

function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-config-test-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const docs = path.join(workspace, 'octo-docs');
  fs.mkdirSync(path.join(docs, 'scripts'), { recursive: true });
  for (const file of ['gen-config.mjs', '_lib.mjs', 'config-environment.json']) {
    fs.copyFileSync(path.join(scripts, file), path.join(docs, 'scripts', file));
  }
  const configDir = path.join(workspace, 'octo-server/configs');
  fs.mkdirSync(configDir, { recursive: true });
  // No environment variable in the YAML: this is the original omission case.
  fs.writeFileSync(path.join(configDir, 'tsdd.yaml'), 'mode: "debug" # mode\n');
  return {
    docs,
    run: (...args) => spawnSync(process.execPath, [path.join(docs, 'scripts/gen-config.mjs'), ...args], { encoding: 'utf8' }),
    page: (lang) => path.join(docs, lang === 'zh' ? 'zh' : '', 'reference/configuration.mdx'),
  };
}

test('environment-only contract appears in both languages without a YAML key', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const data = JSON.parse(fs.readFileSync(path.join(scripts, 'config-environment.json'), 'utf8'));
  for (const lang of ['en', 'zh']) {
    const page = fs.readFileSync(f.page(lang), 'utf8');
    assert.match(page, /### OCTO_USER_API_KEY_SECRET/);
    assert.ok(page.includes(data.variables[0][lang].format));
    assert.ok(page.includes(data.variables[0][lang].rotation));
    assert.ok(page.includes(data.variables[0][lang].failure));
    for (const source of data.sources) assert.ok(page.includes(`/blob/${data.revision}/${source}`));
    assert.ok(page.includes(`${lang === 'zh' ? '/zh' : ''}/guides/operators/deploy-compose`));
    assert.match(page, /```bash\nopenssl rand -hex 16\n```/);
    assert.match(page, /\| `mode` \|/); // Template tables are retained.
  }
  assert.equal(f.run('--check').status, 0);
});

test('check detects a missing translated environment section without rewriting it', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const original = fs.readFileSync(f.page('zh'), 'utf8');
  const changed = original.replace('### OCTO_USER_API_KEY_SECRET', '### Missing setting');
  fs.writeFileSync(f.page('zh'), changed);
  const checked = f.run('--check');
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /zh\/reference\/configuration.mdx/);
  assert.equal(fs.readFileSync(f.page('zh'), 'utf8'), changed);
});

test('supplement changes participate in drift detection and regenerate both languages', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const file = path.join(f.docs, 'scripts/config-environment.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.variables[0].en.storage += ' Updated recovery guidance.';
  data.variables[0].zh.storage += ' 更新恢复说明。';
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(f.run('--check').status, 1);
  assert.equal(f.run().status, 0);
  for (const lang of ['en', 'zh']) assert.ok(fs.readFileSync(f.page(lang), 'utf8').includes(data.variables[0][lang].storage));
  assert.equal(f.run('--check').status, 0);
});

test('incomplete translation fails instead of generating a partial contract', (t) => {
  const f = fixture(t);
  const file = path.join(f.docs, 'scripts/config-environment.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete data.variables[0].zh.rotation;
  fs.writeFileSync(file, JSON.stringify(data));
  const generated = f.run();
  assert.notEqual(generated.status, 0);
  assert.match(generated.stderr, /Missing zh.rotation/);
  assert.equal(fs.existsSync(f.page('en')), false);
  assert.equal(fs.existsSync(f.page('zh')), false);
});
