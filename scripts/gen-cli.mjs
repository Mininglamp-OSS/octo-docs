#!/usr/bin/env node
/**
 * gen-cli.mjs — octo-cli command reference generator (SSOT → Mintlify MDX).
 *
 * octo-cli is metadata-driven from the same embedded OpenAPI specs as gen-api.mjs.
 * This renders them as CLI commands — `octo-cli <service> <op-tail> [flags]` —
 * for each language (en, zh), with translated scaffolding.
 *
 * Emits reference/cli/<domain>.mdx + reference/octo-cli.mdx (zh under zh/).
 * Usage:  node scripts/gen-cli.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DOCS_ROOT, WORKSPACE, HTTP_METHODS, banner,
  deref, mdEscape, typeOf, readJson, createSink,
} from './_lib.mjs';

const CLI_SPECS_DIR = path.join(WORKSPACE, 'octo-cli/internal/registry/specs');

const check = process.argv.includes('--check');
const sink = createSink({ check, generator: 'gen-cli' });
const SRC = { generator: 'gen-cli.mjs' };

// Domains withheld from the docs (deprecated / internal). matter is deprecated.
const EXCLUDE = new Set(['matter', 'marketplace']);

const LANGS = {
  en: { dir: DOCS_ROOT, link: '' },
  zh: { dir: path.join(DOCS_ROOT, 'zh'), link: '/zh' },
};

const ORDER = { message: 1, thread: 2, group: 3, file: 4, event: 5, bot: 6, matter: 7, docs: 8, html: 9 };

const RISK = {
  en: { read: '🟢 read', write: '🟠 write', 'high-risk-write': '🔴 high-risk' },
  zh: { read: '🟢 读', write: '🟠 写', 'high-risk-write': '🔴 高危' },
};

const S = {
  en: {
    cmds: 'commands', genFrom: 'generated from', envelope: 'Every invocation emits a structured JSON envelope on stdout.',
    domainNote: (link) => `Authenticate by exporting \`OCTO_BOT_TOKEN\` (\`bf_…\`) and \`OCTO_API_BASE_URL\`. See the [CLI overview](${link}/reference/octo-cli) for common flags and the output contract.`,
    domainDesc: (n) => `octo-cli commands in the ${n} domain — generated from the embedded OpenAPI spec.`,
    args: 'Arguments', flags: 'Flags', thArg: 'Arg', thDesc: 'Description', pathParam: 'path parameter',
    thFlag: 'Flag', thType: 'Type', thReq: 'Required',
    idxTitle: 'octo-cli Command Reference',
    idxDesc: 'All octo-cli commands across every domain, generated from the embedded OpenAPI specs.',
    idxIntro: (t, d) => `[\`octo-cli\`](https://github.com/Mininglamp-OSS/octo-cli) is a single-binary REST client designed for AI agent bots to call via \`exec\`. Its command tree — **${t} commands across ${d} domains** — is auto-registered from embedded OpenAPI specs at startup, so this reference stays in lock-step with the CLI and the server.`,
    info: (link) => `Every invocation prints a structured JSON envelope on stdout; errors go to stderr with a deterministic taxonomy. There is no interactive I/O — ideal for agent runtimes. Pair with the [REST API reference](${link}/reference/rest-websocket-api) (each command maps to one API operation).`,
    hCommon: 'Common flags', thPurpose: 'Purpose',
    dataFlag: 'JSON request body for create/update commands.', jqFlag: 'Post-process the JSON envelope with a jq expression.',
    hDomains: 'Domains', thGroup: 'Command group', thCount: 'Commands', total: 'Total',
  },
  zh: {
    cmds: '条命令', genFrom: '由以下规范生成：', envelope: '每次调用都会在 stdout 输出结构化的 JSON 信封。',
    domainNote: (link) => `鉴权方式：导出 \`OCTO_BOT_TOKEN\`(\`bf_…\`)与 \`OCTO_API_BASE_URL\`。通用标志与输出约定见 [CLI 总览](${link}/reference/octo-cli)。`,
    domainDesc: (n) => `${n} 领域的 octo-cli 命令 —— 由内嵌的 OpenAPI 规范生成。`,
    args: '位置参数', flags: '标志', thArg: '参数', thDesc: '说明', pathParam: '路径参数',
    thFlag: '标志', thType: '类型', thReq: '必填',
    idxTitle: 'octo-cli 命令参考',
    idxDesc: '跨所有领域的全部 octo-cli 命令 —— 由内嵌的 OpenAPI 规范生成。',
    idxIntro: (t, d) => `[\`octo-cli\`](https://github.com/Mininglamp-OSS/octo-cli) 是一个单二进制 REST 客户端,专为 AI Agent 机器人通过 \`exec\` 调用而设计。它的命令树 —— **${d} 个领域、共 ${t} 条命令** —— 在启动时由内嵌的 OpenAPI 规范自动注册,因此本参考始终与 CLI 和服务端保持同步。`,
    info: (link) => `每次调用都会在 stdout 输出结构化的 JSON 信封;错误输出到 stderr,并带有确定性的分类。没有交互式 I/O —— 非常适合 Agent 运行时。可与 [REST API 参考](${link}/reference/rest-websocket-api) 搭配使用(每条命令对应一个 API 接口)。`,
    hCommon: '通用标志', thPurpose: '用途',
    dataFlag: '用于创建/更新命令的 JSON 请求体。', jqFlag: '用 jq 表达式对 JSON 信封做后处理。',
    hDomains: '领域', thGroup: '命令组', thCount: '命令数', total: '合计',
  },
};

const commandFor = (operationId) => operationId.split('.').join(' ');

function flagsFor(op, root) {
  const flags = [];
  for (const raw of op.parameters || []) {
    const p = deref(raw, root);
    if (p.in === 'path') continue;
    flags.push({ flag: `--${p['x-octo-flag'] || p.name}`, type: typeOf(p.schema), required: !!p.required, desc: p.description || '' });
  }
  const body = deref(op.requestBody?.content?.['application/json']?.schema, root);
  if (body?.properties) {
    const required = new Set(body.required || []);
    for (const [pn, praw] of Object.entries(body.properties)) {
      const pv = deref(praw, root);
      if (pv.type === 'object' || pv.type === 'array') {
        flags.push({ flag: '--data', type: 'json', required: required.has(pn), desc: `${pn}: ${pv.description || 'JSON payload'}` });
      } else {
        flags.push({ flag: `--${pv['x-octo-flag'] || pn}`, type: typeOf(pv), required: required.has(pn), desc: pv.description || '' });
      }
    }
  }
  const seen = new Set();
  return flags.filter((f) => { if (f.flag === '--data') { if (seen.has('--data')) return false; seen.add('--data'); } return true; });
}

const pathArgs = (op, root) =>
  (op.parameters || []).map((r) => deref(r, root)).filter((p) => p.in === 'path').map((p) => p.name);

function renderCommand(operationId, op, root, t, riskMap) {
  const cmd = commandFor(operationId);
  const args = pathArgs(op, root);
  const flags = flagsFor(op, root);
  const risk = riskMap[op['x-octo-risk']] || '';
  const usage = `octo-cli ${cmd}` + args.map((a) => ` <${a}>`).join('') + (flags.length ? ' [flags]' : '');
  const out = [`### \`${cmd}\`\n`];
  const meta = [op.summary ? mdEscape(op.summary) : '', risk].filter(Boolean).join(' · ');
  if (meta) out.push(meta + '\n');
  out.push('```bash\n' + usage + '\n```\n');
  if (op.description) out.push(mdEscape(op.description) + '\n');
  if (args.length) {
    out.push(`**${t.args}**\n\n| ${t.thArg} | ${t.thDesc} |\n|---|---|\n` + args.map((a) => `| \`<${a}>\` | ${t.pathParam} |`).join('\n') + '\n');
  }
  if (flags.length) {
    out.push(`**${t.flags}**\n\n| ${t.thFlag} | ${t.thType} | ${t.thReq} | ${t.thDesc} |\n|---|---|---|---|\n` +
      flags.map((f) => `| \`${f.flag}\` | ${f.type} | ${f.required ? '✓' : ''} | ${mdEscape(f.desc)} |`).join('\n') + '\n');
  }
  return out.join('\n');
}

function generateDomain(name, spec, lang) {
  const t = S[lang], L = LANGS[lang], riskMap = RISK[lang];
  const specPath = `octo-cli/internal/registry/specs/${name}.json`;
  const cmds = [];
  for (const [, item] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) if (item[method]?.operationId) cmds.push([item[method].operationId, item[method]]);
  }
  cmds.sort((a, b) => a[0].localeCompare(b[0]));
  const body = [
    '---',
    `title: "octo-cli ${name}"`,
    `description: "${t.domainDesc(name)}"`,
    'icon: "terminal"',
    '---',
    '',
    banner({ ...SRC, spec: specPath }),
    '',
    `> ${cmds.length} ${t.cmds}, ${t.genFrom} [\`${specPath}\`](https://github.com/Mininglamp-OSS/octo-cli/blob/main/internal/registry/specs/${name}.json). ${t.envelope}`,
    '',
    t.domainNote(L.link),
    '',
    cmds.map(([id, op]) => renderCommand(id, op, spec, t, riskMap)).join('\n---\n\n'),
    '',
  ].join('\n');
  sink.emit(path.join(L.dir, 'reference/cli', `${name}.mdx`), body);
  return { name, count: cmds.length };
}

function generateIndex(summaries, total, lang) {
  const t = S[lang], L = LANGS[lang];
  const rows = summaries.map((s) => `| [\`octo-cli ${s.name}\`](${L.link}/reference/cli/${s.name}) | ${s.count} |`).join('\n');
  const index = [
    '---',
    `title: "${t.idxTitle}"`,
    `description: "${t.idxDesc}"`,
    'icon: "terminal"',
    '---',
    '',
    banner({ ...SRC, spec: 'octo-cli/internal/registry/specs/*.json' }),
    '',
    t.idxIntro(total, summaries.length),
    '',
    '<Info>',
    `  ${t.info(L.link)}`,
    '</Info>',
    '',
    `## ${t.hCommon}`,
    '',
    `| ${t.thFlag} | ${t.thPurpose} |`,
    '|---|---|',
    `| \`--data <json>\` | ${t.dataFlag} |`,
    `| \`--jq <expr>\` | ${t.jqFlag} |`,
    '',
    `## ${t.hDomains}`,
    '',
    `| ${t.thGroup} | ${t.thCount} |`,
    '|---|---|',
    rows,
    `| **${t.total}** | **${total}** |`,
    '',
  ].join('\n');
  sink.emit(path.join(L.dir, 'reference/octo-cli.mdx'), index);
}

function main() {
  if (!fs.existsSync(CLI_SPECS_DIR)) { console.error(`[gen-cli] spec dir not found: ${CLI_SPECS_DIR}`); process.exit(2); }
  const names = fs.readdirSync(CLI_SPECS_DIR)
    .filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'))
    .filter((n) => !EXCLUDE.has(n))
    .sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99));
  const specs = Object.fromEntries(names.map((n) => [n, readJson(path.join(CLI_SPECS_DIR, `${n}.json`))]));

  let total = 0;
  for (const lang of Object.keys(LANGS)) {
    const summaries = names.map((name) => generateDomain(name, specs[name], lang));
    total = summaries.reduce((n, s) => n + s.count, 0);
    generateIndex(summaries, total, lang);
  }
  const ok = sink.finish(`[gen-cli] wrote ${names.length} CLI domain pages (${total} commands) + index × ${Object.keys(LANGS).length} langs.`);
  if (!ok) process.exit(1);
}

main();
