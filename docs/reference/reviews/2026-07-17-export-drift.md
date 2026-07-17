# Export-format drift audit — ultimate-tokens

Built from ACTUAL emitter output (`src/engine/exports.js`, `type.mjs`, `geometry.mjs`), not docs.
State: 2 enabled palettes (Neutral, Primary) from `docs/reference/data/role-table.json` defaults;
`typeScale({treatment:"product"})`; `geomScale({treatment:"comfortable"}, {typeScale})`. Evidence
strings below are copy-pasted from real output (see `gen2.mjs` in this dir to reproduce).

No repo-wide kebab-case naming-grammar ADR exists yet (checked `decision-records.md` — ADR-001..011
cover color math/import mechanics only, none touch identifier casing). This matrix is the first
system-wide look at the casing grammar, so every casing split below is currently **undocumented**,
even where it may turn out to be a reasonable choice once ratified.

---

## Matrix 1 — COLOR: same concept, different names/casing across formats

Concept: the `on-surface` role on the Neutral palette (light end `950`, dark end `50`).

| Surface | Namespace/segment style | This concept's actual name |
|---|---|---|
| CSS (`exportCSS`/`exportOKLCH`) | slug palette (`neutral`) + **kebab suffix** | `--c-neutral-on-surface` |
| Tailwind (`exportTailwind`) | slug palette + **kebab suffix** (same suffix as CSS) | `--color-neutral-on-surface` |
| JSON (`exportJSON`) | **original Name** as top-level key (`"Neutral"`, not `"neutral"`) + **camelCase** role key | `json["Neutral"].semantic[].key === "onSurface"` |
| DTCG (`exportDTCG`) | slug palette (`neutral`) + **camelCase** role key | `Light_tokens.json.neutral.onSurface` |
| UI3 (`exportUI3`) | slug palette + **camelCase** role key, `/`-delimited | `neutral/onSurface` |
| ShadCN (`exportShadcn`) | fixed contract name, not role-derived | `--foreground` (mapped from `-on-surface`) |
| DS/Claude-Design (`dsColorRoles`) | slug palette + **kebab** slot (suffix minus leading `-`) | `neutral-on-surface` |

Concept: the fixed system constant `dialog-backdrop` (opaque black @ 80%).

| Surface | Actual name |
|---|---|
| CSS | `--c-dialog-backdrop` |
| Tailwind | `--color-dialog-backdrop` |
| JSON | `json.constants.dialogBackdrop` (**camelCase** — the one JSON key that isn't the CSS/DTCG kebab form) |
| DTCG raw tree | `palette.tokens.json.constants["dialog-backdrop"]` (kebab) |
| UI3 | `raw/constants/dialog-backdrop` (kebab) |
| ShadCN | `--overlay` (fixed contract name) |

Concept: a raw solid stop (`Neutral` palette, stop 500) and its scrim (`500-050`).

| Surface | Stop name | Scrim name |
|---|---|---|
| CSS | `--c-neutral-500` | `--c-neutral-500-050` |
| Tailwind | `--color-neutral-500` (also emits finer stops like `-550`, `-575` unchanged) | n/a (scrims not emitted — see Matrix 4) |
| JSON | `stops["500"]` | `scrims["500-050"]` |
| DTCG raw | `neutral["500"]` | `neutral["500-050"]` |
| UI3 | `raw/neutral/500` | `raw/neutral/500-050` |

Stop/scrim key SHAPE is consistent everywhere it's emitted (pad3, `{base}-{step}` for scrims) — this
one is clean.

---

## Matrix 2 — TYPE: same concept, different names/casing across formats

Concept: the `Sub-heading` voice's `MD` step, `size` field (value `34`).

| Surface | Actual key path |
|---|---|
| CSS (`typeTokensCSS`) | `--type-sub-heading-md-size` (category **and** step both run through `kebab()`) |
| DTCG (`typeTokensDTCG`) | `typography["Sub-heading"]["MD"].$value.fontSize` — category key is the **verbatim authored name** (`Sub-heading`, capital S, still hyphenated), step key is **verbatim uppercase** (`MD`, not `md`) |
| Figma Modes (`typeTokensFigmaModes`) | `type/Sub-heading/MD/size` — same verbatim category+step, **plus** the property segment (`size`, `lineHeight`, `letterSpacing`, `paragraphSpacing`) is **camelCase** |
| Figma Primitives (`typeTokensFigmaPrimitives`) | `font/Sub-heading` (verbatim voice), but `family/<role>` uses the **lowercase role** (`family/display`, `family/body`) — a third casing register in the same file |

So a single voice+step (`Sub-heading`/`MD`) has **four different spellings** across the type export
surface: `sub-heading-md` (CSS) vs `Sub-heading`/`MD` (DTCG, Figma Modes) vs mixed
`Sub-heading`+lowercase-role (Figma Primitives). CSS is the only fully-kebabed surface in the whole
type family.

Concept: a sibling weight (`Sub-heading` → `Bold`, weight 700).

| Surface | Actual key |
|---|---|
| CSS | `--type-sub-heading-weight-bold` (voice kebabed, weight-name kebabed: `bold`) |
| DTCG | `weights["Sub-heading"]["Bold"]` — voice verbatim, weight-name **Title Case**, not kebab |
| Figma Primitives | `weight/Display/bold`, `weight-style/Display/bold` — voice verbatim, weight-slug kebab (matches CSS's kebab weight-name, unlike DTCG) |

---

## Matrix 3 — GEOMETRY: same concept, different names/casing across formats

Concept: the `MD` size row, `paddingNarrow` field (value `5`).

| Surface | Actual key path | Casing of the size-row name | Casing of the field name |
|---|---|---|---|
| CSS (`geomTokensCSS`) | `--size-md-padding-narrow` | kebab (`md`) | kebab (`padding-narrow`) |
| DTCG (`geomTokensDTCG`) | `size.MD.paddingNarrow` | **verbatim uppercase** (`MD`) | **camelCase** (`paddingNarrow`) |
| Figma single (`geomTokensFigma`) | `Geometry.size.MD.paddingNarrow` | verbatim uppercase | camelCase |
| Figma Modes (`geomTokensFigmaModes`) | `size/MD/paddingNarrow` | verbatim uppercase | camelCase |

Concept: the `stackTight` gap and `controlGroup` inset (same DTCG/Figma object, same emitter call).

| Surface | Actual key |
|---|---|
| CSS | `--gap-stack-tight`, `--inset-control-group` (kebab, via `camelKebab()`) |
| DTCG | `gap["stack-tight"]`, `inset["control-group"]` (**kebab** — `camelKebab()` applied here too) |
| Figma single/Modes | `Geometry.gap["stack-tight"]` / `gap/stack-tight` (kebab, same `camelKebab()`) |

**This is the load-bearing internal inconsistency**: in the exact same DTCG/Figma payload,
`size.MD.paddingNarrow` is camelCase but `gap["stack-tight"]` / `inset["control-group"]` a few lines
away are kebab-case. Two different key-casing conventions coexist in one collection because
`geomTokensDTCG`/`geomTokensFigma`/`geomTokensFigmaModes` kebab the container-tier groups via
`camelKebab()` but leave the per-size-row fields (`GEOM_SIZE_FIELDS` / the inline object literals in
`buildSize`) as raw camelCase JS property names, unconverted.

Radius (`none/xs/sm/md/lg/xl/full`) and space (`0..9`) keys are already single-token/numeric, so no
casing question arises there — clean.

---

## Findings, severity-ranked

### CRITICAL

**C1 — Color semantic-role identifier casing is bimodal across the whole color export surface, with no documented rule.**
- Evidence: `on-surface`/`onSurface` (Matrix 1). CSS + Tailwind + the already-shipped DS/Claude-Design
  export use **kebab** (`neutral-on-surface`); JSON + DTCG + UI3 use **camelCase** (`onSurface`).
- Verdict: **DRIFT**, not policy. `exports.js`'s own header comment (lines 1–19) documents ADR-002,
  ADR-005, ADR-006, ADR-007 — every deliberate cross-format divergence in this file is fenced with an
  ADR. There is no ADR for role-key casing; the split is just each emitter reading a different field
  off the same role object (`r.suffix` and `r.key` are BOTH produced by `semantic.js`'s `role()`
  helper as two views of the same 53 roles — no one had to choose between them, so nobody did).
- Kebab-era fix: pick one casing for the *token name* (kebab, per the ratified direction) and make
  `r.key` (camelCase, semantic.js's own JS-identifier-friendly form for programmatic consumers) and
  `r.suffix` (kebab, for name-building) explicitly two different, intentionally-diverging fields — then
  point JSON/DTCG/UI3 at a kebab-built name instead of `r.key` for anything that is a *token name*
  (JSON's `semantic[].key`, DTCG's group keys, UI3's variable-path segment). `r.key` can stay as an
  internal/programmatic identifier if something still needs one, but no export surface should emit it
  as a token name once the migration lands.

**C2 — Geometry's per-size DTCG/Figma fields (`paddingNarrow`, `paddingWideCompact`, `minWidth`, `radius`) are camelCase while sibling groups in the SAME collection (`inset`, `gap`, `border`, `focus`) are kebab, via two different code paths for the same collection.**
- Evidence: Matrix 3, `size.MD.paddingNarrow` vs `gap["stack-tight"]` in one `geomTokensDTCG()`/
  `geomTokensFigmaModes()` call.
- Verdict: **DRIFT**. `camelKebab()` exists in `geometry.mjs` specifically to convert `controlGroup` →
  `control-group` for the container tier; the size-row fields were simply never routed through it
  (`GEOM_SIZE_FIELDS` in `geomTokensFigmaModes` and the inline field lists in `geomTokensDTCG`/
  `geomTokensFigma` hard-code the camelCase JS property names as the emitted keys). Nothing marks this
  as intentional, and it directly contradicts the sibling groups three lines away in the same object.
- Kebab-era fix: run every size-row field name through `camelKebab()` (or the equivalent used
  elsewhere) so `paddingNarrow` → `padding-narrow`, `paddingWideCompact` → `padding-wide-compact`,
  `minWidth` → `min-width`, matching CSS's own `--size-md-padding-narrow` naming, which already gets
  this right. This is a breaking shape change for any consumer parsing these DTCG/Figma-modes JSON keys
  today — needs a version bump / migration note in `adding-export-formats`' references.

### MAJOR

**M1 — Type's DTCG/Figma-Modes/Figma-Primitives surfaces never kebab the voice name or step name at all — CSS is the only fully-kebabed type surface.**
- Evidence: Matrix 2. `Sub-heading`/`MD` survive verbatim (capital, hyphen, no case-fold) into
  `typeTokensDTCG`, `typeTokensFigmaModes`, and `typeTokensFigmaPrimitives`; only `typeTokensCSS` kebabs
  both segments via its own local `kebab()` call.
- Deliberate-vs-drift: **partially deliberate, partially drift.** The voice/step segments are almost
  certainly kept human-readable on purpose for Figma's variable-panel UI (a designer reads
  "Sub-heading/MD" more easily than "sub-heading/md" in the Figma sidebar) — this is the same
  reasoning `geomTokensFigmaModes`'s comment gives for keeping Figma legible (see its own header notes
  on why Figma stays pixel-absolute rather than percent, for a parallel "Figma UI legibility" rationale
  elsewhere in this codebase). But this reasoning has never been written down for the *type* voice/step
  segment specifically, so right now it reads as an accident, not a decision — and it directly
  contradicts geometry's own Figma Modes emitter, which DOES kebab its group segments
  (`inset/control-group`) in the exact same kind of Figma variable-path key. Two sibling Figma-Modes
  emitters (type vs geometry) disagree on whether Figma variable paths should be kebab.
- Kebab-era fix: this is the one place the audit recommends a decision, not just a mechanical fix —
  either (a) ratify "Figma variable-path segments stay human-cased for panel legibility" as an explicit,
  documented exception to the kebab migration (and then also fix `typeTokensFigmaPrimitives`'s
  three-way mix of verbatim voice / lowercase role / kebab weight-slug into ONE convention), or (b) kebab
  Figma segments too and accept the panel showing `sub-heading/md`. Whichever is chosen, geometry's
  Figma Modes emitter and type's Figma Modes emitter must agree — right now they don't.

**M2 — JSON is the only color format keyed by the palette's original Name instead of its slug.**
- Evidence: `json["Neutral"]` / `json["Primary"]` vs every other format's `neutral`/`primary` (Matrix 1).
- Verdict: **DRIFT** (or at least undocumented). `docs/reference/references/knowledge-04-export-formats.md`
  §3 (JSON) documents this as "Keyed by the original palette NAME" but gives no reason, and every other
  format in the same doc explicitly uses the slug. A palette renamed to include punctuation/case a CSS
  identifier can't hold (e.g. "Ocean/Teal") would produce a JSON key inconsistent with every sibling
  export's slug for the same palette.
- Kebab-era fix: either re-key JSON by slug (breaking change, needs a version note) or, if Name-keying
  is kept for human-readability/round-trip reasons, document why in knowledge-04 §3 and add a sibling
  `slug` field inside each palette object so a consumer can cross-reference without re-deriving `slug()`
  itself.

### MINOR

**N1 — JSON's `constants.dialogBackdrop` is camelCase while every other format's constant is kebab (`dialog-backdrop`).**
- Verdict: **DRIFT**, small blast radius (one constant, one format). Same root cause as C1 — JSON reads
  camelCase field names wherever exports.js's internal object literals happen to use them
  (`out.constants = { dialogBackdrop: {...} }` at `exports.js:378` is hand-authored camelCase, not
  derived from a shared name-builder).
- Fix: rename to `out.constants = { "dialog-backdrop": {...} }` alongside the C1 fix, same PR.

**N2 — Tailwind hard-codes the `color` prefix while CSS/OKLCH's prefix is configurable (`cssPrefixOf`/`state.export.colorPrefix`).**
- Evidence: `exportCSS`/`exportOKLCH` read `cssPrefixOf(state)` (defaults to `c`, but a kit can rename
  it, e.g. to `md-sys-color`); `exportTailwind` always emits `--color-*` verbatim, no prefix parameter.
- Deliberate-vs-drift: **DELIBERATE** — Tailwind v4's `@theme` block requires the literal `--color-*`
  namespace for its utility-class generation (`bg-{name}`, `text-{name}`) to work at all; a renamed
  prefix would silently break every Tailwind utility class. Flagged here only so it's captured in the
  matrix as an intentional, permanent exception (not something the kebab migration should "fix" by
  making Tailwind's prefix configurable) — worth one line in `knowledge-04-export-formats.md`'s Tailwind
  gap (already noted in that doc as an unwritten section) so a future reader doesn't file this as a bug.

**N3 — ShadCN's `--radius`/`--font-*` naming stays shadcn's own fixed vocabulary (not this repo's grammar), by contract.**
- Verdict: **DELIBERATE** (exports.js:547–552 header explicitly says "ShadCN expects a FIXED token
  contract"). Not drift — noted only for completeness of the matrix; the kebab migration should not
  touch ShadCN's own token names, only the *aliasing* layer when `opts.aliasPrefix` is set (which
  already correctly points at whatever the kebab-migrated design-token layer ends up naming things).

---

## Coverage asymmetries (family presence per format)

| Family | CSS | Tailwind | JSON | DTCG | UI3 | ShadCN | DS/Claude-Design |
|---|---|---|---|---|---|---|---|
| Color stops (raw) | ✅ | ✅ | ✅ | ✅ | ✅ | — (mapped indirectly) | ✅ (verbatim) |
| Color scrims | ✅ | ❌ (not emitted) | ✅ | ✅ | ✅ | — | — |
| Color semantic roles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (curated subset, `SHADCN_ORDER`/`MAP`) | ✅ (curated subset, §6.5) |
| Key colors (brand-retained) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | not checked this pass |
| Type scale | n/a (own CSS export) | ❌ (Tailwind export carries NO type/geometry) | n/a | ✅ | ✅ (Figma Modes) | ✅ (`--font-*` 3 slots only) | not checked this pass |
| Geometry scale | n/a (own CSS export) | ❌ | n/a | ✅ | ✅ (Figma Modes/single) | ✅ (`--radius` seed only, from `md` corner) | not checked this pass |

- **Tailwind carries no scrims** — `exportTailwind` never loops `SCRIM_BASES`/`SCRIM_STEPS` the way
  `cssFrom`/`exportJSON`/`exportDTCG`/`exportUI3` all do. Checked whether this is documented: it isn't,
  in either `exports.js`'s header or knowledge-04. Given Tailwind v4's opacity-modifier syntax
  (`bg-primary-500/20`) can substitute for a baked scrim, this is plausibly **deliberate** (a scrim
  primitive is redundant once Tailwind's own opacity modifiers exist) but it should say so in one line
  wherever Tailwind's shape eventually gets documented (the doc gap already flagged in knowledge-04's
  intro).
- **Key colors** (retained exact brand hex) are carried by CSS/OKLCH and JSON, but NOT DTCG or UI3 —
  a palette with `keyColors` set exports differently depending on format, silently. This one reads as
  an actual gap rather than a documented choice; worth a follow-up ticket independent of the casing
  work.
- **Tailwind and ShadCN are the only two formats with zero type/geometry family coverage** beyond a
  couple of seed values (`--radius`, three `--font-*` slots) — this is `adding-export-formats`'
  documented scope (Tailwind/ShadCN are color-first frameworks bridging into shadcn's own type/spacing
  conventions), so **deliberate**, not drift.

---

## Summary of what the kebab migration needs to decide, in priority order

1. **Pick ONE casing for color semantic-role token names** and stop letting JSON/DTCG/UI3 read
   `r.key` (camelCase) while CSS/Tailwind/DS read `r.suffix`-derived kebab (C1). This is the highest-
   leverage fix — it touches every semantic-role emission in the file.
2. **Route geometry's per-size DTCG/Figma fields through `camelKebab()`** so `paddingNarrow` joins
   `stackTight` in already being kebab inside the same collection (C2).
3. **Decide, and document, whether Figma variable-path segments (voice/step names) are exempt from
   kebab for panel legibility** — then make type's and geometry's Figma-Modes emitters agree with each
   other (M1); today they don't.
4. Sweep the two one-off camelCase leftovers this produces "for free": JSON's `dialogBackdrop` (N1)
   and JSON's Name-vs-slug top-level keying (M2).
5. Leave Tailwind's fixed `color` prefix and ShadCN's fixed contract alone — both are load-bearing,
   documented-by-context exceptions, not migration targets (N2, N3).
