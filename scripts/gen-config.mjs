#!/usr/bin/env node
/**
 * gen-config.mjs — octo-server configuration reference generator (SSOT → Mintlify MDX).
 *
 * Parses the annotated config template (octo-server/configs/tsdd.yaml) into a
 * grouped reference table, for each language (en, zh). The config's own section
 * titles and key descriptions are already Chinese in the source, so only the
 * page chrome (frontmatter, intro, callout, table headers) is translated.
 *
 * Emits reference/configuration.mdx (zh under zh/).
 * Usage:  node scripts/gen-config.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import { DOCS_ROOT, WORKSPACE, banner, mdEscape, codeEscape, createSink } from './_lib.mjs';

const CONFIG_FILE = path.join(WORKSPACE, 'octo-server/configs/tsdd.yaml');

const check = process.argv.includes('--check');
const sink = createSink({ check, generator: 'gen-config' });
const SRC = { generator: 'gen-config.mjs' };

const LANGS = {
  en: { dir: DOCS_ROOT, link: '' },
  zh: { dir: path.join(DOCS_ROOT, 'zh'), link: '/zh' },
};

const S = {
  en: {
    title: 'Configuration Reference',
    desc: 'Every octo-server configuration key, default, and description — generated from the config template.',
    intro: (k, s) => `Generated from the annotated config template [\`octo-server/configs/tsdd.yaml\`](https://github.com/Mininglamp-OSS/octo-server/blob/main/configs/tsdd.yaml) — **${k} keys across ${s} sections**.`,
    info: (link) => `Keys are shown in dotted form (e.g. \`db.mysqlAddr\`). Most keys are commented out in the template and fall back to a built-in default; keys marked _(active default)_ are set explicitly in the shipped template. Many keys also accept an environment-variable override — see the inline notes and the [deployment guide](${link}/guides/operators/deploy-compose).`,
    thKey: 'Key', thDefault: 'Default', thDesc: 'Description', active: ' _(active default)_',
  },
  zh: {
    title: '配置参考',
    desc: 'octo-server 的每一个配置项、默认值与说明 —— 由配置模板生成。',
    intro: (k, s) => `由带注释的配置模板 [\`octo-server/configs/tsdd.yaml\`](https://github.com/Mininglamp-OSS/octo-server/blob/main/configs/tsdd.yaml) 生成 —— **${s} 个分组、共 ${k} 个配置项**。`,
    info: (link) => `配置项以点分形式展示(例如 \`db.mysqlAddr\`)。模板中大多数项默认被注释,回退到内置默认值;标注 _(active default)_ 的项在随附模板中被显式设置。许多项还支持环境变量覆盖 —— 参见内联说明与[部署指南](${link}/guides/operators/deploy-compose)。`,
    thKey: '配置项', thDefault: '默认值', thDesc: '说明', active: ' _(默认已启用)_',
  },
};

const SECTION_RE = /^#{3,}\s*(.+?)\s*#{3,}\s*$/;
const SCALAR_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|true|false|null)$/;

function splitValueComment(rest) {
  let inS = false, inD = false;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD) return [rest.slice(0, i).trim(), rest.slice(i + 1).trim()];
  }
  return [rest.trim(), ''];
}

function parse(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = { title: 'General', entries: [] };
  const stack = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const sec = line.match(SECTION_RE);
    if (sec) {
      if (current.entries.length || current.title !== 'General') sections.push(current);
      current = { title: sec[1].replace(/#/g, '').trim() || 'General', entries: [] };
      stack.length = 0;
      continue;
    }
    const cm = line.match(/^(\s*)#(.*)$/);
    const commented = !!cm;
    const logical = commented ? cm[1] + cm[2] : line;
    const im = logical.match(/^(\s*)(.*)$/);
    const indent = im[1].length;
    const em = im[2].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!em) continue;
    const key = em[1];
    const [value, comment] = splitValueComment(em[2]);
    const isParent = value === '';
    if (!isParent && !SCALAR_RE.test(value)) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentPath = stack.length ? stack[stack.length - 1].path : '';
    const dotted = parentPath ? `${parentPath}.${key}` : key;
    if (isParent) stack.push({ indent, path: dotted });
    current.entries.push({ key: dotted, value, desc: comment || '', commented, isParent });
  }
  if (current.entries.length) sections.push(current);
  return sections;
}

function renderSection(sec, t) {
  const rows = sec.entries
    .filter((e) => e.desc || (e.value && !e.isParent))
    .map((e) => {
      const def = e.value ? `\`${codeEscape(e.value)}\`` : '—';
      const note = e.commented ? '' : t.active;
      return `| \`${e.key}\` | ${def} | ${mdEscape(e.desc)}${note} |`;
    });
  if (!rows.length) return '';
  return [`## ${mdEscape(sec.title)}`, '', `| ${t.thKey} | ${t.thDefault} | ${t.thDesc} |`, '|---|---|---|', rows.join('\n'), ''].join('\n');
}

function main() {
  if (!fs.existsSync(CONFIG_FILE)) { console.error(`[gen-config] config not found: ${CONFIG_FILE}`); process.exit(2); }
  const sections = parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const totalKeys = sections.reduce((n, s) => n + s.entries.length, 0);

  for (const lang of Object.keys(LANGS)) {
    const t = S[lang], L = LANGS[lang];
    const doc = [
      '---',
      `title: "${t.title}"`,
      `description: "${t.desc}"`,
      'icon: "sliders"',
      '---',
      '',
      banner({ ...SRC, spec: 'octo-server/configs/tsdd.yaml' }),
      '',
      t.intro(totalKeys, sections.length),
      '',
      '<Info>',
      `  ${t.info(L.link)}`,
      '</Info>',
      '',
      sections.map((s) => renderSection(s, t)).filter(Boolean).join('\n'),
    ].join('\n');
    sink.emit(path.join(L.dir, 'reference/configuration.mdx'), doc);
  }

  const ok = sink.finish(`[gen-config] wrote configuration.mdx (${totalKeys} keys, ${sections.length} sections) × ${Object.keys(LANGS).length} langs.`);
  if (!ok) process.exit(1);
}

main();
