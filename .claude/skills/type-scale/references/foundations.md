## Foundations — the model a type-engine change leans on

The load-bearing ideas. If a change feels like it needs a hand-authored size or a new branch, you are
probably fighting one of these. The full *why* (the eleven voices, the system relationships, the leading
bands, the target token shape) is owned by `docs/reference/typography/README.md` — this file is only the mental
model the *procedure* assumes.

### 1. Five layers, one direction of flow

`type.mjs` builds bottom-up: **`cat` → `make11` → a treatment → `typeScale` → an emitter.** Nothing skips a
layer.

- **`cat(role, base, ratio, leading, weight, trackingEm, steps, transform, box)`** is a thin
  constructor — it just packages one voice's *params* into a record. No sizes are computed here. `steps`
  defaults to `STEPS_5`, `transform` to `"none"`, and `box` DEFAULTS from the role (`ui`/`mono` ⇒ `true`,
  every other role ⇒ `false`) — the presentation-flow flag the math keys on (see §2 + §3), overridable.
- **`make11(o={})`** is the FACTORY: it returns the eleven voices as a `{name: catRecord}`
  object, every voice sharing the same STRUCTURE while reading its knobs from `o` (with a default per knob,
  e.g. `o.dRatio ?? 1.25`). The knobs are prefixed by voice: Display `d-` (`dBase/dRatio/dLead/dWeight/
  dTrack/dTransform`), Heading `he-`, Sub-heading `hc-`, Kicker `eye-`, Lead `lead-`
  (`leadWeight/leadLead/leadTrack`), Body `b-`, Quote `quote-` (`quoteRatio/quoteLead/quoteWeight/quoteTrack`),
  Caption `cap-` (`capLead/capWeight`), UI `ui-`, Code `code-`/`codeWeight`/`codeTrack`, Legal `legal-`
  (`legalLead/legalWeight`). A knob a treatment doesn't pass falls to the `make11` default.
- **A treatment** is `{id, label, note, fonts, categories: make11({...})}`. It supplies
  the **font palette** (`{display, heading, body, ui, mono}` — five roles) and a few character knobs; the
  shared `make11` structure does the rest. `note` is the human description the UI specimen reads.
- **`typeScale(config = {treatment, bodyBase, overrides?, voices?, fonts?})`** resolves a treatment into
  the output object `{treatment, label, fonts, roleOf, categories}` — it runs `buildCategory` over every
  voice and attaches `roleOf` (voice→font-role) and a copy of `fonts`. The three optional channels are
  per-kit overrides layered over the treatment, each **identity-gated** (absent/empty/non-finite ⇒
  byte-identical output): `overrides` = flat per-cell `"<voice>|<step>"`→size map (size only); `voices` =
  `{<voice>:{weight, tracking, leading, ratio}}` reshaping a whole voice; `fonts` = `{<role>: family}`
  per-role custom family (blank/non-string ignored). Unknown `treatment` → `TYPE_TREATMENTS[0]`;
  unknown/`0` `bodyBase` → the treatment's `Body.base`.
- **The emitters** (`typeTokensCSS`, `typeTokensBreakpointCSS`, `typeTokensDTCG`, `typeTokensFigmaModes`)
  operate on the resolved `scale` — they never re-run the math, they read `scale.categories` /
  `scale.fonts` / `scale.roleOf`.

### 2. The eleven named voices + the three step sets

The canonical taxonomy (docs/reference/typography): **Display · Heading · Sub-heading · Kicker · Lead ·
Body · Quote · Caption · UI · Code · Legal** — Sub-heading + Kicker are LABELS (not headings), which is why
they lost the "Heading" prefix; the four editorial voices (Lead · Quote · Caption · Legal) are ADR-013.
Three step ramps (`STEPS_3`/`STEPS_5`/`STEPS_UI` in type.mjs):

- **`STEPS_3`** = `[["SM",−1],["MD",0],["LG",1]]` (3) — the lean editorial ramp: Lead, Quote, Caption, Legal.
  These voices realistically use one-or-two registers, so they skip the full XS–XL (MD = the voice's base).
- **`STEPS_5`** = `[["XS",−2],["SM",−1],["MD",0],["LG",1],["XL",2]]` — Display, Heading, Sub-heading, Kicker, Body.
- **`STEPS_UI`** = `[["3XS",−4],["2XS",−3],["XS",−2],["SM",−1],["MD",0],["LG",1],["XL",2],["2XL",3]]` (8) —
  UI and Code. (53 steps across the eleven voices in all.)

`MD` is always exponent 0, i.e. the voice's *base* size. The exponent is the step's signed distance from the
base, so the same modular ratio governs both directions.

**The role map (`roleOf`)** comes straight from each `cat`'s first arg: Display→`display`; Heading,
Sub-heading, and **Quote** → `heading` (so the pull-quote inherits each treatment's display face — a serif
quote in the serif treatments, a grotesque in Brutalist); **Lead** + Body → `body`; UI, **Caption**, and
**Legal** → `ui`; and the two mono voices — **Kicker and Code — →`mono`** (both `cat("mono", …)`). That mono
pairing is deliberate: the kicker overline and code both want the monospaced face. The emitters use `roleOf`
to point each voice's CSS/DTCG at the right `--font-{role}`.

**The `box` flag (flow ≠ font).** A per-voice `box` field decouples the presentation FLOW from the font
role. It DEFAULTS from the role (`ui`/`mono` ⇒ `box:true`; every other role ⇒ `false`), so the seven
original voices are byte-identical. A BOX voice is CONTROL/label text — it emits a `singleLineHeight` and
uses a flat label-height paragraph factor; a PROSE voice wraps (no single-line height, reading paragraph
factor). The override that matters: **Caption + Legal ride the `ui` FONT but set `box:false`** — they are
prose (reading leading ~1.5), NOT the box/control treatment the UI voice itself gets. `singleLineHeight` and
the paragraph factor key on `box`, NOT on `role === "ui"||"mono"` (see §3).

### 3. The math — `buildCategory(name, p, factor, overrides, vp)`

For each `[step, n]` in the voice's `steps` (in type.mjs):

```
ratio/weight/leading/trackingEm = vp.{ratio,weight,leading,tracking} if finite, else the treatment's  # per-voice channel
rawModular    = p.base · factor · ratio ** n
derived       = Math.max(8, Math.round(rawModular))   # the modular-scale size (8px floor) — tracking stays on THIS
nice          = niceSize(derived)                     # the "nice number" ladder; bumped past prev if it collides
size          = Math.round(ov) if a positive per-cell override exists, else nice   # the exact manual escape
lineHeight    = Math.round(size · leading)            # re-derives from the RESOLVED size (tracks an override)
letterSpacing = round(derived · trackingEm, 2)        # 2-dp px; optical — an override never moves tracking
weight        = weight                                # flat across steps
textTransform = p.transform || "none"
paragraphSpacing = round(size · (p.box ? 1 : PARA_PROSE[role] ?? 0.75))   # BOX = flat label height; PROSE breathes
paragraphIndent  = 0                                  # rhythm tracks the resolved size
singleLineHeight = size                               # BOX voices ONLY (control-text intent, leading 1.0)
```

- **Modular scale**: `size = base · ratio^n`. A `ratio` of 1.2 (Minor Third) means each step is 20% larger
  than the last; `TYPE_RATIOS` in type.mjs names the classic musical ratios for the UI's picker
  (minor-second 1.067 … golden 1.618). The `LG/MD ≈ ratio` assert allows quantization slack.
- **The nice-number ladder** (`niceStep`/`niceSize`/`nextNice`): emitted sizes read as FAMILIAR values
  (…12,13,14,15,16,18,20,22,24,28,32,36,40,44,48…) — granularity coarsens as size grows (step 1 ≤16,
  2 ≤24, 4 ≤48, 8 ≤96, else 16), and `nextNice` bumps a rare adjacent-step collision so the quantized ramp
  stays strictly increasing. The bump rides the DERIVED ladder, so a per-cell override never nudges its
  neighbours. Consequence: MD is the *snapped* base (product Display base 54 emits 56), so "MD = base" holds
  only where the base is already on the ladder — the pinned invariant is **Body MD = `bodyBase`** plus
  every-size-on-the-ladder + strictly-increasing (asserted per treatment × bodyBase in `test/engine/type.mjs`).
  The ladder is also what keeps rem exports clean (16px→1rem, 24px→1.5rem).
- **`factor = bodyBase / Body.base`** (in `typeScale`) — the ONE global resize lever. It multiplies every
  voice's base, so the whole system scales together while every ratio is preserved. `bodyBase 20` → Body MD
  20, and Display XL grows proportionally (the bodyBase-scaling assert). Resize via `bodyBase`, never by
  editing individual bases.
- **Optical letter-spacing**: `trackingEm` is an em coefficient, so `letterSpacing` scales WITH the size.
  Negative `trackingEm` (Display) tightens, and tightens *more* at larger steps; positive (UI, the caps
  Headings) loosens. This is why Display.XL is more negative than Display.XS (the tracking-scales-with-size
  assert). Tracking is computed from the DERIVED modular size, so a per-cell size override changes size +
  line-height only — the ratified "size lever; line re-derives; tracking/weight unchanged" rule (pinned by
  the Display-override asserts, which use a non-zero tracking voice).
- **The two override channels** (both identity-gated, see §1): per-cell `overrides` moves ONE step's size;
  per-voice `vp` (from `config.voices`) retunes a WHOLE voice's ratio/weight/leading/tracking — like a
  per-palette Hue. Other voices stay byte-identical.
- **The 8px floor** (`Math.max(8, …)`) keeps the smallest UI/Code steps legible even after a small `bodyBase`.
- **Paragraph rhythm keys on `box`, not role.** `paragraphSpacing = round(size · (box ? 1 : PARA_PROSE[role] ??
  0.75))` — a BOX voice (control/label text: UI · Code · Kicker) uses a flat `1.0×size` (its "paragraph" is its
  own height); a PROSE voice breathes at its reading factor from `PARA_PROSE` (`{display:0.7, heading:0.7,
  body:0.75}`), and a ui-FONT prose voice — Caption · Legal — falls back to `0.75`. `singleLineHeight`
  (= size, leading 1.0 — the control-text intent) is emitted for the BOX voices ONLY, never for the ui-font
  prose voices. (The constant is `PARA_PROSE`, renamed from `PARA_FACTOR`.)

### 4. Case is per-treatment, not a blanket rule

`textTransform` comes from each voice's `transform` arg. The standing rules:

- **Sub-heading** and **Kicker** are the two genuine UPPERCASE "caps voices" — `"uppercase"`
  is hardcoded in `make11` for both. They track POSITIVE so small caps open up.
- **Display** defaults to title/sentence case (`o.dTransform ?? "none"`). Only the **Brutalist/`statement`**
  treatment passes `dTransform:"uppercase"` — the one earned ALL-CAPS display. The test
  asserts *exactly one* treatment sets an uppercase Display (the exactly-one-uppercase-Display assert), and
  that Display tracks NEGATIVE (big caps tighten).
- Everything else (Heading, Body, UI, Code) is sentence case.

### 5. The five treatments — voice, not just a font swap

Each treatment expresses a distinct voice through case + weight contrast + tracking + leading + scale
(fonts in `display/heading/body/ui/mono` order):

| id | label | fonts | the move |
|---|---|---|---|
| `product` | Product / Lifestyle | Inter Tight · Inter Tight · Inter · Inter · JetBrains Mono | calm geometric sans, title-case display, the everyday voice |
| `luxury` | Luxury / Premium | Source Serif 4 · Source Serif 4 · Inter · Inter · JetBrains Mono | high-contrast serif set LIGHT (`dWeight 400`) and large (`dBase 76`), airy prose, wide-tracked labels |
| `editorial` | Editorial / Magazine | Source Serif 4 · Inter Tight · Inter · JetBrains Mono · JetBrains Mono | serif headlines, tight sans subheads, sans long-form body, mono metadata (UI rides mono) |
| `technical` | Technical / Data | Inter (display·heading·body) · JetBrains Mono (ui+mono) | mono-forward, dense, tight leading, restrained scale — display reads as data |
| `statement` | Brutalist / Statement | Inter Tight · Inter Tight · Inter · Inter · JetBrains Mono | one heavy grotesque (`dWeight 900`), ALL-CAPS display, dramatic jumps (`dRatio 1.5`) |

The SCALE + tracking + weight + leading + case relationships are the product; fonts are swappable (free
families only). Note `luxury`'s Display base is 76 (not the `make11` default 60) — treatments override knobs.
Note also `technical` and `editorial` map the **UI** voice to JetBrains Mono (their `fonts.ui` is the mono
family), while `mono` is always JetBrains Mono.

### 6. The emitter shapes

All four take a resolved `scale`; the dimension emitters take `{unit}` — `dimUnit(px, unit)` formats a px
value as `px` (default/identity), or `rem`/`em` = px÷16 with trailing zeros stripped (the nice ladder keeps
these clean: 16px→1rem, 24px→1.5rem).

- **`typeTokensCSS(scale, {unit})`** → `:root` custom props (`--font-{role}: '{family}'` — QUOTED; per-step
  `--type-{voice}-{step}-{size,line,tracking,weight}`) PLUS a utility class per step
  (`.type-display-xl { font-family: var(--font-display); … text-transform: … }`). The class points at the
  voice's role via `roleOf`; `kebab()` lowercases + dash-joins voice/step names.
- **`typeTokensBreakpointCSS(modes, {unit, desktopMinWidth=1280})`** → one SEPARATE, self-contained file
  PER breakpoint mode (`modes = [{name, minWidth, scale}]`) — NOT one @media-embedded stylesheet (#264).
  `typeTokensCSS(baseScale)` is the complete, unconditional base file (the designed/Desktop scale, no
  media query — a consumer can drop it in alone and be done); each entry here is an independent bolt-on:
  `@media (min-width: …) and (max-width: …) { :root { …that mode's vars… } }`, bounded on BOTH ends except
  the NARROWEST mode, which stays open below (`max-width` only, so the smallest viewports still land
  somewhere). Bounds mean load order never matters — add any subset, any order. Returns
  `[{name, minWidth, css}]`, sorted DESCENDING by minWidth; a mode without a positive `minWidth` is
  skipped; `modes = []` ⇒ `[]`.
- **`typeTokensDTCG(scale, {unit})`** → `{fontFamily, typography}`: a `fontFamily` group
  (one `{$type:"fontFamily",$value}` per role) and a `typography` group of composite
  `{$type:"typography",$value:{fontFamily, fontSize, lineHeight, letterSpacing, fontWeight:number,
  textCase, paragraphSpacing, paragraphIndent}}` tokens per voice/step (the W3C-DTCG shape). Dimensions are
  unit STRINGS (default px, e.g. `"16px"`); `fontWeight` is a NUMBER; `textCase` carries `textTransform`;
  `fontFamily` is the role's family string (`scale.fonts[role]`).
- **`typeTokensFigmaModes(baseScale, modes)`** → ONE Figma variable collection (`"Typography"`) with
  `modes: ["Base", …breakpoints]` and five FLOAT variables per voice×step
  (`<voice>/<step>/{size,lineHeight,letterSpacing,weight,paragraphSpacing}` — weight too; Figma variables
  are numbers), plus `singleLineHeight` on the box voices (UI · Code · Kicker) where present.
  `disambiguateModeNames` renames a breakpoint named "Base" or a duplicate (`"Wide 2"`) so Figma never
  rejects the import. `modes = []` ⇒ a single "Base" mode equal to the base scale (identity).

### 7. The font-rendering path (offline + Figma plugin)

The engine names families as strings; the *rendering* of those families is a separate concern:

- **`src/ui/type-fonts.js`** exports one thing — `TYPE_FONTS_CSS`, a string of four base64-woff2
  `@font-face` rules (Inter, Inter Tight, Source Serif 4, JetBrains Mono, Latin subset). It is a COMMITTED
  GENERATED asset; the header says "DO NOT EDIT".
- **`scripts/gen-type-fonts.mjs`** fetches each family's Latin woff2 subset from Google's css2 endpoint and
  writes `type-fonts.js`. Its `FAMILIES` array (name + variable `wght` axis — Inter/Inter Tight/Source Serif
  4 at `wght@400..900`, JetBrains Mono at `wght@400..800`) is the source of truth for *which* faces are
  embedded. It is **manual** (`npm run gen:type-fonts`), not in `build`/`test`.
- **`ensureTypeFonts()`** (in `src/ui/app.js`) injects the `<style>` once and eagerly registers all four
  via `new FontFace(...)` + `document.fonts.add` + `load()` (the `<style>` `@font-face` path is lazy — a
  face outside the current treatment would flash the fallback on first use without the eager activation).
  Data URIs, so still offline-safe and store-compliant (`networkAccess:"none"`).