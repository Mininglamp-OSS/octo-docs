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
