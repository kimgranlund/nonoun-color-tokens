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

## 2. CSS (hex) and CSS (OKLCH)

```
:root{
  color-scheme: light dark;

  /* {Name} — cam16 hue {h}°; flat mode-independent RAW primitives. Raw names end in DIGITS,
     semantic names end in a WORD, so both share the --c- prefix with no collision. */
  --c-{n}-050: {hex};            ... --c-{n}-950: {hex};
  /* scrims (the 500 ramp; alpha% = step/10) */
  --c-{n}-500-050: {hex8};  ...  --c-{n}-500-950: {hex8};
  /* SEMANTIC roles -> light-dark of two raw primitives */
  --c-{n}{suffix}: light-dark(var(--c-{n}-{refKey(light)}), var(--c-{n}-{refKey(dark)}));
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
      "scrims":  { "500-050": {hex,alpha}, "500-100":{...}, ... "500-950":{...} },
      "semantic":{ "<roleKey>": {css, light, dark, lightHex, darkHex}, ... }
    }
  ]
}
```
Stop keys padded to 3 digits. The `semantic` block lists every role with its CSS var name
and both resolved hexes.

## 4. Figma DTCG (3-file zip)

`download()` emits `figma-tokens.zip` containing:

- `palette.tokens.json` — **raw** collection, mode `Value`. Solid stops + 11 scrims per
  palette as resolved `colorLeaf`s.
- `Light_tokens.json` — **semantic**, mode `Light`. Every role resolved to a `colorLeaf`.
- `Dark_tokens.json` — **semantic**, mode `Dark`.

`colorLeaf(rgb, alpha)`:
```
{ "$type":"color",
  "$value":{ "colorSpace":"srgb", "components":[r/255,g/255,b/255], "alpha":a, "hex":"#RRGGBB[AA]" },
  "$extensions":{ "com.figma.hiddenFromPublishing":true, "com.figma.scopes":["ALL_SCOPES"] } }
```
`figmaMode(tree, mode)` adds top-level `$extensions.com.figma.modeName`. Export preview shows
the Light semantic tree; the download adds raw + Dark.

The zip is built by a dependency-free **store/deflate writer** (`makeZip`, with `crc32`); it
works fully offline.

**Optional aliasData**: a `rawColl` input (blank by default). When filled, semantic leaves
gain `$extensions["com.figma.aliasData"] = {targetVariableName:"{n}/{refKey}", targetVariableSetName:coll}`.
Blank → plain resolved colors that always import (default). See §7.

## 5. Collections (UI3)

Single file `figma-ui3-variables.json`:
```
{ "$schema":"figma-ui3-variables.color.schema.v1",
  "collections":{
    "Color / Primitives":{ "modes":["Base"],
      "variables":{ "raw/{n}/{050}":{type:"COLOR",values:{Base:"#HEX"}}, ... } },
    "Color / Semantic":{ "modes":["Light","Dark"],
      "variables":{ "{n}/{roleKey}":{type:"COLOR",
        values:{Light:"{raw/{n}/{refKey light}}", Dark:"{raw/{n}/{refKey dark}}"}}, ... } }
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
- `SCRIM_BASES=[500]`, `SCRIM_STEPS=[50,100,200,300,400,500,600,700,800,900,950]`; a scrim `500-{step}` is the 500 color at alpha% = step/10.

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
| UI3 (Figma) | `raw/constants/dialog-backdrop` in `Color / Primitives` **only** |
| Tailwind `@theme` | One `--color-dialog-backdrop` line, outside any palette's scale/role blocks |
| ShadCN | `--overlay` in both `:root`/`.dark` (literal, or `var(--{aliasPrefix}-dialog-backdrop)` when aliased), mapped in `@theme inline` |

**Why it is absent from the DTCG/UI3 *semantic* tree (Light/Dark · Color / Semantic) — load-bearing,
don't "fix" this:** every top-level key of that tree is treated elsewhere as a REAL PALETTE with a
full 53-role set, positionally zipped against `doc.palettes` (the app's style-plan family
derivation; `figma/binder/style-plan.mjs`'s paint/text-style generation). A synthetic non-palette
key there is silently miscounted as a palette with no real roles, breaking both. This was caught
live when first wiring `dialog-backdrop` (2026-07-11) — the raw tree has no such assumption (its
consumers, e.g. `figma/plugin/code.js`'s variable-creation loop, walk it generically by name), so
constants live there and there only; a Figma user binds directly to the raw primitive (nothing to
alias FROM — the value has no palette).
