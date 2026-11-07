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
input file's SHA-256 before generation. Each local generator verifies the checkout HEAD
and, for a release source, `refs/tags/<tag>^{commit}` against the locked SHA before
reading input bytes. CLI and Server have an explicit `tag` equal to their release
label; auth has `tag: null` and the explicit contract-snapshot label. Annotated and
lightweight tags are supported; a same-named branch is not a substitute for a tag.
Keep the release tags in the sibling Git checkouts; copied files alone cannot pass
the full source check. Validators never fetch or choose upstream `main`.
Use `node scripts/reference-sources.mjs`
to check local input files, then `npm run gen:all` and `npm run gen:check`.

- CLI v0.18.0: `d564a63bbd8ec2dd4305a40a64fe0179ca9c667f`.
- Server v1.22.0 template: `8326c67afdcd0fb8cd3b9f98548e2ed40ed49a62`.
- Auth contract snapshot: `94045414467c0a30fb7022dcbba699c7bb333901`. No SDK release tag is claimed.

The 84 operation IDs in eight domains preserve the existing API/CLI documentation
coverage. Other operations, newly added spec files, and disabled domains do not enter
the reference automatically. A missing/duplicated reviewed operation or changed input
fails before any output. Expanding coverage requires a deliberate lock/navigation review.
This baseline keeps argument-rendering changes in the separate CLI argument-contract PR.

输入与覆盖范围由同一份锁文件管理。CI 按完整 SHA 检出并记录实际版本，所有生成器先核对
Git HEAD、发布标签解引用后的提交和输入文件哈希。CLI 与 Server 的 `tag` 必须和版本标签
一致；auth 显式使用 `tag: null`，只声明合同快照。支持 annotated/lightweight tag，不能以
同名分支代替。来源目录须保留 Git 检出及发布标签，单独复制文件不能通过完整校验；校验器
不联网，也不会为了检查通过而跟随未发布的 main。这里只保留已有的 8 个领域、84 个
操作，既不是完整产品能力清单，也不是取消漂移检查。新增领域/操作须显式审查锁文件与导航；
缺失操作、重复操作、输入变化或中文输出陈旧仍会使门禁失败。auth 仅为既有合同快照，
不冒称正式 SDK 发行。更新参考须改源/生成器后重生成，不能手改派生页。


## Hand-written admin guide provenance / 手写管理指南来源

`admin-guide-sources.json` separately locks Admin v1.13.0 and Server v1.24.0 for
`guides/teams/admin-console.mdx` and its Chinese counterpart. It does **not** change
the generated reference's Server v1.22.0 input or regenerate reference pages.

```bash
npm run test:guide-sources                  # offline tests, including temporary Git tag fixtures
node scripts/admin-guide-sources.mjs --documents-only # EN/ZH release assertions and source links only
npm run check:guide-sources                 # documents + checked-out revisions, tags and source bytes
```

For the full check, use sibling checkouts named `octo-admin-guide` and
`octo-server-guide`, at the exact manifest revisions, with their release tags
available locally. The existing Docs workflow uses separate full-history checkouts
for these sources. The validator never fetches: it checks HEAD and each
`refs/tags/<tag>^{commit}` against the locked SHA, then verifies SHA-256 hashes of
all cited source files. It rejects missing, mutable, mismatched or unlocked source
references in either language and requires each release label/tag/SHA assertion.
Updating the guide baseline requires reviewing the manifest and both languages.

These checks establish source provenance and drift detection, **not** that the prose
matches every runtime behavior, that login/MFA/roles work, or that a deployment is
secure. They do not execute the product or a recovery test.

此门禁独立校验英中手写指南的发布标签、完整提交 SHA、固定源码链接与文件哈希；不会升级
生成参考的 Server v1.22.0 基线。CI 在独立目录检出来源并核对标签所指提交；脚本本身不联网。
来源一致性检查不等于语义审查、产品行为验证或真实部署验收。

## PR workflow boundaries / PR 工作流边界

The Docs workflow keeps the `pull_request` trigger and explicitly limits its token
to `contents: read`. Every checkout uses `persist-credentials: false`: checkout
authentication is temporary, not left in Git config for later repository scripts
or dependency lifecycle code. No token is exported to build/install steps.

Before the sibling checkouts, inline workflow code reads both lock files as JSON
data without loading repository scripts. Fixed repository/directory names and
exact 40-character lowercase hexadecimal revisions are checked before writing any
outputs. Checkout receives these values as action inputs; the revision comparison
receives them as environment data and uses parameterized Git calls, never expression
interpolation into shell source. Full source, document and generated-page checks
still run after all checkouts.

Run `node --test scripts/docs-workflow.test.mjs` for offline contract and negative
tests of the actual inline workflow code. These tests use mocked filesystem/Git
calls; CI performs the real checkouts and source validation. The PR's workflow and
lock files still require review. These checks neither prove a PR safe nor approve a
changed source baseline. The version-pinned Mintlify registry install is unchanged.

Docs 保持 `pull_request` 触发，显式限制为 `contents: read`，全部检出关闭凭据持久化；
检出的临时认证不会留给后续仓库脚本或依赖生命周期代码，构建与安装步骤不导出 token。
检出来源前只以 JSON 数据读取两份清单，验证固定仓库/目录及完整 40 位小写十六进制 SHA，
全部通过后才输出。SHA 经 action 参数或环境变量传递，使用参数化 Git 调用，
不将表达式结果插入 shell 源码。离线测试使用模拟文件/Git 调用，真实检出与完整校验由 CI 执行。
工作流、清单及来源版本变更仍须审核，门禁不代表安全批准；Mintlify 按版本从 registry 安装的方式未改。
