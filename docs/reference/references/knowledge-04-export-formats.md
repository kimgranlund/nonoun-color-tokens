# Knowledge 04 — Export Formats

> Topic: the eight color export formats (CSS hex, CSS OKLCH, JSON, Figma DTCG, UI3, Tailwind, ShadCN, plus `exportAll`), their exact output shapes, naming/padding rules, and the
> Figma-import constraints that drove the resolved-vs-aliased decision.

## Table of Contents
1. Format overview
2. CSS (hex) and CSS (OKLCH)
3. JSON
4. Figma DTCG (3-file zip)
5. Collections (UI3)
6. Shared rules: padding, slug, scrims
7. Figma import constraints (why resolved, not aliased)
8. System constants (fixed, non-palette tokens)
9. Key colors (retained brand colors)

Tailwind v4 (`exportTailwind`) and ShadCN (`exportShadcn`) are introduced in §1 but do not yet have
their own dedicated section here — their shapes are documented at the point of use in
`adding-export-formats`'s references instead. (A pre-existing gap noted, not fixed, in this pass —
scope was the §8 addition only.)

---

## 1. Format overview

| Tab | `expFmt` | File(s) | Shape |
|-----|----------|---------|-------|
| CSS | `css` | `hct-palette.css` | flat raw vars + `--c-*` semantic via `light-dark()` |
| CSS OKLCH | `oklch` | `hct-palette.oklch.css` | same, values as `oklch()` |
| JSON | `json` | `hct-palette.tokens.json` | meta + per-palette stops/scrims/semantic |
| Figma | `figma` | `figma-tokens.zip` (3 files) | DTCG; raw + Light + Dark, resolved |
| Collections | `ui3` | `figma-ui3-variables.json` | two-collection schema, in-file aliases |

All formats operate over **enabled** palettes (`palette.on`) and **export stops** (25).

Two more **framework** formats ship alongside these (see `src/engine/exports.js`, not detailed below):
**Tailwind v4** (`tailwind` · `exportTailwind`) and **ShadCN** (`shadcn` · `exportShadcn`). ShadCN is a
**curated subset** — a fixed `SHADCN_ORDER` over a hand-kept suffix `MAP`, NOT all roles — so a new
semantic role does not surface in it unless explicitly wired into `MAP`.

**Scope note (TKT-0015):** `src/engine/exports.js` holds ONLY these 8 formats (the 7 emitters above plus
the `exportAll` aggregator) plus their shared helpers (`derivePalette`/`derivedAll`, `pad3`/`slug`/`hexOf`/
`hex8`/`colorLeaf`/`roleOklch`, the `dialogBackdrop*` system constant). The Claude Design / Google Stitch /
Figma Make "DS bundle" DESIGN.md-authoring subsystem that used to share the file now lives in the sibling
`src/engine/ds-export.js` — a different kind of artifact (a consumption-bundle spec + prose, not a token
serializer) with no rubric of record in this directory yet. It is out of scope for this document and for
`adding-export-formats`; don't conflate a `ds-export.js` change with an export-format change covered here.

## 2. CSS (hex) and CSS (OKLCH)

```
:root{
  color-scheme: light dark;

  /* {Name} — cam16 hue {h}°; flat mode-independent RAW primitives. Raw names end in DIGITS,
     semantic names end in a WORD, so both share the --c- prefix with no collision. */
  --c-{n}-050: {hex};            ... --c-{n}-950: {hex};
  /* scrims (the 500 ramp; alpha% = step/10) */
  --c-{n}-scrim-050: {hex8};  ...  --c-{n}-scrim-950: {hex8};   (ADR-016 nesting — 500 base implicit)
  /* SEMANTIC roles -> light-dark of two raw primitives */
  --c-{n}{suffix}: light-dark(var(--c-{n}-{refSlug(light)}), var(--c-{n}-{refSlug(dark)}));
}
```

- Raw tokens are **flat single values** (not `light-dark()`), because the mode flip lives in
  the semantic layer (Knowledge 03 §1).
- OKLCH variant emits `oklch(L C H)` for solids and `oklch(L C H / a%)` for scrims; values
  via `rgbToOklch`.

## 3. JSON

```
{
  "model": "HCT (CAM16 H/C + CIELAB L*)",
  "curve", "tension", "lstar":{min,max}, "damp", "hueSpace",
  "scrimAlphas": [...],
  "palettes": [
    { "name", "hue", "chromaPct", "skew",
      "stops":   { "050": {hex, lstar, chroma}, ... },
      "scrims":  { "050": {hex,alpha}, "100":{...}, ... "950":{...} },   (keyed by padded step; palette keys are SLUGS; semantic `key` is the kebab leaf — ADR-016)
      "semantic":{ "<roleKey>": {css, light, dark, lightHex, darkHex}, ... }
    }
  ]
}
```
Stop keys padded to 3 digits. The `semantic` block lists every role with its CSS var name
and both resolved hexes.

## 4. Figma DTCG (the raw file plus one semantic file per theme)

`download()` emits `figma-tokens.zip` containing:

- `palette.tokens.json` — **raw** collection, mode `Value`. Solid stops + 11 scrims (+ any key
  colors, §9) per palette as resolved `colorLeaf`s.
- One `"{theme.name}_tokens.json"` per entry in the **theme axis** — **semantic**, mode
  `theme.name`. Every role resolved to a `colorLeaf` using that theme's `side` end (`"light"` or
  `"dark"`). By default (no `opts.themes`), the axis is `semantic.js`'s `DEFAULT_THEMES` —
  `[{name:"Light",side:"light"}, {name:"Dark",side:"dark"}]` — producing the historical
  `Light_tokens.json`/`Dark_tokens.json` pair, byte-identically (ADR-019, TKT-0021). A doc/caller
  can pass a longer `opts.themes` (e.g. `+ {name:"Dim", side:"dark"}`) to add a named companion
  mode with no engine change — this does NOT give a theme its own independent resolved color per
  role (that needs a third ref in the role table itself, a separate change); every theme's value is
  one of the role's two existing ends.

`colorLeaf(rgb, alpha)`:
```
{ "$type":"color",
  "$value":{ "colorSpace":"srgb", "components":[r/255,g/255,b/255], "alpha":a, "hex":"#RRGGBB[AA]" },
  "$extensions":{ "com.figma.hiddenFromPublishing":true, "com.figma.scopes":["ALL_SCOPES"] } }
```
`figmaMode(tree, mode)` adds top-level `$extensions.com.figma.modeName` — `figma/plugin/code.js`'s
`applyBundle` reads this tag (not the filename) to discover which theme files a bundle carries and
how many Color Semantic modes to create. Export preview shows the first theme's semantic tree; the
download adds raw + every other theme.

**`exportUI3`'s `Color Semantic` collection still hardcodes the Light/Dark pair** (`values:{Light,
Dark}`) — deliberately out of TKT-0021/ADR-019's scope (a documented follow-up, not an oversight;
see ADR-019's Consequences). Don't assume UI3 already generalizes the same way DTCG now does.

The zip is built by a dependency-free **store/deflate writer** (`makeZip`, with `crc32`); it
works fully offline.

**Optional aliasData**: a `rawColl` input (blank by default). When filled, semantic leaves
gain `$extensions["com.figma.aliasData"] = {targetVariableName:"{n}/{refPath}", targetVariableSetName:coll}` (scrims nest: "{n}/scrim/{step}").
Blank → plain resolved colors that always import (default). See §7.

## 5. Collections (UI3)

Single file `figma-ui3-variables.json`:
```
{ "$schema":"figma-ui3-variables.color.schema.v1",
  "collections":{
    "Color Primitives":{ "modes":["Base"],
      "variables":{ "raw/{n}/{050}":{type:"COLOR",values:{Base:"#HEX"}}, ... } },
    "Color Semantic":{ "modes":["Light","Dark"],
      "variables":{ "{n}/{roleKey}":{type:"COLOR",
        values:{Light:"{raw/{n}/{refPath light}}", Dark:"{raw/{n}/{refPath dark}}"}}, ... } }   (semantic keys = "{n}/{kebab leaf}", ADR-016)
  } }
```
Semantic values are **in-file key-path aliases** the importer resolves.

> ⚠️ **OD-003 — UI3 schema authenticity.** `figma-ui3-variables.color.schema.v1` returns
> zero hits in Figma's documentation and is **not** a verified native import format. Do not
> import it via the Variables modal expecting native resolution. It is retained as a
> convenience/interchange shape only. See ADR-007.

## 6. Shared rules: padding, slug, scrims

- `pad3(stop)` → 3 digits (`"50"→"050"`); applied to all stop keys and var refs.
- `slug(name)` → lowercase, non-alphanumeric → `-`, trimmed. Palette name → token namespace.
- `hex8(rgb, frac)` → `#RRGGBBAA` for scrims.
- `SCRIM_BASES=[500]`, `SCRIM_STEPS=[50,100,200,300,400,500,600,700,800,900,950]`; a scrim ref `500-{step}` is the 500 color at alpha% = step/10, EMITTED as the nested `scrim/{step}` path (`refPath`) / `scrim-{step}` slug (`refSlug`) — ADR-016.

## 7. Figma import constraints (why resolved, not aliased)

Researched and verified against Figma's "Modes for variables" documentation:

- Figma's native importer accepts **DTCG** (`$type`/`$value`).
- Same-file alias = `$value:"{token}"`. Cross-collection alias = `com.figma.aliasData`,
  which Figma resolves by matching provided data; names normalize to forward slashes; one
  mode per file.
- Name-only `aliasData` (without the library key UUIDs Figma only mints on export) **errors**
  rather than falling back — this produced the observed "errors importing N tokens".

**Resolution**: semantic Light/Dark ship **resolved** colors (no aliasData) → they always
import. The live cascade (edit raw → semantic follows) cannot be done by JSON import; it is
provided by the companion plugin (`knowledge-05-figma-plugin.md`). The `rawColl` field is the
opt-in escape hatch for users who want aliasData emitted anyway. See ADR-002.

## 8. System constants (fixed, non-palette tokens)

A **system constant** is a color token that is NOT derived from any palette — a fixed value,
emitted once per document, never mode-flipped. The only one today: `dialog-backdrop` (opaque
black at 80% alpha — the canonical modal/dialog scrim, distinct from the per-palette,
brand-tinted `*/scrim*` roles). Still rides the same configurable `{pfx}`/`{aliasPrefix}` as
every other token, so a renamed namespace covers it too.

**Where it appears, and where it deliberately does NOT:**

| Format | Placement |
|---|---|
| CSS (hex/oklch) | One `--{pfx}-dialog-backdrop` line in `:root`, before any palette (`cssFrom`) |
| JSON | A top-level `constants` object, sibling to the palette-name keys |
| DTCG | A `constants` group in `palette.tokens.json` (RAW) **only** |
| UI3 (Figma) | `raw/constants/dialog-backdrop` in `Color Primitives` **only** |
| Tailwind `@theme` | One `--color-dialog-backdrop` line, outside any palette's scale/role blocks |
| ShadCN | `--overlay` in both `:root`/`.dark` (literal, or `var(--{aliasPrefix}-dialog-backdrop)` when aliased), mapped in `@theme inline` |

**Why it is absent from the DTCG/UI3 *semantic* tree (Light/Dark · Color Semantic) — load-bearing,
don't "fix" this:** every top-level key of that tree is treated elsewhere as a REAL PALETTE with a
full 53-role set, positionally zipped against `doc.palettes` (the app's style-plan family
derivation; `figma/binder/style-plan.mjs`'s paint/text-style generation). A synthetic non-palette
key there is silently miscounted as a palette with no real roles, breaking both. This was caught
live when first wiring `dialog-backdrop` (2026-07-11) — the raw tree has no such assumption (its
consumers, e.g. `figma/plugin/code.js`'s variable-creation loop, walk it generically by name), so
constants live there and there only; a Figma user binds directly to the raw primitive (nothing to
alias FROM — the value has no palette).

## 9. Key colors (retained brand colors)

A palette may carry `keyColors: [{ role, oklch:[L,C,H], name? }]` — exact brand colors the
generator retains verbatim rather than deriving from the ramp (they may sit off it entirely; the
UI places them perceptually, exports keep them lossless). `role` is a free-form string
(`"dominant"`/`"supportive"` are the two the UI currently offers); `oklch` is the source of truth
(`oklchToRgb` derives `rgb`/`hex` for formats that need a raster leaf). Emitted **only** when a
palette actually sets `keyColors` — absent otherwise (opt-in, not a per-palette default).

**Where it appears:**

| Format | Placement |
|---|---|
| CSS (hex/oklch) | `--{pfx}-{n}-key-{role}` lines, per palette, after that palette's semantic roles |
| JSON | `palettes[n].keyColors: [{role, oklch, name?}]` — verbatim passthrough |
| DTCG | `palette.tokens.json` (RAW): a `key` group nested under the palette, keyed by `role` — mirrors `scrim`'s two-segment shape (`{n}.key.{role}`), a resolved `colorLeaf` (frac 1, no alpha) |
| UI3 (Figma) | `raw/{n}/key/{role}` in `Color Primitives` — mirrors the `raw/{n}/scrim/{step}` shape |
| Tailwind / ShadCN | not emitted (frameworks; out of scope, same as scrims for Tailwind) |

**Why DTCG/UI3 carry them in the RAW tree only, not the semantic tree:** key colors are extra raw
values scoped to one palette, not new top-level tree keys — nesting them under the palette's own
raw group (`{n}.key.{role}` / `raw/{n}/key/{role}`) never touches the positional-palette-zip
invariant §8 describes for system constants (that invariant is about a tree's TOP-LEVEL keys, and
`key` here is a second-level group inside an existing, real palette). No ADR previously fenced
their DTCG/UI3 absence — checked `decision-records.md` and found none; TKT-0022 confirmed it was
an oversight (they exported fine via CSS/JSON, the two formats an emitter happened to route
through `p.keyColors` directly) and closed the gap rather than fencing it.
