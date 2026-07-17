# CTO Platform/Distribution Review — ultimate-tokens
Scope: figma/plugin, figma/binder, mcp/, plugin/ultimate-tokens, docs/site/mcp-hosting-spec.md, CI, release model.
Read-only. Repo confirmed PUBLIC on GitHub (`gh repo view` → visibility: PUBLIC); package-lock.json IS committed.

## Strengths (fair CTO — name these before the gaps)

- **Parity-gate culture is real, not aspirational.** `test/figma/binder.mjs`'s "PARITY GUARD" and
  "floatparity" gates load the runtime `code.js`, extract function bodies by balanced-brace scan, strip
  comments/whitespace, and diff them against the canonical source / the flagship's copy. The comments cite
  a real incident (2026-06-18 scrim-ref drift) that motivated the gate — this is a team that got burned once
  and mechanized the lesson, not merely trusted itself to remember.
- **The planner/executor split for color + mode-apply is genuinely pure.** `figma/binder/bind-plan.mjs`,
  `mode-apply-plan.mjs`, `style-plan.mjs` have zero `figma` references, are unit-tested in isolation
  (`test/figma/mode-apply.mjs`, `style-plan.mjs`, `binder.mjs`), and the executors (`code.js` in both the
  flagship and the binder) are deliberately "dumb" — this is the right shape for code that must run in two
  non-interoperable sandboxes (Figma's plugin VM can't `import` an `.mjs`).
- **Offline-by-design is enforced, not just documented.** Both manifests declare
  `networkAccess:{allowedDomains:["none"]}`; `test/figma/plugin.mjs` and `test/figma/binder.mjs` both grep the
  comment-stripped source for `fetch`/`XMLHttpRequest`/`WebSocket`/dynamic `import()` and fail the build if
  found. The hosted-MCP spec (docs/site/mcp-hosting-spec.md §Constraints) explicitly re-states this as a
  load-bearing constraint for Phase B–F, routing all future network code through web-only seams in
  `src/main.ts` (the one seam that exists today, `_licenseService`, is a clean precedent).
- **The MCP core is single-sourced by construction, not by discipline.** `mcp/brand-kit-core.mjs`
  (`buildSurface`/`handle`) is imported by both the stdio server today and the planned Cloudflare Worker
  (spec §7) — this is the *opposite* of the Figma-plugin duplication problem below, because Node module
  imports work fine in both environments. `test/mcp/core.mjs` locks the surface directly.
- **The consumer-plugin distribution channel is real and live**, not just planned: `@ultimate-tokens/claude`
  is published on npm (checked via `npm view`: v0.2.1, published 6 days ago), `.github/workflows/publish-plugin.yml`
  auto-publishes on every `plugin.json` version bump with an idempotent version-compare guard, and the
  parity gates (`plugin/ultimate-tokens/skills/*/scripts/*-parity.mjs`) are wired into `npm test`
  (`test/run.mjs` runs `plugin/manifest.mjs`, `plugin/color-tokens.mjs`, etc.).

## Findings

### 1. CRITICAL — no gate checks that committed generated artifacts match their own generator
`figma/plugin/ui.html` (2.87 MB, single 234 KB minified line at its longest), `figma/plugin/code.js`'s
role table, `mcp/*.mjs` assets, and `src/ui/*-assets.js` are all committed, generated files. `npm test` and
`npm run build` **regenerate them in the working tree** (`gen:figma-assets`, `gen:mcp-assets`, `bundle`,
`gen:figma-ui`) before running the suite — but `.github/workflows/ci.yml` never runs `git diff --exit-code`
(or any equivalent) after the build step to assert the regeneration produced no diff against what's
committed. CI tests the **freshly regenerated** copy in its own ephemeral checkout; it never verifies that
copy is byte-identical to the one a user actually gets from `git clone` / a release zip / dragging
`figma/plugin/` into Figma without running `npm run build` first.
- **Consequence:** a contributor can edit `src/ui/app.js` or an engine file, forget to run `npm test`/`build`
  locally before committing, and CI will still go green (it regenerates and tests its own fresh copy) while
  the *committed* `ui.html` silently ships stale UI/logic to every real Figma-plugin user and every npm/zip
  consumer. This is exactly the "committed build artifacts as API" risk the task description flags, and today
  nothing catches it mechanically.
- **Remedy:** add one CI step after `npm run build` / `npm test`: `git status --porcelain` (or
  `git diff --exit-code`) over the generated paths (`figma/plugin/ui.html`, `figma/plugin/code.js`'s
  generated sections, `src/ui/*-assets.js`, `mcp/*` assets), fail the job if non-empty. Cost: ~30 minutes,
  one CI step, no new tooling.

### 2. MAJOR — the byte-parity discipline is diff-testing hand-duplicated code, not single-sourcing it
`figma/binder/figma-semantic-binder/code.js:151-246` hand-carries a second copy of the 53-role table
(`roleTable()`) that must match `bind-plan.mjs`'s derivation of `semanticRoles()`, and lines 55-136 hand-port
five float-executor functions (`readFloatRegistry`/`writeFloatRegistry`/`ensureFloatCollection`/
`varsByName`/`applyFloatPlans`) **verbatim** from `figma/plugin/code.js`. The comments are candid about why:
"Figma plugin code runs in a non-module sandbox and cannot import the .mjs at run time" (code.js:13-14).
The `floatparity` gate (`test/figma/binder.mjs:207-236`) regex-extracts each named function from both files
via a balanced-brace scanner, strips comments/whitespace, and string-compares — a real trip-wire, but a
narrow one: it depends on both copies keeping the exact same function *name* and *shape* (a plain
`function`/`async function` declaration). Splitting one of the five functions into a helper, converting one
to an arrow function, or renaming a parameter for clarity in only one copy would either silently escape the
regex (false pass) or false-fail on a semantically-identical refactor.
- **Consequence:** the gate holds today (2 artifacts: the flagship + one binder), but it doesn't scale
  sub-linearly — every new Figma surface that needs the float-executor or the role table (a 3rd binder
  variant, a per-brand exporter) is another hand-copy + another parity-gate entry to maintain, and the
  extraction regex itself is a second place that can drift from what Figma's VM actually accepts (e.g. it
  wouldn't catch a shape change that both copies made identically but that breaks the *comparison*, only
  drift *between* the copies).
- **Remedy:** the repo already has precedent for source-splicing into generated Figma artifacts — the
  `FLOAT_PLANS` anchor (`code.js:41`, `/* __ULTIMATE_TOKENS_FLOAT_PLANS__ */`) is exactly this pattern, string-
  replaced at download time by `app.js`. Extend `scripts/gen-figma-ui.mjs` (or a sibling `gen-figma-binder.mjs`)
  to literally read the five function bodies + the role-table-equivalent out of the canonical `.mjs` sources
  and splice them into `figma-semantic-binder/code.js` at build time, the same way `gen-figma-ui.mjs` already
  splices the bridge script into `ui.html`. This converts "two hand-written copies + a diff test" into "one
  source + a codegen step", eliminating the entire parity-gate class for these functions. Cost: ~1 day
  (the splicing mechanism already exists as a pattern to copy; the risk is confirming Figma's plugin VM
  accepts the resulting inlined code with no bundler-added syntax it rejects — `vmsyntax` gate already
  covers the optional-catch-binding class of that risk).

### 3. MODERATE — migration policy ("retire") is smuggled into the DOM-adjacent app layer, not the planner
`src/ui/app.js:6188-6191` (`_figmaFloatPlans()`) mutates the plan objects returned by the pure
`modeApplyPlan()` after the fact: `if (p.collection === "Geometry" && p.variables.some(v =>
v.name.startsWith("type/"))) p.retire = ["Typography"];` — this is a real architectural decision (the
TKT-0009 collection-merge migration retires the old two-collection era) living in a ~7,600-line UI file
alongside render methods, not in `figma/binder/mode-apply-plan.mjs` beside `modeApplyPlan`/
`validateModeInterchange`, which are otherwise the tested, pure home for this class of decision. It's
exercised only via the headless-DOM shim (`test/ui/headless-boot.mjs` "(ty-fig)" group, e.g. line 1731),
not as a standalone pure-function test the way `bindingPlan`/`modeApplyPlan` get in `test/figma/*.mjs`.
This is precisely the "plans smuggle policy" pattern the task brief called out by name.
- **Consequence:** the mechanism (a `retire` array riding a plan) is sound and generically named, so it
  will keep being reused — but every future migration (the repo has already shipped TKT-0009 and TKT-0010
  in the last two weeks per git log) adds another ad hoc `if (...) p.retire = [...]` clause bolted onto
  `_figmaFloatPlans`, with no accumulating abstraction, no dedicated unit test file, and no place a reviewer
  would think to look for "what does this release retire."
- **Remedy:** extract a small pure function, e.g. `retirementsFor(plans, migrations)` or a `RETIRE_RULES`
  table, into `mode-apply-plan.mjs` (or a new `figma/binder/retire-plan.mjs`), with its own tests in
  `test/figma/mode-apply.mjs`. `_figmaFloatPlans()` becomes a thin caller. Cost: ~half a day, mechanical,
  no behavior change.

### 4. MINOR — CI uses `npm install` against a committed lockfile instead of `npm ci`
`.github/workflows/ci.yml` runs `npm install` (not `npm ci`) despite `package-lock.json` being committed.
`npm install` can still silently update the lockfile / resolve a different transitive version than what's
pinned if package.json's range (`vite ^8.0.12`, `typescript ~6.0.2`) has a new release since the lockfile
was written, whereas `npm ci` is strict-install-from-lockfile-or-fail. Given the build toolchain (vite+tsc)
directly produces the *committed* `ui.html` artifact (finding #1), the install step that produces that
artifact's toolchain should be the most reproducible one in the pipeline, not the least.
- **Remedy:** swap `npm install` → `npm ci` in `ci.yml`. Cost: trivial, one-line change; verify lockfile is
  currently in sync first (`npm ci` will fail loudly if not, which is itself useful signal).

### 5. Byte duplication does not currently extend to the role table across the 3-way parity claim
CLAUDE.md states the Figma `code.js` table "mirrors" `role-table.json` (3-way parity: role-table.json ↔
`semanticRoles` ↔ Figma `code.js`). Verified: `test/figma/binder.mjs` explicitly *defers* the role-table leg
("`console.log('defer  hpg-parity-roletable — role-table parity is verified by semantic-mapping')`" —
binder.mjs:244) rather than re-checking it itself — it relies on a *different* verifier
(semantic-mapping's own harness, not reviewed in this pass) to have already locked `role-table.json` ↔
`semanticRoles()`, and only checks `code.js`'s hardcoded `roleTable()` against the derived `bindingTargets()`.
This is architecturally fine (no test should duplicate another test's assertion) but it does mean the
"triple parity" is actually two separate two-way gates chained together, each owned by a different verifier
file, with no single test asserting all three are simultaneously consistent in one run. Low risk today since
both legs run in the same `npm test` invocation, but worth naming as a design note, not a defect.

### 6. Hosted/accounts trajectory — the spec correctly anticipates today's identity gap, but the escape hatch is thin
`docs/site/mcp-hosting-spec.md` §6 ("last-write-wins per kit... multi-device concurrent edits are out of
scope for v1") and §13 openly flag versioning as unresolved. The one thing not yet addressed even at spec
level: **kit identity across a rename.** Today a "kit" is `brand-kit.json` — a resolved snapshot with no
stable id; the spec's own Phase C introduces `kit_id` in D1, but the *migration* path for a user's existing
local kit (renamed, or the same brand re-exported) has no identity rule (is it "the same kit" by name match?
by content hash? a fresh id every time?) — this will directly determine whether "always-current" sync (the
sold value prop) actually reads as "my kit" or as "a new kit that happens to look similar" the first time a
free user upgrades to Pro and syncs an existing local kit. Not a code defect (nothing built yet — correctly
gated behind an unwired `hostedMcp` flag, confirmed: `flagOf` shows no `TIER_FLAGS`/`_kitSync` consumer in
`src/` yet), but worth flagging now since the spec's data model (§8) already fixes `kits.kit_id` as a
server-minted primary key with no field for "the client's local identifier" to map from.
- **Remedy:** before Phase C, add one line to §6/§8: how a first sync assigns `kit_id` to a pre-existing
  local kit (recommend: content-hash-or-name-match on first sync, id thereafter — cheap, and avoids an
  orphaned-duplicate kit on every early adopter's first sync).

## Verdict

The parity-gate *culture* (strengths, above) is the standout asset here — most of what a fast-scaling
plugin surface breaks (drift between a sandboxed copy and its source, network creeping into an "offline"
plugin, a hosted service duplicating a downloadable one) is already caught by a real, cited-incident-driven
test. The two things that will actually hurt at the next order of scale are structural, not cultural: (1)
the generated-artifact-as-API model has no drift gate between commit and generator (finding #1 — this is
the one I'd fix first, it's cheap and closes a real gap that could ship stale code to real users silently),
and (2) the Figma-sandbox duplication is solved by testing the duplication rather than removing it (finding
#2) — sustainable at N=2 hand-copied artifacts, not obviously sustainable at N=4 or 5 as more Figma surfaces
ship. Everything else (planner/executor split, MCP core sharing, offline doctrine, consumer-plugin release
pipeline) is in good shape and should be held as the template for what comes next (the hosted MCP Worker,
future Figma surfaces).
