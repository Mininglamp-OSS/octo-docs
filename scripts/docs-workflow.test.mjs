/** Offline checks of the actual inline workflow code, not a second implementation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workflow = fs.readFileSync(new URL('../.github/workflows/docs.yml', import.meta.url), 'utf8');
const steps = workflow.split(/^      - /m).slice(1);
function step(name) {
  const matches = steps.filter((text) => text.startsWith(`name: ${name}\n`));
  assert.equal(matches.length, 1, `Expected one workflow step: ${name}`);
  return matches[0];
}
function run(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('        run: '));
  assert.notEqual(start, -1, 'Expected a run block');
  if (lines[start] !== '        run: |') return lines[start].slice(13);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}
function inlineNode(name) {
  const lines = run(step(name)).split('\n');
  assert.equal(lines.shift(), "node <<'NODE'");
  assert.equal(lines.pop(), 'NODE');
  return lines.join('\n');
}
const reader = inlineNode('Read fixed source revisions');
const verifier = inlineNode('Record and verify input revisions');
const referenceFile = 'scripts/reference-sources.json';
const guideFile = 'scripts/admin-guide-sources.json';
const locks = Object.fromEntries([referenceFile, guideFile].map((file) => [file,
  JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))]));
const sources = [
  [referenceFile, 'cli', 'cli', 'CLI_REVISION', 'octo-cli'],
  [referenceFile, 'auth', 'auth', 'AUTH_REVISION', 'octo-auth'],
  [referenceFile, 'server', 'server', 'SERVER_REVISION', 'octo-server'],
  [guideFile, 'admin', 'guide_admin', 'ADMIN_GUIDE_REVISION', 'octo-admin-guide'],
  [guideFile, 'server', 'guide_server', 'SERVER_GUIDE_REVISION', 'octo-server-guide'],
];
function read(inputs) {
  const writes = [];
  try {
    vm.runInNewContext(reader, {
      require(name) {
        assert.equal(name, 'node:fs', 'The reader must not load repository code');
        return {
          readFileSync(file, encoding) {
            assert.equal(encoding, 'utf8');
            assert.ok(Object.hasOwn(inputs, file));
            return JSON.stringify(inputs[file]);
          },
          appendFileSync(file, value) { assert.equal(file, 'output-file'); writes.push(value); },
        };
      },
      process: { env: { GITHUB_OUTPUT: 'output-file' } },
    }, { timeout: 1000 });
  } catch (error) { return { writes, error }; }
  return { writes };
}
const environment = Object.fromEntries(sources.map(([file, key, , variable]) =>
  [variable, locks[file].sources[key].revision]));
function verify(env = environment, wrongHead) {
  const calls = [];
  vm.runInNewContext(verifier, {
    require(name) {
      assert.equal(name, 'node:child_process');
      return { execFileSync(command, args, options) {
        const directory = sources[calls.length][4];
        assert.equal(command, 'git');
        assert.deepEqual(Array.from(args), ['-C', directory, 'rev-parse', 'HEAD']);
        assert.equal(options.encoding, 'utf8');
        assert.equal(options.shell, undefined);
        calls.push(directory);
        return `${wrongHead === directory ? '0'.repeat(40) : environment[sources[calls.length - 1][3]]}\n`;
      } };
    },
    process: { env }, console: { log() {} },
  }, { timeout: 1000 });
  return calls;
}

test('PR workflow has read-only permissions, no token exports and no privileged trigger', () => {
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.equal((workflow.match(/\bpermissions:/g) || []).length, 1);
  assert.match(workflow, /^  pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request_target:|workflow_run:|secrets\.|github\.token|\btoken:/);
});
test('all six immutable checkouts disable credential persistence', () => {
  const checkouts = steps.filter((text) => text.startsWith('uses: actions/checkout@'));
  assert.equal(checkouts.length, 6);
  for (const text of checkouts) {
    assert.match(text, /^uses: actions\/checkout@[0-9a-f]{40} # /);
    assert.match(text, /^          persist-credentials: false$/m);
  }
});
test('released reference and guide checkouts include tags while auth stays tagless', () => {
  for (const directory of ['octo-cli', 'octo-server', 'octo-admin-guide', 'octo-server-guide']) {
    const checkout = steps.find((text) => text.includes(`          path: ${directory}\n`));
    assert.match(checkout, /^          fetch-depth: 0(?: #.*)?$/m);
  }
  assert.equal(locks[referenceFile].sources.auth.tag, null);
  assert.equal(locks[referenceFile].sources.auth.label, 'contract snapshot (no release tag claimed)');
});
test('expressions never become shell source and repository code follows all checkouts', () => {
  for (const text of steps.filter((text) => text.includes('        run: '))) {
    assert.doesNotMatch(run(text), /\$\{\{/);
  }
  const lastCheckout = steps.findLastIndex((text) => text.startsWith('uses: actions/checkout@'));
  const earlyRuns = steps.slice(0, lastCheckout).filter((text) => text.includes('        run: '));
  assert.deepEqual(earlyRuns, [step('Read fixed source revisions')]);
  for (const [, , output, variable, directory] of sources) {
    const expression = '${{ steps.sources.outputs.' + output + ' }}';
    assert.ok(step('Record and verify input revisions').includes(`${variable}: ${expression}`));
    const checkout = steps.find((text) => text.includes(`          path: ${directory}\n`));
    assert.ok(checkout?.includes(`ref: ${expression}`));
  }
});
test('the real lock files emit only five fixed-name SHA outputs', () => {
  const result = read(locks);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.writes, [sources.map(([file, key, output]) =>
    `${output}=${locks[file].sources[key].revision}\n`).join('')]);
});
test('all five HEAD comparisons use parameterized git and environment data', () => {
  assert.deepEqual(verify(), sources.map((source) => source[4]));
});

const invalidRevisions = [
  '', 'main', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'a'.repeat(40) + '\n',
  "'; echo injected; #", '$(echo injected)', '`echo injected`',
  'a'.repeat(40) + '\nextra=value', null, 123, ['a'.repeat(40)],
];
for (const [file, key, output, variable, directory] of sources) {
  test(`${output} rejects a mismatched HEAD`, () => {
    assert.throws(() => verify(environment, directory), /Revision mismatch/);
  });
  for (const [index, revision] of invalidRevisions.entries()) {
    test(`${output} rejects malformed or shell-like revision ${index} without output`, () => {
      const inputs = structuredClone(locks);
      inputs[file].sources[key].revision = revision;
      const result = read(inputs);
      assert.match(result.error?.message ?? '', /Invalid fixed source metadata/);
      assert.deepEqual(result.writes, []);
      // Environment validation is independent of the lock-file reader.
      assert.throws(() => verify({ ...environment, [variable]: revision }), /Invalid revision/);
    });
  }
  for (const field of ['repository', 'directory']) {
    test(`${output} rejects changed ${field}`, () => {
      const inputs = structuredClone(locks);
      inputs[file].sources[key][field] = '../untrusted';
      const result = read(inputs);
      assert.match(result.error?.message ?? '', /Invalid fixed source metadata/);
      assert.deepEqual(result.writes, []);
    });
  }
  test(`${output} rejects a missing source`, () => {
    const inputs = structuredClone(locks);
    delete inputs[file].sources[key];
    const result = read(inputs);
    assert.match(result.error?.message ?? '', /Invalid fixed source metadata/);
    assert.deepEqual(result.writes, []);
  });
}
for (const file of [referenceFile, guideFile]) {
  test(`${file} rejects an unknown schema without partial output`, () => {
    const inputs = structuredClone(locks);
    inputs[file].schema = 2;
    const result = read(inputs);
    assert.match(result.error?.message ?? '', /Unsupported source lock schema/);
    assert.deepEqual(result.writes, []);
  });
}
