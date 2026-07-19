# Describe-Palette MCP — Spec (words → brand kit, two-step, deterministic core)

**Status:** draft / design — build kickoff for the umbrella feature **#379** (children #369–#377).
**Owner:** `kimgranlund/ultimate-tokens`. **Gates:** the `describePalette` Pro flag (`src/engine/flags.js`
— a **new** key; adding it to `FLAG_KEYS` + `TIER_FLAGS` is #369's build, see §9).

The **describe-palette MCP** turns a plain-language description ("1980s at the Bel Air Hotel Pool
Party") into a full Ultimate Tokens brand kit — 8 palettes, 53 semantic roles light+dark — with the
labor divided so **an LLM only ever decides seeds, never colors**: the calling agent interprets words
into a **PaletteBrief** (numbers + hexes), and a **pure, deterministic core** turns the brief into
tokens through the same engine path the app uses. It extends the shipped read-only Brand-Kit MCP
(`mcp/brand-kit-core.mjs` / `brand-kit-server.mjs`) and merges into its server (#374), keeping that
sibling's ethos: pure transport-agnostic core, zero-dependency stdio entry, parity by construction.

This document is the one contract the child builds implement against. It nails three things the
child issues reference casually: **(A)** the PaletteBrief JSON Schema (§3–§4), **(B)** the two-step
`generate_kit` protocol (§5–§6), and **(C)** what "parity-gated identical" mechanically means (§8).
It also fixes one smaller, informative contract along the way: **(D)** the `export_tokens` response
shape (§7) — scoped to #374, but load-bearing for §8's G2/G3 parity gates.

---

## 1. Goals & constraints

**Goals**
- **Words → kit on any host, zero installed skills.** The method travels *inside* the tool result
  (the self-teaching briefing payload, §5) — MCP users have no nonoun skills, agents, or corpus.
- **LLM decides seeds, never colors.** Every hex in the output comes from the engine
  (`toneMode:"perceptual"`), driven by clamped numeric seeds. Interpretation quality varies by
  caller; token math never does.
- **Deterministic + reproducible.** Same brief + same engine version → deep-equal kit/doc (§6.4).
  Refinement = patch the brief, regenerate; the loop is stable because generation is pure.
- **No dead-end kits.** Post-generate, the full read surface + `export_tokens(format)` work against
  the generated kit (§7), and the doc JSON is the open-in-app off-ramp for hand-tuning.
- **Local/hosted tool-surface parity**, gated like the brand-kit sibling (§8).

**Constraints (load-bearing)**
- **No server-side LLM in the local flavor.** The calling agent is the interpreter. Description-only
  calls return a briefing payload and *never* generate (#371).
- **Family names are a fixed enum** of the canonical 8 (§3.1) — the shadcn emitter matches family
  names by regex, so the LLM never names palettes.
- **Seeds clamp through `src/ui/persist.js` domains** before reaching the engine — a schema-invalid
  brief degrades to a clamped doc + lint notes, never a rejection (§4.4).
- **Zero new runtime dependencies** anywhere: core, stdio server, PNG encoder (#373: stored-deflate,
  ~100 lines), retrieval.
- **Pro-gated, both flavors** — settled by the #379 ruling (2026-07-18), not relitigated here (§9).
- **`docs/site/mcp-hosting-spec.md` §1 states "the generator stays client-side."** The hosted flavor
  (#377) deliberately breaches that constraint; **ratifying the amendment is #376's ADR**, which the
  hosting spec must then reference. This spec *depends on* that ADR for §8's hosted column and does
  not amend the constraint itself.

---

## 2. Architecture at a glance

| Concern | Choice | Why |
|---|---|---|
| Interpretation | the **calling agent**, taught in-band by the briefing payload | prompts are unreliable delivery; the tool result is guaranteed in context at the moment of use |
| Generation | **`mcp/describe-kit-core.mjs`** (PURE, beside `brand-kit-core.mjs`) | brief → clamp → doc → `brandKit(doc)`; both flavors import it — parity by construction |
| Engine path | `toneMode:"perceptual"`, `hueSpace:"oklch"` (all brief hues are OKLCH hues) | the perceptual OKHSL distribution the rubric's hue/chroma vocabulary is calibrated to |
| Server | **merged into the brand-kit read server** (#374) | a generated kit immediately serves `list_palettes` / `resolve_token` / … / `export_tokens` |
| Preview | PNG swatch board as an MCP **image content block** + a **lint array** (#373) | vision-capable callers self-critique; text-only callers still get an actionable signal |
| Hosted flavor | the Phase B Worker (#377), + a demoted `describe_palette` for LLM-less clients (#376) | one deliberate asymmetry; everything else parity-gated (§8) |

```
 agent ── generate_kit{description} ──▶ briefing payload (rubric · schema · exemplars · research) ──┐
   ▲                                                                                                │
   └── interprets words → PaletteBrief (numbers/hexes only) ◀───────────────────────────────────────┘
   │
   └─ generate_kit{brief} ──▶ describe-kit-core.mjs (PURE, deterministic)
                                 brief → clamp (persist.js domains) → doc (8 palettes,
                                 toneMode "perceptual") → brandKit(doc)
                              ──▶ { kit · doc · lint · meta(stamp) } + PNG swatch board
   │
   └─ refine: patch the brief, resend        └─▶ read tools + export_tokens now serve this kit
```

---

## 3. The PaletteBrief schema

`$id: "ultimate-tokens-palette-brief/1"`. Published verbatim inside every briefing payload (§5.2) —
the schema the agent constructs against and the hosted `describe_palette` forces tool-use against
(#377). Validation is **advisory**: construction targets this schema; the server clamps rather than
rejects (§4.4).

```json
{
  "$id": "ultimate-tokens-palette-brief/1",
  "type": "object",
  "required": ["families"],
  "properties": {
    "name":   { "type": "string" },
    "story":  { "$ref": "#/$defs/story" },
    "families": {
      "type": "object",
      "required": ["Primary"],
      "properties": {
        "Neutral":   { "$ref": "#/$defs/familySeed" },
        "Primary":   { "$ref": "#/$defs/familySeed" },
        "Secondary": { "$ref": "#/$defs/familySeed" },
        "Tertiary":  { "$ref": "#/$defs/familySeed" },
        "Info":      { "$ref": "#/$defs/familySeed" },
        "Success":   { "$ref": "#/$defs/familySeed" },
        "Warning":   { "$ref": "#/$defs/familySeed" },
        "Danger":    { "$ref": "#/$defs/familySeed" }
      },
      "additionalProperties": false
    },
    "global": {
      "type": "object",
      "properties": {
        "vibrancy": { "type": "number", "minimum": 0, "maximum": 100 }
      },
      "additionalProperties": false
    }
  },
  "$defs": {
    "familySeed": {
      "type": "object",
      "properties": {
        "hue":          { "type": "number", "minimum": 0,    "maximum": 360 },
        "chroma":       { "type": "number", "minimum": 0,    "maximum": 100 },
        "skew":         { "type": "number", "minimum": -100, "maximum": 100 },
        "lift":         { "type": "number", "minimum": -40,  "maximum": 40  },
        "cuspPull":     { "type": "number", "minimum": 0,    "maximum": 100 },
        "keyColor":     { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "supportColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "colorName":    { "type": "string" },
        "description":  { "type": "string" },
        "colorRole":    { "enum": ["dominant", "supporting", "accent"] }
      },
      "additionalProperties": false
    },
    "story": {
      "type": "object",
      "properties": {
        "title":     { "type": "string" },
        "kicker":    { "type": "string" },
        "narrative": { "type": "string" },
        "refuses":   { "type": "string" },
        "groups": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["hier", "pct"],
            "properties": {
              "hier": { "enum": ["d", "s", "a"] },
              "pct":  { "type": "number" },
              "note": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

### 3.1 The family enum

Keys of `families` are **exactly** the 8 canonical names from `docs/reference/data/role-table.json`
→ `defaults[].name`: **Neutral · Primary · Secondary · Tertiary · Info · Success · Warning ·
Danger**. The core copies each key verbatim into the palette's `name` — that is what keeps the
shadcn name-matcher regex, the semantic-role slugs (`kit.roles.neutral` … `kit.roles.danger`), and
the read tools' `palette` args all working without any LLM-chosen names. No other family may be
created; overflow referents become key colors on these ramps (§4.3), never extra families.

### 3.2 The per-family seed

- `hue` — **OKLCH hue**, 0–360 (the doc is generated with `hueSpace:"oklch"`; the rubric's hue-wheel
  anchors are OKLCH anchors). `chroma` — 0–100, % of gamut; the rubric's vocabulary ladder (pastel
  ~25 · muted ~40 · vivid ~80 · neon ~100, #370) is calibrated to this scale. `skew` (−100..100) and
  `lift` (−40..40) — ramp shaping, semantics per the rubric. Domains are `persist.js` `DOMAINS.palette`,
  restated here so the schema and the clamp can never disagree.
- `cuspPull` — optional per-family override of `global.vibrancy` (the engine's existing per-palette
  control, `tonal.js` okhsl path; absent → inherit the global).
- `keyColor` — **used when the user/theme names a real color** (a hex the agent looked up or was
  given). The core converts it to OKLCH, attaches it as the palette's `keyColors` **dominant** entry
  (the existing perceptual-lens placement path — the ramp is bent through it exactly as an app-side
  key color would be), and derives the family's `hue`/`chroma` from it. **Precedence: `keyColor`
  wins** — sibling `hue`/`chroma` values are ignored (with a `key-color-precedence` lint note, §6.3);
  `skew`/`lift`/`cuspPull` remain honored alongside it. `supportColor` maps to the **supportive**
  keyColors entry (persist allows exactly one of each role per palette).
- `colorName` / `description` / `colorRole` — the story annotations `persist.js` `clampPalette`
  already round-trips (from the curated-preset schema); optional, carried into the doc so the
  open-in-app off-ramp keeps the narrative.

Two distinct, easily-confused enums live side by side here: `keyColors.role` is
`dominant`/**`supportive`** — which ramp-placement slot a hex occupies. `colorRole` above is
`dominant`/**`supporting`**/`accent` — a narrative label, unrelated to ramp placement. Do not
normalize one into the other.

### 3.3 The global block

`global.vibrancy` (0–100, default 0 = the persist domain default) is the one perceptual-path control
the brief may set globally; it drives `tonal.js`'s cusp-anchoring blend. Everything else about the
doc — `curve`/`tension`/`lmin`/`lmax`/`damp*`/`chromaFloor`/`onColorMode`/`accentRef` — pins to the
persist defaults, with `toneMode:"perceptual"` and `hueSpace:"oklch"` **forced** (a brief cannot
change them). Widening the global block is a spec change, not a build-time judgment call.

### 3.4 The set-level fields

`name` — the kit/set name (free string; defaults from `story.title` per `brandKit`'s existing
fallback). `story` — the set-level concept narrative in exactly `persist.js` `clampStory`'s shape
(title · kicker · narrative · refuses · groups `{hier: d|s|a, pct, note}`), the same d/s/a
hierarchy-tiering spine the rubric teaches (#370) — so the interpretation's reasoning survives into
the doc as data, not just as colors.

---

## 4. Defaulting, family mapping, and the status distinctness gate

All rules in this section live in the **deterministic core** (#369/#372) and are *stated* in the
rubric (#370) so the agent can predict them — but the core enforces them regardless of what the
agent sends.

### 4.1 Absent-family defaults

A brief carries only the families the theme determined; the core fills the rest deterministically:

- **Neutral** absent → the brief's Primary hue at the role-table default chroma/skew/lift
  (`chroma 29 · skew −20 · lift 0` — the role-table's own Neutral-follows-Primary shape).
- **Secondary / Tertiary** absent → harmony recipes, both now ruled (§12 item 7): **Secondary** is
  the **complement** of Primary (180°); **Tertiary** (#372) is the **analogous** of Secondary (30°).
  Named constants in `describe-kit-core.mjs` (`SECONDARY_HARMONY_OFFSET`, `TERTIARY_ANALOGOUS_OFFSET`)
  — #370's rubric must teach agents the identical recipe, or an underdetermined brief and a
  rubric-following agent disagree and the determinism goal (§1) breaks.
- **Info / Success / Warning / Danger** absent → the `role-table.json` conventional defaults —
  **Info 235 · Success 145 · Warning 70 · Danger 27** (chroma 40 · 55 · 100 · 55 respectively, with
  the role-table's skew/lift) — plus a **brand-hue nudge**: a bounded, deterministic pull of each
  status hue toward the brief's Primary hue that never leaves the status family's conventional band
  (§4.2). An *explicitly provided* status seed is taken as-is (no nudge) and only subject to the
  distinctness gate.

### 4.2 The status distinctness gate — RESOLVED (#372's build)

Theme palettes collide with status conventions (the canonical case: a Siberian-tiger Primary at hue
~27–50 sits on Danger 27 and near Warning 70). After defaulting, the core enforces a **minimum
OKLCH-hue separation between each brand family (Primary/Secondary/Tertiary) and each status family**
(Neutral excluded — the ticket's own stated scope), resolved in a stated order, over every fully
resolved+clamped palette regardless of whether its hue was given or defaulted:

1. **Shift the status hue to whichever edge of its own band maximizes the worst-case distance** to
   any brand hue (not just the one that originally collided — a status family is checked against all
   three brand families at once).
2. **Band exhausted** (even the best edge stays under the threshold) → keep that best-effort hue and
   differentiate by **chroma** instead (pushed to the domain max — a status role reads as
   vivid/saturated anyway, so this rarely reads as a compromise; lift differentiation was scoped out
   as unneeded once chroma alone cleared every real case tested).

The band edges per status family, the minimum-separation threshold, and the nudge magnitude (§4.1)
are **named constants in `describe-kit-core.mjs`**: `STATUS_BANDS[name] = {center, halfWidth}` (center
= the family's own role-table hue, OKLCH-converted; `halfWidth = 20°`), `MIN_HUE_SEP = 25°`,
`BRAND_NUDGE = 8°` (≤ every band's halfWidth by construction, so the nudge alone can never leave the
band). Centered on the role-table defaults above; verified against the tiger-orange acceptance case
(Primary hue 40 → Danger and Warning both land ≥25° from Primary) plus a forced band-exhausted case
(Primary pinned exactly on a status band's center, where both edges tie at 20° < 25°, forcing the
chroma fallback). Every gate resolution emits a `status-distinctness` lint entry (§6.3).

### 4.3 Referent count ≠ family count

- **Fewer referents than families** → fill per §4.1; never invent referents.
- **More referents than families** → overflow referents become **key colors on existing ramps**
  (`supportColor`, or additional dominant placements on the family they're nearest) — **never extra
  families**. The rubric instructs this; the schema makes it structural (`additionalProperties:
  false` on `families`).

### 4.4 Clamping (never rejecting)

Any object sent as `brief` generates. Per-field: numbers clamp to the `persist.js` domain bounds
(nearest bound, per-field isolation — an out-of-domain field never resets its siblings), unknown
enum values fall to defaults, unknown properties are dropped — each divergence emitting a `clamped`
lint entry. Only a non-object `brief` is a tool error. This is #371's acceptance ("schema-invalid
briefs degrading to clamped docs") made precise. The core shares persist's `DOMAINS`/`clampPalette`/
`clampStory` by direct import (§12 item 1, resolved in #369's build) — the effective domains are
persist's, by construction.

---

## 5. The two-step `generate_kit` protocol

One tool, two modes, discriminated by which argument is present. JSON-RPC 2.0, protocol
`2025-06-18`, same framing/conventions as `brand-kit-core.mjs` (`tools/call` → `content` blocks).

```
inputSchema: { type: "object", properties: {
  description: { type: "string" },   // mode 1: teach
  brief:       { type: "object" }    // mode 2: generate (the PaletteBrief)
} }
```

**Precedence: `brief` wins.** If both are given, the core generates from the brief and ignores the
description (lint-noted) — so an agent that re-sends its description alongside a constructed brief
still gets a kit, and an agent that sends *only* a description gets taught. The design self-corrects:
there is no call shape that silently produces the wrong mode.

### 5.1 Mode 1 — `{description}` → the briefing payload (never generates)

Returns **one text content block** containing a JSON object:

| field | contents |
|---|---|
| `rubric` | the interpretation method (markdown, #370): referent extraction (concrete things in the scene, not mood adjectives) · d/s/a hierarchy tiering with percentages · a named refusal · sourcing discipline · OKLCH hue-wheel anchors · the chroma vocabulary ladder · skew/lift semantics · harmony recipes · the §4 rules stated |
| `schema` | the PaletteBrief JSON Schema (§3), verbatim |
| `exemplars` | keyword-retrieved, theme-adjacent entries from the bundled exemplar corpus (~15 entries total in the package; retrieval returns the adjacent subset) |
| `research` | the research-tier instruction: *if the theme names a specific real subject, look up its documented colors first* (most hosts have web search) — found colors enter the brief as `keyColor` hexes |
| `instructions` | the round-trip contract: construct a PaletteBrief per `schema` + `rubric`, call `generate_kit` again with `{brief}` |

The rubric, exemplars, and retrieval ship **inside the MCP package** (#370) — no network, no
installed skills assumed. The exemplar entries are the same artifact family as the golden-description
eval set (#375).

### 5.2 Mode 2 — `{brief}` → the kit

Runs `describe-kit-core.mjs`: brief → clamp (§4.4) → defaults + mapping + distinctness gate (§4.1–4.3)
→ doc (8 palettes, `toneMode:"perceptual"`) → `brandKit(doc)`. Result payload in §6.

### 5.3 The expected round trip

1. Agent calls `generate_kit{description}` → briefing payload.
2. Agent (optionally) researches named real subjects, extracts referents, tiers them d/s/a per the
   rubric, maps them onto the 8 families, writes numeric seeds / keyColor hexes → a PaletteBrief.
3. Agent calls `generate_kit{brief}` → kit + doc + PNG + lint.
4. Refine: the agent (seeing the PNG, reading the lint, or told "warmer, less Miami") **patches the
   brief and resends** — never edits hexes in the output. Determinism (§6.4) keeps the loop stable.

---

## 6. The generation result

One `tools/call` result carrying **a text block (the JSON digest, standing alone on hosts that drop
images) + an image block (the PNG swatch board)**.

### 6.1 The JSON digest (text block)

| field | contents |
|---|---|
| `kit` | the resolved `brand-kit.json` — the exact shape `brandKit(doc, systems)` produces (`$schema: "ultimate-tokens-brand-kit/1"`; palettes + ramps, 53 roles light+dark per palette, constants, motion, icons) |
| `doc` | the app-doc JSON (the persist-shaped State) — the **open-in-app off-ramp** for hand-tuning; the exact import path is #369's open item (§12) |
| `lint` | the advice array (§6.3) |
| `meta` | the reproducibility stamp (§6.4) |

### 6.2 The PNG swatch board — RESOLVED (#373's build)

A flat-color swatch board (`mcp/png-swatch-board.mjs`) encoded with **zero dependencies** — a
hand-rolled PNG writer (CRC-32, Adler-32, DEFLATE's "stored" uncompressed block type, PNG chunk
framing) rather than a real compression library, since a few dozen solid-color pixels need none —
returned as an MCP image content block (`{type:"image", data: base64, mimeType:"image/png"}`). A
**4×2 grid, 80px swatches** (320×160 total), FAMILY_NAMES order (brand families top row, status
families bottom row), each swatch sourced from that family's own ramp **500-stop hex** — the exact
value the #373 acceptance checks against ("swatch colors deep-match the kit"). Verified against a
REAL independent decoder (Node's own `zlib.inflateSync`, in tests only — the shipped encoder stays
dependency-free) and deterministic (the same kit always encodes to byte-identical bytes, spec §6.4).
Computed **lazily at dispatch time**, not baked into `generateKit`'s own return shape — the pure core
and the MCP-tool wrapper (`generateKitTool`) stay unaware of images; only the transport layer
(`attachImageBlock`, appended to `describe-mcp-core.mjs`) builds one, for any dispatcher whose reply
carries a generated kit — including the merged server (#374), via the SAME exported helper, with no
changes to `brand-kit-core.mjs`.

### 6.3 The lint array — RESOLVED (#373's build)

`lint: [{ level: "error"|"warn"|"info", code: string, message: string, ...context }]`. Codes:
`contrast`, `chroma-budget`, `clamped` (§4.4 divergences), `status-distinctness` (§4.2 resolutions),
`key-color-precedence` (§3.2), `description-ignored` (§5 precedence). The array is the text-only
caller's signal channel — every automatic correction OR advisory is visible in it, silent otherwise
(no routine "everything's fine" noise, matching the existing codes' own philosophy).

- **`contrast`** — the prime/on-prime pairing's WCAG ratio (light AND dark), warned when either falls
  under **`CONTRAST_MIN = 3.0`** (`describe-mcp-core.mjs`) — the large-text/UI-component floor, not
  the stricter 4.5 body-text one: the app's own "fixed" `onColorMode` (ADR-003) targets exactly this
  floor, and the DEFAULT document's own dark-mode ratios already cluster at 3.0-3.4. A fine sweep of
  the brief's exposed per-family parameters (hue/chroma/skew/lift) found a worst reachable case of
  ~3.028 — THIN headroom, not a wide margin: this floor is close to being exercised by legal input, so
  a regression test pins the exact worst-known config (`test/mcp/describe-mcp-core.mjs`) rather than
  trusting the margin to hold across future engine changes.
- **`chroma-budget`** — ONE advisory (not per-family) when the 8 families' average chroma clears
  **`CHROMA_BUDGET_AVG_THRESHOLD = 80`** (near the rubric's "vivid" tier, #370). The app's own default
  document already averages ~63 (role-table.json mixes vivid brand accents with muted status/support
  families by convention), so this only fires on a theme that has deliberately pushed most families
  high — info level, not a warning: a bold, near-neon kit can be entirely intentional.

Both checks read the FINAL resolved kit/doc (not construction-time concerns like the others), and
live at the MCP-tool layer (`describe-mcp-core.mjs`'s `generateKitTool`), not inside
`describe-kit-core.mjs`'s own `generateKit` — that module's scope stays clamp/default/distinctness
only, matching its own stated header comment.

### 6.4 The reproducibility stamp

```
meta: {
  generator:     "Ultimate Tokens",
  engineVersion: <package.json version>,
  kitSchema:     "ultimate-tokens-brand-kit/1",
  briefSchema:   "ultimate-tokens-palette-brief/1",
  brief:         <the originating brief, verbatim as received>
}
```

The stamp is the replay handle: resending `meta.brief` to any server on the same `engineVersion`
reproduces a deep-equal `kit` and `doc` (and byte-identical PNG). The hosted `describe_palette` path
echoes the brief for the same reason (#377).

---

## 7. The merged server surface — RESOLVED (#374's build)

The generator merges **into** the brand-kit read server — one core, one surface — so a generated kit
never dead-ends. Shipped as new, additional files (`mcp/brand-kit-merged-core.mjs` +
`mcp/brand-kit-merged-server.mjs`) — the existing standalone `brand-kit-server.mjs` and
`describe-mcp-server.mjs` are both left intact; deliberate reuse of `brand-kit-core.mjs`'s own
`handle` dispatcher (already fully generic over a `surface` object) rather than a third near-copy of
the same JSON-RPC switch:

- **Boot:** the merged server starts with or without a sibling `brand-kit.json` (unlike today's
  read-only server, which exits without one). Kitless boot serves the generator surface only; the
  read surface appears once a kit exists — this falls out of composition for free (`buildSurface(kit
  || {})`'s own presence-driven tool list naturally contributes zero read tools for an empty kit),
  not special-cased.
- **Post-generate:** the surface rebinds to the generated kit — `list_palettes` · `get_ramp` ·
  `resolve_token` · `get_semantic` · `nearest_token` · `get_type` · `get_geometry`, the
  `brand://…` resources, and the `apply_brand` prompt all serve it immediately. Within a session,
  last generate wins; a loaded sibling kit is the initial binding. A **teaching-mode** (`{description}`)
  call never rebinds — only a successful generation does, so exploring the method mid-session can't
  clobber an already-bound kit.
- **`export_tokens(format)`** — wraps `src/engine/exports.js`, via the SAME `projectView(doc).exports`
  the app's own export drawer reads from (no duplicated exporter wiring). `format` enum: `css` ·
  `oklch` · `json` · `dtcg` · `ui3` · `tailwind` · `shadcn` · `all` (the 7 named formats aggregated
  into one multi-file response — `all` is the only one of the 8 enum values that's actually
  multi-file; each named format alone is one file). Response: `{ files: [{ name, mimeType, text }] }`
  — array-shaped for `all`'s sake, not because any single named format is itself multi-file.
  Available whenever the server holds a **doc** (always true post-generate); a downloaded-kit-only
  session has no doc, so `export_tokens` returns a graceful `{ error }` (matching the read tools' own
  precedent, e.g. `get_ramp`'s "no palette …" shape) until a real generate call happens. Whether the
  downloadable zip itself grows a doc (so a *downloaded* kit could also export_tokens) still rides
  #374's packaging open (§12 item 3) — unresolved; this build only wires the mechanism.

---

## 8. The local/hosted parity contract

Every child issue says "parity-gated identical." Mechanically, that means **tool-surface parity, not
full feature parity**, asserted at three gates:

| gate | asserts | where |
|---|---|---|
| **G1 core↔app** | golden brief → core `kit` deep-equals the app's `brandKit(doc, systems)` export for the same doc | `npm test` (#369 acceptance) |
| **G2 surface** | `tools/list` (names + inputSchemas) identical between the local stdio server and the hosted Worker, **modulo the enumerated hosted-only set** below | `test/mcp/` + the Worker's parity test (mirrors `test/mcp/core.mjs`) |
| **G3 output** | same brief → the hosted `generate_kit` result (`kit`/`doc`/`lint`/`meta`, PNG bytes) deep-equals the local result | by construction (both import `describe-kit-core.mjs`) + asserted in #377's acceptance |

**The enumerated hosted-only set** (the *only* permitted asymmetries, excluded from G2 by name):
1. `list_kits` + the `kit` arg — the hosting spec's existing account-scoped additions (§7 there).
2. **`describe_palette`** — the demoted server-LLM path (#376): exists **only hosted**, **only for
   LLM-less clients** (the web describe box, plain HTTP/curl). One provider call with **forced
   tool-use against the PaletteBrief schema** (output guaranteed schema-valid), the brief echoed
   back as the replay handle, then the same deterministic core. Agent callers are steered to
   `generate_kit` by tool descriptions — routing an Opus-class caller through a Haiku-class server
   interpretation caps quality at the weaker model and adds cost + an abuse surface. Ratified by
   #376's ADR, not by this spec.

Anything else differing between flavors is a parity failure, not a judgment call. Interpretation
quality (the words→brief step) is explicitly **outside** the parity contract — it varies by calling
model and is gated separately by the eval set (§11).

---

## 9. Tier gating (settled — do not relitigate)

Per the #379 ruling (2026-07-18): **both flavors sit behind the Pro tier** — a premium capability,
not bundled with the free downloadable kit. Concretely:

- Add **`describePalette`** to `FLAG_KEYS` and `TIER_FLAGS` in `src/engine/flags.js`
  (`free: false`, `pro: true`) — a small addition #369's build makes.
- **Local:** the generator's packaging/download surface in the app is gated by
  `flagOf("describePalette")` (the `proExport`/`hostedMcp` pattern; locked → `_proUpsell()`). This is
  a deliberate narrowing of the ruling's literal wording ("the local server's **generate_kit** tool"
  reads flagOf) to what a zero-dep, offline stdio server can actually enforce: once downloaded, the
  server has no live entitlement check to call — the same reason the read-only sibling ships
  free+offline by design. The gate that matters is therefore **at download time**, not call time —
  a hard constraint on §12 item 3's still-open packaging question: whatever the generator's packaging
  resolves to (standalone zip, merged into the export-drawer zip, replacing or joining the brand-kit
  zip), it MUST stay behind this gate. A Free user's existing brand-kit-zip download must never gain
  `generate_kit` as a side effect of a packaging choice.
- **Hosted:** `generate_kit` + `describe_palette` on the Worker are entitlement-gated
  **server-side** (the hosting spec's LS-by-email + webhook model), never the client-side check,
  with rate limiting and abuse protection (#377).

---

## 10. Packaged knowledge (rubric · exemplars · evals — one artifact family)

- The **rubric** is distilled *from* `docs/reference/colors/categories/` (the story-schema corpus:
  sourced referents with per-swatch `hier: d|s|a`, named refusals, seasonal/temporal sourcing lines),
  not written fresh (#370).
- **~15 exemplar entries** span categories (eras, nature, film, brand moods) + cheap keyword
  retrieval, bundled in the MCP package; the two canonical retrieval test asks are *"1980s at the
  Bel Air Hotel Pool Party"* and *"Siberian Tigers on Parade"* (#370 acceptance).
- The **golden-description eval set** (#375) — descriptions → acceptable per-family hue/chroma bands
  — reuses the exemplar entries as few-shot, so rubric, exemplars, and evals cannot drift apart.

---

## 11. Quality gates

| gate | mechanism | blocking? |
|---|---|---|
| Golden brief → snapshot kit | `npm test` (`test/mcp/`), zero-dep | yes |
| Core↔app parity (G1) | deep-equal vs the app export | yes |
| Two-step round trip | description → briefing → brief → kit; invalid-brief clamping; no network | yes |
| Tiger-orange distinctness | Primary hue 27–50 → distinguishable Danger + Warning (#372) | yes |
| PNG + lint | decodable PNG matches families; text digest stands alone | yes |
| `export_tokens` | each of the 8 formats returned for a generated kit | yes |
| Surface + output parity (G2/G3) | shared-core + Worker parity test | yes (at #377) |
| Interpretation quality | eval runner vs per-family bands, against the hosted interpreter model | **no** — scheduled/manual CI (LLM cost/flake) |

---

## 12. Open decisions

1. ~~**Clamp-domain sharing**~~ — **RESOLVED (#369's build):** `describe-kit-core.mjs` imports
   `DOMAINS`/`clampPalette`/`clampStory` directly from `persist.js` (all three newly exported —
   already pure, dependency-free) rather than duplicating the domain table. `persist.js` living under
   `src/ui/` is a directory-ownership convention, not a DOM-purity boundary; the same is already true
   of `model.mjs`'s `brandKit`, which every flavor imports. Effective domains ARE persist's, by
   import, not by restatement — no separate parity gate needed for this half of §4.4's contract.
2. **The open-in-app doc-import path** (#369): how a user loads the emitted `doc` JSON into the app
   (existing config import vs a dedicated route). `describe-kit-core.mjs`'s build proved the
   *mechanism* — `hydrate(doc)` plus reattaching `doc.name` (which `hydrate` drops, same as
   `app.js#_restore`) round-trips a generated doc back to the exact original kit — but the UI
   *route* a user takes to do this is still open.
3. **Packaging** (#371 × #374): standalone zip vs inside the existing export-drawer MCP zip; and
   whether the merged server *replaces* the current brand-kit zip or ships beside it (one server
   serving both a downloaded and a generated kit). Interacts with §7's "doc present" condition for
   `export_tokens`.
4. ~~**Numeric constants**~~ — **RESOLVED (#372's build):** `STATUS_BANDS` halfWidth `20°`,
   `MIN_HUE_SEP = 25°`, `BRAND_NUDGE = 8°`, tuned against the tiger-orange case (§4.2) and a forced
   band-exhausted case. Open only if a future theme surfaces a real collision these don't resolve —
   not expected to be common, since the gate checks the WORST-CASE distance across all three brand
   families at once, not just the one that originally collided.
5. **Exemplar count vs briefing-payload token budget** (#370): ~15 is the target; the briefing
   payload returns a retrieved subset — subset size vs payload weight is tuned in-build.
6. **Eval ops** (#375): CI custody of the provider key; run cadence given nondeterminism.
7. ~~**The Secondary-from-Primary harmony recipe**~~ — **RESOLVED (#369's build):** Secondary
   (absent) is the **complement** of Primary (`SECONDARY_HARMONY_OFFSET = 180°`, the classic
   two-color brand pairing); Tertiary (absent) is the **analogous** of Secondary
   (`TERTIARY_ANALOGOUS_OFFSET = 30°`), both named constants in `describe-kit-core.mjs`. #370's
   rubric must teach agents the identical recipe, or an underdetermined brief and a rubric-following
   agent will disagree (the determinism goal, §1) — #370's build reads these two constants rather
   than re-deriving the choice.

## 13. Risks & open questions

- **The hosted flavor is blocked** on domains (hosting-spec step zero), Phase B accounts/OAuth, and
  #376's ADR — nothing in §8's hosted column ships before those. The local flavor (#369–#374) has no
  such dependency and lands first.
- **The hosting-spec constraint amendment** (§1) must land as #376's ADR *before* #377 builds;
  shipping the hosted generator without it is silent drift on a load-bearing constraint.
- **Engines in a Worker:** the engines are pure DOM-free ESM and *expected* to run in a Worker —
  verify early in #377 (the hosting spec's Phase A lesson: lock the surface first).
- **Interpretation variance:** the deterministic core caps the blast radius of a weak interpreter at
  "aesthetically off," never "invalid tokens" — but rubric regressions are only caught by the
  non-blocking eval (§11); treat eval misses as defects, not noise.
- **Briefing-payload weight:** the rubric + schema + exemplars ride inside a tool result on every
  description-mode call; hosts with small context windows are the constraint driving open decision 5.
- **PNG encoder scope creep:** stored-deflate stays ~100 lines and flat swatches only — resist
  gradients/labels that would pull in a real encoder (the zero-dep constraint is load-bearing).
