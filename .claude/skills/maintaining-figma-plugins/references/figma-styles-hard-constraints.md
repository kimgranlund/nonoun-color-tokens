# Figma text-style hard constraints — found live, 2026-07-13/14

Five constraints of Figma's real Plugin API surface, each discovered against a REAL applied file
(BZZR) after the static parity gates were already green — none is documented crisply by Figma, and
each shipped here as a fix to a live defect. Cite these before "improving" the styles layer; every
one of them looks like a bug you'd want to fix until you know why it's load-bearing.

## 1. fontStyle and fontWeight bindings are MUTUALLY EXCLUSIVE (never bind both)

Real Figma resolves a bound `fontWeight` to "the closest valid weight for the font" **independently
of** a bound `fontStyle` — binding both silently overrides a custom named cut ("Compressed Black
Italic") back to whatever plain face is nearest by weight number. Found live: BZZR's Display core
not rendering its bound style at all. A custom `styleName` is strictly more specific than a numeric
weight, so it alone drives the bind; voices without one bind `fontWeight` alone. A stale bind must
also be explicitly cleared: `bindField` only ever ADDS a binding, so a style reused by name across
re-applies (likely, since visible labels are relative ranks, not literal names) can keep a stale
bind from an earlier apply where the OTHER half of the pair was in play — the executor explicitly
`setBoundVariable(field, null)`s whichever half the current plan omits.
— `figma/binder/style-plan.mjs` (the `coreStyleName ? {fontStyle} : {fontWeight}` forks, PR #292)
+ `figma/plugin/code.js#applyStylePlans` (the null-clear, PR #301).

## 2. Metric fields (lineHeight/letterSpacing/fontWeight) bind NUMBER variables only; a bound percent displays as a bare number

These accept FLOAT variables only — **no STRING binding exists** for a metric field (vendor docs:
"accepts number variables"), so an explicit `"112.5%"` string token is impossible. `fontFamily` and
`fontStyle` bind STRING variables and are unaffected. Worse, Figma's own Properties panel renders a
bound percent FLOAT as a bare unit-less number ("112.5"), indistinguishable from a pixel value.
Resolution: the type/ variables
(the merged breakpoint-moded Geometry collection, TKT-0009) emit
`lineHeight`/`letterSpacing`/`singleLineHeight` as **absolute pixels** (legible,
unambiguous; Figma is a fully-regenerated snapshot per apply, so nothing is lost) while CSS/DTCG
keep the exact ratio/em relative units. — `src/engine/type.mjs#typeTokensFigmaModes`, PRs #294/#295.

## 3. The Styles panel folder-izes any name that is a PATH PREFIX of another

`"Voice/step/• label"` + `"Voice/step/• label/single"` renders the plain leaf **and** an
identically-labeled implied folder as two separate rows. A separate `"{step}-single"` folder avoids
the collision but hides single-line variants away from their multi-line counterpart. The shape that
works: a `-single` **suffix on the leaf itself** (`"Body/md/regular-single"`) — no new `/` segment,
so it can never become or collide with a folder. Same law drove the core's default marker to a
TRAILING `" •"` (`"heavy •"`, always the last token — also never clipped by Figma's own truncation
of a long label). — PRs #293/#297/#305.

## 4. No variable-font metadata exists — numeric instance names are the only weight signal

`listAvailableFontsAsync()` returns `{family, style}` strings and nothing else: no axes, no
`isVariable` flag, no wght range (verified against vendor docs 2026-07-13; plugins have NO axis
API at all). A variable font is only detectable by the SHAPE of its style list, and its named
instances are often numeric ("350", "Text 550") — `styleNameWeight` parses an embedded 1–1000
integer before falling back to Regular/400, else every numerically-named style ties at distance
zero-from-400 and the first array entry wins arbitrarily. — `figma/plugin/code.js`, PR #300.

## 5. Real font catalogs break naive name/weight matching two more ways

- **Separator chaos:** foundries write compound weights as "Extra Bold" (GT America), "ExtraBold",
  or this kit's own "Extra-bold". `normalizeStyleName` strips ALL hyphens/spaces before comparing —
  collapsing to a single space (the first fix) still missed New Caledonia's concatenated
  "SemiBold". — PRs #291/#300.
- **Ladder gaps make ties NORMAL:** GT America has no 600/800 cut, so a wanted 800 sits exactly
  ±100 from its real Bold(700)/Black(900). `resolveFace` breaks ties toward the HEAVIER real
  weight, deterministically — never by `listAvailableFontsAsync` array order, which is
  install-dependent. — PR #300. Preset-side: sibling weights must be researched against the real
  font's actual cuts (see `type-scale`'s `references/weight-ladders-and-labels.md`).
