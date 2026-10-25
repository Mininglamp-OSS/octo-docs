# scripts/ — SSOT generators (Mintlify)

These generators turn specs into Mintlify MDX reference pages so documentation
never drifts from the code. See `DESIGN.md` §4. They share helpers from `_lib.mjs`.

| Generator | Input (source of truth) | Output |
|---|---|---|
| `gen-api.mjs` | `octo-cli/internal/registry/specs/*.json` (`matter` excluded → 8 domains, 84 ops) + `octo-auth/contract/errors-v1.yaml` | `reference/api/<domain>.mdx` + `reference/rest-websocket-api.mdx` + `reference/errors-and-envelopes.mdx` |
| `gen-cli.mjs` | the same octo-cli specs (metadata-driven CLI) | `reference/cli/<domain>.mdx` + `reference/octo-cli.mdx` (84 commands) |
| `gen-config.mjs` | `octo-server/configs/tsdd.yaml` | `reference/configuration.mdx` (133 keys / 14 sections) |

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
  maintained by hand; the 9 API + 9 CLI domain pages are already listed).

## Planned

- SDK reference (`octo-auth` Go/TS) from the auth OpenAPI contract.

## Released CLI argument contracts

The `message` and `file` reference pages use the published `octo-cli v0.18.0`
contract at `d564a63bbd8ec2dd4305a40a64fe0179ca9c667f`.
`scripts/cli-reference-sources.json` records the exact SHA-256 of those two specs
and the existing operation subset retained in this maintenance pass. The generator
fails before writing if either selected spec differs. It does not treat a release
preparation commit on `main` as a published release.

```bash
# In the sibling octo-cli checkout, use the recorded release commit first.
node scripts/gen-cli.mjs --domains message,file
node scripts/gen-cli.mjs --domains message,file --check
npm run test:cli
```

The targeted command writes only the two domain pages in each language. It leaves
the index, REST API pages, other CLI domains, SDKs, and server configuration alone.
The message page intentionally keeps its existing four operations; newly released
search operations require their own documentation update and version review.

Match `cmd/service/flags.go` when deriving names: replace underscores with dashes,
preserve `x-octo-flag` aliases and existing camelCase, and document required
`--file` for `x-octo-multipart` operations. JSON wire property names stay unchanged.

The existing CI workflow still clones upstream default branches for the broader
generation checks. Until those inputs are separately versioned, `gen:all` is not
proof of released-product compatibility. Do not refresh unrelated references from
those branches as part of this argument-contract fix.
