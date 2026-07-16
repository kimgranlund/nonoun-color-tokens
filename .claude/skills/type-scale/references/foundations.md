## Foundations — the model a type-engine change leans on

The load-bearing ideas. If a change feels like it needs a hand-authored size or a new branch, you are
probably fighting one of these. The full *why* (the thirteen voices, the fixed-size-table rewrite, the
target token shape) is owned by `docs/reference/typography/README.md` — this file is only the mental
model the *procedure* assumes. Sibling-weight ladders, the Figma Styles label vocabulary, and the
`•`/`-single` naming convention are a SEPARATE axis, owned by `references/weight-ladders-and-labels.md`
— cited here, not duplicated.

### 1. Five layers, one direction of flow

`type.mjs` builds bottom-up: **`cat` → `makeVoices` → a treatment → `typeScale` → an emitter.** Nothing
skips a layer.

- **`cat(role, sizeKey, leading, weight, trackingEm, transform, box)`** is a thin constructor — it packages
  one voice's *params* into a record. `sizeKey` indexes the FIXED size table (`SIZES`, §3) — there is no
  `ratio`/`steps` argument anymore (2026-07-13 rewrite; sizes are no longer derived from a modular scale).
  `transform` defaults `"none"`; `box` DEFAULTS from the role (`ui`/`mono` ⇒ `true`, every other role ⇒
  `false`), overridable per voice (§2).
- **`makeVoices(o={})`** is the FACTORY: it returns the THIRTEEN voices as a `{name: catRecord}` object,
  every voice sharing the same structure while reading its knobs from `o` (each with a default, e.g.
  `o.dWeight ?? 700`). The knobs are prefixed by voice: Display `d-` (`dLead/dWeight/dTrack/dTransform`),
  Headline `h-`, Sub-heading `sh-`, Title `t-`, Sub-title `st-`, Lead `lead-`
  (`leadLead/leadWeight/leadTrack`), Body `b-` (`bLead/bWeight` — no tracking knob, always 0), Body-mono
  `bodyMono-`, Label `label-`, Label-mono `labelMono-`, Kicker `kick-`, Tiny `tiny-` (`tinyLead/tinyWeight`),
  Tiny-mono `tinyMono-`. A knob a treatment doesn't pass falls to the `makeVoices` default.
- **A treatment** is `{id, label, note, fonts, categories: makeVoices({...})}`. It supplies the **font
  palette** (`{display, heading, body, ui, mono}` — five roles) and CHARACTER knobs only — weight,
  tracking, leading, case. Treatments no longer differ in SIZE (§3); `note` is the human description the
  UI specimen reads.
- **`typeScale(config = {treatment, bodyBase, modeFactor?, overrides?, voices?, fonts?})`** resolves a
  treatment into `{treatment, label, fonts, roleOf, categories, styleNames?, weights?, voiceFonts?}` — it
  runs `buildCategory` over every voice and attaches `roleOf` (voice→font-role) and a copy of `fonts`. Five
  optional channels are per-kit overrides layered over the treatment, each **identity-gated**
  (absent/empty/non-finite/1 ⇒ byte-identical output): `overrides` = flat per-cell `"<voice>|<step>"`→size
  map (size only); `voices` = `{<voice>: {weight, leading, tracking, styleName, weights, font}}` reshaping
  a whole voice (weight/leading/tracking retune the character; `styleName`/`weights`/`font` are the
  Figma-facing name, sibling-weight, and per-voice-font channels — weight-ladders-and-labels.md,
  §7 below); `fonts` = `{<role>: family}` per-role custom family; **`modeFactor`** = the hierarchy-aware
  BREAKPOINT compression (§3). Unknown `treatment` → `TYPE_TREATMENTS[0]`; unknown/`0` `bodyBase` → the
  treatment's `Body.base`.
- **The emitters** (`typeTokensCSS`, `typeTokensBreakpointCSS`, `typeTokensDTCG`, `typeTokensFigmaModes`,
  `typeTokensFigmaPrimitives`) operate on the resolved `scale` — they never re-run the math, they read
  `scale.categories` / `scale.fonts` / `scale.roleOf` / `scale.weights` / `scale.voiceFonts`.

### 2. The thirteen named voices + the single 3-step ramp

The canonical taxonomy (`docs/reference/typography/README.md`, `type.mjs`'s own header comment): **Display
· Headline · Sub-heading · Title · Sub-title · Lead · Body · Body-mono · Label · Label-mono · Kicker ·
Tiny · Tiny-mono**. Every voice is a UNIFORM 3-step ramp — **SM · MD · LG** — there is no longer a
per-voice step count (the old `STEPS_3`/`STEPS_5`/`STEPS_UI` split, 3/5/8 steps by voice, is retired along
with the modular scale, 2026-07-13). `RANKS = ["SM","MD","LG"]` is the one ramp every voice rides.

**`roleOf`** comes from each `cat`'s first arg: Display→`display`; Headline, Sub-heading, Title→`heading`;
Lead, Body→`body`; Label, Tiny→`ui`; Body-mono, Label-mono, Kicker, Tiny-mono, **and Sub-title**→`mono`
(five voices share the mono role — Sub-title rides the mono FONT as a small alternate-face heading, not a
control label). The emitters use `roleOf` to point each voice's CSS/DTCG at the right `--font-{role}`.

**The `box` flag (flow ≠ font).** A per-voice `box` field decouples the presentation FLOW from the font
role. It DEFAULTS from the role (`ui`/`mono` ⇒ `box:true`), overridden `false` for **Sub-title, Tiny, and
Tiny-mono** — they ride a box-default role but are PROSE (a small heading, and a former-Caption prose
voice, respectively). The actual BOX voices (control/label text — emit `singleLineHeight`, flat
1.0×size paragraph rhythm) are exactly **Label · Body-mono · Label-mono · Kicker**; every other voice
(the other nine) is PROSE (wraps, no single-line height, reading paragraph factor). `singleLineHeight`
and the paragraph factor key on `box`, not on `role === "ui"||"mono"` (see §3).

**The mono-alias groups** — Body-mono aliases Body's own SM/MD/LG triplet, Label-mono and Kicker both
alias Label's, Tiny-mono aliases Tiny's: every `-mono` voice (and Kicker) is the SAME size register as its
non-mono sibling, dressed in the mono font — not a distinct scale of its own (§3).

### 3. The math — `buildCategory(name, p, factor, overrides, vp, compress)`

For each `[step, n]` in the voice's `steps` (`type.mjs`):

```
n              = the voice's FIXED literal size at this step (the SIZES table, below) — no exponent, no ratio
rawScaled      = compress ? compress(n · factor) : n · factor      # breakpoint compression, before rounding
derived        = Math.max(8, Math.round(rawScaled))                # the scaled fixed size — tracking STAYS on this
nice           = factor===1 && !compress ? derived : niceSize(derived)   # UNSCALED passes through EXACT; only a
                                                                          # genuinely scaled/compressed size re-snaps
size           = Math.round(ov) if a positive per-cell override exists, else nice
lineHeight     = Math.round(size · leading)           # re-derives from the RESOLVED size (tracks an override)
letterSpacing  = round(derived · trackingEm, 2)        # 2-dp px; optical — an override never moves tracking
leadingRatio   = leading                               # the EXACT, unrounded ratio — constant across every step
trackingRatio  = trackingEm                            # ditto — every relative-unit emitter reads THESE, never
                                                         # re-derives from the rounded lineHeight/letterSpacing
weight         = weight
textTransform  = p.transform || "none"
paragraphSpacing = Math.round(size · (p.box ? 1 : PARA_PROSE[p.role] ?? 0.75))   # BOX=flat label height; PROSE breathes
paragraphIndent  = 0
singleLineHeight = size                                # BOX voices ONLY
```

- **FIXED SIZE TABLE, not a modular scale (2026-07-13 rewrite).** `SIZES` in type.mjs is a literal
  `[SM, MD, LG]` px triplet per voice-scale (nine distinct triplets; the four mono-alias voices reuse
  their sibling's), shared identically across ALL 5 treatments — matching Material 3's own approach (one
  fixed scale; theme varies styling, not the numbers). Previously every voice derived `base · ratio^n`
  (a treatment's own base+ratio gave it a distinct scale feel); treatments now differ ONLY in
  font/weight/tracking/leading/case, never size.
- **`factor = bodyBase / 16`** (Body's own MD literal, `SIZES.Body[1]`) — the ONE global resize lever, in
  `typeScale`. It multiplies every voice's fixed size, so the whole system scales together. `DEFAULT_TYPE`
  pins `bodyBase: 16` to match.
- **The nice-number ladder ONLY engages when actually scaled or compressed** (`niceStep`/`niceSize`/
  `nextNice`) — an UNSCALED literal (factor 1, no breakpoint compression) passes through EXACTLY, never
  re-snapped to a different "nice" number (the 2026-07-13 fix: 120 must stay 120, not round to 128 —
  the coarser-as-size-grows bucketing would otherwise re-round an already-nice hand-authored literal for
  no reason). A genuinely scaled size still snaps (…12,13,14,15,16,18,20,22,24,28,32,36,40,44,48…,
  coarsening 1/2/4/8/16 by size band) and the monotonic bump (`nextNice`) still guards a rare adjacent-step
  collision, riding the derived ladder so a per-cell override never nudges its neighbours.
- **Breakpoint compression (`modeFactor`) — the hierarchy-aware law (2026-07-10, ratified).** `modeFactor`
  (optional, default 1; identity-gated) compresses each step's size BEFORE rounding/quantization: body-class
  text stays frozen across breakpoints while display-class type compresses. The factor names the
  compression at the TOP of the ramp (Tablet **5/6** · Mobile **2/3** canonical — e.g. Display 90 → 75 →
  60); each step's own factor interpolates in LOG-size space from ×1.0 at `bodyBase` (frozen) to
  ×`modeFactor` at the ramp's largest fixed size, so Body/Label/Kicker move ±0px while headings compress
  partially and Display fully. The concrete breakpoint set (Tablet 992px/Mobile 476px, the 5/6 and 2/3
  factors, plus Body's own small Mobile-only nudge) is wired app-side in `app.js`'s `_typeModeScales` /
  `_bodyMobileNudge` — the engine only knows the generic curve.
- **`leadingRatio`/`trackingRatio` — never re-derive a relative unit from a rounded absolute.** Each step
  carries the EXACT unrounded ratio alongside the rounded absolute `lineHeight`/`letterSpacing` — the
  absolute fields exist for LIVE on-screen rendering (whole-pixel-snapped); every RELATIVE-unit emitter
  (CSS ratio/em, DTCG, Figma %) reads the ratio field directly. Re-deriving from the rounded absolute
  (`round(size·leading)/size`) breaks ratio-constancy at most sizes — found live: one configured 112.5%
  leading rendering as 111.8%/114.3% at different steps in Figma's Styles panel. Figma's own Typography
  collection is the ONE deliberate exception — it emits absolute PIXELS instead of the ratio (a bound
  percent FLOAT displays as a bare, unit-less number in Figma's Properties panel, indistinguishable from a
  pixel value — see `maintaining-figma-plugins`'s `references/figma-styles-hard-constraints.md` §2).
- **`parseRatio` — leading/tracking accept a ratio OR a percent string.** A per-voice `config.voices[v]`
  override's `leading`/`tracking` may be the legacy unitless number (1.125 for leading, an em-fraction like
  -0.05 for tracking) OR a self-documenting percent STRING ("112.5%", "-5%") — `parseRatio` normalizes
  either to the same unitless ratio; anything else is ignored (falls to the treatment default).
- **The 8px floor** (`Math.max(8, …)`) keeps the smallest steps legible even after a small `bodyBase`.
- **Paragraph rhythm + `singleLineHeight` key on `box`, not role** — a BOX voice (Label · Body-mono ·
  Label-mono · Kicker) uses a flat `1.0×size` and emits `singleLineHeight`; a PROSE voice breathes at its
  reading factor from `PARA_PROSE` (`{display:0.7, heading:0.7, body:0.75}`, falling back to 0.75 for a
  mono/ui-font prose voice) and never emits `singleLineHeight`.
- **Sibling weights, the Figma-facing `styleName`, and per-voice weight labels** are a separate,
  fully-owned axis — `references/weight-ladders-and-labels.md` (the two-tier ladder, the fixed
  Regular/Medium/Semi-bold face mapping for body-class voices, the `•`/`-single` naming convention). Don't
  duplicate that model here.
- **Per-voice FONT override (`config.voices[v].font`, TKT-0002)** — the escape hatch off the five shared
  roles: any of the 13 voices may carry its own family instead of riding its role's default (e.g.
  Sub-heading no longer forced to share Headline's font). `resolvedFontFor(scale, voice)` is the ONE
  resolution point — every emitter and the Figma style planner call it, never `scale.fonts[role]` directly,
  so an override can never be silently bypassed by a new call site. Identity-gated like the other channels:
  absent ⇒ no `voiceFonts` key, byte-identical output.

### 4. Case is per-treatment, not a blanket rule

`textTransform` comes from each voice's `transform` arg. The standing rules:

- **Sub-heading** and **Kicker** are the two genuine UPPERCASE "caps voices" — `"uppercase"` is hardcoded in
  `makeVoices` for both. They track POSITIVE so small caps open up.
- **Display** defaults to title/sentence case (`o.dTransform ?? "none"`). Only the **Brutalist/`statement`**
  treatment passes `dTransform:"uppercase"` — the one earned ALL-CAPS display. The test asserts *exactly
  one* treatment sets an uppercase Display, and that Display tracks NEGATIVE (big caps tighten).
- Everything else (Headline, Title, Sub-title, Body, Label, Tiny…) is sentence case.

### 5. The five treatments — voice, not just a font swap

Each treatment expresses a distinct voice through case + weight contrast + tracking + leading (fonts in
`display/heading/body/ui/mono` order) — **never scale** (2026-07-13; size is now the shared fixed table,
§3):

| id | label | fonts | the move |
|---|---|---|---|
| `product` | Product / Lifestyle | Inter Tight · Inter Tight · Inter · Inter · JetBrains Mono | calm geometric sans, title-case display, the everyday voice |
| `luxury` | Luxury / Premium | Source Serif 4 · Source Serif 4 · Inter · Inter · JetBrains Mono | high-contrast serif set LIGHT (`dWeight 400`), airy prose, wide-tracked labels — restraint over shout |
| `editorial` | Editorial / Magazine | Source Serif 4 · Inter Tight · Inter · JetBrains Mono · JetBrains Mono | serif headlines in title case, tight sans subheads, sans long-form body, mono metadata (UI rides mono) |
| `technical` | Technical / Data | Inter (display·heading·body) · JetBrains Mono (ui+mono) | mono-forward, dense, tight leading, restrained character — display reads as data |
| `statement` | Brutalist / Statement | Inter Tight · Inter Tight · Inter · Inter · JetBrains Mono | one heavy grotesque (`dWeight 900`), the earned ALL-CAPS display, tight tracking |

The WEIGHT + tracking + leading + case relationships are the product; fonts are swappable (free families
only). Note `technical` and `editorial` map the **UI** voice to JetBrains Mono (their `fonts.ui` is the
mono family), while `mono` is always JetBrains Mono. `statement`'s Body/Label core weights are capped at
440 (not their character weight) so the body-class ladder still snaps to Regular — the brutalist heft
lives in the display/heading/kicker weights instead (weight-ladders-and-labels.md).

### 6. The emitter shapes

All five take a resolved `scale`; the CSS/DTCG dimension emitters take `{unit}` — `dimUnit(px, unit)`
formats a px value as `px` (default/identity), or `rem`/`em` = px÷16 with trailing zeros stripped.
Leading/tracking are ALWAYS relative in CSS/DTCG (never px — see §3's `leadingRatio`/`trackingRatio` law);
Figma's type/ variables (the merged breakpoint-moded Geometry collection, TKT-0009) are the one PIXEL exception.

- **`typeTokensCSS(scale, {unit, prefix})`** → `:root` custom props (`--font-{role}: '{family}'` — QUOTED;
  a `--font-voice-{voice}` prop per voice via `resolvedFontFor`; per-step
  `--{prefix}-{voice}-{step}-{size,line,tracking,weight,para}` — `line` is the unitless `leadingRatio`,
  `tracking` is `{em}`; `line-single` on BOX voices only) PLUS a utility class per step, plus one
  `--{prefix}-{voice}-weight-{slug}` prop per sibling weight (`scale.weights`, once per voice not per step).
- **`typeTokensBreakpointCSS(modes, {unit, prefix, desktopMinWidth=1280})`** → one SEPARATE, self-contained
  file PER breakpoint mode (`modes = [{name, minWidth, scale}]`) — NOT one @media-embedded stylesheet
  (#264). `typeTokensCSS(baseScale)` is the complete, unconditional base file (the designed/Desktop scale);
  each entry here is bounded on BOTH ends except the NARROWEST mode (open below). Sorted DESCENDING by
  minWidth; load order never matters. `modes = []` ⇒ `[]`.
- **`typeTokensDTCG(scale, {unit})`** → `{fontFamily, typography, weights?}`: `fontFamily` is keyed by
  VOICE (13, via `resolvedFontFor`), `typography` is a composite `{$type:"typography", $value:{fontFamily,
  fontSize, lineHeight (unitless number), letterSpacing (em string), fontWeight (number), textCase,
  paragraphSpacing, paragraphIndent, singleLineHeight?}}` per voice/step, and `weights` (present only when
  `scale.weights` exists) is a `{$type:"fontWeight", $value}` group per voice.
- **`typeTokensFigmaModes(baseScale, modes, {baseName, baseLast})`** → ONE Figma variable collection
  (`"Typography"`) with one MODE per breakpoint and five FLOAT variables per voice×step
  (`<voice>/<step>/{size,lineHeight,letterSpacing,weight,paragraphSpacing}` — ALL pixels, per §3's Figma
  exception), plus `singleLineHeight` on the BOX voices where present. `disambiguateModeNames` renames a
  breakpoint that clashes with the reserved base-mode name or another breakpoint. `modes = []` ⇒ a single
  base mode equal to the base scale (identity).
- **`typeTokensFigmaPrimitives(scale)`** → the COMPANION "Font Primitives" collection: distinct font
  families deduped into `family/<role>` STRING primitives (plus `family/voice/<voice>` for a family reached
  only via a per-voice override), a `font/<voice>` ALIAS per voice, a `weight/<voice or voice/slug>` FLOAT
  primitive (core + one per sibling), and — when the kit names a custom `styleName` (a non-variable face) —
  a matching `weight-style/…` STRING primitive, templated per `siblingStyleName` so a sibling's style name
  follows the SAME naming convention as the core (weight-ladders-and-labels.md). Single `"Value"` mode
  (families/weights don't vary by breakpoint). Import-artifact only — the in-Figma apply path never
  consumes it.

### 7. The font-rendering path (offline + Figma plugin)

The engine names families as strings; the *rendering* of those families is a separate concern:

- **`src/ui/type-fonts.js`** exports one thing — `TYPE_FONTS_CSS`, a string of four base64-woff2
  `@font-face` rules (Inter, Inter Tight, Source Serif 4, JetBrains Mono, Latin subset). It is a COMMITTED
  GENERATED asset; the header says "DO NOT EDIT".
- **`scripts/gen-type-fonts.mjs`** fetches each family's Latin woff2 subset from Google's css2 endpoint and
  writes `type-fonts.js`. Its `FAMILIES` array (name + variable `wght` axis) is the source of truth for
  *which* faces are embedded. It is **manual** (`npm run gen:type-fonts`), not in `build`/`test`.
- **`ensureTypeFonts()`** (in `src/ui/app.js`) injects the `<style>` once and eagerly registers all four via
  `new FontFace(...)` + `document.fonts.add` + `load()` (the `<style>` `@font-face` path is lazy — a face
  outside the current treatment would flash the fallback on first use without the eager activation). Data
  URIs, so still offline-safe and store-compliant (`networkAccess:"none"`).
