---
name: type-scale
description: >
  Use when a change touches src/engine/type.mjs or any typography in
  ultimate-tokens — the modular scale, a voice or treatment,
  tracking/leading/weight/case, a font swap, a fallback-font render, or a red
  type gate. Covers the eleven named voices (Display · Heading · Sub-heading · Kicker · Lead ·
  Body · Quote · Caption · UI · Code · Legal), the five treatments, and the self-hosted fonts. TYPE sibling of
  color-math (COLOR only).
disable-model-invocation: false
user-invocable: true
---

# The typography engine — the type scale (ultimate-tokens)

One file, `src/engine/type.mjs`, the type analog of the color engine: a few per-voice params → a systematic
scale → DTCG / CSS tokens. Pure, no DOM, no magic numbers — every step's size, line-height, letter-spacing,
weight, and case is **derived** from the treatment's knobs. The conceptual *why* (the eleven voices, the
system relationships, the leading constants, the target token shape) is owned by
`.claude/docs/spec/typography/README.md` — **cite it, don't re-derive.** Color lives next door in `color-math`;
this skill never touches color.

## The shape — five layers (depth in `references/foundations.md`)

| Layer | What it is | The contract |
|---|---|---|
| **`cat(role, base, ratio, leading, weight, trackingEm, steps, transform, box)`** | builds ONE voice's param record | `{role, base, ratio, leading, weight, trackingEm, steps, transform, box}` — no resolved sizes yet; `steps` defaults `STEPS_5`, `transform` `"none"`, `box` defaults from the role (`ui`/`mono` ⇒ `true`, else `false`) |
| **`make11(o={})`** | the FACTORY — returns the ELEVEN named voices, sharing structure, reading per-voice knobs from `o` | `Display · Heading · Sub-heading · Kicker · Lead · Body · Quote · Caption · UI · Code · Legal` (the four editorial voices — Lead · Quote · Caption · Legal — are ADR-013) |
| **`TYPE_TREATMENTS`** (5) | each = `{id,label,note,fonts,categories:make11({...})}` | ids `product · luxury · editorial · technical · statement` (`statement` = Brutalist) |
| **`typeScale(config={treatment,bodyBase,modeFactor?,overrides?,voices?,fonts?})`** | resolves a treatment → `{treatment,label,fonts,roleOf,categories}` | `roleOf` maps each voice→font role; `categories[voice][step]` = the resolved step. The optional channels are **per-kit overrides** layered over the treatment, each **identity-gated** (absent/empty/non-finite/1 ⇒ byte-identical output): `overrides` = flat per-cell `"<voice>\|<step>"`→size map (moves SIZE only); `voices` = `{<voice>:{weight,tracking,leading,ratio}}` reshaping a whole voice; `fonts` = `{<role>:family}` per-role font swap; **`modeFactor`** = the hierarchy-aware BREAKPOINT compression (#253): each step's size scales by a factor log-interpolated from ×1 at `bodyBase` to ×`modeFactor` at the ramp's top — body-class frozen, Display fully compressed (Tablet 5/6 · Mobile 2/3 canonical); line/tracking/para re-derive from the compressed size |
| **`typeTokensCSS` / `typeTokensBreakpointCSS` / `typeTokensDTCG` / `typeTokensFigmaModes`** | the emitters (operate on a resolved `scale`; px/rem/em via `dimUnit`) | CSS custom props + a utility class per step (the base file — UNCONDITIONAL, no media query, the designed/Desktop scale, complete on its own) · one SEPARATE, self-contained override file per breakpoint mode (#264 — each bounded `min-width`+`max-width` except the narrowest, which stays open below; a consumer adds the base file alone or any subset of breakpoint files, any load order) · DTCG composite `typography` tokens · a breakpoint-moded Figma collection (`{baseName, baseLast}` name/position the base layer — the intrinsic set emits **Desktop · Tablet · Mobile** with the DESIGNED scale as Desktop = Figma's default mode; synthesis lives app-side in `_typeModeScales`) |

## The taxonomy + the math — owned by `references/foundations.md`

One-line pointers; this body does not restate them:

- **Voice taxonomy** — the eleven voices × three step ramps (`STEPS_3` 3 / `STEPS_5` 5 / `STEPS_UI` 8; 53 steps), the `roleOf` mapping (Kicker + Code → `mono`; Lead → `body`; Quote → `heading`; Caption + Legal → `ui`), the `box` flag that decouples the presentation FLOW from the font role (Caption + Legal ride the `ui` font but are PROSE, `box:false`), the caps voices, the per-treatment case rules → foundations §2 + §4. (The four editorial voices are ADR-013.)
- **The math** — `buildCategory(name, p, factor, overrides, vp)` in type.mjs: modular scale → 8px floor → the nice-number ladder (with the monotonic bump) → per-cell/per-voice overrides; tracking stays OPTICAL on the modular size; `bodyBase` is the ONE global resize lever (`factor = bodyBase / Body.base` in `typeScale`) → foundations §3.
- **Emitter shapes** — the four emitters + the `dimUnit` px/rem/em option → foundations §6.
- **Leading constants** — FIXED per-role, uniform across treatments (the `font.modes.json` intent): display **0.8** (< 1, large type sets tight) · heading · sub-heading **1.125** · body **1.5** · Lead **1.4** · Quote **1.35** · Caption · Legal **1.5** · Kicker **1.4** · code **~1.5** · UI **~1.4** (the one small per-treatment lever, `1.35–1.45`). Not bands → foundations §3.

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
   - A wrong size/leading/tracking/weight/case on a voice → a `make11` knob (default in `make11`, override in the treatment's `make11({...})`).
   - A new treatment → push a `{id,label,note,fonts,categories:make11({...})}` row onto `TYPE_TREATMENTS`.
   - A new voice group → add a `cat(...)` line in `make11` (its role flows into `roleOf` from `cat`'s first arg), THEN wire the blast radius the emitters DON'T auto-flow: the `persist.js` **VOICES allowlist** (miss it and the voice's per-voice overrides are SILENTLY DROPPED on hydrate — the one functional landmine), the `styles.css` `.ty-s0…N` series colours (one per voice, in order), and the `GROUPS` list + headless count literals (steps / groups). A voice-count change is a taxonomy change, not just code — see best-practices.
   - A bad emitted token → the emitter (`typeTokensCSS` / `typeTokensBreakpointCSS` / `typeTokensDTCG` / `typeTokensFigmaModes`).
   - A wrong/missing rendered face → `src/ui/type-fonts.js` (regenerate) + the treatment's `fonts`.
   - A **per-kit, user-tuned** size/shaping/font (NOT a treatment-wide change) → the `typeScale` override channels, never the treatment: a single cell → `config.overrides`; a whole voice's weight/tracking/leading/ratio → `config.voices`; a per-role font swap → `config.fonts` (each MUST stay identity-gated — see the `typeScale` row).
2. **Edit only `type.mjs`** (+ `scripts/gen-type-fonts.mjs` for a font change). Keep the math in `buildCategory` — never bake a resolved px size into a treatment; pass a `base`/`ratio`/`trackingEm` knob and let the engine derive it. Case is a per-treatment decision via the `transform` arg, not a blanket rule.
3. **Respect the invariants** (the tests assert these): Body MD = `bodyBase`; every size sits on the nice-number ladder and strictly increases XS→XL; Display tracks negative + scales with size; Sub-heading/Kicker uppercase + positive tracking; Kicker + Code map to `mono`; Code/UI carry the 8-step `STEPS_UI` ramp; exactly ONE treatment (Brutalist/`statement`) sets an uppercase Display; CSS families stay QUOTED; leadings at the per-role constants (Display < 1).
4. **New treatment? — add the ELEVEN voices by passing the full `fonts` palette** (`display/heading/body/ui/mono` — five roles) so `roleOf` resolves every voice, and supply `note` (the UI specimen copy reads it). The test asserts every treatment has all eleven voices + `fonts`.
5. **New font? — wire BOTH ends.** `TYPE_TREATMENTS.fonts` (so a voice uses it) AND `scripts/gen-type-fonts.mjs#FAMILIES` (so it's embedded), then `npm run gen:type-fonts` and commit `src/ui/type-fonts.js`.

## Validate (the anchor-style gate — draft → check → fix → re-check)

Run the pure verifier first (prints `type PASS` / `type FAIL (n)`; exit 1 fails), then the suite:

```
node test/engine/type.mjs    # 5 treatments × 11 voices · roleOf (Kicker+Code→mono, Quote→heading, Lead→body,
                             # Caption+Legal→ui) · the caps voices ·
                             # exactly ONE uppercase Display (Brutalist) · Body MD=bodyBase · monotonic XS→XL ·
                             # the nice-number ladder · LG/MD≈ratio · lineHeight=size·leading · optical tracking
                             # (Display neg / UI pos) · Code 8-step ramp · bodyBase scales uniformly ·
                             # the override channels (identity gates) · unknown→first · CSS class + px/rem/em ·
                             # the QUOTING guard (luxury → --font-display: 'Source Serif 4') · DTCG composite ·
                             # per-breakpoint files (bounded, order-independent) · Figma modes
npm test                     # the above + ui/figma/exports + smoke gen (node test/run.mjs)
```

The guard that catches the Safari font break is the `typeTokensCSS(luxury)` quoting assert in `test/engine/type.mjs`. The guard that catches a forced-caps Display is the "exactly ONE treatment" filter there. Don't call it done until `node test/engine/type.mjs` AND `npm test` are green. If you regenerated fonts, also confirm `src/ui/type-fonts.js` is committed and the specimen renders in the real faces (the smoke is Chrome-only — eyeball Safari for the font path).

## References

| Path | Use when |
|---|---|
| `references/foundations.md` | the SINGLE OWNER of the model: the five layers (`cat`→`make11`→treatment→`typeScale`→emitter), the voice taxonomy + step sets, the `buildCategory` math (nice ladder + override channels), `bodyBase` scaling, the emitter shapes, the font-rendering path |
| `references/best-practices.md` | the non-obvious do/don't (derive-don't-hardcode, the quoting guard, case-is-per-treatment, the manual font regen, both-ends font wiring) + a worked walkthrough from the treatment/specimen history |
| `references/rubric.md` | score the change before calling it done — the eleven voices, the math invariants, the quoting guard, and the font wiring are the gates |
| `.claude/docs/spec/typography/README.md` | the eleven named voices, the system relationships, the leading constants, the target token shape — owned there, cite |

Peers: [[geometry-system]] (composition with type) · [[adding-export-formats]] (the type emitter) · [[building-editor-sections]] (the Typography section) · [[shipping-changes]].