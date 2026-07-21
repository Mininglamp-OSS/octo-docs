/**
 * gen-openapi.mjs — vendor the octo-cli OpenAPI specs into octo-docs, augmented
 * for Mintlify's interactive API playground.
 *
 * Source of truth : ../octo-cli/internal/registry/specs/*.json (OpenAPI 3.1)
 * Output          : api-reference/openapi/<domain>.json  (committed, drift-checked)
 *
 * The source specs are embedded in the octo-cli Go binary and are NOT edited by
 * hand. They lack the pieces Mintlify's playground needs, so this generator
 * injects them in-memory on every run:
 *   - `servers`      : an editable server variable (Octo is self-hosted; no public API)
 *   - `securitySchemes` + `security` : bearer auth so "Try it" renders a token input
 *   - X-Space-Id header parameter on services that declare `x-octo-space-header: true`
 *
 * Run `npm run gen:all` after changing a spec; `npm run gen:check` gates drift.
 * See DESIGN.md §6.
 */

import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACE, DOCS_ROOT, createSink, readJson } from './_lib.mjs';

const CLI_SPECS_DIR = path.join(WORKSPACE, 'octo-cli/internal/registry/specs');
const OUT_DIR = path.join(DOCS_ROOT, 'api-reference/openapi');

/** Deprecated / internal / unreleased / not-yet-documented — withheld from docs. */
const EXCLUDE = new Set(['matter', 'marketplace']);

/** Editable base URL — users point "Try it" at their own Octo instance. */
const SERVERS = [
  {
    url: 'https://{host}',
    variables: {
      host: {
        default: 'your-octo-instance.com',
        description: 'Your Octo base URL (the CLI\'s OCTO_API_BASE_URL, without scheme).',
      },
    },
  },
];

/** Bearer auth: bf_ (User Bot) / app_ (App Bot) tokens, or uk_ user API key. */
const SECURITY_SCHEMES = {
  botToken: {
    type: 'http',
    scheme: 'bearer',
    description:
      'Octo credential as a bearer token: bf_… (User Bot) or app_… (App Bot), or a uk_… user API key. See Security & auth.',
  },
};

/** Header carried when a spec declares x-octo-space-header: true (octo-cli sends X-Space-Id). */
const SPACE_HEADER_PARAM = {
  name: 'X-Space-Id',
  in: 'header',
  required: false,
  description: 'Target space id (the CLI\'s OCTO_SPACE_ID). Sent when the credential spans multiple spaces.',
  schema: { type: 'string' },
};

function augment(spec) {
  const out = { ...spec };
  out.servers = SERVERS;
  out.components = { ...(spec.components || {}), securitySchemes: { ...SECURITY_SCHEMES } };
  out.security = [{ botToken: [] }];

  if (spec['x-octo-space-header'] === true && out.paths) {
    for (const item of Object.values(out.paths)) {
      for (const key of Object.keys(item)) {
        const op = item[key];
        if (!op || typeof op !== 'object' || !op.responses) continue; // skip non-operation keys
        const params = op.parameters ? [...op.parameters] : [];
        if (!params.some((p) => p && p.in === 'header' && String(p.name).toLowerCase() === 'x-space-id')) {
          params.push({ ...SPACE_HEADER_PARAM });
        }
        op.parameters = params;
      }
    }
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const sink = createSink({ check, generator: 'gen-openapi' });

  if (!fs.existsSync(CLI_SPECS_DIR)) {
    console.error(`[gen-openapi] spec dir not found: ${CLI_SPECS_DIR}`);
    console.error('  Clone octo-cli beside octo-docs (see scripts/README.md).');
    process.exit(2);
  }

  const files = fs
    .readdirSync(CLI_SPECS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((name) => !EXCLUDE.has(name))
    .sort();

  let totalOps = 0;
  for (const name of files) {
    const spec = readJson(path.join(CLI_SPECS_DIR, name + '.json'));
    const augmented = augment(spec);
    for (const item of Object.values(spec.paths || {})) {
      for (const key of Object.keys(item)) {
        if (item[key] && typeof item[key] === 'object' && item[key].responses) totalOps++;
      }
    }
    sink.emit(path.join(OUT_DIR, name + '.json'), JSON.stringify(augmented, null, 2) + '\n');
  }

  const ok = sink.finish(
    `[gen-openapi] wrote ${files.length} augmented specs (${totalOps} ops) → api-reference/openapi/`,
  );
  if (!ok) process.exit(1);
}

main();
