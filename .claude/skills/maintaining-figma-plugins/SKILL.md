---
name: maintaining-figma-plugins
description: >
  Work on the Figma plugins for ultimate-tokens — the standalone semantic
  Binder and the app-as-plugin apply path. Use whenever a change touches figma/,
  a binder/plugin code.js, the offline manifest, the "Color Semantic" / "Color
  Primitives" collections, the raw→semantic alias cascade, the apply/Regroup
  gate, the config round-trip out of variables, or someone says "apply to Figma
  isn't working", "the binder skipped roles", "fix the cascade", "Figma plugin
  fails to run / syntax error in the sandbox".
disable-model-invocation: false
user-invocable: true
---

# Figma variable binder — ultimate-tokens

There are **TWO** Figma plugins in `figma/`, and they are NOT the same artifact. Know which one a task
touches before you change a line — they share the Color Primitives → Color Semantic vocabulary (ADR-016) but differ in
who creates what:

| | **The standalone Binder** | **The app-as-plugin** |
|---|---|---|
| Path | `figma/binder/figma-semantic-binder/{code.js, manifest.json}` | `figma/plugin/{code.js, manifest.json, ui.html}` |
| Does | aliases an existing raw collection → a new aliased `Color Semantic` | the full generator UI; `applyBundle` CREATES both collections, prunes, can rebuild |
| Needs | `Color Primitives` to ALREADY exist (else it notifies + closes) | nothing — it generates the raw colors too |
| `ui.html` | none (no UI) | the generated app bundle (`npm run gen:figma-ui` → `<ultimate-tokens>` + the bridge) |
| Verifier | `test/figma/binder.mjs` | `test/figma/plugin.mjs` |

The conceptual model — *why* aliasing is the only thing giving a live raw→semantic cascade — is owned by
`docs/reference/references/knowledge-05-figma-plugin.md`. **Cite it; don't re-derive it.** Role-table parity (the
`code.js#roleTable(n)` copy) is owned by `adding-semantic-roles` — **cite it; don't duplicate the procedure.**

## The four load-bearing constraints (depth in `references/foundations.md`)

1. **Offline, always.** Both manifests declare `networkAccess: { allowedDomains: ["none"] }` (ADR-010 /
   AC-P3). No `fetch` / `XMLHttpRequest` / `WebSocket` / dynamic `import()`. This is *why* the app's fonts are
   base64-embedded in `ui.html` — there is no CDN. A network call is a hard gate failure, not a style choice.
2. **The sandbox can't import `.mjs`.** Figma plugin code runs in a non-module VM, so the standalone binder's
   `code.js` **HARDCODES** `roleTable(n)` — a verbatim copy of `semanticRoles(n)`. `figma/binder/bind-plan.mjs`
   is the pure, importable planner the verifier tests; `code.js` mirrors it. They MUST stay in lockstep
   (`adding-semantic-roles` step 4 owns the edit; the parity gate is in `references/foundations.md` §3/§4).
3. **The VM is jsvm-cpp, not modern V8.** Optional catch binding (`catch {` with no param, ES2019) PARSE-fails
   in Figma yet loads fine in Node — so a `node --check` (and the verifier's own `new Function` load) won't
   catch it. **Always write `catch (e) {`.** Both plugins follow this as a PRACTICE; the static guard is a
   GATE in `plugin.mjs` only (the `vmsyntax` check — real incident 2026-06-17). The binder's `code.js` also
   uses `catch (e)` (its one catch is the `main().catch` wrapper) but is unguarded — so be disciplined there.
4. **Never surface a raw error to the user.** Figma policy rejects plugins that show a stack/`e.message`.
   `main().catch(...)` (binder) / the message handler's `catch (e)` (app) logs the detail to `console.error`
   and `figma.notify`s a friendly line. Both verifiers' `compliance` check greps for
   `figma.notify(...e.message/String(e)/.stack...)` and fails the run on a hit.

## The two flows (depth in `references/foundations.md`)

**Standalone binder** (`figma/binder/figma-semantic-binder/code.js`, read it): find the `Color Primitives`
collection → index its vars by name → create/find `Color Semantic` with Light + Dark modes → for each of the 8
`PALETTES`, for each role in `roleTable(n)`, resolve `rawVars["{n}/{refKey(ref)}"]` for light and dark →
`createVariableAlias(rawVar)` into each mode via `setValueForMode`. Reports `bound` + any `missing` raw
targets. The grammar `"{n}/{refKey(ref)}"` is load-bearing: every emitted target is GUARANTEED to be a
canonical raw-colors name (solid → pad3 `"50"→"050"`; scrim → `"500-{step}"` verbatim).

**App apply path** (grep `src/ui/app.js`): the buttons call `requestApplyToFigma(rebuild)` →
`renderApplyGate()` (a consent road-block: *back up your file first*; normal apply is cookieable via a
versioned localStorage key, the destructive **Regroup** ALWAYS warns) → `applyToFigma` posts
`{type:"apply", dtcg: this.figmaBundle(), config: serialize(this.doc), rebuildSemantic, collections}`.
`figma/plugin/code.js#applyBundle` creates Color Primitives + Color Semantic, prunes orphans, embeds the config
in `figma.root` pluginData. **The two collection NAMES are per-doc overridable (#255)** — Settings ›
Token mapping › "Figma collections" writes `doc.figmaCollections {raw, semantic}` (persisted, absent =
defaults); `figmaCollectionNames(doc)` (model.mjs) resolves, rides the bundle's aliasData
`targetVariableSetName` AND `msg.collections`; code.js `setCollectionNames()` adopts it with constant
fallbacks, and `readRawColors` resolves a renamed file from the SAVED config at boot. The standalone
Binder still looks up the DEFAULT names only. **STYLES (2026-07-09, PRs #231–#236):** when the drawer's Styles chip is on
(opt-OUT), `msg.stylePlans` + `msg.fontPrimitives` ride the same apply — pure plans from
`figma/binder/style-plan.mjs` (the THIRD planner sibling: paint styles per semantic role bound to Color
Modes via `setBoundVariableForPaint`; text styles per voice×step×sibling-weight bound to
Typography/Font Primitives; `primitivesApplyPlan` = the ordered Font Primitives ensure-plan) →
`code.js#applyStylePlans` + `applyFontPrimitives` execute them verbatim, provenance-pruned via
`STYLE_REGISTRY_KEY` (user styles untouchable). Binds fontSize/fontFamily/paragraphSpacing/
lineHeight/letterSpacing (px FLOATs since #295) + EITHER fontStyle OR fontWeight — **never both**
(2026-07-13, #292/#301, supersedes the v1 bind-all shape: real Figma resolves a bound fontWeight to
"the closest valid weight" independently, silently overriding a bound fontStyle's named cut; the
executor also explicitly UNBINDS the stale half of the pair on re-apply). The full hard-constraint
list found live against real files: `references/figma-styles-hard-constraints.md`. Verifier:
`test/figma/style-plan.mjs` (both-directions parity vs exportUI3) + the styles e2e in `plugin.mjs`.
Sibling weights: `doc.type.voices[v].weights`, edited in the per-voice panel (Suggest =
`siblingWeightDefaults`, or `bodyClassSiblingDefaults` for Body*/Label*/Tiny*/Lead — #303/#307). Round-trip OUT: `configFromVariables` (`src/ui/model.mjs`) recovers each family's
500 hue/chroma from the live raw vars (the APPROXIMATE fallback when no config is embedded); `read-variables`
→ `receiveLiveVariables` feeds the drift diff. Geometry rides a separate `Geometry` collection of Figma
NUMBER (FLOAT) vars via `geomTokensFigma` (`src/engine/geometry.mjs`).

## Procedure

1. **Identify the plugin.** Standalone binder vs app-as-plugin (the table above). A "binder skipped roles"
   bug is the binder's `missing` list (a raw target absent — check pad3 + scrim grammar). An "apply did
   nothing / duplicated" bug is the app's `applyBundle`.
2. **If the role set changed**, this is an `adding-semantic-roles` task — the binder's `roleTable(n)` is one
   of its parity sites. Do NOT hand-edit the role rows here in isolation; follow that skill's lockstep so the
   answer key, the `.mjs` planner, the count literals, and this copy all move together.
3. **Keep it offline + VM-safe.** No network API; `catch (e) {` not `catch {`; no raw error in `figma.notify`;
   no remote `import()`. (The app verifier also requires the `ui.html` bridge — `figma-init` / `pluginMessage`
   / `figmaBundle` / `config-loaded`→`applyLoadedConfig` / `variables-read`→`receiveLiveVariables`.)
4. **If you touched the binder's `roleTable`/`refKey`/grammar**, re-derive the target set against
   `bind-plan.mjs` (the parity gate does this) — every `"{n}/{refPath}"` must be in the canonical raw name set,
   no dangling `"{n}/50"`, no out-of-range scrim step.
5. **If you regenerated the app bundle**, run `npm run gen:figma-ui` so `figma/plugin/ui.html` is current
   (`npm test` runs it for you; a stale `ui.html` fails the `ui` gate). Never hand-edit `ui.html` — it is
   generated from `dist/ultimate-tokens.html`.

## Validate (draft → check → fix → re-check)

Run the two pure Figma verifiers first, then the full suite. Each prints `pass`/`FAIL` per group — the
per-verifier gate-group list is owned by `references/rubric.md` (read it there):

```
node test/figma/binder.mjs   # the standalone binder — owns the `parity` gate (roleTable ↔ bind-plan ref-set)
node test/figma/plugin.mjs   # the app-as-plugin — owns the `vmsyntax` gate (NO `catch {`)
npm test                     # test/run.mjs runs both plus the engine/ui suite
```

The two SILENT KILLERS a green Node run hides: **`parity`** in `binder.mjs` (it loads `roleTable`/`refKey`
out of `code.js` via `new Function`, strips the top-level `main();`, and diffs the derived ref-target SET both
directions against `bindingTargets(NAMES)` — the real 2026-06-18 scrim drift), and **`vmsyntax`** in
`plugin.mjs` (a `catch {` that parses in Node but not in Figma's VM). Don't call it done until both pure
verifiers and `npm test` are green.

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the two-plugin split, the alias-cascade mechanism, the binder bind loop, the app apply/prune/rebuild contract, the parity model, the four constraints |
| `references/best-practices.md` | the non-obvious do/don't (offline, `catch (e)`, friendly errors, idempotent find-or-create, the binder `missing` list) + a worked debug walkthrough |
| `references/rubric.md` | score a Figma-plugin change before calling it done (offline + parity + VM-safe are the gates) |
| `references/figma-styles-hard-constraints.md` | before changing the styles executor/planner — the five live-file API constraints (fontStyle/fontWeight XOR, NUMBER-only metric fields, path-prefix folder-ization, no variable-font axis metadata, real-font name/weight matching) |
| `docs/reference/references/knowledge-05-figma-plugin.md` | the conceptual model — why aliasing gives the cascade, files/manifest, run instructions, failure modes (owned there — cite, don't copy) |
| `.claude/skills/adding-semantic-roles/` | the `code.js#roleTable(n)` role-row edit + every parity site (owned there — a role change is THAT skill, not this one) |

Peers: [[adding-semantic-roles]] (the alias-cascade parity site) · [[adding-export-formats]] (the Figma
export variant) · [[shipping-changes]].