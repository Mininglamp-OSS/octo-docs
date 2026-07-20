# Deploying the Octo docs

The portal is built with [Mintlify](https://mintlify.com). Mintlify hosts the site and
**auto-deploys on every push to the default branch** once its GitHub App is connected to this
repo.

## One-time setup (manual — requires dashboard + GitHub org admin)

These steps can only be done by someone with access to the Mintlify dashboard and admin rights on
the `Mininglamp-OSS` GitHub org:

1. Sign in at [dashboard.mintlify.com](https://dashboard.mintlify.com) with the org account.
2. Create a project and point it at this repo (`Mininglamp-OSS/octo-docs`), or import it.
3. Install the **Mintlify GitHub App** from the dashboard
   (`Settings → GitHub App`) and grant it access to `octo-docs`.
4. Set the deployment branch to **`main`** and the docs root to the repo root (where `docs.json`
   lives).
5. (Optional) Configure a custom domain (e.g. `docs.octo.dev`) under the project's domain
   settings, and add the DNS record Mintlify shows you.

After that, every merge to `main` redeploys automatically. Preview deployments are created for
pull requests.

## What CI already enforces

`.github/workflows/docs.yml` runs on every PR and push to `main`:

- **`npm run gen:check`** — fails if the generated reference pages are stale versus the source
  specs (SSOT drift). It clones the sibling spec repos (`octo-cli`, `octo-auth`, `octo-server`)
  to compare.
- **`mint validate`** — strict build (fails on warnings/errors).
- **`mint broken-links`** — fails if any internal link is broken.

So a green PR is guaranteed to build and deploy cleanly.

## Local preview

```bash
npm install
npm run gen:all          # regenerate reference from the sibling spec repos
mint dev                 # http://localhost:3000
mint validate            # strict check
```

> The Mintlify CLI (`mint`) requires an **LTS Node** (≤ 22). If your default Node is newer, use
> an LTS Node for `mint` commands.

## Regenerating reference before a release

The `reference/` pages (API, CLI, config, auth-verify) are **generated** and committed. When a
source spec changes upstream, regenerate and commit:

```bash
npm run gen:all
git add reference zh/reference
git commit -m "docs: regenerate reference from updated specs"
```

Never hand-edit files under `reference/` or `zh/reference/` — each carries a `DO NOT EDIT`
banner. See `scripts/README.md`.
