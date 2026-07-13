# Typography tokens — reference shape

`typography.tokens.json` is a **frozen historical snapshot** of the target output shape (a real
Figma-exported token set, kept here as an example of the DTCG shape) — it predates the 2026-07-13
voice-taxonomy and fixed-size-table rewrite below and is not kept in lockstep with the engine; read
`src/engine/type.mjs` for the current, live source of truth. The type analog of the color engine — a
few parameters → a systematic type scale → exported as [DTCG](https://tr.designtokens.org/) tokens
(and, in the plugin, Figma text styles). Font-role names are generic (no brand/foundry specifics).

## Structure

| Top-level key | What it is |
|---|---|
| `Number` | a base numeric token |
| `Font Family` | the named **font roles** — `Font: UI`, `Font: Display`, `Font: Code` (mono) |
| `Font Specs` | the **scales**, grouped by role category (below) |
| `$extensions` | Figma mode metadata |

### `Font Specs` — the eleven named voices

The engine implements this as **eleven voices**: Display · Headline · Sub-heading · Title ·
Sub-title · Lead · Body · Code · Label · Kicker · Tiny. Each is a size ramp, each step carrying
`Size · Line Height · Letter Spacing · Weight · Case · Paragraph Spacing · Indent`.

**2026-07-13 — size is now a FIXED, hand-authored table**, not a modular scale: every voice is a
uniform 3-step **SM · MD · LG** ramp, with literal px values shared identically across all 5
treatments (previously each voice derived from its own `base × ratio^step`, with step counts varying
5/3/8 by voice). Treatments now differ only in font/weight/tracking/leading/case, never size.

| Voice | Font role | Case | Letter-spacing character |
|---|---|---|---|
| **Display** | display | sentence/title (UPPERCASE only in Brutalist) | negative, tightens with size |
| **Headline** | heading | sentence | ~0 |
| **Sub-heading** | heading | **UPPERCASE** | wide positive (caps open up) |
| **Title** | heading | sentence | slight negative |
| **Sub-title** | **mono, prose** | sentence | slight positive |
| **Lead** | body | sentence | slight negative |
| **Body** | body | sentence | 0 |
| **Code** | **mono** (pegged to Body's sizes) | sentence | 0 |
| **Label** | ui | sentence | small positive (optical) |
| **Kicker** | **mono** (pegged to Label's sizes) | **UPPERCASE** | very wide positive |
| **Tiny** | **ui, prose** | sentence | 0 |

33 steps in all (11 voices × 3). Each treatment supplies the font palette + a few character knobs (a
shared `make11()` factory); the FIXED SIZES table gives every step's size; the engine still derives
leading, optical tracking, weight, and case per treatment. Code and Kicker use the mono role, aliasing
Body's and Label's own size triplets respectively (same numbers, mono font only) — they are not a
distinct size register. Sub-title also rides the mono role but is prose (`box:false`), not a control
label. Sub-heading + Kicker are the uppercase caps voices (Display is uppercase only in the Brutalist
treatment).

## The system relationships (what the generator derives)

Unlike color (`{hue, chroma, distribution}` → an even tonal ramp derived from a formula), type SIZE is
now a fixed literal table (`SIZES` in `src/engine/type.mjs`); the rest still derives from
`{ leading per category, weight ramp, optical tracking coefficient, font roles }`:

- **Size** = a **fixed literal per voice+step** (e.g. Display SM/MD/LG = 72/96/120), identical across
  every treatment. `bodyBase` (default 15 — Body/Label's own fixed MD literal) still scales the WHOLE
  table proportionally (`factor = bodyBase/15`) — a larger/smaller `bodyBase` grows/shrinks every voice
  together, snapping back onto a nice-number ladder when the factor isn't 1. Ratio (`base × ratio^step`)
  is **retired** — it no longer means anything to override per voice.
- **Letter Spacing** = `f(size)` — negative to *tighten* large display, positive to *loosen* small label text (optical).
- **Multi-line Height** = `size × leading`, where **leading is a per-role constant** (the
  `font.modes.json` design intent). The reading/display voices are held *uniform across all treatments* —
  treatments express voice through font, weight, tracking, and case, not leading:
  - **display — 0.8** (large type sets *tight*, leading < 1)
  - **headline · sub-heading · title — 1.125**
  - **body — 1.5** · **lead — 1.4** · **sub-title — 1.3** · **tiny — 1.5**
  - **kicker — 1.4** · **code — ~1.5**
  - **label — ~1.4** (the one voice that keeps a small per-treatment lever, `1.35–1.45`)
- **Single-line Height** = `size × 1.0` — the control-text height, emitted on the **box** voices only
  (**Label · Code · Kicker**). Keyed on a per-voice `box` flag, not the role — so Tiny/Sub-title, which
  ride the ui/mono FONT but are prose (`box:false`), do NOT get a single-line height.
- **Weight** ramps by role — Display `700` (`900` Brutalist), Headline `620–800`, Sub-heading · Kicker
  `~500–700`, Title `650`, Sub-title `500`, Lead `400` (`300` Luxury), Body `440`, Code `460`, Label
  `480`, Tiny `440`.

A set of **treatments** (Product/Lifestyle, Luxury, Editorial, Technical/Data, Brutalist) seed these
character params, exactly as the color "Color Categories" presets seed palette params — but no longer
seed size at all.

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
Display/Headline/Body/Label/Kicker) ships its siblings pre-populated at generation time
(`scripts/gen-categories.mjs#design5ToTypeConfig`), computed from that slot's own designed weight — so
opening any curated palette already exports emphasis-ready text styles, not just a single core weight.

> Status: **shipped** — `src/engine/type.mjs` (`typeScale` + `typeTokensCSS`/`typeTokensDTCG`) and the Typography editor section generate these tokens.
