# Typography tokens — reference shape

`typography.tokens.json` is the **target output shape** for the typography feature: the type
analog of the color engine — a few parameters → a systematic, harmonious type scale → exported as
[DTCG](https://tr.designtokens.org/) tokens (and, in the plugin, Figma text styles). It's a real
Figma-exported token set, kept here as the canonical example. The engine that generates it ships in
`src/engine/type.mjs`. Font-role names are
generic (no brand/foundry specifics).

## Structure

| Top-level key | What it is |
|---|---|
| `Number` | a base numeric token |
| `Font Family` | the named **font roles** — `Font: UI`, `Font: Display`, `Font: Code` (mono) |
| `Font Specs` | the **scales**, grouped by role category (below) |
| `$extensions` | Figma mode metadata |

### `Font Specs` — the eleven named voices

The engine implements this as **eleven voices** (ADR-013 — the original seven plus four **editorial**
voices: Lead · Quote · Caption · Legal): each is a size ramp, each step carrying `Size · Line Height ·
Letter Spacing · Weight · Case · Paragraph Spacing · Indent`.

| Voice | Steps | Font role | Case | Letter-spacing character |
|---|---|---|---|---|
| **Display** | `XS … XL` (5) | display | sentence/title (UPPERCASE only in Brutalist) | negative, tightens with size |
| **Heading** | `XS … XL` (5) | heading | sentence | ~0 |
| **Sub-heading** | `XS … XL` (5) | heading | **UPPERCASE** | wide positive (caps open up) |
| **Kicker** | `XS … XL` (5) | **mono** | **UPPERCASE** | very wide positive |
| **Lead** | `SM · MD · LG` (3) | body | sentence | slight negative |
| **Body** | `XS … XL` (5) | body | sentence | 0 |
| **Quote** | `SM · MD · LG` (3) | **heading** (display cut) | sentence | slight negative |
| **Caption** | `SM · MD · LG` (3) | **ui font, prose** | sentence | 0 |
| **UI** | `3XS … 2XL` (8) | ui | sentence | small positive (optical) |
| **Code** | `3XS … 2XL` (8) | **mono** | sentence | 0 |
| **Legal** | `SM · MD · LG` (3) | **ui font, prose** | sentence | 0 |

53 steps in all. Each treatment supplies the font palette + a few character knobs (a shared `make11()`
factory); the engine generates every step's size (modular scale), leading, optical tracking, weight, and
case. Kicker + Code use the mono role; **Quote** rides the heading role so it inherits each treatment's
display face (a serif pull-quote in the serif treatments); **Caption + Legal** ride the ui FONT but are
**prose** (the `box:false` flow — reading leading, no single-line height). Sub-heading + Kicker are the
uppercase caps voices (Display is uppercase only in the Brutalist treatment).

## The system relationships (what the generator derives)

Mirroring color (`{hue, chroma, distribution}` → even tonal ramp), type derives from
`{ base size, modular ratio per category, leading per category, weight ramp, optical tracking
coefficient, font roles }`:

- **Size** = a **modular scale** `base × ratio^step`, then snapped to a nice-number ladder. The ratio is
  per-role/per-treatment: `1.125` (UI · Code) through `1.2–1.25` (most voices) up to `1.5` (the Brutalist
  display) — not one global ratio.
- **Letter Spacing** = `f(size)` — negative to *tighten* large display, positive to *loosen* small UI text (optical).
- **Multi-line Height** = `size × leading`, where **leading is a per-role constant** (the
  `font.modes.json` design intent). The reading/display voices are held *uniform across all treatments* —
  treatments express voice through font, weight, tracking, and scale, not leading:
  - **display — 0.8** (large type sets *tight*, leading < 1)
  - **heading · sub-heading — 1.125**
  - **body — 1.5** · **Lead — 1.4** · **Quote — 1.35** · **Caption · Legal — 1.5** (the editorial voices)
  - **Kicker — 1.4** · **code — ~1.5**
  - **UI — ~1.4** (the one voice that keeps a small per-treatment lever, `1.35–1.45`)
- **Single-line Height** = `size × 1.0` — the control-text height, emitted on the **box** voices only
  (**UI · Code · Kicker**). Keyed on a per-voice `box` flag, not the role — so Caption/Legal, which ride the
  ui FONT but are prose (`box:false`), do NOT get a single-line height (ADR-013).
- **Weight** ramps by role — Display `700` (`900` Brutalist), Heading `620–800`, Sub-heading · Kicker `~600`,
  Lead `400` (`300` Luxury), Body `440`, Quote `450`, Caption · Legal `440`, UI `480`, Code `460`.

A set of **treatments** (Product/Lifestyle, Luxury, Editorial, Technical/Data, Brutalist) seed these
params, exactly as the color "Color Categories" presets seed palette params.

## Sibling weights — adjacent emphasis variants

A voice's core weight is one number; real UIs also need a *nearby* weight for inline emphasis (a bold
word in body text, a medium label next to a regular one) without inventing an unrelated weight.
`siblingWeightDefaults(core)` (`src/engine/type.mjs`) derives exactly that: the **two ladder-adjacent
stops** (immediate neighbors on the 9-stop `WEIGHT_LADDER` — 100…900 — never a skipped step), stepping
from the core **toward the ladder's center** (the 400–600 band), nearer neighbor first — `Regular 400`
→ `Medium 500, Semi-bold 600`; `Bold 700` → `Semi-bold 600, Medium 500`. The core itself is never
included.

A voice opts in by carrying `weights: [{name, weight}, …]` (`config.voices[voice].weights` in
`typeScale`) — absent/empty is the identity gate (no `weights` key on the scale, every emitter
byte-identical). Once set, siblings emit everywhere the core does: a `--type-{voice}-weight-{slug}` CSS
custom prop, a DTCG `weights.{voice}.{Name}` `fontWeight` token, a `weight/{voice}/{slug}` Font
Primitives variable, and — the reason this exists — a **sibling Figma text style** per variant
(`Voice/step/Name`, e.g. `Body/md/Semi-bold`, alongside the bare `Voice/step` core; see
`figma/binder/style-plan.mjs`). Every Color Categories preset (336 palettes × the 5 designed roles —
Display/Heading/Body/UI/Kicker) ships its siblings pre-populated at generation time
(`scripts/gen-categories.mjs#design5ToTypeConfig`), computed from that slot's own designed weight — so
opening any curated palette already exports emphasis-ready text styles, not just a single core weight.

> Status: **shipped** — `src/engine/type.mjs` (`typeScale` + `typeTokensCSS`/`typeTokensDTCG`) and the Typography editor section generate these tokens.
