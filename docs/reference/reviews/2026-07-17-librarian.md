# Librarian review — ultimate-tokens variable-collection organization

Scope: the four collections a Figma consumer sees (Color Primitives, Color Modes, Geometry,
Font Primitives), reviewed for catalog coherence, findability, naming grammar, classification
logic, mode semantics, homonym collisions, tree depth, and growth headroom. Read-only; no
files changed. Ground truth: `src/engine/exports.js`, `src/engine/type.mjs`,
`src/engine/geometry.mjs`, `figma/binder/style-plan.mjs`, `src/ui/persist.js`,
`src/ui/figma-plugin-assets.js`, `docs/reference/references/knowledge-04-export-formats.md`,
`docs/tickets/tkt-0009.md`, `tkt-0010.md`.

---

## CRITICAL

### C1 — The canonical export engine and the live plugin disagree on the two color-collection names
`src/engine/exports.js:498-499` (`exportUI3`) names the collections **"Color / Primitives"** and
**"Color / Semantic"** (with " / " as a literal delimiter), and `knowledge-04-export-formats.md`
§5 documents that shape as canonical. But the code that actually creates collections in a live
Figma file — `src/ui/figma-plugin-assets.js:8` (`RAW_COLLECTION = "Color Primitives"`,
`SEMANTIC_COLLECTION = "Color Modes"`) — and the user-facing override surface
(`src/ui/persist.js:274-275`, `clampFigmaCollections` defaulting to `"Color Primitives"` /
`"Color Modes"`) use a **third, different pair of names**, with no `/` delimiter and "Semantic"
swapped for "Modes". Three names describe two collections:

| Concept | exportUI3 (interchange) | live plugin / persist defaults |
|---|---|---|
| raw stops | `Color / Primitives` | `Color Primitives` |
| semantic roles | `Color / Semantic` | `Color Modes` |

A librarian cataloging "what does a user actually see" cannot answer from the engine file alone
— the ground-truth doc (knowledge-04) describes a collection name that never ships. This is
explained (barely) by `exportUI3` being marked ADR-007/OD-003 "interchange-only, not a verified
native import path" — but the doc doesn't say that loudly enough at the point the name is quoted,
and nothing stops the two from drifting further apart.

**Fix.** Make `exportUI3`'s collection keys literally equal `RAW_COLLECTION`/`SEMANTIC_COLLECTION`
(import the constants, or move them to one shared module both sides import) so there is one name
per collection, full stop. If the "/" delimiter is kept anywhere, keep it nowhere else — Figma
group delimiters are `/`, and a literal `/` *inside* a collection's own display name reads as a
faux-group to a scanning eye. Recommended single names: **`Color Primitives`** and
**`Color Semantic`** (not "Modes" — see M1 below for why).

---

## MAJOR

### M1 — "Geometry" is no longer an honest classification once it hosts `type/`
Since TKT-0009 (`docs/tickets/tkt-0009.md`), the collection literally named **"Geometry"**
(`geomTokensFigmaModes`, `src/engine/geometry.mjs:358-385`; merged with
`typeTokensFigmaModes`, `src/engine/type.mjs:678-703`) carries eight top-level groups:
`border · focus · gap · inset · radius · size · space · type`. Seven of those are box geometry;
`type/` is the entire typography scale (15 voices × steps × 5 props — size, lineHeight,
letterSpacing, weight, paragraphSpacing/singleLineHeight). A designer scanning Figma's
collection list for "where do I bind font-size" sees `Color Primitives`, `Color Modes`,
`Geometry`, `Font Primitives` — nothing says "typography lives here too." The merge's *reason*
(one mode switch flips type + geometry together, so a frame can't drift Geometry=Mobile /
Typography=Desktop) is sound engineering; the *name* never caught up to what the collection now
is: the single breakpoint-moded surface for the whole responsive system, not "geometry" in the
box-model sense.

This also breaks the primitives/semantic split's symmetry between Color and Type: Color gets a
content-scoped pair (Primitives raw stops / Semantic roles); Type gets `Font Primitives`
(genuinely content-scoped: families/weights) paired with a collection named after a *different*
domain (Geometry) instead of something parallel like "Type Semantic." A collection name should
answer "what is in here," not "what else happened to get folded in for mode-switching reasons."

**Fix.** Rename the merged collection from its domain (`Geometry`) to its axis
(**`Breakpoints`**, or `Responsive`) — it is, definitionally, "the collection that varies by
viewport width," which is exactly what both box-geometry and type share and exactly what Color
Primitives/Font Primitives (`Value`-mode, invariant) do not. Rail order unaffected: `border ·
focus · gap · inset · radius · size · space · type`. This single rename also resolves the
mode-semantics confusion in M4 below for free — the collection's own name would state its mode
axis (breakpoint) the same way "Color Modes/Semantic" states its axis (scheme).

### M2 — Two unrelated "gap" concepts share a bare leaf name, one level apart
`size/{name}/gap` (`GEOM_SIZE_FIELDS`, `src/engine/geometry.mjs:345`) is the **internal**
icon-to-label gap inside one control size (e.g. `size/MD/gap`, part of the centering-law pad
formulas in TKT-0010). `gap/{cluster,stackTight,stack,stackLoose,grid,section}`
(`src/engine/geometry.mjs:182`, emitted at `geomTokensFigmaModes:375`) is the **container-level**
rhythm scale (e.g. `gap/stack`). Both are FLOAT variables, both breakpoint-moded, both live in
the same collection (post-M1, the same collection twice over). Figma's variable search is a
fuzzy path match — typing "gap" surfaces both families interleaved with no way to tell, from the
name alone, that one is a per-control internal metric and the other a page-rhythm token. This is
exactly the kind of same-shape/different-meaning collision a catalog should never allow.

**Fix.** Rename the control-internal one so its leaf is unambiguous: **`size/{name}/icon-gap`**
(it is, mechanically, the gap between the icon and the text/caret — `icon-gap` reads correctly
even out of context). Leave the container rhythm scale as `gap/{key}` — it already reads
correctly on its own once the collision is gone.

### M3 — Two unrelated "radius" concepts share a bare leaf name, one level apart
Same shape as M2: `size/{name}/radius` (`GEOM_SIZE_FIELDS`, sourced from `radiusPill` —
`src/engine/geometry.mjs:345`, `= height/2`, a **per-control pill radius**) vs. the standalone
`radius/{k}` ladder (`sm/md/lg/xl…`, `src/engine/geometry.mjs:372`, a **general corner-radius
scale** used for cards/dialogs/etc., independent of any control size). A control's own corner
radius and "the radius token you'd bind a card to" are different design decisions that happen to
share a leaf name.

**Fix.** Rename the per-control one to **`size/{name}/pill-radius`** (states what law it follows
— full pill at that control's height — and stops colliding with the general ladder's `radius/{k}`
namespace).

### M4 — Three different meanings of "mode" across four collections, only one collection's name says which
`Color Primitives`/`Font Primitives` use a single `Value` mode (no real mode axis — the name
"Primitives" is doing the work of signaling that). `Color Modes` (or "Color Semantic," post-C1)
varies by **color scheme** (Light/Dark). `Geometry` varies by **breakpoint** (Desktop/Tablet/
Mobile/Desktop Lg/Desktop Xl — `breakpoint-modes-canon`). A first-time consumer has no way to
predict, from the collection list alone, which mode axis a given collection's mode dropdown will
show — "Modes" as a bare word appears in exactly one collection's name and doesn't distinguish
scheme-modes from breakpoint-modes. Renaming per M1 (Geometry → Breakpoints) and C1 (Color Modes
→ Color Semantic) resolves this directly: each collection's name would either state its axis
(Breakpoints) or its content (Color Primitives / Color Semantic / Font Primitives), and only one
of the four actually needs a mode-axis word in its name because only one axis (breakpoint) isn't
self-evident from "what's inside."

---

## MINOR

### N1 — Scrim keys are a hyphen-compounded pair of numerals sitting flat beside solid stops
`src/engine/exports.js:406-412` (raw DTCG tree) and `:472-477` (UI3 primitives) both write scrim
keys as `${pad3(base)}-${pad3(step)}` (e.g. `500-200`, per the brief's own example) as **siblings**
of the plain solid stops (`050`…`950`) in the *same* flat group (`rawTree[p.n]`, `primVars["raw/
{n}/…"]`). A palette's raw group in the Variables panel therefore interleaves `050, 100, …, 500,
500-050, 500-100, …, 950` — two different concepts (a lightness stop, and an alpha-blended scrim
at a fixed base) told apart only by whether the key happens to contain a second hyphen-joined
triplet. Since `SCRIM_BASES` is currently always `[500]`, the base segment is dead weight in the
common case and only earns its keep if a second scrim base is ever added.

**Fix.** Nest scrims under their own path segment instead of compounding the key:
**`{n}/scrim/{step}`** (drop the redundant base entirely while `SCRIM_BASES.length === 1`;
if a second base is ever ratified, promote to `{n}/scrim/{base}/{step}` at that point — the
`scrim/` segment already marks "you are now in alpha-blend land," which the flat hyphen never
does). This also gives the raw collection the same `scrim/` grouping the semantic Styles layer
already uses for scrim roles (`style-plan.mjs:76`, `styleGroupOf` → `scrims/`), instead of one
catalog nesting scrims and the other flattening them.

### N2 — Font Primitives mixes flat and namespaced depth for the same "family" group without a rule
`typeTokensFigmaPrimitives` (`src/engine/type.mjs:716-761`) emits `family/{role}` for the 5
shared role families (flat: `family/body`), but a voice-only override family gets
**`family/voice/{voice}`** — the literal word "voice" inserted as a namespace segment, found
nowhere else in the primitives tree (compare `weight/{voice}/{slug}`, which nests by the actual
slug, never by a literal type-of-key word). It is a deliberate collision-avoidance device (an
override family must not collide with a role-keyed primitive) and it works, but it is the one
place in the whole surface where a path segment names "what kind of key this is" rather than
being part of the key. A newcomer skimming the group has to learn that `voice/` is special
plumbing, not a fifth role called "voice."

**Fix.** Rename the segment to make the collision-avoidance purpose legible instead of implicit:
**`family/override/{voice}`** (states why the nesting exists) — or, if terseness matters more,
keep `family/voice/{voice}` but call it out explicitly in the one doc comment a consumer would
read first (`type.mjs:705-715`'s header comment already explains the mechanism; it just never
says *why* the segment is spelled "voice").

### N3 — `-single` (leaf suffix) and ` •` (trailing mark) are two different suffix mechanisms doing adjacent jobs, undocumented as a pair
Text-style names use **` •`** (a literal bullet, always trailing, `style-plan.mjs:172`) to mark
"the default pick among this step's named weight siblings," and **`-single`** (a hyphen suffix on
the leaf, `style-plan.mjs:214/223`) to mark "the 1.0-leading sibling of this style, same step
folder." Both are deliberately *not* new `/`-segments, both trail the label, and both exist to
dodge the same failure mode (Figma's Styles panel folder-izes any name that's a path-prefix of
another). They're well-reasoned individually (the comments at `style-plan.mjs:17-36` and
`:194-207` each explain their own case in detail) but the pattern connecting them — "a suffix,
never a segment, always last" — is never stated as a *general rule* a future third suffix would
need to follow. This is a documentation-coherence gap, not a naming defect: as-is it's consistent,
it just isn't written down as the rule it clearly is.

**Fix.** Add one line to the proposed naming grammar (below) so a future suffix (say, a
"condensed" or "italic" variant) inherits the constraint instead of re-discovering it the hard way
TKT-0008 did.

### N4 — `paddingNarrowCompact` / `paddingWideCompact` word order is right but unstated as a rule
TKT-0010 renamed `padding`/`edgePadding` → `paddingNarrow`/`paddingWide` and added
`paddingNarrowCompact`/`paddingWideCompact` (`src/engine/geometry.mjs:214`,
`GEOM_SIZE_FIELDS`). The order — base token (`padding`) then variant (`Narrow`/`Wide`) then
modifier (`Compact`) — is correct and should carry through the kebab migration as
`padding-narrow-compact` / `padding-wide-compact` (base-variant-modifier), not
`padding-compact-narrow` or `compact-padding-narrow`. Worth ratifying explicitly since it's the
one 3-token name in the whole surface and the kebab migration is exactly the moment word order
silently flips if no rule is written down.

---

## Growth headroom

- **More palettes**: the raw/semantic split scales fine (`{n}/{key}` is palette-name-keyed
  already); N1's scrim fix (nest, don't compound) matters more as palette count grows since it's
  the one place two numeral-shaped concepts interleave per palette.
- **More voices**: Font Primitives' `family/voice/{voice}` and `weight/{voice}/{slug}` both scale
  linearly and cleanly; N2 is a legibility nit, not a scaling risk.
- **More breakpoints**: already proven at 5 modes (BZZR) plus a 6th ("TV", `bzzr-tv-breakpoint`
  memory) added outside the engine — the `disambiguateModeNames` collision-guard
  (`type.mjs:668-677`, `geometry.mjs:348-357`, duplicated verbatim in both files) is the load-
  bearing piece here and already handles arbitrary mode counts. Minor drift risk: it's
  copy-pasted between the two engine files rather than shared — fine today, a real hazard if the
  two copies ever diverge under future edits.
- **A second scrim base**: `SCRIM_BASES = [500]` today; N1's fix future-proofs this (base
  segment added only when it's not redundant).

---

## Proposed naming grammar (ratify this)

1. **Case**: kebab-case for every emitted token/path segment (`padding-narrow`, `ui-control`,
   `icon-gap`). No camelCase, no PascalCase, anywhere in a variable path once the migration lands.
2. **Delimiter**: `/` is the ONLY path/group delimiter, used exactly where Figma's own grouping
   splits on it. Never embed a literal `/` inside a single segment's display text (fixes C1's
   `"Color / Primitives"` form). A compound concept that needs two axes (e.g. a scrim's base +
   step) is two nested segments, never one hyphen-joined leaf (fixes N1).
3. **Segment ordering**: `{collection-implicit} / {family-or-domain} / {sub-group?} / {leaf}`,
   e.g. `primary/scrim/200`, `type/Display/lg/size`, `size/md/icon-gap`. Sub-groups exist only
   when there is a real second axis (scrim step under a base, a voice under family/override) —
   never inserted purely to avoid a same-name collision at the leaf (that's what renaming the leaf
   is for, per M2/M3).
4. **Reserved/no-content segments**: a path segment that exists ONLY to disambiguate two
   otherwise-identical trees (like the current `voice/` in `family/voice/{voice}`) must name the
   *reason* for its own existence, not the axis it's protecting — prefer `override/` over `voice/`
   when the thing being protected against is "collides with a role name," not "this is a voice."
5. **Suffix policy** (Styles panel names, not variable paths): a suffix that must never become a
   new path segment (because Figma folder-izes prefixes) is a **trailing, hyphenated leaf marker**
   (`-single`) or a **trailing, space-separated glyph marker** (` •`) — never both on ambiguous
   precedence, always last, never leading. Any future suffix inherits this rule rather than
   re-deriving it (fixes N3).
6. **Numeral padding**: stops pad to 3 digits (`050`…`950`); this is already consistent and should
   not be touched.
7. **Homonym check (new rule)**: before a leaf name ships, grep the full moded-collection tree for
   that exact leaf at any other path depth. Two same-named leaves at different depths are either
   (a) truly the same concept viewed at two grains — fine — or (b) two different concepts that
   both need a rename, never a "same name because different folder" resolution (fixes M2/M3 and
   guards against a repeat).
8. **Collection naming**: name a collection for what varies across its modes when the mode axis
   isn't self-evident from content (`Breakpoints`), and for its content when the mode axis IS
   self-evident or trivial (`Color Primitives`, `Color Semantic`, `Font Primitives` — all
   single-mode or scheme-obvious). Never name a collection for a domain (`Geometry`) once it hosts
   a second domain's data (`type/`) for orthogonal reasons (mode-switch coupling) — that's exactly
   what drifted in M1.
