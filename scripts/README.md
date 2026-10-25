# scripts/ — SSOT generators (Mintlify)

These generators turn specs into Mintlify MDX reference pages against reviewed, fixed source snapshots. See `DESIGN.md` §4. They share helpers from `_lib.mjs`.

| Generator | Input (source of truth) | Output |
|---|---|---|
| `gen-api.mjs` | `octo-cli/internal/registry/specs/*.json` (`matter` excluded → 8 domains, 84 ops) + `octo-auth/contract/errors-v1.yaml` | `reference/api/<domain>.mdx` + `reference/rest-websocket-api.mdx` + `reference/errors-and-envelopes.mdx` |
| `gen-cli.mjs` | the same octo-cli specs (metadata-driven CLI) | `reference/cli/<domain>.mdx` + `reference/octo-cli.mdx` (84 commands) |
| `gen-config.mjs` | `octo-server/configs/tsdd.yaml` | `reference/configuration.mdx` (template keys / sections) |

## Commands

```bash
npm run gen:all      # regenerate every reference page
npm run gen:check    # CI: exit 1 if any page is stale (drift detection)
```

## Rules

- **Do not hand-edit** generated files — each carries a `{/* DO NOT EDIT */}` banner.
  Edit the spec in the source repo and re-run the generator.
- Generators expect the sibling repos (`octo-cli`, `octo-auth`, `octo-server`)
  checked out next to `octo-docs`. In CI, either check them out or commit the
  generated pages.
- New reference pages must also be added to `docs.json` navigation (the nav is
  maintained by hand; the existing eight API and eight CLI domain pages are listed).

## Planned

- SDK reference (`octo-auth` Go/TS) from the auth OpenAPI contract.

## Reproducible reference inputs / 可复现的参考输入

`reference-sources.json` is the shared input/coverage lock. CI reads its exact 40-character
revisions, checks out all three repositories, records their actual SHAs, and checks each
input file's SHA-256 before generation. Local generators verify the same input bytes;
they never fetch or choose upstream `main`. Use `node scripts/reference-sources.mjs`
to check local input files, then `npm run gen:all` and `npm run gen:check`.

- CLI v0.18.0: `d564a63bbd8ec2dd4305a40a64fe0179ca9c667f`.
- Server v1.22.0 template: `8326c67afdcd0fb8cd3b9f98548e2ed40ed49a62`.
- Auth contract snapshot: `94045414467c0a30fb7022dcbba699c7bb333901`. No SDK release tag is claimed.

The 84 operation IDs in eight domains preserve the existing API/CLI documentation
coverage. Other operations, newly added spec files, and disabled domains do not enter
the reference automatically. A missing/duplicated reviewed operation or changed input
fails before any output. Expanding coverage requires a deliberate lock/navigation review.
This baseline keeps argument-rendering changes in the separate CLI argument-contract PR.

输入与覆盖范围由同一份锁文件管理。CI 按完整 SHA 检出并记录实际版本，所有生成器先校验
输入文件哈希；不会为了检查通过而跟随未发布的 main。这里只保留已有的 8 个领域、84 个
操作，既不是完整产品能力清单，也不是取消漂移检查。新增领域/操作须显式审查锁文件与导航；
缺失操作、重复操作、输入变化或中文输出陈旧仍会使门禁失败。auth 仅为既有合同快照，
不冒称正式 SDK 发行。更新参考须改源/生成器后重生成，不能手改派生页。

## CLI argument contract correction

The argument correction uses the shared v0.18.0 lock and the same 84-operation
coverage; there is no second partial source lock. It replaces underscores with dashes,
preserves explicit aliases/camelCase and adds required multipart `--file`.
Regenerate all affected existing CLI pages with `npm run gen:cli`, then run
`npm run test:cli` and `npm run gen:check`. `--domains message,file` remains available
for focused inspection, but cannot replace the full generation gate.

参数规则修订复用统一发行锁，不另建两个领域的重复版本源。全局命名规则变化后，
必须重生成所有受影响的已有 CLI 页面；覆盖仍是原来的 84 个操作。局部 --domains
检查不能替代整站门禁，不能仅改部分派生页而留下其余页陈旧。

## Configuration environment supplement

`config-environment.json` covers settings read directly from the process environment
that are absent from `tsdd.yaml`. Its bilingual text is curated against the implementation
files listed in `sources`, pinned to the full upstream `revision` SHA. It contains no secret
values. When the implementation changes, verify the raw input format, consumers, failure
behavior, and migration risks, then update both languages and the source revision together.
The existing YAML template remains the source for the template tables.

```bash
npm run gen:config                  # regenerate only the EN/ZH configuration pages
node scripts/gen-config.mjs --check # configuration-only drift check
npm run test:config                 # generator regression checks, no sibling repos needed
```

This supplement is intentionally limited to `OCTO_USER_API_KEY_SECRET`; it is not an audit
of every environment variable. Source revisions for unrelated API/CLI/SDK references are
unchanged by this maintenance pass.
