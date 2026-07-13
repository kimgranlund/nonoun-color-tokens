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

### `Font Specs` — the thirteen named voices

The engine implements this as **thirteen voices**: Display · Headline · Sub-heading · Title ·
Sub-title · Lead · Body · Body-mono · Label · Label-mono · Kicker · Tiny · Tiny-mono. Each is a size
ramp, each step carrying `Size · Line Height · Letter Spacing · Weight · Case · Paragraph Spacing ·
Indent`.

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
| **Body-mono** | **mono** (pegged to Body's sizes) | sentence | 0 |
| **Label** | ui | sentence | small positive (optical) |
| **Label-mono** | **mono** (pegged to Label's sizes) | sentence | 0 |
| **Kicker** | **mono** (pegged to Label's sizes) | **UPPERCASE** | very wide positive |
| **Tiny** | **ui, prose** | sentence | 0 |
| **Tiny-mono** | **mono, prose** (pegged to Tiny's sizes) | sentence | 0 |

39 steps in all (13 voices × 3). Each treatment supplies the font palette + a few character knobs (a
shared `makeVoices()` factory); the FIXED SIZES table gives every step's size; the engine still
derives leading, optical tracking, weight, and case per treatment. Body-mono, Label-mono, Tiny-mono,
and Kicker all use the mono role, aliasing their non-mono sibling's own size triplet (same numbers,
mono font only) — they are not a distinct size register. Sub-title and Tiny-mono also ride the mono
role but are prose (`box:false`), not control labels — unlike Body-mono/Label-mono/Kicker, which are
box (control-text) voices, same as Label. Sub-heading + Kicker are the uppercase caps voices (Display
is uppercase only in the Brutalist treatment).

## The system relationships (what the generator derives)

Unlike color (`{hue, chroma, distribution}` → an even tonal ramp derived from a formula), type SIZE is
now a fixed literal table (`SIZES` in `src/engine/type.mjs`); the rest still derives from
`{ leading per category, weight ramp, optical tracking coefficient, font roles }`:

- **Size** = a **fixed literal per voice+step** (e.g. Display SM/MD/LG = 72/96/120), identical across
  every treatment. `bodyBase` (default 16 — Body's own fixed MD literal) still scales the WHOLE
  table proportionally (`factor = bodyBase/16`) — a larger/smaller `bodyBase` grows/shrinks every voice
  together, snapping back onto a nice-number ladder when the factor isn't 1. Ratio (`base × ratio^step`)
  is **retired** — it no longer means anything to override per voice. Body's own SM/MD/LG = 14/16/18;
  at the responsive **Mobile** breakpoint tier specifically (the canonical ×2/3 compression factor),
  Body carries a targeted per-cell nudge down to 14/15/16 (its own pre-2026-07-13 sizes) — the general
  hierarchy-aware law freezes Body/Label at Desktop↔Tablet by design, but can't produce this small step
  on its own, so it's a deliberate, explicit exception, not a change to the general compression curve.
- **Letter Spacing** = `f(size)` — negative to *tighten* large display, positive to *loosen* small label text (optical).
- **Multi-line Height** = `size × leading`, where **leading is a per-role constant** (the
  `font.modes.json` design intent). The reading/display voices are held *uniform across all treatments* —
  treatments express voice through font, weight, tracking, and case, not leading:
  - **display — 0.8** (large type sets *tight*, leading < 1)
  - **headline · sub-heading · title — 1.125**
  - **body — 1.5** · **lead — 1.4** · **sub-title — 1.3** · **tiny · tiny-mono — 1.5**
  - **kicker — 1.4** · **body-mono — ~1.5** · **label-mono — 1.4**
  - **label — ~1.4** (the one voice that keeps a small per-treatment lever, `1.35–1.45`)
- **Single-line Height** = `size × 1.0` — the control-text height, emitted on the **box** voices only
  (**Label · Body-mono · Label-mono · Kicker**). Keyed on a per-voice `box` flag, not the role — so
  Tiny/Tiny-mono/Sub-title, which ride the ui/mono FONT but are prose (`box:false`), do NOT get a
  single-line height.
- **Weight** ramps by role — Display `700` (`900` Brutalist), Headline `620–800`, Sub-heading · Kicker
  `~500–700`, Title `650`, Sub-title `500`, Lead `400` (`300` Luxury), Body `440`, Body-mono `460`,
  Label `480`, Label-mono `480`, Tiny `440`, Tiny-mono `440`.

A set of **treatments** (Product/Lifestyle, Luxury, Editorial, Technical/Data, Brutalist) seed these
character params, exactly as the color "Color Categories" presets seed palette params — but no longer
seed size at all.

## Sibling weights — adjacent emphasis variants

A voice's core weight is one number; real UIs also need *nearby* weights for inline emphasis (a bold
word in body text, a medium label next to a regular one) without inventing an unrelated weight.
`siblingWeightDefaults(core)` (`src/engine/type.mjs`) derives exactly that: **three ladder-adjacent
stops** (immediate neighbors on the 9-stop `WEIGHT_LADDER` — 100…900 — never a skipped step) — one
stepping **away** from the ladder's center, two stepping **toward** it (nearer first) — `Regular 400`
→ `Light 300` (away) `Medium 500, Semi-bold 600` (toward); `Extra-bold 800` → `Black 900` (away)
`Bold 700, Semi-bold 600` (toward). The core itself is never included. An edge core (`Thin 100` /
`Black 900`) has nowhere for its "away" stop to go — it drops, leaving the old 2-stop set.

**2026-07-13 — every voice's siblings are AUTO-POPULATED by default.** `typeScale()` seeds
`weights[voice]` from `siblingWeightDefaults` on that voice's own **resolved** core weight (after any
per-voice weight override) whenever `config.voices[voice].weights` is absent — no opt-in required
anymore. An explicit `weights: [{name, weight}, …]` still **replaces** the default entirely for that
voice (including `weights: []`, which opts the voice OUT of siblings altogether — the one remaining
lever, and the only way to get a bare, undisambiguated core style).

Siblings emit everywhere the core does: a `--type-{voice}-weight-{slug}` CSS custom prop, a DTCG
`weights.{voice}.{Name}` `fontWeight` token, a `weight/{voice}/{slug}` Font Primitives variable, and —
the reason this exists — a **sibling Figma text style** per variant (`Voice/step/{slug}`, lowercase-
kebab, e.g. `Body/md/semi-bold`). Because siblings now exist by default, the **core** style also always
carries a segment now — a **dot-prefixed, Title-Case name** (`Voice/step/• {Name}`, e.g.
`Body/md/• Regular`) that visually marks it as the default pick among its named siblings without ever
colliding with a sibling's own lowercase-kebab slug (the one exception: a voice explicitly opted OUT
via `weights: []` keeps the bare `Voice/step` name — nothing to disambiguate). Every Color Categories
preset (336 palettes × the 5 designed roles — Display/Headline/Body/Label/Kicker) still ships its
siblings **explicitly** pre-populated at generation time (`scripts/gen-categories.mjs#design5ToTypeConfig`,
computed from that slot's own designed weight) — the other 8 voices on every preset now get the SAME
default siblings automatically, live, from the engine.

> Status: **shipped** — `src/engine/type.mjs` (`typeScale` + `typeTokensCSS`/`typeTokensDTCG`) and the Typography editor section generate these tokens.
