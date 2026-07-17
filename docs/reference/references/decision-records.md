# Decision Records (ADRs)

> These are the **fenced choices**: decisions that are intentional, sometimes
> counter-intuitive, and must survive regeneration. An agent enhancing this spec or
> regenerating the tool should treat each as a constraint with a rationale, not a bug to
> fix. Where a decision overrides an "obvious" correctness rule, it is flagged
> **OVERRIDE** — that is exactly the kind of thing a well-meaning agent will try to undo.

Format: Context → Decision → Rationale → Consequences → Status.

---

## ADR-001 — HCT (CAM16 H/C + CIELAB L\*) over OKLCH-only
- **Context.** OKLCH is the obvious modern choice and the user is fluent in it.
- **Decision.** Use HCT: hue/chroma from CAM16, tone from CIELAB L\*.
- **Rationale.** HCT holds hue and tone stable across a ramp while maximizing chroma within
  gamut at each tone, which yields perceptually even tonal scales for design-system ramps.
  OKLCH is the **default** *input hue space* (mapped to CAM16) and an *output format*; cam16
  stays selectable (ADR-011).
- **Consequences.** Heavier engine (full CAM16 forward+inverse). OKLCH input requires a hue
  bridge — now the chroma-aware inverse (ADR-011, superseding the sampled ADR-008).
- **Status.** DECIDED.

## ADR-002 — Semantic export ships RESOLVED colors, not aliasData
- **Context.** Ideal would be semantic tokens that alias raw cross-collection so edits
  cascade on import.
- **Decision.** Light/Dark semantic DTCG files contain resolved colors with no `aliasData`
  by default. A `rawColl` field opts into emitting `aliasData`.
- **Rationale.** Verified against Figma's "Modes for variables" docs: cross-collection
  `aliasData` needs library-key UUIDs Figma only mints on export; name-only aliasData
  **errors** on native import (observed "errors importing N tokens") rather than falling
  back. Resolved colors always import.
- **Consequences.** No cascade via JSON import; cascade is delegated to the plugin
  (ADR provides the binder). Resolved files are larger but reliable.
- **Status.** DECIDED (default kept).
- **Re-verified 2026-06-15** (Figma "Modes for variables" help doc). The `com.figma.aliasData`
  extension now documents a resolution **fallback hierarchy**: `targetVariableID` → `targetVariableName`
  within a set matching `targetVariableSetID` → `targetVariableName` within a set matching
  `targetVariableSetName`. So cross-collection aliasing by **name + collection-name** (not a
  library-key UUID) IS a documented path **when the target collection already exists in the file**.
  The original "needs library UUIDs / name-only errors" framing is therefore **softened** — but the
  decision stands: resolved colors remain the always-safe default (import with no preconditions),
  while the aliased path is conditional on the Color Primitives collection pre-existing. Pure name-only
  (no `targetVariableSetName`) behavior remains undocumented. Feeds OD-004.
- **Spike 2026-06-17.** The `rawColl` opt-in already emitted the full name+collection shape
  (`targetVariableName` + `targetVariableSetName`); the export verifier now **asserts both** on every
  aliased semantic leaf (`hpg-export-resolved` / AC-X6), so the shape can't silently regress. This is
  SHAPE conformance only — the native-import cascade is still unvalidated end-to-end (no Figma in CI)
  and unexposed in the UI. Default stays resolved; the plugin stays the reliable cascade. Advances
  OD-004 to a **gated spike, not a decision**.

## ADR-003 — On-colors fixed to `050` in both modes  **(OVERRIDE)**
- **Context.** `on{N}` sits on the prime fill. A contrast-optimized system picks white or
  black per fill per mode for contrast. (Note: "perceptually even" — this tool's headline —
  governs ramp *spacing*, not contrast; the two are deliberately distinct, see SKILL Intent.)
- **Decision.** `on{N}` → `050` (both modes), `on{N}Variant` → `200` (both modes), for all
  palettes. The previously implemented **contrast-aware auto-pick logic was removed**.
- **Rationale.** Explicit user/brand requirement: on-colors should be the light tint
  uniformly. The user was shown the contrast data and chose this deliberately.
- **Consequences.** White-on-`Warning` (yellow) ≈ 1.8:1, below WCAG 4.5:1; in dark mode
  several palettes lose contrast as fills lighten. This is **accepted by design**. Tracked
  as OD-001.
- **Status.** DECIDED — **do not reintroduce contrast-aware on-colors as the DEFAULT without explicit
  instruction.**
- **Opt-in added (2026-06-25, explicit instruction).** The default stays `fixed` (050/200 both modes,
  as above). A new `onColorMode` control adds an opt-in `"contrast"` mode that re-points `on{N}`
  (050↔950) and `on{N}Variant` (200↔800) to the end with the better WCAG contrast vs the accent fill
  (550 light / 450 dark), per mode. It's a resolution-layer adjustment (`applyOnColorContrast`,
  applied in `projectView` + `derivePalette`) — `semanticRoles` and the canonical role table are
  UNCHANGED, so the default contract holds. This satisfies OD-001 without overriding ADR-003's default.

## ADR-004 — Semantic scrim roles use base 750 only  **(SUPERSEDED — see the 500-ramp revision)**
> **SUPERSEDED (2026-06-17).** Scrims are now a single **500-based** ramp: a scrim is `500-{step}`
> = the 500 color at alpha% = step/10, and all 12 scrim-using roles (the 7 `scrim*` + outline +
> container/Low/High) resolve onto it, mode-flat (light === dark). Bases 250/750 are no longer
> used. The historical decision is kept below for provenance.
- **Context.** Raw scrims existed on three bases (250/500/750 × 7 alphas). A revision surfaced
  all three as semantic role families (`scrim250*/scrim500*/scrim750*`, 21 roles).
- **Decision.** Revert to 7 unqualified scrim roles (`scrimWeakest…scrimStrongest`) on base
  750. Bases 250 and 500 remain raw primitives only.
- **Rationale.** User clarified that 250/500/750 scrims belong as raw primitives; base 250 is
  a *light* tint overlay and 500 a saturated mid — different overlays, not weaker dark
  scrims — so they were judged not semantically needed.
- **Consequences.** 37 roles/palette (not 51). Tracked as OD-002 in case a use case for
  250/500 semantic scrims appears.
- **Status.** DECIDED.

## ADR-005 — Two-layer model: flat raw + semantic `light-dark()`
- **Context.** The original design made all raw tokens mode-mirror pairs (light+dark=1000),
  so semantics were plain `var()` aliases.
- **Decision.** Raw tokens are flat, mode-independent single values. The light/dark flip is
  expressed once, in the semantic layer, via `light-dark(var(light), var(dark))`.
- **Rationale.** The mirror assumption broke as soon as non-mirror role mappings were
  introduced (e.g. `Dim 650/700`). The flat+semantic split works for any mapping and maps
  cleanly onto Figma's raw(single-mode)/semantic(Light,Dark) collection structure.
- **Consequences.** Every semantic CSS var references two primitives. Mode-switching is
  entirely in the `--c-*` layer.
- **Status.** DECIDED.

## ADR-006 — 3-digit zero padding everywhere
- **Context.** Stops range 50–950; mixing `"50"` and `"050"` causes sort and lookup bugs.
- **Decision.** All stop references zero-pad to 3 digits (`pad3`/`refKey`) in CSS var names,
  CSS refs, JSON keys, DTCG names, and UI3 keys. Scrims keep `"{base}-{step}"` with padded base.
- **CSS var prefix convention (2026-06-17; revised 2026-06-24).** RAW primitives and SEMANTIC roles
  both use the `--c-` prefix: raw are `--c-{family}-{stop|500-step}` and semantic are
  `--c-{family}-{role}`. A raw name's suffix always ends in DIGITS and a semantic name's in a WORD, so
  they never collide despite the shared prefix. (Originally raw used `--c_` with an underscore to
  flag raw-vs-semantic; revised to drop the `_` for a cleaner, all-hyphen CSS namespace — the
  digit-vs-word suffix already disambiguates.) Semantic vars reference raw vars via `var(--c-…)`.
- **Rationale.** Stable lexical sort, exact name matching against the user's `Color Primitives`
  collection (which is padded), no ambiguity; the raw/semantic prefix split is self-documenting.
- **Status.** DECIDED.

## ADR-007 — UI3 "Collections" schema is interchange-only, not native  **(CAUTION)**
- **Context.** A `figma-ui3-variables.color.schema.v1` export was added with in-file aliases.
- **Decision.** Keep it as a convenience/interchange format; **do not** present it as a
  native Figma Variables import format.
- **Rationale.** The schema string returns zero hits in Figma's documentation; it is not a
  verified native import path. Importing it via the Variables modal will not resolve as a
  user might expect.
- **Status.** DECIDED. Tracked as OD-003.

## ADR-008 — OKLCH→CAM16 hue is a sampled mapping  **(SUPERSEDED — see ADR-011)**
- **Context.** Users may enter hues in OKLCH; the engine works in CAM16 hue.
- **Decision.** Map an OKLCH hue to CAM16 by sampling one fixed mid color
  (L=0.72, C=0.10) at that OKLCH hue and reading its CAM16 angle. Memoized.
- **Rationale.** CAM16 hue at a given OKLCH hue varies with L and C; an exact per-color
  mapping is not well-defined for a single "hue input". The fixed sample is a deliberate,
  reproducible compromise.
- **Consequences.** A few degrees of drift vs. an exact mapping. Acceptable for hue *input*;
  not used for output color math.
- **Status.** SUPERSEDED by ADR-011. The fixed mid-sample mapping (and its "few degrees of
  drift") is gone: `oklchToCam16Hue` is now a chroma-aware Newton inverse that lands the
  rendered identity color on the stored OKLCH hue to ~0.00°.

## ADR-009 — Fixed viewing conditions (no VC controls)
- **Context.** CAM16 is parameterized by adapting luminance, surround, background.
- **Decision.** Derive one fixed VC (`makeVC`: average surround, bg 50, mid-gray adapting
  luminance) at load. Do not expose VC controls.
- **Rationale.** Target is screen sRGB under average surround — one stable appearance
  context. Exposing VC would make exports non-portable and the chroma peaks unstable.
- **Status.** DECIDED.

## ADR-010 — Single-file, dependency-free, offline
- **Context.** The tool is a design utility that should run anywhere with no setup.
- **Decision.** One self-contained HTML file, vanilla JS, no build step, no runtime
  dependencies; the zip writer is hand-rolled (`makeZip`/`crc32`); persistence falls back
  `window.storage → localStorage → in-memory`.
- **Rationale.** Portability and longevity; the artifact must open and work years later with
  no toolchain.
- **Consequences.** No npm libraries; any new capability must be implemented inline.
- **Status.** DECIDED.
- **Re-framed 2026-06-15 (from the build).** "Single-file" is the **distribution** format, not an
  authoring constraint. The reference build authors **modular ES modules** (engine · tonal · semantic ·
  export · persist) and **bundles** them to one offline HTML (`ultimate-tokens.html`, ~111 KB,
  opens via `file://`). Authoring modular *and* distributing single-file are both satisfied — the
  "no build step" line means *no toolchain is required to run it*, not *the source must be one file*.

## ADR-011 — OKLCH-native hue model + chroma-aware OKLCH→CAM16 inverse  (supersedes ADR-008)
- **Context.** The per-palette `hue` was a CAM16 hue by default, and the OKLCH→CAM16 bridge
  was a fixed mid-sample mapping (ADR-008) that drifted a few degrees (worst ~15° at the
  blue/violet pole). The user is fluent in OKLCH; the drift made OKLCH-entered hues land off.
- **Decision.**
  1. **OKLCH-native.** The doc-level `hueSpace` default flips **cam16 → oklch** (`tonal.js`
     `DEFAULT_CONTROLS.hueSpace`; `persist.js` `DOMAINS.hueSpace.default`). The per-palette
     `hue` is an OKLCH hue by default. `cam16` stays selectable; legacy docs saved under
     cam16 carry `hueSpace:"cam16"` explicitly and keep rendering in cam16 (preserved).
  2. **Chroma-aware inverse.** `oklchToCam16Hue(h, chromaFrac=1)` becomes a Newton inverse of
     the render path: it finds the CAM16 hue whose color, *at `chromaFrac` of that hue's peak
     chroma*, renders at the target OKLCH hue. It is chroma-aware because the OKLCH↔CAM16 hue
     map shifts with chroma (the **Abney effect**) — a fixed or cusp-only anchor is wrong at
     the other end. `effHue(hue, hueSpace, chromaFrac=1)` passes `palette.chroma/100`.
  3. **High-res HCT→OKLCH.** New `hctToOklch(hue, chroma, tone) → [L, C, H°]` reuses the CAM16
     solve and converts the converged linear sRGB straight through OKLab — no 8-bit
     round-trip. `projectView` emits `keyOklch`; the key HEX is derived from it.
- **Rationale.** Anchoring the solve at the palette's own chroma makes the rendered identity
  color land on the stored OKLCH hue to ~0.00°. **Principle:** HEX is only ever derived for
  consumption; perceptual coords come from the model at full precision (never measured back
  off an 8-bit hex).
- **Consequences.** Producers emit OKLCH hues: `gen-categories` stores each preset's source
  OKLCH hue and bakes `hueSpace:"oklch"`; `seedFromKeyColor(oklch, hueSpace="oklch")` returns
  the input's OKLCH hue (or CAM16 for a legacy cam16 doc); `defaultDocument` converts the 8
  starter CAM16 hues to OKLCH on the fly via `camHueToOklch`. **`role-table.json` is
  UNCHANGED** — still the cam16 answer key; the parity gate is intact. `hctToRgb` is
  byte-identical (refactored to share `_hctToLinRGB`). Engine gate: `hct-oklch-inverse`
  (`test/engine/hct.mjs`).
- **Status.** DECIDED.

## ADR-012 — Ramp hue anchored in each path's RENDER space (per-path direct solve)  (complements ADR-011)
- **Context.** ADR-011 makes the palette `hue` an OKLCH hue and lands the *identity* color on it to
  ~0.00°. But a RAMP is exported in OKLCH while **authored in another space** — the perceptual/peak ramp
  in **OKHSL** (`okhslStops`), the "even" ramp in **HCT/CAM16** (`paletteStops`). "Constant hue" disagrees
  between the author space and OKLCH by a chroma- **and lightness**-dependent amount (the **Abney
  effect**). Anchoring the hue through one proxy point — `effHue → oklchToCam16Hue`, sampled at the hue's
  **peak tone** and a chroma fraction (`hueAnchorFrac`) — left the KEY stop (500) off the set OKLCH hue:
  ~6° on perceptual blues, up to ~9° on the even path under mid-tone amplification (`dampAmp`).
- **Decision.** Anchor the hue in the space each ramp **renders**, at the **KEY stop (500)'s ACTUAL
  chroma + lightness** — not a peak-tone proxy. Each path Newton-solves its own author-space hue so stop
  500 reads back at the set OKLCH hue:
  1. **Perceptual/peak** → `solveOkhslHue(targetOklchHue, s₅₀₀, l₅₀₀)` over `rgbToOklchHue∘okhslToRgb`
     (shipped #201/#202).
  2. **Even** → `solveCam16Hue(targetOklchHue, c₅₀₀, tone₅₀₀)` over `hctToOklch` (this change).
  `effHue`/`hueAnchorFrac` are RETAINED for the `hueSpace:"cam16"` passthrough, the even path's **gamut
  basis** (the `c₅₀₀` seed), and the OKHSL cusp seed.
- **Rationale.** The error is a space mismatch that varies with **both** chroma and lightness, so only a
  solve at the stop's real conditions cancels it; a single peak-tone anchor is right at one end and wrong
  at the other. Same discipline as ADR-011 (anchor the inverse at the palette's own chroma) — **anchor in
  the space the ramp renders, not a proxy.** Result: **~0.5° across the wheel, any damping, both paths**
  (from 6°/9°).
- **Consequences.** A few extra Newton iterations per palette (cheap — palettes are few, the loop is ≤16
  steps and converges in ~3). **`role-table.json` is UNCHANGED** — this is a render-layer calibration, not
  a role remap, so the parity gate holds. Only OKLCH-hue palettes shift; `hueSpace:"cam16"` docs render
  byte-identical (the passthrough branch). Gate: `oklch-hue-anchor` (`test/engine/tonal.mjs`) asserts stop
  500 exports within **1°** of the set hue across the wheel incl. blues, for **both** ramp paths, at
  `dampAmp` 0 and 66.
- **Status.** DECIDED.

## ADR-013 — Editorial type voices (7 → 11) + the box/flow decoupling
- **Context.** The type taxonomy shipped **seven** voices (Display · Heading · Sub-heading · Kicker ·
  Body · UI · Code) — a `make7()` factory, each voice a size ramp riding one of five font roles
  (display/heading/body/ui/mono). It lacked the everyday **editorial** roles: a standfirst/lede, a
  block/pull quote, a figure/media caption, and fine-print. Two constraints shaped the fix: the engine
  emitters are all generic (a new voice auto-flows from one `cat()` line), and `role` conflated three
  things — the **font**, the **paragraph flow** (single-line height + paragraph factor), and the character.
- **Decision.** Add **four editorial voices → `make11()`** (via intent-grill, 2 rounds):
  1. **Set + roles.** **Lead** (body role — a larger standfirst), **Quote** (**heading** role, so it
     inherits each treatment's display face — a serif pull-quote in the serif treatments, a grotesque in
     Brutalist), **Caption** and **Legal** (fine-print). All four ride **existing** font roles, so **no new
     font** is introduced.
  2. **Lean ramp.** Each new voice uses a 3-step **`STEPS_3`** (SM·MD·LG, MD = base), not the full XS–XL
     — editorial voices use one-or-two registers. Total steps 41 → **53**.
  3. **The `box`/flow decoupling (OVERRIDE of the old role⇒flow coupling).** A new per-voice **`box`**
     field separates presentation flow from font role. It DEFAULTS from the role (`ui`/`mono` ⇒ `box`), so
     the seven originals are **byte-identical**. **Caption + Legal ride the ui FONT but set `box:false`** —
     they are PROSE (reading leading ~1.5, paragraph factor 0.75×, **no single-line height**), not the
     control/box treatment the UI voice itself gets. `singleLineHeight` and the paragraph factor now key on
     `box`, not on `role === "ui"||"mono"`.
  4. **Treatment integration** — hybrid: fixed cross-treatment defaults + a few per-voice knobs
     (`leadWeight`, `quoteLead`, `legalWeight`, …), the Kicker/Code pattern; used sparingly (Luxury lightens
     Lead/Quote, Editorial tightens the Quote leading, Brutalist heavies the Quote).
- **Rationale.** A voice is a **function**, so the editorial roles are voices (semantic tokens
  `--type-quote-*` etc.), not Body levels. Riding existing roles keeps the blast bounded; the `box` flag is
  the minimal, correct model for "ui font, prose flow" and generalizes the old ui/mono⇒single-line rule.
- **Consequences.** Emitters (CSS/DTCG/Figma/MCP) auto-flowed. The lockstep edits: `persist.js` VOICES
  allowlist (else per-voice overrides drop on hydrate — the one silent landmine), the test count literals
  (`GROUPS` 11, headless 53 steps / 11 groups), `styles.css` `.ty-s0…10` series colours, and the
  `TYPE_SPECIMENS`/`SHORT` maps. **There is NO code-enforced type answer-key** (unlike colour's
  `role-table.json`): `typography.tokens.json` is a frozen reference snapshot, and the consumption plugin's
  `voice-parity.mjs` **auto-derives** the voice list from the live engine — so parity holds without a
  hand-kept table; the spec/README/marketing "seven"→"eleven" is doc drift, serviced in the same change.
- **Status.** DECIDED.
- **Update (2026-07-13).** The voice SET/NAMES here were renamed and the size mechanism changed
  (superseding this ADR's `STEPS_3`/`STEPS_5`/`STEPS_UI` shape, not its voice-count decision — still
  eleven): Heading→Headline, UI→Label; Quote folded into Lead, Caption folded into a new Tiny voice,
  Legal folded into Body; Title and Sub-title added. Every voice is now a uniform 3-step SM/MD/LG ramp
  (was 5/3/8 steps by voice) at a FIXED, hand-authored size per step — shared identically across all 5
  treatments — instead of a per-treatment `base × ratio^step` modular scale; `ratio` is retired as a
  per-voice/per-treatment knob entirely. See `src/engine/type.mjs`'s header comment and
  `docs/reference/typography/README.md` for the current shape.
- **Update (2026-07-13, later the same day).** Voice count moved eleven → **thirteen**: `Code` renamed
  to `Body-mono` (same behavior — mono role, sentence case, pegged to Body's own sizes — pure rename,
  matching the Sub-heading/Sub-title hyphenated-compound convention); `Label-mono` added (mirrors
  Label — mono role, sentence case, box:true control text, pegged to Label's own sizes — the same
  relationship Code/Body-mono has to Body, applied to Label; Kicker is untouched, still its own
  distinct uppercase/wide-tracked voice); `Tiny-mono` added (mirrors Tiny — mono role, box:false prose,
  pegged to Tiny's own sizes). Tiny's own fixed sizes also moved 10/11/12 → **9/10/11** in the same
  change (Kim: "Tiny should be size 9, 10, 11") — this does NOT touch the `bodyBase`/`factor` identity
  anchor (only Body's own MD literal feeds that), so no ripple to `DEFAULT_TYPE` was needed this time.
  `makeVoices()` (renamed from `make11()`, which now understates the count) still returns 5 primary
  voices consumed by the Color Categories 5-slot preset design (Display/Headline/Body/Label/Kicker) —
  the 3 new mono siblings and Kicker are NOT part of that per-preset design surface, so no preset
  regeneration was required beyond the mechanical `gen:categories` re-run.
- **Update (2026-07-13, again the same day).** Sibling weights: `siblingWeightDefaults(core)` moves
  from 2 stops to **3** — one stepping AWAY from the ladder's center, two TOWARD it (nearer first),
  e.g. core Extra-bold 800 → Black 900 (away), Bold 700, Semi-bold 600 (toward). More consequentially,
  every voice's `weights` is now **AUTO-POPULATED by default** in `typeScale()` — no
  `config.voices[v].weights` opt-in required anymore (Kim: "they should all have it"); an explicit
  `weights: [...]` (including `[]`) still replaces the default entirely per voice, `[]` being the one
  remaining opt-OUT lever. Because siblings now exist for nearly every voice by default, the Figma
  CORE style also always carries a name segment now — **dot-prefixed, Title-Case** (`Voice/step/•
  Name`, e.g. `Body/md/• Regular`), not the old bare kebab-slug — so it can never collide with a
  sibling's own lowercase-kebab name (`Body/md/semi-bold`) and reads visually as "the default" in the
  Figma Styles panel. A voice explicitly opted OUT via `weights: []` is the only remaining case that
  keeps the bare `Voice/step` name. See `figma/binder/style-plan.mjs` and the "Sibling weights"
  section of `docs/reference/typography/README.md`.

---

## ADR-014 — The `ultimate-tokens` rename orphans all Figma `pluginData` (no migration is possible)
- **Context.** The product renamed `nonoun-color-tokens` → `ultimate-tokens` across four namespaces: the
  custom element, the localStorage keys, the Figma plugin id, and the brand-kit MCP schema. Three of the
  four are migratable. The fourth is not.
- **Decision.** Rename the Figma plugin `id` anyway, accepting that every key it ever wrote is orphaned.
- **Why no migration exists.** `figma.root.setPluginData(key, value)` is namespaced **by the calling
  plugin's id**. A plugin can only read back the data *it* wrote under *its own* id. Once the id changes,
  the pre-rename keys are not merely differently-named — they are **unreachable**, from any code path, in
  any plugin. There is no cross-id read API. A "migration" would have to run under the OLD id, and the old
  plugin is what's being replaced. So `LEGACY_CONFIG_KEY` (the `"hct-config"` fallback that survived the
  *previous* rename, when the id happened not to change) is dead code and was removed.
- **What is gated instead.** `load-config` must degrade to a **clean empty config** when only pre-rename
  keys are present — never throw, never silently adopt a stale one (`test/figma/plugin.mjs`, `config` gate).
  The user's cost is re-running *apply* once on an old `.fig`; the config also travels in the exported
  bundle, so nothing is unrecoverable.
- **Contrast with localStorage.** The web app's keys ARE migratable — same origin, no namespacing — so
  `migrateStorageKeys()` chains `hct-palette-state-v1` ← `nonoun-color-tokens` ← `ultimate-tokens`,
  newest legacy wins, and never overwrites a present key. The asymmetry is the platform's, not a choice.
- **Consequences.** The `<nonoun-color-tokens>` element tag stays registered as a deprecated alias (and its
  CSS selectors keep matching), because there the compatibility *is* free. The separately-published **Color
  Tokens Semantic Binder** plugin keeps its own id (`color-tokens-semantic-binder`) for the same reason in
  reverse: renaming it would orphan *its* data and its Figma listing, and it gains nothing.
- **AMENDED 2026-07-09 (#250).** The alias was **retired**. "Free" priced only the code; it ignored that the
  alias keeps the retired brand alive in the DOM, in `styles.css`, and in every generated bundle — which the
  debrand (ADR-015) forbids. An embed on the old tag now renders nothing: a visible failure, which beats a
  silently-styled ghost element. The **storage** half of this ADR is untouched — `migrateStorageKeys()`
  still chains the old prefixes, because that carries a user's saved palettes and dropping it deletes work.
  The tag was cosmetic compatibility; the keys are data compatibility. Only the first was expendable.
- **Status.** DECIDED (consequences amended).

---

## ADR-015 — The product is unattributed: no maker brand, no "by" line, no monogram
- **Context.** The product shipped as **"Ultimate Tokens by NONOUN"**: a maker brand with an "N" monogram
  (favicon, og:image, in-app wordmark mark), a `nonoun.io` support/docs/account surface, and a voice
  platform whose §1 derived the house grammar rule ("no nouns, just verbs") from the *etymology* of the
  maker's name.
- **Decision.** Retire the maker brand entirely. The product is **"Ultimate Tokens"** — every mention, no
  longer form, no attribution. Copy speaks as "we"; nothing signs the work.
- **What replaced the nonoun.io surface.** Nothing branded. Support is **GitHub Issues**, docs are the
  **repo README**, billing is **Lemon Squeezy's own customer portal**. Every replacement link RESOLVES
  today — the alternative was a domain nobody owns, shipping 404s behind a nicer name. The unbuilt
  hosted-MCP and magic-link URLs became explicit `<APP_DOMAIN>` / `<MCP_DOMAIN>` placeholders, so Phase B
  must acquire a domain as step zero rather than inherit one.
- **What survived the removal.** The *stance*, not the signature. "No nouns, just verbs" is load-bearing on
  its own and stayed; only its origin story went. The one-person-workshop posture likewise steers how copy
  is written — it just no longer names anyone. **A workshop that names itself is performing smallness; one
  that ships is demonstrating it.**
- **The mark.** The monogram could not be renamed away — it *was* the letterform. It was deleted, along
  with its eight `ico-nonoun-*` assets, and the favicon set was regenerated from a brand-neutral mark:
  four tonal swatches, which say what the product *is* rather than who made it.
- **Why this is gated, not swept.** A find-and-replace decays. The next person to write a toast, an og:
  tag, or a lifecycle email reintroduces the maker by muscle memory, and re-attribution is a *factual*
  claim about who makes this. So `test/repo/branding.mjs` runs in `npm test` and fails on `NONOUN`, on any
  `nonoun.io` URL, and on the pre-rename identifier outside a named back-compat allowlist. `voice-check.mjs`
  raises the same word to **ERROR** in copy.
- **What still, deliberately, names the old identifier.** Only the `migrateStorageKeys()` prefix chain —
  **data** compatibility, which carries a user's saved palettes across the rename (see ADR-014). The
  `<nonoun-color-tokens>` element tag was **cosmetic** compatibility and went with the brand: a tag is a
  name the DOM says out loud. The allowlist in the gate is the boundary, and a *new* file may not quietly
  join it.
- **Status.** DECIDED.

---

## ADR-016 — One kebab-case naming grammar across every emitted surface; the moded collection is "Breakpoints"
- **Context.** The 2026-07-17 six-seat architecture review (reports:
  `docs/reference/reviews/2026-07-17-*.md`) found the emitted naming bimodal — semantic roles
  kebab in CSS/Tailwind but camelCase in JSON/DTCG/UI3; `paddingNarrow` beside `stack-tight`
  inside one collection; type's Figma emitter preserving `Sub-heading/MD` while geometry kebabs
  its groups — plus a three-way collection-name split (`Color / Primitives` vs `Color
  Primitives`), the merged moded collection still named "Geometry" while hosting all of
  typography (TKT-0009), and two homonym pairs (`size/*/gap` vs `gap/*`, `size/*/radius` vs
  `radius/*`).
- **Decision.** Adopt the librarian grammar in full (report §"Proposed naming grammar", 8
  rules), ratified 2026-07-17: **kebab-case for every emitted token/path segment on every
  surface** — CSS, DTCG keys, JSON, UI3, Figma variable paths *including voice/step segments*
  (`type/ui-control/md/line-single`) — `/` as the only path delimiter (never inside a display
  name), base-variant-modifier word order (`padding-narrow-compact`), suffixes always trailing
  (`-single`, ` •`), 3-digit stop padding, the homonym-check gate, and collection names per
  rule 8. Homonyms resolve by leaf rename: `size/*/gap` → `size/*/icon-gap`, `size/*/radius` →
  `size/*/pill-radius`. Scrims nest (`{n}/scrim/{step}`), JSON keys by palette slug. The
  canonical collection set (one shared constant, both export + plugin): **"Color Primitives" ·
  "Color Semantic"** (renamed from "Color Modes", rule 8: name the content when the mode axis is
  self-evident) **· "Breakpoints"** (renamed from "Geometry" — its modes ARE the axis; the
  domain name became a lie when type/ moved in) **· "Font Primitives"**.
- **Rationale.** One grammar ends the C1/C2/M1 drift class at the root instead of per-emitter;
  kebab matches the shipped CSS surface, W3C DTCG style practice, and the ratified TKT-0010
  token names. Engine-INTERNAL JS identifiers stay camelCase — the grammar governs emissions.
- **Consequences.** A one-shot migration wave (TKT-0013) across engine emitters, tests, consumer
  skills, the design-systems plugin, and BZZR — gated on the rename-capability prerequisite
  (TKT-0012), because all apply-loops reconcile by name and a bare rename orphans user bindings
  (collections-arch review, CRITICAL-1). Collection renames additionally migrate the provenance
  registry keys. Deliberate divergences stay fenced: Tailwind's literal `color` namespace,
  ShadCN's fixed vocabulary, Figma's all-pixel rule.
- **Status.** DECIDED (ratified 2026-07-17; execution TKT-0011..0014).

## ADR-017 — Ticket backend moves from `docs/tickets/*.md` files to GitHub Issues
- **Context.** Since 2026-07-12 ([[tickets-workflow-adopted]]) `docs/tickets/` held every `kind:
  bug`/`kind: feature` TICKET, minted by scribe's `/bug-report`/`/feature`, frontmatter carrying
  `status`/`size`. By 2026-07-17 the store had grown to 30 files (TKT-0001..0030), 18 still open
  (TKT-0004, TKT-0013..TKT-0030) — a plain-file backlog living only inside this repo, invisible to
  GitHub's own issue search/labels/assignment/notifications, and duplicating machinery (`status:`,
  `size:`) that Issues already provide natively (open/closed state, labels). The repo already ships
  through GitHub (PRs, CI, `gh pr merge`) and `gh` is authenticated with `repo` scope — the
  git-native backend scribe's `/bug-report`/`/feature` support out of the box was simply never
  switched on here.
- **Decision.** New bugs/features/issues route to **GitHub Issues** via `gh issue create`, not new
  `docs/tickets/*.md` files. The payload contract is unchanged (Summary/Acceptance/Links/Scope-
  Open/Findings as `##` sections); `kind:bug`/`kind:feature` + `size:small`/`size:big` labels
  replace the frontmatter fields as the machine-read surface. `docs/tickets/` freezes as the
  pre-2026-07-17 archive — its 12 already-`done` files stay put as historical record; its 18 open
  files migrate to Issues (`TKT-0031`) rather than continuing to accrue alongside a second store.
  CLAUDE.md's Layout section carries the routing-table row scribe's own intake Phase 0 reads to
  detect this ruling.
- **Rationale.** One live backlog beats two: a file-and-Issue split would silently fork "what's
  open" across two places with no cross-link, and every future `/bug-report`/`/feature` run would
  have to re-decide the backend from scratch without a durable ruling to read. GitHub's native
  open/closed + labels + search subsumes the frontmatter `status:`/`size:` fields at zero added
  maintenance, and surfaces the backlog to collaborators who don't have this repo's `docs/`
  conventions loaded.
- **Consequences.** Every consumer of the old file contract updates once: `project-docs`
  (routes doc-shaped "what's open" questions — now split pre/post-2026-07-17), any script reading
  `docs/tickets/*.md` frontmatter (none found outside the skill's own intake at ratification time —
  reverify at TKT-0031), and this repo's own muscle memory ("check `docs/tickets/` for open work"
  becomes "check `gh issue list`"). No file-format migration risk: Issues are created fresh from
  each file's existing Summary/Acceptance/Links/Scope-Open text, not parsed/transformed
  mechanically.
- **Status.** DECIDED (ratified 2026-07-17; migration execution `TKT-0031`).

## ADR-018 — `role-table.json` stays a hand-kept answer key; only the Figma-sandbox copy generates
- **Context.** TKT-0019 (#331) proved a splice-at-build-time generator (`scripts/gen-figma-binder-code.mjs`)
  for the Figma-sandbox binder's (`figma/binder/figma-semantic-binder/code.js`) hand-duplicated
  executable bodies: the five float-executor functions AND its 53-row role table, both previously
  hand-copied because Figma's standalone-plugin sandbox cannot `import` a `.mjs` at runtime — the same
  constraint the `FLOAT_PLANS` download-time anchor already worked around. TKT-0030 (#342) asked whether
  the same generate-don't-duplicate technique should extend to the *other* two role-table copies:
  `docs/reference/data/role-table.json` (the hand-edited answer key) and `src/engine/semantic.js`'s
  `semanticRoles()` (the actual implementation) — "three role-table copies… hand-kept in lockstep behind
  test gates," per the issue.
- **Decision.** Partial: TKT-0019's build already collapsed the count from three copies to two — the
  binder's `roleTable(paletteName)` is now `semanticRoles()`'s function body, spliced verbatim (plus its
  3 supporting `SCRIM_*` consts), not hand-copied. The remaining pair — `role-table.json` ↔
  `semantic.js` — is ruled **WONTFIX** for further generation. `role-table.json` continues to be
  hand-edited exactly as `adding-semantic-roles` already documents (no `gen:role-table` script), and
  `test/engine/semantic.mjs`'s `refs-canonical` gate keeps deep-equaling `semanticRoles("primary")`
  against it.
- **Rationale.** The binder's role table and `role-table.json` are NOT the same shape of problem, even
  though both are called "duplication" in the issue. The binder's copy existed for a purely TECHNICAL
  reason (the sandbox import constraint) and carried ZERO independent verification value — it was pure
  waste, the ideal generation target, and TKT-0019 eliminated it with no loss of any guarantee.
  `role-table.json` is the opposite: it is a deliberately hand-authored, INDEPENDENT answer key (the
  test's own comment calls it exactly that — "the canonical primary-palette table (answer key)"), whose
  entire job is to catch an ACCIDENTAL behavioral change landing directly inside `semanticRoles()` (a
  mistyped ref, a reordered role, a dropped state). If `role-table.json` were generated FROM
  `semanticRoles()`, the `refs-canonical` gate becomes tautological — "X deep-equals a copy of
  itself" — and would pass unconditionally even if `semanticRoles()`'s logic silently regressed, because
  there would no longer be an INDEPENDENT reference to diff against. This is the same tension ADR-011
  already ruled on for this exact file (the cam16-hue encoding "looks wrong" but is the deliberate
  answer-key snapshot) — a second, load-bearing precedent for treating `role-table.json` as a golden
  master, not a duplicate implementation. The reverse direction (generating `semanticRoles()` FROM
  `role-table.json`) is not even coherent to attempt: `role-table.json` carries rows for exactly ONE
  palette name (`"primary"`), while `semanticRoles(paletteName)` is a general, name-parametric function
  — there is no data in the JSON sufficient to derive the function for any other palette.
- **Consequences.** `role-table.json` and `semantic.js` continue to move together BY HAND on every
  role/count change, per `adding-semantic-roles`' existing lockstep procedure — an accepted, ongoing
  maintenance cost (not a defect), because the human-authored second copy is the feature, not the bug.
  No test, script, or skill changes; the `refs-canonical` gate is unchanged and remains the drift-catcher
  it was designed to be. Revisit only if a genuinely NEW, unrelated reason to keep two independently
  generated copies ever surfaces — no such reason exists today.
- **Status.** DECIDED (2026-07-17; TKT-0030/#342, informed by TKT-0019/#331's completed build-out).

## ADR-019 — The theme axis is a data-driven `{name, side}[]` list, not a hardcoded Light/Dark pair; a role stays 2-ended
- **Context.** The 2026-07-17 collections-architecture review
  (`docs/reference/reviews/2026-07-17-collections-arch.md`, CRITICAL-3) found the breakpoint axis
  fully generic (N modes, any names — `typeTokensFigmaModes`/`geomTokensFigmaModes`'s `modes[]`
  parameter) while the THEME axis was hardcoded to exactly two: `exportDTCG` only ever built
  `"Light_tokens.json"`/`"Dark_tokens.json"`, `figma/binder/bind-plan.mjs`'s `bindingPlan` only ever
  emitted `{lightTarget, darkTarget}`, and `figma/plugin/code.js`'s `applyBundle` hardcoded exactly
  two Figma modes named `"Light"`/`"Dark"`. Adding a third theme (a dim mode, high-contrast, a
  second brand) required an engine change, not a config change (TKT-0021).
- **Decision.** Genericize the AXIS, not the per-role DATA MODEL: a role keeps its existing
  2-ended shape (a `light` ref and a `dark` ref — semantic.js's header note, unchanged). A
  **theme** is a named Figma mode bound to ONE of those two already-resolved ends via a `side`
  field (`"light"` or `"dark"`). `semantic.js` exports `DEFAULT_THEMES = [{name:"Light",
  side:"light"}, {name:"Dark", side:"dark"}]` — the single source every surface falls back to.
  `exportDTCG(state, opts)` takes an optional `opts.themes` and emits one `"{name}_tokens.json"`
  per theme (in order); `bindingTargets(paletteNames, themes)` / `bindingPlan(paletteNames,
  themes)` take the same optional list (`bindingPlan`'s per-role shape changed from the fixed
  `{lightTarget, darkTarget}` fields to a generic `targets: [{mode, target}, ...]` array — no
  consumer read the old field names directly); `applyBundle` walks every `"{name}_tokens.json"`
  file the bundle actually carries (identified by its `$extensions["com.figma.modeName"]` tag, not
  by parsing the filename) and creates exactly that many Color Semantic modes, in that order,
  pruning any mode the current bundle no longer wants. An absent/default `opts.themes` reproduces
  the pre-ADR-019 two-file, two-mode output **byte-identically** — proven by an explicit
  before/after diff, not just "tests still pass" (TKT-0021's own gate).
- **Rationale.** A THIRD resolved end per role (so "Dim" could carry its OWN color, distinct from
  both Light and Dark) would require a new field in the role table itself
  (`data/role-table.json`'s `roleTable`, `semantic.js`'s `semanticRoles()`, every consumer of
  `r.light`/`r.dark`) — a far larger, separate change with its own role-count-style lockstep
  concerns (`adding-semantic-roles`). The axis genericization this ticket needed — "N named modes,
  not exactly 2" — does NOT require that: a theme can already reuse either existing end under a
  new name (e.g. a "Dim" companion mode bound to the same `"dark"` side as "Dark"), which is
  sufficient to prove and use the generic plumbing today. A genuine third COLOR (not just a third
  NAME) is future work, scoped separately if the product asks for it.
- **Consequences.** `figma/binder/figma-semantic-binder/code.js` (the standalone binder, which
  reads a LIVE file's raw variables directly rather than an `exportDTCG` bundle) still hardcodes
  its own Light+Dark mode creation — out of scope for TKT-0021 (the issue and the review cite only
  `exportDTCG`/`bind-plan.mjs`/`applyBundle`); its `bindingPlan`-mirrored role table still emits the
  same canonical raw-color target SET either way (a 3-theme axis reusing an existing `side`
  contributes no new raw names — proven in `test/figma/binder.mjs`'s `themes` gate), so the two
  binders stay compatible, but the standalone binder does not yet let a user create a 3rd Color
  Semantic mode on its own. `exportUI3`'s `Color Semantic` collection (`values:{Light, Dark}`) was
  NOT touched — also out of the ticket's named scope; it carries the identical hardcoded-pair
  pattern and should genericize the same way in a follow-up (a documented gap, not a fixed one).
  No UI control was added for authoring extra themes per doc — this ADR ratifies that the
  ENGINE/BIND/APPLY path no longer blocks it structurally; wiring a user-facing control is a
  separate, later decision.
- **Status.** DECIDED (ratified 2026-07-17; TKT-0021). Follow-up: genericize `exportUI3`'s theme
  axis and the standalone binder's live-mode creation the same way, if/when a real 3rd-theme ask
  lands (tracked informally here, not yet a filed ticket).

## ADR-020 — `bundle.mjs` stays the single-file inliner; vite is not byte-comparable and not adopted
- **Context.** `scripts/bundle.mjs` is a hand-rolled regex import-transformer with manually-synced
  `MODS`/`KEY` module registries and a documented no-default-export limitation. `vite` is already a
  devDependency (it builds the real web app from `index.html`/`src/ui/index.html`). TKT-0028 was a
  time-boxed spike asking whether vite's own single-file build capability could replace
  `bundle.mjs` for the Figma-sandbox-embeddable bundle, with the acceptance bar stated explicitly
  as **"adopt only on byte-comparable output."**
- **Decision.** Keep `bundle.mjs`. Do not adopt vite for this artifact. Instead, harden
  `bundle.mjs` with a `preflight()` whole-graph scan (below) that runs before any transform.
- **Rationale.** A real vite build was attempted: a JS entry (`import "./styles.css"; import
  "./app.js";`) built in `lib` mode with `rollupOptions.output.inlineDynamicImports: true` and
  `cssCodeSplit: false` (vite 8.0.16, rolldown-powered) DOES fold every dynamic `import()` — the
  category-module lazy chunks — into one chunk with no runtime module resolution, which is the
  actual hard constraint (the Figma UI iframe has no module server to satisfy a real `import()`).
  So vite *can* produce a working single-file bundle mechanically. But the acceptance bar is byte
  parity, not "also works": vite/rolldown's output carries its own module-runtime prelude
  (`rolldown/runtime.js`'s `__esmMin`/`__exportAll` helpers) and a completely different code shape
  from `bundle.mjs`'s naive source concatenation, so byte-identical output is categorically
  unreachable — not a tuning problem, a different tool. Measured on the SAME source tree: the
  current `bundle.mjs` output (CSS + JS + HTML shell, unminified by construction) is **2832.8 KB**.
  The vite build's JS+CSS alone (unminified) is **~3397.9 KB** (3301.15 KB JS + 96.75 KB CSS) —
  **~20% larger before even adding an HTML shell**, and minifying the JS barely helps (3039.62 KB,
  only ~8% smaller) because most of this artifact's bytes are inert DATA embedded as JS/JSON
  string literals (the ~343 curated palettes, the base64-embedded self-hosted fonts, the whole
  Figma binder `code.js` and MCP server source carried as string constants for download) — a
  minifier cannot compress opaque string payloads the way it compresses logic. So switching
  bundlers would be a straight ~20% size regression on a downloadable offline single-file build
  and the Figma plugin's embedded UI, for a documented limitation (`export default`) that a repo
  grep confirms **zero current files trigger** — a latent risk, not an active one.
- **Consequences.** `bundle.mjs`'s `MODS`/`KEY` registries stay hand-maintained; every new module
  in the import graph still needs an entry in both (unchanged going forward — `adding-export-formats`/
  `building-editor-sections` and similar skills that touch these registries are unaffected). In
  exchange, `scripts/bundle.mjs` gained a `preflight()` function that runs before any transform and
  reports EVERY registry problem in one itemized error instead of dying on the first: (a) a `KEY`
  entry pointing at a `MODS` key that doesn't exist — previously this destructured `__M.<key>` as
  `undefined` and only threw in the **browser**, on whatever click path first reached it; (b) two
  `MODS` entries sharing a basename in different directories — `KEY` is keyed by basename only, so
  this silently resolved every importer to whichever one the object literal's last-key-wins landed
  on, with **no error at all**; (c) the existing per-import/`export default` check, now run
  up front across the WHOLE graph (every problem reported, not just the first file the assembly
  loop happens to reach) with source-file context on each line. Verified: `npm test` and
  `npm run build` green with byte-identical `dist/ultimate-tokens.html` (2832.8 KB) and
  `figma/plugin/ui.html` (2835.8 KB) output before/after the hardening; `npm run smoke` (real
  headless Chrome, TKT-0028's own verification bar for the Figma-embeddable bundle) green end to
  end, including the Apply-to-Figma consent gate.
- **Status.** DECIDED (ratified 2026-07-17; TKT-0028, a spike — no follow-up work implied). If a
  future change genuinely needs a default export, or vite gains a mode that reproduces
  `bundle.mjs`'s concatenation shape (no module-runtime prelude) at comparable size, this ADR is
  the record to revisit, not to silently override.

## Quick map: decisions an enhancing agent is most likely to "fix" (don't)
| ADR | Looks wrong because… | But it's intentional because… |
|-----|----------------------|-------------------------------|
| ADR-003 | on-colors fail WCAG on Warning | explicit brand override; contrast-aware was removed on purpose |
| ADR-004 | scrims unified onto one 500 ramp (SUPERSEDED) | scrims now a single 500 ramp; the former base-750-only decision is superseded |
| ADR-002 | semantic could alias raw to cascade | native import errors on name-only aliasData; plugin does cascade |
| ADR-011 | `role-table.json` still encodes cam16 hues though hueSpace is now OKLCH | role-table is the cam16 answer key for the parity gate; the OKLCH flip is at the doc/seed layer, not the role table |
| ADR-019 | `exportUI3` and the standalone binder still hardcode Light/Dark | deliberately out of TKT-0021's scope — a documented follow-up, not an oversight |
| ADR-007 | a real-looking Figma schema isn't imported | the schema is unverified/non-native |
| ADR-014 | a pre-rename `.fig` loses its embedded config, and no migration was written | `setPluginData` is namespaced per plugin id — the old keys are unreadable from the new id; a migration cannot exist |
| ADR-015 | the product has no maker, no logo, and support points at an issue tracker | deliberate: the maker brand was retired; `test/repo/branding.mjs` fails the build if it returns |
| ADR-018 | `role-table.json` isn't generated from `semantic.js` like the Figma binder's role table now is (TKT-0019) | it's a deliberate independent answer key; generating it would make the `refs-canonical` gate tautological |
| ADR-020 | `scripts/bundle.mjs` still hand-rolls import transforms though `vite` is already a devDependency | measured: vite's single-file output is ~20% LARGER (rolldown runtime prelude + a data-heavy artifact minification barely shrinks) and can't be byte-comparable — the spike's own acceptance bar ruled it out |
