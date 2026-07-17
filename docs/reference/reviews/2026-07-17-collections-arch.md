# Variable-collection architecture review — ultimate-tokens Figma surface

Reviewer: systems-architecture pass (read-only). Scope: the generator's Figma-variable output —
Color Primitives / Color Modes / Geometry (box + `type/`) / Font Primitives, the three pure
planners (`bind-plan.mjs`, `mode-apply-plan.mjs`, `style-plan.mjs`), and the two executors
(`figma/plugin/code.js`, `figma/binder/figma-semantic-binder/code.js`).

Severity is about consumer blast radius, not code quality — this repo's engineering discipline
(pure planners, parity gates, provenance registries) is unusually good; the findings below are
about what the ARCHITECTURE still allows to go wrong despite that discipline.

---

## CRITICAL

### C1 — Every collection reconciles by NAME only; an engine-side field/role rename is binding-breaking by default

**Where:** `figma/plugin/code.js` — `applyBundle` raw loop (`rawByName[name] || figma.variables.createVariable(name, raw, "COLOR")`, ~L565) and semantic loop (~L593); `applyFloatPlans` variable loop (`byName[v.name] || figma.variables.createVariable(v.name, coll, v.type)`, ~L659); `applyStylePlans` style find-by-name (~L410-412, ~L484-486). All four reconciliation loops are identical in shape: **create-or-reuse keyed on the emitted NAME, prune whatever isn't in the current "wanted" name set.**

**Mechanism:** a Figma variable's *name* is its identity for every purpose that matters to a bound consumer (the path Figma displays, and — critically — what this executor uses to find "the same variable" across an apply). When the engine renames a field (TKT-0009: `padding`→`paddingNarrow`, `edgePadding`→`paddingWide`; TKT-0010 continues the same shape with the compact variants), the emitted key changes (`size/MD/padding` → `size/MD/paddingNarrow`). On a normal user re-apply: the OLD variable is no longer in the "wanted" set → **pruned (deleted)**, breaking every node/component/style bound to it; a NEW variable is minted under the new name with a **new Figma id**. Nothing in the executor detects "this is the same concept, renamed."

**Evidence this is real, not theoretical:** both TKT-0009 and TKT-0010's own "Findings" sections describe a **bespoke, hand-run migration** against the live BZZR file — calling the real Figma `variable.name = newName` API directly to preserve ids ("renamed IN PLACE... ids keep every node/style binding — zero re-binds needed"). That id-preserving path is NOT something the shipped plugin does automatically; it was a one-off script run by whoever executed the ticket, twice, in the same 24 hours. There have been **two renames in this repo's last day of history alone.**

**Consumer impact:** any team that treats a generated Figma file as long-lived (bound components, not just a swatch reference) will have their bindings silently severed the next time they click "Apply" after a kit upgrade that renamed anything — with no warning beyond the generic "back up your file" apply-gate nudge, which doesn't distinguish a safe re-apply from a rename-breaking one.

**Fix:** thread an explicit, hand-authored `renames: { "old/path": "new/path" }` map through the three planners (`mode-apply-plan.mjs` for float, `bind-plan.mjs`/`exportDTCG` for color, `style-plan.mjs` for styles) — authored *alongside* the ticket that ships a rename, the same discipline this repo already applies to count-literal test updates. Executors do the rename-first pass: `const v = byName[old]; if (v) { v.name = neu; byName[neu] = v; delete byName[old]; }` before the create-or-reuse pass, and drop `old` from the prune set.

**Migration cost:** **plan-level** (additive capability, doesn't touch existing values) but needs an ongoing authoring convention that doesn't exist today — nothing forces a future contributor to remember the rename map, so the fix is necessary-but-not-sufficient without a lint/checklist item (`shipping-changes` or the ticket template seems the natural home).

---

### C2 — Apply is a blind, unconditional overwrite; Geometry/Type have no read-back or drift detection at all (Color has a little)

**Where:** `applyFloatPlans` (`vr.setValueForMode(mid, Number(pair.value))`, code.js ~L660-663) and `applyBundle`'s two `setValueForMode` calls (~L566, ~L598-599) run for **every** variable in the plan regardless of whether it already existed — there is no "only write if changed" or "warn if the live value differs from what we're about to write" branch anywhere in the apply path.

**Asymmetry:** `readRawColors` (~L222-244) DOES read back live Color Primitives values for a UI-side drift diff (`read-variables` message, `figma.ui.onmessage`). There is **no equivalent for Geometry or Font Primitives** — grep of `figma.ui.onmessage`'s message-type list shows only `read-variables`, hardcoded to the raw color collection. So a hand-tweak to a dimension variable is not just unprotected on re-apply, it's **invisible to the tool even for inspection** — no diff, no warning, nothing.

**Consumer impact:** a designer who nudges one button's height in Figma for a real, deliberate reason gets it silently reverted on the next Apply — worse for dimension edits than for color edits, where at least a read-back path exists in the codebase (even if not wired into a pre-apply warning today).

**Fix:** extend `readRawColors`'s pattern to Geometry + Font Primitives so the UI can surface "N variables differ from the live file" before Apply — **plan-level**, no schema change, mirrors an existing capability. A stronger fix (actually preserving a hand-edit through re-apply) needs a per-variable "locked" flag — a genuine data-model addition; recommend sequencing the diff-surface first and treating override-preservation as a separate, later decision.

---

### C3 — The theme axis (Light/Dark) is hardcoded to exactly two modes; the breakpoint axis is fully generic — same "modes" vocabulary, two very different extensibility stories

**Where:** `exportDTCG`'s `semanticTree(mode)` is only ever invoked with the literals `"light"`/`"dark"` (`src/engine/exports.js` ~L451-453); `applyBundle` hardcodes `sem.modes[0]`→"Light", `sem.modes[1] || sem.addMode("Dark")`→"Dark" (code.js ~L583-586); `bind-plan.mjs`'s `bindingPlan` only ever emits `{ lightTarget, darkTarget }` — no N-way mode list. Contrast with `typeTokensFigmaModes`/`geomTokensFigmaModes`, whose `modes[]` parameter and `disambiguateModeNames` helper are fully generic over count and name.

**Consumer impact:** adding a breakpoint (BZZR's TV mode, per memory) is a supported, generator-side operation. Adding a **third theme** (High Contrast, a seasonal variant, a white-label sub-brand) is **not** — it requires an engine change across the exporter's return shape, the binder's target-name contract, and the executor's mode-creation loop, not a config toggle a user can reach.

**Fix:** generalize the color path to an arbitrary named-mode list, mirroring the float path's shape (`{name, roles}[]` instead of a fixed light/dark pair). This is a real, cross-cutting change (public export shape + binder contract + executor), so treat it as a genuine SPEC/ADR decision, not a quick patch — and confirm the product actually wants >2 themes before investing, since the fix touches `exportDTCG`'s public JSON shape (a documented format per `knowledge-04-export-formats.md`).

**Migration cost:** **plan-level, non-trivial** (touches a documented public export contract).

---

## MAJOR

### M1 — The mode-list back-fill (`mergeModeInterchanges`) can make a breakpoint silently inert for one system with no signal

**Where:** `figma/binder/mode-apply-plan.mjs` L39-46, L66-73 — when type's configured breakpoint list and geometry's differ, the merge unions the names and back-fills whichever half doesn't define a given mode with **that half's own default-mode value**. `_typeModeScales()` and `_geomModeScales()` are independent calls (`src/ui/app.js` L6780, L6795) — nothing in the UI currently prevents them from diverging.

**Consumer impact:** if a project ever configures type breakpoints independently of geometry breakpoints, a Figma user inspecting e.g. "Desktop Lg" on a `type/Display/lg/size` variable sees the Desktop (base) value with **nothing marking it as un-configured at that breakpoint** — it's indistinguishable from a deliberately-authored value. This is documented as an intentional design choice in the mode-apply-plan.mjs header ("doesn't vary there" = base values) — the finding is that the choice is invisible downstream, not that it's wrong.

**Fix:** a cheap UI-side validation warning whenever the two mode-scale calls' name sets diverge, surfaced before Apply. **Migration cost: cheap** (UI-only, no schema/data change).

### M2 — Styles are a hand-synced parallel vocabulary, not a projection of the variable names

**Where:** `style-plan.mjs` L88 builds paint-style names as `${f.name}/${styleGroupOf(r.key)}${r.key}` (Title-case family, e.g. `Primary/onPrimary`) while the variable it binds to is `${f.n}/${r.key}` (lowercase slug, `primary/onPrimary`) — same role, two independently-templated strings, kept aligned only by the `test/figma/style-plan.mjs` parity gate rather than one deriving from the other.

**Consumer impact:** every future role/voice rename is now a two-site change (variable path AND style path), and the two trees a Figma user browses (Local variables vs. Local styles panels) never read as literally the same name — a real, if modest, cognition/maintenance tax. This divergence (Title Case vs. lowercase) is plausibly a **deliberate** UI-convention choice (Figma's Styles picker reads better in Title Case; variable paths feed dev-mode/code) — if so this should be downgraded to MINOR and simply documented as intentional; I found no comment anywhere stating that rationale, which is itself the gap.

**Fix:** either derive the style name from the variable name via one shared case-transform function (making the divergence an explicit, single-point transform instead of two hand-authored templates), or add a one-line comment at both sites cross-referencing the other and stating the rationale. **Migration cost: cheap, source-only.**

### M3 — Color collections use weaker adoption-safety than the (newer) float collections, despite the safer pattern already existing in the same file

**Where:** `ensureCollection` (code.js L197-200, color) adopts **any** same-named collection found by `getLocalVariableCollectionsAsync().find(c => c.name === name)` — including a user's own hand-built collection that happens to share the name. `ensureFloatCollection` (L206-213, Geometry/Font Primitives) was deliberately hardened against exactly this: it only ever adopts a collection whose id is in the `FLOAT_REGISTRY_KEY` provenance map, per its own comment ("NEVER adopts a same-named collection it didn't create").

**Consumer impact:** "Color Primitives" and "Color Modes" are generic, guessable names — a user who names their own collection either of these gets it **silently adopted and mutated** on the next Apply, a failure mode the team already recognized and fixed for the newer float path but never back-ported to the original color path.

**Fix:** add a `COLOR_REGISTRY_KEY` mirroring `FLOAT_REGISTRY_KEY`, and change `ensureCollection` to look up by id first, else by name (existing files self-heal into the registry on next apply — no data loss, no rename). **Migration cost: cheap-ish** — the pattern is already proven in the same file.

---

## MINOR

### N1 — One flat schema version (`...schema.v1`) shared across four independently-evolving interchange shapes

Color's `exportUI3`, Geometry/Type's `...FigmaModes`, and the Font Primitives shape each declare their own `$schema` string but there's no evidence of a version-bump convention if any one shape changes in a breaking way (e.g., if C3 above ever ships, color's shape changes underneath the same `v1` tag). Already flagged in this repo's own docs as an unverified, interchange-only format (ADR-007/OD-003) — worth extending that awareness to "and each shape family should bump its OWN version independently when its contract changes," not share one flat number. Cheap, source-only.

### N2 — The `dialog-backdrop` constants placement is a positional-invariant landmine, already correctly flagged as load-bearing

`docs/reference/references/knowledge-04-export-formats.md` L167-175 already documents, in appropriate detail, why every top-level key of the semantic/UI3-semantic tree is positionally treated as a real palette, and why a system constant must never appear there. This is architecturally fragile (a hidden assumption baked into a generic-looking tree-walk, not an enforced type) but it is already the **correctly-written durable fix** for the 2026-07-11 incident it describes — citing only, so a future reviewer doesn't have to rediscover it. No new action needed beyond confirming the doc is being read before the *next* system constant is added.

---

## Recommended target architecture

```
                    ┌───────────────────────────┐
                    │   Color Primitives (Value) │   ← raw stops/scrims, N palettes
                    └─────────────┬─────────────┘
                                  │ alias (real Figma alias, per role, per mode)
                    ┌─────────────▼─────────────┐
                    │   Color Modes (Light/Dark…)│   ← generalize to N named theme
                    │   53 roles × N palettes    │      modes (fixes C3), + COLOR_
                    └───────────────────────────┘      REGISTRY_KEY provenance (M3)

                    ┌───────────────────────────┐
                    │  Font Primitives (Value)   │   ← family STRINGs, weight FLOATs,
                    │  font/<voice> ALIAS layer  │      font/<voice> alias — already
                    └─────────────┬─────────────┘      the "primitive→semantic" shape
                                  │ bound by            color has; keep as-is
                    ┌─────────────▼─────────────┐
                    │        Geometry            │   ← ONE breakpoint-moded collection
                    │  box geometry + type/ …    │      (TKT-0009 — keep: right end state)
                    │  literal per-mode values    │      NOT aliased — correct, because
                    └───────────────────────────┘      mode variance here IS the value,
                                                        not a role reassignment (C1's
                                                        finding is the RENAME path, not
                                                        the lack-of-aliasing itself)

  ── cutting across all three, add ──
  1. A shared `renames{}` contract in every planner + rename-first pass in every
     executor (C1) — the single highest-leverage fix; everything else is secondary
     until this exists, because it's the one place a correct-by-construction system
     still ships user-breaking changes on a normal upgrade.
  2. A `read-geometry-variables` / `read-type-variables` message mirroring
     `read-variables`, feeding the SAME pre-apply diff surface Color already has
     the bones for (C2).
  3. `COLOR_REGISTRY_KEY` provenance for Color Primitives/Modes, matching the
     float path's existing, already-correct pattern (M3).
  4. A UI-side mode-list-divergence warning between `_typeModeScales()` and
     `_geomModeScales()` (M1).

  Do NOT build: a primitive/alias layer under Geometry/Type "to match color's
  shape" for its own sake — the asymmetry is PRINCIPLED (color's mode axis is a
  role→raw reassignment; dimension's mode axis is a real per-breakpoint value),
  not accidental. The one place indirection would add real value — a "semantic
  dimension role" a component binds to instead of a raw size tier, so re-tiering
  a component doesn't require touching it — is a genuine, separable enhancement,
  but it does NOT fix C1 (an alias's own name is still name-keyed by the same
  executor) and should be scoped and decided independently, not bundled in as a
  "parity with color" default.
```
