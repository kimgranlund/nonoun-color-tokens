# Distributing the consumption plugin — the pure-npm channel

> Ratified 2026-07-11 (supersedes the same-day ultimate-tokens.com hosting plan — nothing is
> hosted anywhere). The repo is going PRIVATE; the plugin's only public artifact is the npm
> package **`@ultimate-tokens/claude`** (the npm org Kim owns), published **automatically by
> GitHub Actions** on every version bump that lands on main.

## The user-facing channel

```
/plugin marketplace add https://unpkg.com/@ultimate-tokens/claude/marketplace.json
/plugin install ultimate-tokens
```

(jsdelivr mirror, same file: `https://cdn.jsdelivr.net/npm/@ultimate-tokens/claude/marketplace.json`.)

## Why this shape (verified platform facts, 2026-07-11)

- **No direct-from-npm install exists** — a marketplace is always the entry point (GitHub repo ·
  git URL · local path · remote URL). So `marketplace.json` rides *inside* the npm package and the
  npm CDNs serve it as a remote-URL marketplace: the registry is the only infrastructure.
- **A remote-URL marketplace downloads only marketplace.json** — its plugin source must be an
  npm/git source. Here it is the package itself, **unpinned** (floating latest): releases only
  touch npm, and a downloaded catalog never goes stale. `/plugin marketplace update
  ultimate-tokens` + marketplace auto-update deliver new versions.

## The release flow (fully automatic)

1. Edit the plugin under `plugin/ultimate-tokens/` and **bump `plugin.json` `version`** — the
   version is the update cache key AND the publish trigger; a content change without a bump is a
   release nobody receives. `test/plugin/hosted-pack.mjs` gates the lockstep.
2. Merge to main. `.github/workflows/publish-plugin.yml` compares the local version against
   `npm view @ultimate-tokens/claude version`; on a difference it runs the zero-dep suite, builds
   the pack (`npm run gen:plugin-pack`), and `npm publish --access public`. Same version → no-op.

Manual escape hatch: `npm run gen:plugin-pack` then
`npm publish dist/plugins/npm/ultimate-tokens-claude --access public`.

## One-time setup (Kim)

1. **`NPM_TOKEN` repo secret** — npmjs.com → Access Tokens → **Granular** token, packages
   read/write scoped to the `@ultimate-tokens` org → GitHub repo → Settings → Secrets → Actions.
2. The **first successful workflow run claims `@ultimate-tokens/claude`** on the registry. From
   that moment the channel is LIVE — flip the public install copy (below).

## The flip (at first publish — one PR)

Interim policy: public copy keeps the working GitHub commands until the package exists. Then:

| Surface | Flips to |
|---|---|
| `_zipReadme()` (src/ui/app.js) install commands | the unpkg two-command form above |
| `docs/marketing/fact-sheet.md` plugin row | same |
| `plugin/ultimate-tokens/.claude-plugin/plugin.json` `homepage`/`repository` | drop `repository` (private) or point at ultimate-tokens.com when it exists |
| The root `.claude-plugin/marketplace.json` (the GitHub channel) | retire — or keep as the local/dev channel |
| README / store copy pointers | the unpkg command (re-run voice-check) |

## Going private also breaks (tracked here, fixed at cutover)

The #250 debrand pointed **support** (GitHub Issues), **docs** (the README), and the **homepage**
(GitHub Pages — unavailable on private repos without a paid plan; `pages.yml` stops working) at
this repo. Privatizing without re-homing those ships dead links everywhere the debrand just
cleaned. ultimate-tokens.com (or another public home) must take over homepage + docs + a support
channel at the same cutover; the hosted-MCP spec's `<APP_DOMAIN>` placeholder resolves the same way.
