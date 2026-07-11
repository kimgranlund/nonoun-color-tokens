# Hosting the consumption plugin — the private-repo distribution plan

> Ratified 2026-07-11. The repo is going PRIVATE; the public distribution channel for the
> consumption plugin moves from the GitHub marketplace to a URL-hosted marketplace at
> **`https://ultimate-tokens.com/plugins/claude/marketplace.json`**, backed by an **npm package**
> (`ultimate-tokens-claude`).

## Why this shape (the verified platform constraint)

A URL-hosted marketplace downloads **only** `marketplace.json` — Claude Code cannot fetch plugin
files from plain HTTPS paths, and a relative-path plugin source fails with "path not found"
(code.claude.com/docs/en/plugin-marketplaces → *Plugins with relative paths fail in URL-based
marketplaces*). Plugin sources for a URL-hosted catalog must be **npm, GitHub, or a git URL**.
With the repo private, npm is the only backing that needs no public git anywhere; users only ever
see the domain:

```
/plugin marketplace add https://ultimate-tokens.com/plugins/claude/marketplace.json
/plugin install ultimate-tokens
```

## The release flow (per plugin change)

1. Edit the plugin under `plugin/ultimate-tokens/` and **bump `plugin.json` `version`** — it is the
   update cache key AND the npm/site pin; a content change without a bump is a release nobody
   receives. `test/plugin/hosted-pack.mjs` fails on any version drift between the three artifacts.
2. `npm test` green (parity + the hosted-pack gate).
3. `npm run gen:plugin-pack` → `dist/plugins/`:
   - `dist/plugins/claude/` — `marketplace.json` (npm-pinned to the exact version) + `index.md`
   - `dist/plugins/npm/ultimate-tokens-claude/` — the publishable package
4. `npm publish dist/plugins/npm/ultimate-tokens-claude` (public registry; first publish claims the
   name — needs the npm account login).
5. Upload `dist/plugins/claude/` to the site at `/plugins/claude/` (the catalog must go live AFTER
   the npm version exists — it pins exactly).
6. Users refresh with `/plugin marketplace update ultimate-tokens` → `/plugin update ultimate-tokens`.

## The staged flip (when ultimate-tokens.com is LIVE — one PR)

Interim policy (ratified): all public copy keeps the WORKING GitHub commands until the domain
serves — never ship a 404. At domain-live, flip these in one PR:

| Surface | Today | Flips to |
|---|---|---|
| `_zipReadme()` (src/ui/app.js) install commands | `kimgranlund/ultimate-tokens` marketplace add | the two-command domain form above |
| `.claude/docs/marketing/fact-sheet.md` plugin row | GitHub install commands | the domain form |
| `plugin/ultimate-tokens/.claude-plugin/plugin.json` `homepage`/`repository` | GitHub URLs | `https://ultimate-tokens.com` (drop `repository` or point at the site) |
| The root `.claude-plugin/marketplace.json` | the in-repo (GitHub-channel) catalog | retire or keep as the private/dev channel |
| README / store copy pointers | GitHub | the domain (re-run voice-check) |

## Going private also breaks (tracked, not this file's fix)

The #250 debrand pointed **support** (GitHub Issues), **docs** (the README), and the **homepage**
(GitHub Pages — unavailable on private repos without a paid plan) at this repo. Privatizing without
re-homing those ships dead links everywhere the debrand just cleaned. ultimate-tokens.com must take
over homepage + docs + a support channel at the same cutover; the hosted-MCP spec's `<APP_DOMAIN>`
placeholder resolves to the same domain.
