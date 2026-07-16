---
name: type-scale
description: >
  Use when a change touches src/engine/type.mjs or any typography in
  ultimate-tokens — the fixed-size type scale, a voice or treatment,
  tracking/leading/weight/case, sibling weights, breakpoint compression, a
  font swap, a fallback-font render, or a red type gate. Covers the fifteen named voices (Display ·
  Headline · Sub-heading · Title · Sub-title · Lead · Body · Body-mono · Label · Label-mono · Kicker ·
  Tiny · Tiny-mono · UI-control · UI-widget), the five treatments, and the self-hosted fonts. TYPE sibling of
  color-math (COLOR only).
disable-model-invocation: false
user-invocable: true
---

# The typography engine — the type scale (ultimate-tokens)

One file, `src/engine/type.mjs`, the type analog of the color engine: a few per-voice params → a systematic
scale → DTCG / CSS tokens. Pure, no DOM. Every step's size, line-height, letter-spacing, weight, and case is
**derived** from the treatment's knobs — EXCEPT size itself, which since 2026-07-13 is a hand-authored FIXED
table shared across all treatments (see the layer table below). The conceptual *why* (the fifteen voices,
the fixed-size-table rewrite, the target token shape) is owned by `docs/reference/typography/README.md` —
**cite it, don't re-derive.** Color lives next door in `color-math`; this skill never touches color.

## The shape — five layers (depth in `references/foundations.md`)

| Layer | What it is | The contract |
|---|---|---|
| **`cat(role, sizeKey, leading, weight, trackingEm, transform, box)`** | builds ONE voice's param record | `{role, base, leading, weight, trackingEm, steps, transform, box}` — `sizeKey` indexes the FIXED `SIZES` table (no `ratio`/exponent anymore); `steps` is always the uniform SM/MD/LG ramp; `transform` defaults `"none"`, `box` defaults from the role (`ui`/`mono` ⇒ `true`, else `false`) |
| **`makeVoices(o={})`** | the FACTORY — returns the FIFTEEN named voices, sharing structure, reading per-voice knobs from `o` | `Display · Headline · Sub-heading · Title · Sub-title · Lead · Body · Body-mono · Label · Label-mono · Kicker · Tiny · Tiny-mono · UI-control · UI-widget` (the last two = the interactive-text voices, TKT-0008; UI-control composes into geometry's control ramp) |
| **`TYPE_TREATMENTS`** (5) | each = `{id,label,note,fonts,categories:makeVoices({...})}` | ids `product · luxury · editorial · technical · statement` (`statement` = Brutalist); treatments differ in CHARACTER only, never size |
| **`typeScale(config={treatment,bodyBase,modeFactor?,overrides?,voices?,fonts?})`** | resolves a treatment → `{treatment,label,fonts,roleOf,categories,styleNames?,weights?,voiceFonts?}` | `roleOf` maps each voice→font role; `categories[voice][step]` = the resolved step. The optional channels are **per-kit overrides** layered over the treatment, each **identity-gated** (absent/empty/non-finite/1 ⇒ byte-identical output): `overrides` = flat per-cell `"<voice>\|<step>"`→size map (moves SIZE only); `voices` = `{<voice>:{weight,leading,tracking,styleName,weights,font}}` reshaping a whole voice (leading/tracking accept a percent-string OR a ratio); `fonts` = `{<role>:family}` per-role font swap; **`modeFactor`** = the hierarchy-aware BREAKPOINT compression (ratified 2026-07-10): each step's size scales by a factor log-interpolated from ×1 at `bodyBase` to ×`modeFactor` at the ramp's top — body-class frozen, Display fully compressed (Tablet 5/6 · Mobile 2/3 canonical); line/tracking/para re-derive from the compressed size |
| **`typeTokensCSS` / `typeTokensBreakpointCSS` / `typeTokensDTCG` / `typeTokensFigmaModes` / `typeTokensFigmaPrimitives`** | the emitters (operate on a resolved `scale`; px/rem/em via `dimUnit`) | CSS custom props + a utility class per step (the base file — UNCONDITIONAL, no media query, the designed/Desktop scale, complete on its own) · one SEPARATE, self-contained override file per breakpoint mode (#264 — each bounded `min-width`+`max-width` except the narrowest, which stays open below) · DTCG composite `typography` tokens (+ an optional `weights` group) · a breakpoint-moded Figma collection, ALL-PIXEL (the one relative-unit exception; `{baseName, baseLast}` name/position the base layer — synthesis lives app-side in `_typeModeScales`) · the companion "Font Primitives" collection (deduped family/weight/style STRING+FLOAT primitives, aliased per voice) |

## The taxonomy + the math — owned by `references/foundations.md`

One-line pointers; this body does not restate them:

- **Voice taxonomy** — the fifteen voices × the single uniform 3-step ramp (SM/MD/LG; the old per-voice `STEPS_3`/`STEPS_5`/`STEPS_UI` split is retired), the `roleOf` mapping (Body-mono/Label-mono/Kicker/Sub-title/Tiny-mono → `mono`; Lead/Body → `body`; Label/Tiny/UI-control/UI-widget → `ui`), the `box` flag that decouples the presentation FLOW from the font role (the actual BOX voices are exactly Label/Body-mono/Label-mono/Kicker/UI-control/UI-widget — Sub-title/Tiny/Tiny-mono ride a box-default role but are `box:false` PROSE), the caps voices, the per-treatment case rules → foundations §2 + §4.
- **The math** — `buildCategory(name, p, factor, overrides, vp, compress)` in type.mjs: FIXED literal size (`SIZES` table) × `factor` × optional breakpoint `compress` → 8px floor → the nice-number ladder (ONLY when actually scaled/compressed — an unscaled literal passes through EXACT) → per-cell/per-voice overrides; tracking stays OPTICAL on the derived size; `bodyBase` is the ONE global resize lever (`factor = bodyBase / 16` in `typeScale`); `leadingRatio`/`trackingRatio` are the exact unrounded per-step ratios every relative-unit emitter must read (never re-derive from the rounded absolute) → foundations §3.
- **Emitter shapes** — the five emitters + the `dimUnit` px/rem/em option → foundations §6.
- **Sibling weights + Figma labels** — the two-tier ladder (expressive vs. body-class), the fixed Regular/Medium/Semi-bold face mapping, the `•`/`-single` naming convention → `references/weight-ladders-and-labels.md` (a fully separate axis — don't duplicate here).
- **Leading constants** — FIXED per-role, uniform across treatments: display **0.8** (< 1, large type sets tight) · heading-family (Headline/Sub-heading/Title) **1.125** · prose (Body/Lead/Sub-title/Tiny) **1.4–1.5** · single-line control text (Label/Label-mono/Kicker/Body-mono) **1.0** · the interactive voices (UI-control/UI-widget) **1.4**. Retune a per-voice `*Lead` knob only for a deliberate character exception → foundations §3.

## The font-quoting guard — the Safari trap

`typeTokensCSS` emits `--font-{role}: '{family}';` — **the single quotes are load-bearing.**
A family name with a digit (`Source Serif 4`, `Inter Tight`) is invalid *unquoted* in a strict CSS parser:
**Safari drops the whole declaration and falls back.** The `luxury` treatment uses `Source Serif 4`, so the
verifier pins `typeTokensCSS(typeScale({treatment:"luxury"}))` contains `--font-display: 'Source Serif 4'`
(the luxury quoting assert in `test/engine/type.mjs`). Never emit an unquoted family. (This is the type echo of color's anchors — a
quiet break that *looks* fine in Chrome; see the smoke-is-Chrome-only memory.)

## The self-hosted fonts (the offline / Figma-plugin path)

The 4 families — **Inter, Inter Tight, Source Serif 4, JetBrains Mono** — are base64 woff2 `@font-face`
inlined in `src/ui/type-fonts.js` (one export, `TYPE_FONTS_CSS`), so the specimen renders in the real faces
offline AND inside the Figma plugin (`manifest networkAccess:"none"` hard-blocks the Google Fonts CDN).
`ensureTypeFonts()` (in `src/ui/app.js`) injects the `<style>` once AND eagerly registers all four via the
`FontFace` API + `load()` (the `<style>` path is lazy — Chromium activates a face only on first use, so a font
outside the current treatment flashes the fallback without the eager load).

- **`src/ui/type-fonts.js` is a COMMITTED generated asset** (header: "DO NOT EDIT"). **Do NOT hand-edit it.** Regenerate with `npm run gen:type-fonts` (= `node scripts/gen-type-fonts.mjs`).
- **`gen:type-fonts` is MANUAL — it is NOT in the build or test chain** (`package.json`: `build`/`test` do not call it). Run it ONLY when the font set changes, then commit the regenerated file. If you add/swap a family in `TYPE_TREATMENTS.fonts`, also add it to the `FAMILIES` array in `scripts/gen-type-fonts.mjs` (name + variable `wght` axis) and regenerate — otherwise the new face has no embedded woff2 and renders in the fallback.

## Procedure — change → check → fix → re-check

1. **Locate the layer — one frame each:**
   - A wrong DESIGNED size on a voice → the voice's literal in the `SIZES` table (the fixed table, not a formula).
   - A wrong leading/tracking/weight/case on a voice → a `makeVoices` knob (default in `makeVoices`, override in the treatment's `makeVoices({...})`).
   - A new treatment → push a `{id,label,note,fonts,categories:makeVoices({...})}` row onto `TYPE_TREATMENTS` — character knobs only, never a size/ratio knob.
   - A new voice group → add a `cat(...)` line in `makeVoices` (its role flows into `roleOf` from `cat`'s first arg) + a `SIZES` entry (unless it aliases an existing voice's triplet), THEN wire the blast radius the emitters DON'T auto-flow: the `persist.js` **VOICES allowlist** (miss it and the voice's per-voice overrides are SILENTLY DROPPED on hydrate — the one functional landmine), the `styles.css` `.ty-s0…N` series colours (one per voice, in order), and the count literals in `test/engine/type.mjs` (`GROUPS`) + `test/ui/headless-boot.mjs` (45 steps / 15 groups). A voice-count change is a taxonomy change, not just code — see best-practices.
   - A bad emitted token → the emitter (`typeTokensCSS` / `typeTokensBreakpointCSS` / `typeTokensDTCG` / `typeTokensFigmaModes` / `typeTokensFigmaPrimitives`).
   - A sibling-weight ladder or Figma Styles label wrong → `references/weight-ladders-and-labels.md`, not this file.
   - A wrong/missing rendered face → `src/ui/type-fonts.js` (regenerate) + the treatment's `fonts`.
   - A **per-kit, user-tuned** size/shaping/font (NOT a treatment-wide change) → the `typeScale` override channels, never the treatment: a single cell → `config.overrides`; a whole voice's weight/tracking/leading → `config.voices`; a per-role font swap → `config.fonts`; a per-voice font swap → `config.voices[v].font` (each MUST stay identity-gated — see the `typeScale` row).
2. **Edit only `type.mjs`** (+ `scripts/gen-type-fonts.mjs` for a font change). Keep character math in `buildCategory` — never bake a resolved px size into a treatment's KNOBS (treatments carry no size knob anymore); a genuine size change goes in `SIZES` itself, shared by every treatment. Case is a per-treatment decision via the `transform` arg, not a blanket rule.
3. **Respect the invariants** (the tests assert these): Body MD = `bodyBase`; an unscaled size passes through the fixed `SIZES` literal EXACTLY (never re-snapped); a scaled/compressed size sits on the nice-number ladder and strictly increases SM→LG; Display tracks negative + scales with the derived size; Sub-heading/Kicker uppercase + positive tracking; exactly ONE treatment (Brutalist/`statement`) sets an uppercase Display; CSS families stay QUOTED at both the role and per-voice level; leadings at the per-role constants (Display < 1); body-class core weights stay ≤450 (weight-ladders-and-labels.md); `leadingRatio`/`trackingRatio` never re-derive from a rounded absolute.
4. **New treatment? — add the FIFTEEN voices by passing the full `fonts` palette** (`display/heading/body/ui/mono` — five roles) so `roleOf` resolves every voice, and supply `note` (the UI specimen copy reads it). The test asserts every treatment has all fifteen voices + `fonts`.
5. **New font? — wire BOTH ends.** `TYPE_TREATMENTS.fonts` (so a voice uses it) AND `scripts/gen-type-fonts.mjs#FAMILIES` (so it's embedded), then `npm run gen:type-fonts` and commit `src/ui/type-fonts.js`.

## Validate (the anchor-style gate — draft → check → fix → re-check)

Run the pure verifier first (prints `type PASS` / `type FAIL (n)`; exit 1 fails), then the suite:

```
node test/engine/type.mjs    # 5 treatments × 15 voices · roleOf (Body-mono/Label-mono/Kicker/Sub-title/
                             # Tiny-mono→mono, Body/Lead→body, Label/Tiny→ui) · the caps voices ·
                             # exactly ONE uppercase Display (Brutalist) · Body MD=bodyBase · the fixed SIZES
                             # table (exact unscaled passthrough) · a scaled/compressed ramp on the
                             # nice-number ladder, strictly increasing · lineHeight=size·leading · optical
                             # tracking (Display neg / Label pos) · box/prose split (singleLineHeight on
                             # Label/Body-mono/Label-mono/Kicker only) · bodyBase scales uniformly · the
                             # override channels (identity gates, incl. config.voices.font) · unknown→first ·
                             # CSS class + px/rem/em · the QUOTING guard (luxury → --font-display: 'Source
                             # Serif 4') · DTCG composite · per-breakpoint files (bounded, order-independent) ·
                             # Figma modes + Font Primitives · sibling weights + relative labels
npm test                     # the above + ui/figma/exports + smoke gen (node test/run.mjs)
```

The guard that catches the Safari font break is the `typeTokensCSS(luxury)` quoting assert in `test/engine/type.mjs`. The guard that catches a forced-caps Display is the "exactly ONE treatment" filter there. Don't call it done until `node test/engine/type.mjs` AND `npm test` are green. If you regenerated fonts, also confirm `src/ui/type-fonts.js` is committed and the specimen renders in the real faces (the smoke is Chrome-only — eyeball Safari for the font path).

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the SINGLE OWNER of the model: the five layers (`cat`→`make11`→treatment→`typeScale`→emitter), the voice taxonomy + step sets, the `buildCategory` math (nice ladder + override channels), `bodyBase` scaling, the emitter shapes, the font-rendering path |
| `references/best-practices.md` | the non-obvious do/don't (derive-don't-hardcode, the quoting guard, case-is-per-treatment, the manual font regen, both-ends font wiring) + a worked walkthrough from the treatment/specimen history |
| `references/rubric.md` | score the change before calling it done — the fifteen voices, the fixed-size-table math, the quoting guard, the body-class snap boundary, and the font wiring are the gates |
| `references/weight-ladders-and-labels.md` | sibling-weight ladders, the expressive-vs-body-class label split, the Figma Styles `•`-marker + `-single` suffix, the never-re-derive-a-relative-unit law, preset weight authoring against a real font's cuts |
| `docs/reference/typography/README.md` | the fifteen named voices, the fixed-size-table rewrite, the system relationships, the target token shape — owned there, cite |

Peers: [[geometry-system]] (composition with type) · [[adding-export-formats]] (the type emitter) · [[building-editor-sections]] (the Typography section) · [[shipping-changes]].