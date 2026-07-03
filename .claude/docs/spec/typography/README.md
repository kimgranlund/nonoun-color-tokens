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

### `Font Specs` — the seven named groups

The engine implements this as **seven groups** (Sub-heading + Kicker are labels, not headings): each is a size ramp,
each step carrying `Size · Line Height · Letter Spacing · Weight · Case · Paragraph Spacing · Indent`.

| Group | Steps | Font role | Case | Letter-spacing character |
|---|---|---|---|---|
| **Display** | `XS … XL` (5) | display | sentence/title (UPPERCASE only in Brutalist) | negative, tightens with size |
| **Heading** | `XS … XL` (5) | heading | sentence | ~0 |
| **Sub-heading** | `XS … XL` (5) | heading | **UPPERCASE** | wide positive (caps open up) |
| **Kicker** | `XS … XL` (5) | **mono** | **UPPERCASE** | very wide positive |
| **Body** | `XS … XL` (5) | body | sentence | 0 |
| **UI** | `3XS … 2XL` (8) | ui | sentence | small positive (optical) |
| **Code** | `3XS … 2XL` (8) | **mono** | sentence | 0 |

41 steps in all. Each treatment supplies the font palette + a few character knobs (a shared `make7()`
factory); the engine generates every step's size (modular scale), leading, optical tracking, weight, and
case. Kicker + Code use the mono role; Sub-heading + Kicker are the uppercase caps voices (Display is uppercase only in the Brutalist treatment).

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
  - **body — 1.5**
  - **Kicker — 1.4** · **code — ~1.5**
  - **UI — ~1.4** (the one voice that keeps a small per-treatment lever, `1.35–1.45`)
- **Single-line Height** = `size × 1.0` — the control-text height, emitted on the box voices **UI · Code · Kicker**.
- **Weight** ramps by role — Display `700` (`900` Brutalist), Heading `620–800`, Sub-heading · Kicker `~600`,
  Body `440`, UI `480`, Code `460`.

A set of **treatments** (Product/Lifestyle, Luxury, Editorial, Technical/Data, Brutalist) seed these
params, exactly as the color "Color Categories" presets seed palette params.

> Status: **shipped** — `src/engine/type.mjs` (`typeScale` + `typeTokensCSS`/`typeTokensDTCG`) and the Typography editor section generate these tokens.
