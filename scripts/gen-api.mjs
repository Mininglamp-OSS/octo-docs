#!/usr/bin/env node
/**
 * gen-api.mjs — Octo API reference generator (SSOT → Mintlify MDX).
 *
 * Reads the authoritative OpenAPI 3.1 specs that ship inside the code:
 *   - octo-cli   : internal/registry/specs/*.json   (9 domains, 98 ops)
 *   - octo-auth  : contract/errors-v1.yaml
 *
 * Emits, for each language (en, zh):
 *   reference/api/<domain>.mdx + reference/rest-websocket-api.mdx +
 *   reference/errors-and-envelopes.mdx   (zh under a zh/ prefix)
 * The scaffolding (frontmatter, intros, section headers, callouts) is
 * translated; spec-derived rows are identical across languages, since the API
 * is defined in English specs. Every file carries a DO-NOT-EDIT banner.
 *
 * Usage:  node scripts/gen-api.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  DOCS_ROOT, WORKSPACE, HTTP_METHODS, banner,
  deref, mdEscape, typeOf, readJson, createSink,
} from './_lib.mjs';

const CLI_SPECS_DIR = path.join(WORKSPACE, 'octo-cli/internal/registry/specs');
const AUTH_CONTRACT_DIR = path.join(WORKSPACE, 'octo-auth/contract');

const check = process.argv.includes('--check');
const sink = createSink({ check, generator: 'gen-api' });
const SRC = { generator: 'gen-api.mjs' };

// Domains withheld from the docs (deprecated / internal). matter is deprecated.
const EXCLUDE = new Set(['matter']);

// Per-language output roots and label prefixes.
const LANGS = {
  en: { dir: DOCS_ROOT, link: '' },
  zh: { dir: path.join(DOCS_ROOT, 'zh'), link: '/zh' },
};

const DOMAIN_META = {
  message: { en: 'Messages', zh: '消息', order: 1 },
  thread: { en: 'Threads', zh: '话题', order: 2 },
  group: { en: 'Groups', zh: '群组', order: 3 },
  file: { en: 'Files', zh: '文件', order: 4 },
  event: { en: 'Events', zh: '事件', order: 5 },
  bot: { en: 'Bot Identity', zh: '机器人身份', order: 6 },
  matter: { en: 'Matters', zh: '事项', order: 7 },
  docs: { en: 'Docs (collaborative)', zh: '协作文档', order: 8 },
  html: { en: 'Docs (interactive HTML)', zh: '交互式 HTML 文档', order: 9 },
};

const RISK = {
  en: { read: '🟢 read', write: '🟠 write', 'high-risk-write': '🔴 high-risk' },
  zh: { read: '🟢 读', write: '🟠 写', 'high-risk-write': '🔴 高危' },
};

const S = {
  en: {
    opsSuffix: 'operations', cliOp: 'CLI op', params: 'Parameters',
    reqBody: 'Request body', responses: 'Responses',
    thName: 'Name', thIn: 'In', thType: 'Type', thReq: 'Required', thDesc: 'Description',
    thField: 'Field', thStatus: 'Status',
    genFrom: 'Generated from', apiDesc: (l) => `${l} endpoints — generated from the octo-cli OpenAPI spec.`,
    idxTitle: 'REST & WebSocket API',
    idxDesc: 'The authoritative Octo REST API, generated from the octo-cli embedded OpenAPI 3.1 specs.',
    idxIntro: (t, d) => `The Octo bot-facing REST API spans **${t} operations across ${d} domains**. Every domain page is generated directly from the OpenAPI 3.1 spec embedded in [\`octo-cli\`](https://github.com/Mininglamp-OSS/octo-cli) — the same spec that drives the CLI and the server, so this reference never drifts from the implementation.`,
    tip: (link) => `The easiest way to call these endpoints is via [\`octo-cli\`](${link}/guides/bot-developers/drive-octo-with-cli) (each operation maps to a \`CLI op\` shown on its domain page) or directly over HTTP with a bot token (\`bf_…\`). See [Verify credentials with octo-auth](${link}/guides/integrators/verify-credentials-with-octo-auth).`,
    hDomains: 'Domains', thDomain: 'Domain', thSpec: 'Spec', thOps: 'Operations', total: 'Total',
    hRisk: 'Risk levels', riskIntro: 'Each operation is tagged with an `x-octo-risk` level from the spec:',
    riskRead: '🟢 **read** — no state change.', riskWrite: '🟠 **write** — creates or mutates state.',
    riskHigh: '🔴 **high-risk** — destructive or broadly-scoped; guard carefully.',
    hAuth: 'Authentication',
    authText: (link) => `See [Errors & response envelopes](${link}/reference/errors-and-envelopes) for credential kinds (session · \`bf_\` bot token · \`uk_\` API key) and the unified error envelope.`,
    errTitle: 'Errors & Response Envelopes',
    errDesc: 'The unified JSON error envelope and wire error-code taxonomy, generated from octo-auth.',
    errGen: 'Generated from',
    hEnvelope: 'Error envelope', hCodes: 'Wire error codes',
  },
  zh: {
    opsSuffix: '个接口', cliOp: 'CLI 命令', params: '参数',
    reqBody: '请求体', responses: '响应',
    thName: '名称', thIn: '位置', thType: '类型', thReq: '必填', thDesc: '说明',
    thField: '字段', thStatus: '状态',
    genFrom: '由以下规范生成：', apiDesc: (l) => `${l} 领域的接口 —— 由 octo-cli OpenAPI 规范生成。`,
    idxTitle: 'REST 与 WebSocket API',
    idxDesc: 'Octo 权威 REST API —— 由 octo-cli 内嵌的 OpenAPI 3.1 规范生成。',
    idxIntro: (t, d) => `Octo 面向机器人的 REST API 覆盖 **${d} 个领域、共 ${t} 个接口**。每个领域页面都直接由内嵌于 [\`octo-cli\`](https://github.com/Mininglamp-OSS/octo-cli) 的 OpenAPI 3.1 规范生成 —— 与驱动 CLI 和服务端的是同一份规范,因此本参考永不与实现漂移。`,
    tip: (link) => `调用这些接口最简单的方式是使用 [\`octo-cli\`](${link}/guides/bot-developers/drive-octo-with-cli)(每个接口都对应领域页中标注的 \`CLI 命令\`),或用机器人 token(\`bf_…\`)直接走 HTTP。参见 [用 octo-auth 校验凭证](${link}/guides/integrators/verify-credentials-with-octo-auth)。`,
    hDomains: '领域', thDomain: '领域', thSpec: '规范', thOps: '接口数', total: '合计',
    hRisk: '风险级别', riskIntro: '每个接口都带有来自规范的 `x-octo-risk` 级别标记:',
    riskRead: '🟢 **读** —— 不改变状态。', riskWrite: '🟠 **写** —— 创建或修改状态。',
    riskHigh: '🔴 **高危** —— 破坏性或作用域较广,请谨慎。',
    hAuth: '鉴权',
    authText: (link) => `凭证类型(会话 · \`bf_\` 机器人 token · \`uk_\` API key)与统一错误信封,参见 [错误与响应信封](${link}/reference/errors-and-envelopes)。`,
    errTitle: '错误与响应信封',
    errDesc: '统一的 JSON 错误信封与线上错误码分类 —— 由 octo-auth 生成。',
    errGen: '由以下规范生成：',
    hEnvelope: '错误信封', hCodes: '线上错误码',
  },
};

function propsTable(schema, root, t) {
  schema = deref(schema, root);
  if (!schema || !schema.properties) return '';
  const required = new Set(schema.required || []);
  const rows = Object.entries(schema.properties).map(([name, raw]) => {
    const p = deref(raw, root);
    return `| \`${name}\` | ${typeOf(p)} | ${required.has(name) ? '✓' : ''} | ${mdEscape(p.description)} |`;
  });
  if (!rows.length) return '';
  return `| ${t.thField} | ${t.thType} | ${t.thReq} | ${t.thDesc} |\n|---|---|---|---|\n` + rows.join('\n');
}

function paramsTable(params, root, t) {
  if (!params || !params.length) return '';
  const rows = params.map((raw) => {
    const p = deref(raw, root);
    return `| \`${p.name}\` | ${p.in} | ${typeOf(p.schema)} | ${p.required ? '✓' : ''} | ${mdEscape(p.description)} |`;
  });
  return `| ${t.thName} | ${t.thIn} | ${t.thType} | ${t.thReq} | ${t.thDesc} |\n|---|---|---|---|---|\n` + rows.join('\n');
}

function renderOperation(route, method, op, root, t, riskMap) {
  const risk = riskMap[op['x-octo-risk']] || '';
  const title = op.summary || op.operationId || `${method.toUpperCase()} ${route}`;
  const out = [`### ${mdEscape(title)}\n`];
  const meta = [`\`${method.toUpperCase()} ${route}\``];
  if (op.operationId) meta.push(`${t.cliOp}: \`${op.operationId}\``);
  if (risk) meta.push(risk);
  out.push(meta.join(' · ') + '\n');
  if (op.description) out.push(mdEscape(op.description) + '\n');
  const params = paramsTable(op.parameters, root, t);
  if (params) out.push(`**${t.params}**\n\n` + params + '\n');
  const body = op.requestBody?.content?.['application/json']?.schema;
  if (body) { const table = propsTable(body, root, t); if (table) out.push(`**${t.reqBody}**\n\n` + table + '\n'); }
  const responses = op.responses || {};
  const respRows = Object.entries(responses).map(([code, r]) => `| \`${code}\` | ${mdEscape(deref(r, root).description)} |`);
  if (respRows.length) out.push(`**${t.responses}**\n\n| ${t.thStatus} | ${t.thDesc} |\n|---|---|\n` + respRows.join('\n') + '\n');
  return out.join('\n');
}

function generateDomainPage(name, spec, lang) {
  const t = S[lang], L = LANGS[lang], riskMap = RISK[lang];
  const meta = DOMAIN_META[name] || { [lang]: name };
  const label = meta[lang] || meta.en || name;
  const source = `octo-cli/internal/registry/specs/${name}.json`;
  const ops = [];
  for (const [route, item] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) if (item[method]) ops.push([route, method, item[method]]);
  }
  const body = [
    '---',
    `title: "${label} API"`,
    `description: "${t.apiDesc(label)}"`,
    'icon: "code"',
    '---',
    '',
    banner({ ...SRC, spec: source }),
    '',
    `> ${t.genFrom} [\`${source}\`](https://github.com/Mininglamp-OSS/octo-cli/blob/main/internal/registry/specs/${name}.json) — **${ops.length} ${t.opsSuffix}**.`,
    '',
    ops.map(([r, m, op]) => renderOperation(r, m, op, spec, t, riskMap)).join('\n---\n\n'),
    '',
  ].join('\n');
  sink.emit(path.join(L.dir, 'reference/api', `${name}.mdx`), body);
  return { name, label, count: ops.length };
}

function generateIndex(summaries, totalOps, lang) {
  const t = S[lang], L = LANGS[lang];
  const rows = summaries.map((s) => `| [${s.label}](${L.link}/reference/api/${s.name}) | \`${s.name}\` | ${s.count} |`).join('\n');
  const index = [
    '---',
    `title: "${t.idxTitle}"`,
    `description: "${t.idxDesc}"`,
    'icon: "plug"',
    '---',
    '',
    banner({ ...SRC, spec: 'octo-cli/internal/registry/specs/*.json' }),
    '',
    t.idxIntro(totalOps, summaries.length),
    '',
    '<Tip>',
    `  ${t.tip(L.link)}`,
    '</Tip>',
    '',
    `## ${t.hDomains}`,
    '',
    `| ${t.thDomain} | ${t.thSpec} | ${t.thOps} |`,
    '|---|---|---|',
    rows,
    `| **${t.total}** | | **${totalOps}** |`,
    '',
    `## ${t.hRisk}`,
    '',
    t.riskIntro,
    '',
    `- ${t.riskRead}`,
    `- ${t.riskWrite}`,
    `- ${t.riskHigh}`,
    '',
    `## ${t.hAuth}`,
    '',
    t.authText(L.link),
    '',
  ].join('\n');
  sink.emit(path.join(L.dir, 'reference/rest-websocket-api.mdx'), index);
}

function generateErrors(errDoc, lang) {
  const t = S[lang], L = LANGS[lang];
  const envelope = errDoc.components?.schemas?.ErrorEnvelope;
  const envTable = envelope ? propsTable(envelope, errDoc, t) : '';
  const codeSchema = errDoc.components?.schemas?.ErrorCode ||
    Object.values(errDoc.components?.schemas || {}).find((s) => s?.enum);
  const codeList = codeSchema?.enum || [];
  const errors = [
    '---',
    `title: "${t.errTitle}"`,
    `description: "${t.errDesc}"`,
    'icon: "triangle-exclamation"',
    '---',
    '',
    banner({ ...SRC, spec: 'octo-auth/contract/errors-v1.yaml' }),
    '',
    `> ${t.errGen} [\`octo-auth/contract/errors-v1.yaml\`](https://github.com/Mininglamp-OSS/octo-auth/blob/main/contract/errors-v1.yaml).`,
    '',
    errDoc.info?.description ? errDoc.info.description.trim() : '',
    '',
    envTable ? `## ${t.hEnvelope}\n\n` + envTable + '\n' : '',
    codeList.length ? `## ${t.hCodes}\n\n` + codeList.map((c) => `- \`${c}\``).join('\n') + '\n' : '',
  ].filter(Boolean).join('\n');
  sink.emit(path.join(L.dir, 'reference/errors-and-envelopes.mdx'), errors);
}

function main() {
  if (!fs.existsSync(CLI_SPECS_DIR)) {
    console.error(`[gen-api] spec dir not found: ${CLI_SPECS_DIR}`);
    process.exit(2);
  }
  const names = fs.readdirSync(CLI_SPECS_DIR)
    .filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'))
    .filter((n) => !EXCLUDE.has(n))
    .sort((a, b) => (DOMAIN_META[a]?.order ?? 99) - (DOMAIN_META[b]?.order ?? 99));
  const specs = Object.fromEntries(names.map((n) => [n, readJson(path.join(CLI_SPECS_DIR, `${n}.json`))]));
  const errorsFile = path.join(AUTH_CONTRACT_DIR, 'errors-v1.yaml');
  const errDoc = fs.existsSync(errorsFile) ? yaml.load(fs.readFileSync(errorsFile, 'utf8')) : null;

  let totalOps = 0;
  for (const lang of Object.keys(LANGS)) {
    const summaries = names.map((name) => generateDomainPage(name, specs[name], lang));
    totalOps = summaries.reduce((n, s) => n + s.count, 0);
    generateIndex(summaries, totalOps, lang);
    if (errDoc) generateErrors(errDoc, lang);
  }

  const ok = sink.finish(`[gen-api] wrote ${names.length} domain pages (${totalOps} ops) + index + errors × ${Object.keys(LANGS).length} langs.`);
  if (!ok) process.exit(1);
}

main();
