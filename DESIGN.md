# Octo Docs — Design Blueprint

> The design rationale, information architecture, and build plan for the unified
> Octo documentation portal, built on **Mintlify**.
>
> **Framework:** Mintlify (`docs.json` + MDX). **CLI:** `mint dev` / `mint validate`.

---

## 0. TL;DR

Octo is an open-source, AI-native team-collaboration platform ("**Agents Do,
Humans Decide**") spread across **31 repositories**. Its per-repo docs are
strong but there's **no unified front door**. This portal provides one:

1. Organized by **reader journey**, not by repo layout.
2. Following the **Diátaxis** framework (Tutorials / How-to / Reference / Explanation).
3. Split into **four audience lanes** (Teams · Bot Developers · Integrators · Operators).
4. With a **single source of truth**: API/CLI/config reference is *generated* from the
   OpenAPI specs and config template that ship inside the code — never hand-typed.
5. **Bilingual (EN / 简体中文)** via Mintlify `navigation.languages`.

---

## 1. Product mental model

Octo is **the open workplace built for humans × AI agents**. The defining
concept is the **Lobster** — an OpenClaw-powered "digital double" that carries
the thinking and doing while humans keep taste. Three principles: **local-first**,
**humans decide**, **release-as-product**.

### 1.1 The 31 repos, grouped by role

| Layer | Repositories | Lang |
|---|---|---|
| **Core services** | `octo-server` (hub), `octo-fleet`, `octo-matter`, `octo-smart-summary`, `octo-mail`, `octo-speech`, `octo-search-indexer`, `octo-message-export-api`, `octo-version-sync`, `octo-marketplace` | Go |
| **Collaborative docs** | `octo-docs-backend` (Yjs/CRDT), `octo-docs-html` | Go |
| **Clients** | `octo-web`, `octo-android`, `octo-ios`, `octo-chrome-extension` | TS / Kotlin / Swift |
| **IM core** | `octo-im` (WuKongIM) | Go |
| **Shared / SDK** | `octo-lib`, `octo-auth` (Go + TS), `octo-adapters` | Go / TS / Py |
| **CLI / runtime** | `octo-cli` (98-op REST client), `octo-daemon-cli` | Go |
| **Standards / skills** | `octo-spec` (OKF), `octo-skills` | — |
| **Channels** | `cc-`, `codex-`, `hermes-`, `claw-`, `openclaw-channel-octo` | Node.js |
| **Delivery** | `octo-deployment`, `octo-website` | — |
| **Admin** | `octo-admin` | TS / React |

---

## 2. Design principles

| # | Principle | Consequence |
|---|---|---|
| P1 | One front door, not 31 | Aggregate; per-repo deep docs stay authoritative and are linked. |
| P2 | Organize by journey | Nav is audience + task, never one-page-per-repo. |
| P3 | Diátaxis | Every page is exactly one of Tutorial / How-to / Reference / Explanation. |
| P4 | Single source of truth | Reference is generated from specs; hand-writing it is banned where a generator exists. |
| P5 | Progressive disclosure | Landing → lane → task. Newcomers reach "hello world" fast. |
| P6 | Bilingual | EN + 简体中文 via `navigation.languages`. |

---

## 3. Information architecture (Mintlify tabs → groups → pages)

- **Get Started** — What is Octo, Architecture at a glance, Core concepts, and the two flagship quickstarts.
- **Guides** — How-to, grouped by the four lanes (Teams · Bot Developers · Integrators · Operators).
- **Reference** — generated: REST/WS API (per domain), octo-cli (per domain), configuration, errors, SDKs, octo-spec.
- **Concepts** — architecture, the Lobster model, security & auth, IM core, collaborative docs, search, philosophy.
- **Ecosystem** — the repository matrix; Contributing (code / docs / translation).

### Audience lanes (homepage `CardGroup`)
- 👤 **Teams & Users** → Deploy in 10 minutes
- 🤖 **Bot & Agent Developers** → Connect your first bot *(signature lane)*
- 🔌 **Integrators** → Call the API
- 🛠 **Operators** → Deploy on Kubernetes

### On-disk layout

```
docs.json                 ← Mintlify config: theme, colors, navigation (languages→tabs→groups→pages)
index.mdx                 ← four-lane landing
get-started/*.mdx
guides/{teams,bot-developers,integrators,operators}/*.mdx
reference/                ← includes GENERATED pages (api/, cli/, configuration, errors)
concepts/*.mdx
ecosystem/*.mdx
contributing/*.mdx
zh/get-started/*.mdx      ← 简体中文 (Mintlify localization)
logo/ · favicon-mark.png  ← brand assets (reused from octo-server)
scripts/                  ← SSOT generators (gen-api / gen-cli / gen-config + _lib)
DESIGN.md                 ← this file
```

---

## 4. Single source of truth (SSOT)

Reference pages are generated, never retyped — see `scripts/`.

| Surface | Source of truth | Generator | Output |
|---|---|---|---|
| REST API (per domain) + index + errors | `octo-cli/internal/registry/specs/*.json`; `octo-auth/contract/errors-v1.yaml` | `gen-api.mjs` | `reference/api/*.mdx`, `reference/rest-websocket-api.mdx`, `reference/errors-and-envelopes.mdx` |
| octo-cli commands (per domain) + index | the same octo-cli specs | `gen-cli.mjs` | `reference/cli/*.mdx`, `reference/octo-cli.mdx` |
| Configuration | `octo-server/configs/tsdd.yaml` | `gen-config.mjs` | `reference/configuration.mdx` |

```bash
npm run gen:all      # regenerate all reference pages
npm run gen:check    # CI drift detection (exit 1 if stale)
```

Every generated file carries a `{/* DO NOT EDIT */}` banner. Generators expect
the sibling repos checked out next to `octo-docs`.

---

## 5. Bilingual, verification

- **i18n** — `navigation.languages: [en (default), zh]`. Chinese pages live under `zh/`.
  Partial translation is fine (untranslated pages simply aren't in the zh tab).
- **Verification** — `mint validate` (strict; fails on warnings/errors) is the build gate;
  `mint broken-links` checks links; `mint dev` for local preview.

---

## 6. Rollout status

| Round | Deliverable | Status |
|---|---|---|
| R1 | Blueprint + IA + skeleton | ✅ |
| R2 | Mintlify scaffolding (`docs.json`, four-lane homepage, i18n, theme) | ✅ |
| R3 | SSOT generators (API + CLI + config) → Mintlify MDX | ✅ |
| R4 | Flagship tutorials (Deploy, Connect a bot) EN + 简体中文 | ✅ |
| R5 | Fill remaining guides/concepts; SDK reference generator; hosted deploy | pending |

### Definition of done (portal v1)
- [ ] A newcomer deploys Octo and connects a Claude Code bot using only the portal.
- [ ] Every reference page is generated from a spec.
- [ ] EN + 简体中文 parity for Get Started.
- [ ] `mint validate` passes in CI.
