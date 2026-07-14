# Weight ladders & relative labels — the two-tier system (2026-07-13/14)

How every voice's weight variants (core + siblings) are chosen and what they're CALLED in the
Figma Styles panel. Established across PRs #301/#303/#307 at direct request; supersedes the
literal-name/templated-name labels (TKT-0001 era) and the single bidirectional ladder.

## The two tiers

| Tier | Voices | Auto-populate | Label vocabulary |
|---|---|---|---|
| **Expressive** | Display · Headline · Sub-heading · Title · Sub-title · Kicker | `siblingWeightDefaults(core)` — 3 ladder-adjacent stops, bidirectional (one away from center, two toward) | `Lighter / Light / Heavy / Heavier` (`RELATIVE_WEIGHT_LABELS`) |
| **Body-class** | Lead · Body · Body-mono · Label · Label-mono · Tiny · Tiny-mono (`BODY_CLASS_VOICES`) | `bodyClassSiblingDefaults(core)` — 2 stops, both strictly HEAVIER | `Regular / Bolder / Boldest` (`BODY_WEIGHT_LABELS`) |

Labels are assigned by RANK among the voice's deduplicated resolved weights
(`relativeWeightLabel(rank, total, words)`), never by what face sits underneath — a long custom
face name truncates illegibly in Figma's narrow panel, with multiple siblings collapsing to the
same visible "condensed …" prefix. A total exceeding the vocabulary's length falls back to the
4-word scale so two weights can never share a label. The default/core style carries a TRAILING
`" •"` marker (`"heavy •"`, `"regular-single •"` — always the last token; a leading dot got
clipped by Figma's truncation).

## Body-class is a FIXED face mapping (#307, at request)

`regular = Regular(400) · bolder = Medium(500) · boldest = Semi-bold(600)` — guaranteed, not just
rank-relative. The load-bearing constraint: **body-class core weights stay ≤ 450** so they SNAP to
the Regular face (`weightNameFor`'s nearest-ladder-stop; 450 ties resolve DOWN). Cores at 460/480/
500/550 (the old Body-mono/Label/statement values) snapped to Medium — so the style *labeled*
"regular •" silently *rendered* Medium. All body-class cores now sit at 440 (slight optical bump,
still snaps Regular); the +100/+200 sibling stops then land exactly on Medium/Semi-bold. Lead's
WEIGHT stays a free treatment lever (luxury deliberately sets it Light) — only its ladder/labels
are body-class.

`gen-categories.mjs` bakes the same class-split ladder into every generated preset (its own
`npm run gen:categories` run prints the live total — don't hardcode a count here, it drifts), and
`test/engine/categories.mjs`'s faithful gate checks against the class-aware function — mapper,
engine, and gate must move together.

## Preset authoring: research the REAL font's cuts first

A sibling weight that doesn't exist in the actual family resolves via nearest-weight fallback to
the SAME face as another configured sibling — visually indistinguishable styles in Figma
(found live: GT America has NO Semi-bold(600)/Extra-bold(800); New Caledonia no Medium(500);
Helvetica Neue no 600; Trade Gothic Bold Condensed No. 20 is a single-weight family; Courier Prime
is 400/700 only). Rule: pick the nearest REAL cuts, verify no two configured weights resolve to
the same face, and use `weights: []` to opt a voice out entirely when no real sibling exists
(the persist layer round-trips an explicit `[]` as an opt-out — distinct from ABSENT, which
auto-populates; PR #302 fixed the hydrate that silently dropped it). BZZR's body-class boldest is
Bold(700), not Semi-bold, for exactly this reason.

## Never re-derive a relative unit from a rounded absolute (#294)

`round(size · leading) / size ≠ leading` at most sizes — re-deriving CSS/DTCG/Figma percents from
the whole-pixel-rounded `lineHeight` made ONE configured ratio (112.5%) render as a different
oddly-specific percent per step (111.8 / 114.3…). Each step carries the exact
`leadingRatio`/`trackingRatio` alongside the rounded absolute px; every relative-unit emitter
reads the ratio, the absolute px stays for live on-screen rendering only. (Figma's Typography
collection is the deliberate exception — absolute px, see maintaining-figma-plugins'
`references/figma-styles-hard-constraints.md` §2.)
