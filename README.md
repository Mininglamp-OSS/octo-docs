# octo-docs

The unified documentation portal for **[Octo](https://github.com/Mininglamp-OSS)** —
the open, AI-native workplace where *agents do and humans decide*.

Built on [Mintlify](https://mintlify.com). Aggregates the 31-repository Octo ecosystem into
one [Diátaxis](https://diataxis.fr/)-structured, bilingual (EN / 简体中文) portal.

> See [`DESIGN.md`](./DESIGN.md) for the full blueprint, IA, and SSOT strategy.

## Local development

```bash
npm install            # dev dep for the generators (js-yaml)
npm run gen:all        # generate the API / CLI / config reference from source specs
mint dev               # local preview at http://localhost:3000
mint validate          # strict build check (fails on warnings/errors)
```

`mint` is the Mintlify CLI (`npm i -g mint`).

## Structure

```
docs.json          Mintlify config (theme, colors, navigation)
index.mdx          four-lane landing page
get-started/       Tutorials: what Octo is, architecture, quickstarts
guides/            How-to, grouped by audience lane
reference/         GENERATED reference (API, CLI, config) — do not hand-edit
concepts/          Explanation
ecosystem/         the repository matrix
contributing/      code + docs + translation
zh/                简体中文 pages (Mintlify localization)
scripts/           SSOT generators (see scripts/README.md)
```

## Reference is generated

The `reference/api/`, `reference/cli/`, `reference/configuration.mdx`, and
`reference/errors-and-envelopes.mdx` pages are generated from the specs that ship inside the
code (`octo-cli`, `octo-auth`, `octo-server`). Edit the spec, then `npm run gen:all` — never
hand-edit the generated files.

## License

Documentation content is Apache-2.0, matching the Octo core repositories.
