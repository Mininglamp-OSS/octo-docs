#!/usr/bin/env node
/**
 * gen-sdk.mjs — Octo auth verify-contract reference generator (SSOT → Mintlify MDX).
 *
 * Reads the octo-auth wire contract (octo-auth/contract/auth-v1.yaml) — the
 * three `/v1/auth/verify*` endpoints that every octo-auth SDK implements — and
 * emits a generated reference page for each language (en, zh). This is the
 * authoritative surface behind the hand-written SDK overview (reference/sdks).
 *
 * Emits reference/auth-verify-api.mdx (zh under zh/).
 * Usage:  node scripts/gen-sdk.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  DOCS_ROOT, WORKSPACE, HTTP_METHODS, banner,
  deref, mdEscape, propsTable, createSink,
} from './_lib.mjs';

const CONTRACT = path.join(WORKSPACE, 'octo-auth/contract/auth-v1.yaml');

const check = process.argv.includes('--check');
const sink = createSink({ check, generator: 'gen-sdk' });
const SRC = { generator: 'gen-sdk.mjs' };

const LANGS = {
  en: { dir: DOCS_ROOT, link: '' },
  zh: { dir: path.join(DOCS_ROOT, 'zh'), link: '/zh' },
};

// Strip references to deprecated/internal modules from spec-derived prose so the
// public docs don't mention them (octo-fleet is deprecated).
function sanitize(s) {
  return String(s ?? '')
    .replace(/,?\s*\(e\.g\.\s*octo-fleet[^)]*\)/gi, '')
    .replace(/octo-fleet's runtime daemon/gi, 'an agent runtime daemon')
    .replace(/octo-fleet/gi, 'the agent runtime');
}


const S = {
  en: {
    title: 'Auth Verify API',
    pageDesc: 'The three /v1/auth/verify* endpoints every octo-auth SDK implements — generated from the wire contract.',
    intro: (n) => `The octo-auth wire contract defines **${n} verify endpoints** that resolve a credential to a Principal. Both the [Go and TypeScript SDKs](${'{LINK}'}/reference/sdks) implement these, and \`octo-server\` serves them. This page is generated from the contract, so it never drifts.`,
    tip: (link) => `You normally don't call these directly — use the [octo-auth SDK](${link}/guides/integrators/verify-credentials-with-octo-auth), which wraps them behind a \`MultiVerifier\`, adds caching, and fails closed. See the [Security & auth model](${link}/concepts/security-and-auth) for the credential realms.`,
    params: 'Query parameters', reqBody: 'Request body', response: 'Response (200)',
    field: 'Field', type: 'Type', required: 'Required', desc: 'Description', name: 'Name', inLabel: 'In',
    genFrom: 'Generated from',
  },
  zh: {
    title: '鉴权校验 API',
    pageDesc: '每个 octo-auth SDK 都实现的三个 /v1/auth/verify* 接口 —— 由线上契约生成。',
    intro: (n) => `octo-auth 线上契约定义了 **${n} 个校验接口**,用于把凭证解析为 Principal。[Go 与 TypeScript SDK](${'{LINK}'}/reference/sdks) 都实现了它们,\`octo-server\` 负责提供服务。本页由契约生成,因此永不漂移。`,
    tip: (link) => `通常你不必直接调用它们 —— 请使用 [octo-auth SDK](${link}/guides/integrators/verify-credentials-with-octo-auth),它以 \`MultiVerifier\` 封装、加入缓存并默认失败即拒。凭证类型参见[安全与认证模型](${link}/concepts/security-and-auth)。`,
    params: '查询参数', reqBody: '请求体', response: '响应（200）',
    field: '字段', type: '类型', required: '必填', desc: '说明', name: '名称', inLabel: '位置',
    genFrom: '由以下契约生成：',
  },
};

function renderEndpoint(route, op, root, t) {
  const out = [`## ${mdEscape(op.summary || op.operationId)}\n`];
  out.push(`\`POST ${route}\`` + (op.operationId ? ` · \`${op.operationId}\`` : '') + '\n');
  if (op.description) out.push(mdEscape(sanitize(op.description)) + '\n');

  if (op.parameters?.length) {
    const rows = op.parameters.map((raw) => {
      const p = deref(raw, root);
      return `| \`${p.name}\` | ${p.in} | ${mdEscape(p.description)} |`;
    });
    out.push(`**${t.params}**\n\n| ${t.name} | ${t.inLabel} | ${t.desc} |\n|---|---|---|\n` + rows.join('\n') + '\n');
  }

  const reqSchema = op.requestBody?.content?.['application/json']?.schema;
  const reqTable = propsTable(reqSchema, root, t);
  if (reqTable) out.push(`**${t.reqBody}**\n\n` + reqTable + '\n');

  const respSchema = op.responses?.['200']?.content?.['application/json']?.schema;
  const respTable = propsTable(respSchema, root, t);
  if (respTable) out.push(`**${t.response}**\n\n` + respTable + '\n');

  return out.join('\n');
}

function main() {
  if (!fs.existsSync(CONTRACT)) {
    console.error(`[gen-sdk] contract not found: ${CONTRACT}`);
    process.exit(2);
  }
  const doc = yaml.load(fs.readFileSync(CONTRACT, 'utf8'));
  const endpoints = [];
  for (const [route, item] of Object.entries(doc.paths || {})) {
    for (const method of HTTP_METHODS) if (item[method]) endpoints.push([route, item[method]]);
  }

  for (const lang of Object.keys(LANGS)) {
    const t = S[lang], L = LANGS[lang];
    const page = [
      '---',
      `title: "${t.title}"`,
      `description: "${t.pageDesc}"`,
      'icon: "key"',
      '---',
      '',
      banner({ ...SRC, spec: 'octo-auth/contract/auth-v1.yaml' }),
      '',
      t.intro(endpoints.length).replaceAll('{LINK}', L.link),
      '',
      '<Tip>',
      `  ${t.tip(L.link)}`,
      '</Tip>',
      '',
      `> ${t.genFrom} [\`octo-auth/contract/auth-v1.yaml\`](https://github.com/Mininglamp-OSS/octo-auth/blob/main/contract/auth-v1.yaml).`,
      '',
      endpoints.map(([route, op]) => renderEndpoint(route, op, doc, t)).join('\n---\n\n'),
      '',
    ].join('\n');
    sink.emit(path.join(L.dir, 'reference/auth-verify-api.mdx'), page);
  }

  const ok = sink.finish(`[gen-sdk] wrote auth-verify-api.mdx (${endpoints.length} endpoints) × ${Object.keys(LANGS).length} langs.`);
  if (!ok) process.exit(1);
}

main();
