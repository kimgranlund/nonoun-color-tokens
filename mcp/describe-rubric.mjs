// describe-rubric.mjs — the interpretation RUBRIC + a bundled EXEMPLAR corpus + cheap keyword retrieval
// for the describe-palette generator (#370, a child of the #379 program). Contract:
// docs/site/describe-palette-spec.md §5.1/§10. Ships INSIDE the MCP package: an MCP host has no nonoun
// skills, agents, or corpus installed, so the words->seeds METHOD has to travel in the tool result itself
// (the briefing payload) rather than live in a skill file only Claude Code would ever load.
//
// Distilled FROM the real story-schema corpus (docs/reference/colors/categories/*.json) per #370's own
// instruction — NOT written fresh. Every citation below (a kicker, a swatch name, a `refuses` line, a
// hierarchy percentage) is copied or lightly summarized from an actual palette in that corpus. The
// EXEMPLARS array distills 15 of those real palettes into (a subset of) the PaletteBrief shape (spec §3)
// so they double as few-shot examples of description -> brief mapping (the `exemplars` field of §5.1's
// briefing payload) — the same artifact family the golden-description eval set (#375) reuses.
//
// Sibling: mcp/describe-kit-core.mjs (the deterministic core this rubric must agree with bit-for-bit on
// the one underdetermined recipe that has to match exactly — the Secondary/Tertiary harmony offsets,
// IMPORTED below rather than restated, so the two can never drift apart; see §12 item 7 of the spec).
//
// Scope (per #370): rubric + exemplars + retrieval ONLY. No MCP server, no tool framing, no generate_kit
// wiring (#371's job) — this module just exports data + one pure function for whatever assembles the
// briefing payload later.

import { readFileSync } from "node:fs";
import { hexToOklch, seedFromKeyColor } from "../src/ui/model.mjs";
import { FAMILY_NAMES, SECONDARY_HARMONY_OFFSET, TERTIARY_ANALOGOUS_OFFSET } from "./describe-kit-core.mjs";

const HERE = new URL(".", import.meta.url);
// Read role-table.json directly (mirrors describe-kit-core.mjs's own convention) rather than importing its
// private ROLE_DEFAULTS map — so this module has no coupling to describe-kit-core.mjs beyond the two named
// harmony constants it deliberately re-exports for parity.
const ROLE_TABLE = JSON.parse(readFileSync(new URL("../docs/reference/data/role-table.json", HERE), "utf8"));
const ROLE_DEFAULTS = new Map(ROLE_TABLE.defaults.map((d) => [d.name, d]));
const rt = (name) => ROLE_DEFAULTS.get(name);

// seedOf(hex) — the SAME conversion describe-kit-core.mjs uses for a brief's `keyColor` (§3.2): a real,
// documented color becomes a numeric {hue, chroma} seed, never a hand-guessed one. Every numeric citation
// in the rubric text below, and every exemplar family seed derived from a hex, goes through this — so if
// the engine's OKLCH/CAM16 math ever changes, these citations move with it instead of silently going stale.
const seedOf = (hex) => seedFromKeyColor(hexToOklch(hex), "oklch");
const chromaOf = (hex) => seedOf(hex).chroma;
const hueOf = (hex) => seedOf(hex).hue;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RUBRIC
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const RESEARCH_TIER_NOTE =
  "Research tier: if the theme names a specific real subject (a place, a brand, a film, a species, an " +
  "era with a documented look), look up its actual colors BEFORE inventing seeds — most MCP hosts carry " +
  "their own web-search tool. A found, documented color becomes a `keyColor` hex in the brief (§3.2), not " +
  "a hand-picked hue/chroma guess. Skip this step only for themes with no specific real referent to look " +
  "up (a mood, an abstract vibe, a made-up scene) — those are exactly what the hue-wheel + chroma-ladder " +
  "sections below are for.";

// The round-trip contract's one-line instruction (spec §5.1's `instructions` field) — kept here so #371
// doesn't have to restate it by hand when it assembles the briefing payload.
export const ROUND_TRIP_INSTRUCTIONS =
  "Construct a PaletteBrief object matching `schema`, using `rubric` (and, for a named real subject, your " +
  "own research) to pick referents and map them to families. Then call generate_kit again with " +
  "{ brief: <your object> } — never with description again alongside it (brief wins and description is " +
  "ignored, lint-noted, if both are sent). To refine after seeing the result, patch the brief and resend; " +
  "never hand-edit the output hexes.";

export const RUBRIC = `# Interpretation rubric — words → PaletteBrief seeds

You are the interpreter. This tool's deterministic core turns numeric seeds into every hex in the kit —
it never asks you for a color, only for **referents** (concrete things) tiered by **visual weight**,
turned into **hue/chroma/skew/lift numbers or a looked-up hex**. This rubric teaches that skill, distilled
from a real curated corpus (\`docs/reference/colors/categories/*.json\`) that already does it thousands of
times over. Every rule below is illustrated with a REAL palette from that corpus, not an invented one.

## 1. Referent extraction — concrete things, never mood adjectives

A referent is something you could point at in a photograph or hold up as a physical chip. "Warm", "moody",
"energetic", "elegant" are not referents — they are the ADJECTIVES a lazy palette reaches for instead of
looking at the actual subject. The corpus never does this. Compare:

- NOT "earthy, rugged mountain tones" — INSTEAD: **"Granite scree, pale grey"**, **"Karamatsu larch, autumn
  gold"**, **"Haimatsu pine, black-green"** — the Hotaka-range palette (Japanese Northern Alps, October)
  names the actual rock, the actual tree species, by their real seasonal color.
- NOT "exotic, wild jungle cat energy" — INSTEAD: **"Bengal tiger, burnt orange"** — the Sundarbans
  mangrove palette names the one animal and the one real fur color, not a feeling.
- NOT "appetizing, warm fast-food branding" — INSTEAD: **"Fiery Red"**, **"BBQ Brown"**, **"Mayo Egg
  White"**, **"Melty Yellow"** — Burger King's own 2021 guideline chip NAMES, sampled verbatim, not a
  paraphrase of what fast food "feels like".

Rule: for every referent, ask "what specific material, organism, pigment, or light condition is this?" If
the honest answer is a feeling instead of a thing, keep looking at the subject until you find the thing
that produces the feeling.

## 2. Hierarchy tiering (d / s / a) with percentages

Every corpus palette tiers its referents into three visual-weight bands, each carrying a percentage of the
scene:

- **d (dominant)** — the color that fills most of the field. Usually 45–60%. Maps toward **Primary** (or
  **Neutral**, if the dominant color is a background/ground material rather than a brand-reading hue).
- **s (supporting)** — the colors that give the dominant its structure; several referents, ~35–45%
  combined. Maps toward **Secondary**, **Tertiary**, and **Neutral**.
- **a (accent)** — rare, loud, SMALL-area punctuation — ~10%, never inflated just because it is the most
  interesting color. Maps toward a **Tertiary** or a status family's \`keyColor\`.

Real calibration: the Hotaka cirque runs **d 55 / s 35 / a 10** ("Pale granite is the whole cirque;
everything else sits on it" / "Larch gold, creeping-pine dark, and glacial jade — the living slope" /
"Rime white and rowan red as small, late reads"). Nike runs the identical **55/35/10** shape (jet black
dominant, box white + greys supporting, swoosh orange + University Red as rare, loud reads) — proof the
same discipline applies to a brand mood, not just a landscape.

Not every theme needs three tiers: the nonoun studio's own **Maison** product palette in the corpus is
**d 60 / s 40** with NO accent tier at all ("Vivid indigo-violet leads the whole system" / "Warm gold-green
and deep magenta-violet carry the rest") — a two-tier brief (Primary + Secondary/Tertiary, no third
punctuation color) is a legitimate, common shape, not an omission to fix.

## 3. The named refusal

Every corpus palette states the CLICHÉ version of its own theme and explicitly rejects it. This is not
decoration — naming what you are NOT doing is proof you looked at the real subject instead of reaching for
the stock idea of it. Real examples:

- Hotaka: *"Snowcap white as primary. In October the Hotaka is rock and gold, not the white pyramid of the
  brochure."*
- Nike: *"Not a rainbow of past colorway drops — Nike's brand identity is disciplined black and white, lit
  by a single orange-red accent, never a full spectrum."*
- Burger King: *"Not the 1990s photoreal, blue-swooshed fast-food logo it replaced — the flame identity is
  warm and fully analogous, unashamedly appetite-red, with no cool blue anywhere in it."*
- Antarctic Peninsula (a gentoo colony): *"Pure white wilderness. A working penguin colony is pink-stained
  and black-rocked; the pristine white is a distant view."*

Rule: before finishing a brief, write one sentence naming the generic/stock palette someone would reach for
on this theme with no research, and state why the real subject refuses it. If you cannot think of a
cliché to refuse, you have not looked closely enough yet.

## 4. Sourcing discipline

Every referent traces to something documented — a pigment history, a guideline spec, a specific hour of
daylight — never a vibe. The corpus's \`kicker\` line pins a palette to one exact moment: *"36° N · October
· 11:00 · Hotaka range above Kamikōchi, Japanese Northern Alps"* — a latitude, a month, an hour, a named
place, not "mountains in autumn". Nike's orange is not "a bold orange" — it is *"the shoebox and Nike+
accent, ≈Pantone 1655 C"*. The Corsa cycling palette sources its pink from print history, not aesthetics:
the Giro d'Italia's *maglia rosa* is pink because **La Gazzetta dello Sport is printed on pink paper**; the
Tour de France's *maillot jaune* is yellow because **L'Auto was printed on yellow paper** — real documented
provenance for why those colors exist at all, not "pink feels festive."

Rule: for a named real subject, find the actual documented color before inventing one (§10, the research
tier, below). For an abstract or invented theme, source each referent to a specific material/light/object
inside the SCENE you are describing, not to a generic association with the theme's category.

## 5. OKLCH hue-wheel anchors

Every \`hue\` in a PaletteBrief is an **OKLCH hue in degrees, 0–360** (not CAM16 — the doc generates with
\`hueSpace:"oklch"\`). General landmarks around the wheel: **0/360 red · 30 orange · 60 yellow · 90
yellow-green · 120 green · 150 teal-green · 180 cyan · 210 sky-blue · 240 blue · 270 violet · 300 magenta ·
330 rose/pink**, wrapping back to red.

This repo's own 8-family defaults calibrate against that wheel (\`docs/reference/data/role-table.json\`,
hue/chroma on the SAME 0–100 chroma scale the brief schema uses):

| family | hue | chroma | landmark |
|---|---|---|---|
| Neutral | ${rt("Neutral").hue}° | ${rt("Neutral").chroma} | violet-blue, muted |
| Primary | ${rt("Primary").hue}° | ${rt("Primary").chroma} | violet-blue, vivid |
| Secondary | ${rt("Secondary").hue}° | ${rt("Secondary").chroma} | teal-green, at-peak |
| Tertiary | ${rt("Tertiary").hue}° | ${rt("Tertiary").chroma} | magenta, muted |
| Info | ${rt("Info").hue}° | ${rt("Info").chroma} | blue, muted |
| Success | ${rt("Success").hue}° | ${rt("Success").chroma} | green, mid |
| Warning | ${rt("Warning").hue}° | ${rt("Warning").chroma} | amber/gold, at-peak |
| Danger | ${rt("Danger").hue}° | ${rt("Danger").chroma} | red-orange, mid |

Real corpus colors land where you'd expect on this wheel once converted the SAME way the core converts a
\`keyColor\` (\`hexToOklch\` + \`seedFromKeyColor\` — the exact function this rubric's own numbers below were
computed with): Nike's Total Orange (\`#FF6600\`) → hue **${hueOf("#FF6600")}°** (the orange band); BZZR's
electric-blue primary sits at hue **267°**, squarely on this repo's own Primary/Neutral default — "electric
indigo-blue" in the corpus's own words is a real product landing exactly on this wheel's violet-blue anchor.

## 6. The chroma vocabulary ladder

\`chroma\` is 0–100, **percent of gamut at that hue** (persist.js's own scale — the SAME scale
\`seedFromKeyColor\` recovers a real hex into). Four named rungs:

- **pastel ≈ 25** — airy, desaturated, "candy" colors.
- **muted ≈ 40** — present but restrained; most Neutrals and Infos live near here.
- **vivid ≈ 80** — confident, saturated, brand-forward.
- **neon ≈ 100** — at or near peak chroma; "electric" in the corpus's own vocabulary.

Real corpus hexes, converted with the exact same function the core uses for a brief's \`keyColor\`, land on
these rungs almost exactly — proof the ladder is calibrated to this repo's real gamut, not an arbitrary
0–100 guess:

| referent | hex | chroma | rung |
|---|---|---|---|
| Miami Beach stucco, flamingo pink | \`#E0ACAC\` | ${chromaOf("#E0ACAC")} | pastel |
| Grand Budapest Hotel facade, pastel pink | \`#E6A9AA\` | ${chromaOf("#E6A9AA")} | pastel |
| Serengeti lion coat, tawny | \`#A37F56\` | ${chromaOf("#A37F56")} | pastel/muted |
| Siberian larch, autumn amber | \`#D0944A\` | ${chromaOf("#D0944A")} | muted |
| Bengal tiger, burnt orange | \`#BB5D1B\` | ${chromaOf("#BB5D1B")} | mid (muted→vivid) |
| Corsa's Giro d'Italia rosa | \`#EA4F93\` | ${chromaOf("#EA4F93")} | vivid |
| Nike's Total Orange | \`#FF6600\` | ${chromaOf("#FF6600")} | vivid |
| Burger King's Fiery Red | \`#D62300\` | ${chromaOf("#D62300")} | vivid→neon |
| BZZR's primary (self-described "near-peak chroma") | parametric hue 267 | 98 | neon |

Rule: pastel/muted referents (rock, wood, fog, cream, mud, moss) almost always tier as **s** or **d**; the
loud, near-neon referents (a signal light, a berry, a logo mark, a single bright flower or bird) almost
always tier as **a** — the ladder and the hierarchy tiers reinforce each other.

## 7. Skew / lift semantics

\`skew\` (−100..100) and \`lift\` (−40..40) shape a family's own light↔dark ramp (\`src/engine/tonal.js\`'s
\`toneAt\`) — they do NOT touch hue or chroma:

- **skew > 0** biases the ramp's MID stops lighter/airier (a "brighter, punchier" reading ramp); **skew <
  0** biases mid stops darker/richer (a "deeper, moodier" reading ramp). Role-table calibration: most
  families default to skew **−20** (a slightly rich, non-washed-out ramp); **Warning defaults to skew
  +40** — amber/gold reads naturally light, so its ramp is deliberately biased lighter to match.
- **lift** is an ADDITIVE brightness bump centered on the ramp's anchor stop (500), fading to zero at the
  ramp's light/dark extremes. **lift > 0** punches the anchor brighter/hotter (Warning: **+15**, an
  "electric" amber core); **lift < 0** dips the anchor darker/deeper (Success and Danger both default to
  **−5**, a grounded, non-neon core even at high chroma).

Rule: leave skew/lift OUT of a family seed unless the theme specifically calls for a ramp that reads
lighter/darker or hotter/deeper than the family's own role-table default — the core fills them in from each
family's own role-table row regardless of which hue/chroma path (given, defaulted, or keyColor-derived) was
taken, so an omitted skew/lift is never a mistake, only a "use the family's own default" choice.

## 8. Mapping referents onto the 8 families + the harmony recipe

Families are a FIXED enum: ${FAMILY_NAMES.join(" · ")} — no other name may be used (§3.1); a theme rarely
determines all eight. Map what the theme actually gives you:

- The **d** referent → **Primary** (or **Neutral**, if it's a ground/background material rather than a
  brand-reading color).
- The strongest **s** referents → **Secondary**, **Tertiary**, and **Neutral** (whichever of these the
  theme hasn't already filled from **d**).
- A loud **a** referent → **Tertiary**, or a status family's \`keyColor\` if the accent IS literally a
  signal color (a warning light, a danger stripe) — never a 9th family.
- **Info / Success / Warning / Danger**: leave these OUT of the brief unless the theme itself determines
  a status color (a specific warning-light hex, a documented "safety green"). The core fills them from the
  role-table conventions in §5's table, nudged toward your brief's Primary hue but kept inside each status
  family's conventional band — that nudge-and-clamp is the core's job (§9 below), not yours.

**When the theme doesn't determine a Secondary or Tertiary, use this EXACT recipe — the core defaults to
the identical numbers, so a brief that skips them and one that states them explicitly must produce the
same kit:**

- **Secondary** (absent) = the **complement** of Primary — \`Primary.hue + ${SECONDARY_HARMONY_OFFSET}°\`
  (wrapped to 0–360). The classic two-color brand pairing.
- **Tertiary** (absent) = the **analogous** neighbor of Secondary — \`Secondary.hue +
  ${TERTIARY_ANALOGOUS_OFFSET}°\` (wrapped). A soft third note near the second.

Do not invent a different offset or a different relationship (e.g. a triad, a different analogous step) —
this is the one place where disagreeing with the core, even slightly, breaks the tool's determinism
guarantee: the SAME description interpreted twice (by you, or by a different agent reading this same
rubric) should reach compatible briefs.

A real corpus palette can also land a brand hue exactly ON a status family's conventional hue — Corsa's own
Tertiary (Vuelta a España red) sits at hue 27, identical to this repo's own Danger default (also hue 27,
see §5's table). That is not a mistake in the corpus; it is exactly the situation the core's status-
distinctness gate exists to resolve automatically (§9) — you do not need to avoid it yourself, just be
aware it can happen when a theme's dominant hue lands near a status band (roughly 0/27 red-orange, 70
amber, 145 green, 235 blue).

## 9. Rules the core enforces anyway (so you can predict them)

These are enforced in \`describe-kit-core.mjs\` regardless of what you send — stated here so your brief's
shape matches what will actually happen:

- **Absent-family defaults** — Neutral (absent) takes Primary's own hue at the role-table's Neutral
  chroma/skew/lift; Secondary/Tertiary follow §8's harmony recipe; Info/Success/Warning/Danger (absent)
  take the role-table conventions (§5's table) nudged toward your Primary's hue, clamped to stay inside
  each status family's conventional band.
- **The status-distinctness gate** — after defaulting, a brand family (Primary/Secondary/Tertiary) and a
  status family are never left indistinguishable: the status hue shifts deeper into its own conventional
  band first; if that band is exhausted, chroma/lightness (lift) differentiates them instead. You never
  need to hand-tune this — an EXPLICIT status seed you provide is honored as given (only clamped, never
  nudged), so only set Info/Success/Warning/Danger yourself when the theme truly determines one.
- **Referent count ≠ family count** — fewer referents than families is normal (§8's defaults fill the
  rest; never invent a referent just to fill a slot). MORE referents than families become key colors on an
  EXISTING family (\`supportColor\`, or another dominant placement) — never a 9th family. \`additionalProperties:
  false\` on \`families\` makes this structural, not just advisory.
- **Clamping, never rejection** — every numeric field clamps to its domain's nearest bound; nothing you
  send is ever rejected outright. Still aim for in-domain numbers — a clamped value is logged as a lint
  note, a visible signal that something in the brief didn't match the theme as cleanly as intended.

## 10. ${RESEARCH_TIER_NOTE}

## Worked example: "Siberian Tigers on Parade"

1. **Named real subject → research tier.** "Siberian tiger" (the Amur tiger) is a specific, documented
   animal — its coat is a real, photographable orange-and-black, not an abstract "wild" feeling. A host
   with web search would look this up; absent that, the corpus already has the closest documented analog:
   the Sundarbans mangrove palette's own **"Bengal tiger, burnt orange" (\`#BB5D1B\`)** swatch — the same
   genus, a real, sourced fur color, tiering as a rare **a** referent (10%) against a dominant mangrove
   green.
2. **The "on Parade" / setting half is a separate referent set.** Taiga is the Siberian tiger's actual
   range; the corpus's own **Baikal-hinterland larch taiga** palette (Siberia, early autumn) supplies real,
   sourced cold-forest referents: dominant **larch amber** (\`#D0944A\`, d 50%), supporting **birch yellow**
   and **dark spruce** (s 40%), accent **lingonberry red** (a 10%).
3. **Map to families**: Primary ← the taiga's dominant larch amber (the SCENE's dominant color, since "on
   parade" implies a procession moving through a place, not a single animal portrait) with \`colorName\`
   "Larch needles, autumn amber"; Secondary ← the spruce/birch supporting color; Tertiary ← the tiger's own
   burnt-orange as a \`keyColor\` (a named real subject's documented color, per the research tier) or the
   lingonberry accent, whichever reads louder for the theme; Neutral ← the peat/forest-floor umber.
   Info/Success/Warning/Danger are left OUT — nothing about this theme determines a status color, so the
   core's own defaults (nudged toward the taiga amber, distinctness-gated against it) apply.
4. **Refusal**: name the cliché — "uniform evergreen wilderness, tiger as a orange-and-black cartoon
   cutout" — and refuse it the way the corpus's own taiga entry does: *"the larch taiga's defining trick is
   that it turns gold and bare — a conifer that behaves like a birch"* — the real scene is amber and gold
   for two weeks a year, not permanent green, and the tiger is a rare glimpsed accent, not the whole field.

This is exactly the shape of the \`siberian-taiga-baikal\` and \`bengal-tiger-sundarbans\` entries in this
module's bundled EXEMPLARS — retrieving on a description like this one should surface both.
`;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EXEMPLARS — ~15 entries distilled from real corpus palettes, spanning eras / nature / film /
// brand moods (#370's own bucket list). Each carries the real corpus citation (`source`), the
// real named referents (`referents`, hier-tagged exactly as the corpus tags them), the corpus's
// own `hierarchy` percentages and `refuses` line, and a `families` object — a PARTIAL PaletteBrief
// `families` map (spec §3) built from a SUBSET of the referents (never all of them; leaving some
// referents un-mapped models §9's "referent count ≠ family count" rule directly: a real brief can
// push an extra referent onto a family as `supportColor` instead, this module just keeps the
// few-shot readable by mapping only the referents that decide a family's seed).
//
// hue/chroma seeds are DERIVED, not hand-typed: seedOf(hex) below runs the exact hexToOklch +
// seedFromKeyColor conversion describe-kit-core.mjs applies to a brief's own `keyColor` — so an
// exemplar's numeric seed is guaranteed correct relative to the real corpus hex it cites, never an
// eyeballed guess. Two brands.json entries (BZZR, Corsa) already ship as parametric {hue,chroma}
// presets in the corpus itself (they were built through the app, not hand-swatched) — those two
// use their own corpus numbers directly instead of re-deriving from a hex.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const HIER_TO_ROLE = { d: "dominant", s: "supporting", a: "accent" };

function familiesFrom(referents) {
  const families = {};
  for (const r of referents) {
    if (!r.family) continue;
    const seed = typeof r.hue === "number" && typeof r.chroma === "number" ? { hue: r.hue, chroma: r.chroma } : seedOf(r.hex);
    families[r.family] = {
      hue: seed.hue,
      chroma: seed.chroma,
      colorName: r.name,
      ...(r.note ? { description: r.note } : {}),
      ...(HIER_TO_ROLE[r.hier] ? { colorRole: HIER_TO_ROLE[r.hier] } : {}),
    };
  }
  return families;
}

const RAW_EXEMPLARS = [
  // ── ERAS ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "ocean-drive-miami-deco",
    category: "architecture",
    source: 'docs/reference/colors/categories/architecture.json — Art Deco vol, "Ocean Drive · 1930s · Miami Beach Art Deco Historic District"',
    theme: "1930s Miami Beach Art Deco hotel strip — pastel stucco, mint trim, poolside cabana color",
    keywords: ["hotel", "pastel", "pink", "mint", "turquoise", "deco", "miami", "florida", "beach", "resort", "poolside", "pool", "cabana", "leisure", "stucco", "neon"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Muted heritage colour. South Beach is candy pastel by design — pink, mint, and turquoise, not a tasteful neutral.",
    referents: [
      { name: "Stucco, flamingo pink", hex: "#E0ACAC", hier: "d", note: "The signature pastel hotel fronts.", family: "Primary" },
      { name: "Trim, mint green", hex: "#A1CEB2", hier: "s", note: "The deco banding and detail.", family: "Secondary" },
      { name: "Accent, sky turquoise", hex: "#78C0C4", hier: "s", note: "Window frames and signage." },
      { name: "Cream stucco, pale", hex: "#DED7CA", hier: "s", note: "The lighter facade fields.", family: "Neutral" },
      { name: "Neon, coral red", hex: "#D56757", hier: "a", note: "The hotels' night signage.", family: "Tertiary" },
      { name: "Sky, Caribbean blue", hex: "#6BABCD", hier: "a", note: "The bright Florida sky." },
    ],
  },
  {
    id: "studio-54-disco",
    category: "music",
    source: 'docs/reference/colors/categories/music.json — Disco & Funk vol, "Studio 54 · the dancefloor"',
    // Studio 54 operated 1977-1986 — genuinely spans both the "1970s" and "1980s" tags below.
    theme: "Studio 54, late-1970s into the 1980s — mirror-ball silver, gold lamé, hot-pink and purple club light on black",
    keywords: ["disco", "nightclub", "party", "glamour", "dancefloor", "1970s", "1980s", "mirror ball", "glitter", "silver", "gold"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Muted '70s brown. Disco is silver, gold, and saturated pink-purple light on black — glittering glamour, not earth tones.",
    referents: [
      { name: "Dancefloor dark, black-purple", hex: "#2B2734", hier: "d", note: "The dark club the lights play on.", family: "Neutral" },
      { name: "Mirror ball, silver", hex: "#B4B8BD", hier: "s", note: "The spinning mirror-ball reflections." },
      { name: "Gold lamé, metallic gold", hex: "#C4A462", hier: "s", note: "The shimmering disco fashion.", family: "Secondary" },
      { name: "Light, hot pink", hex: "#D75C8C", hier: "s", note: "The pink stage wash.", family: "Primary" },
      { name: "Light, electric purple", hex: "#804FA7", hier: "a", note: "The purple club light.", family: "Tertiary" },
      { name: "Light, cyan", hex: "#14B3C5", hier: "a", note: "A cyan beam." },
    ],
  },
  {
    id: "boogie-roller-disco",
    category: "music",
    source: 'docs/reference/colors/categories/music.json — Disco & Funk vol, "Boogie & roller-disco · the rink"',
    theme: "A roller-disco rink, retro 1970s-80s party culture — neon-stripe brights on a blond wood floor",
    keywords: ["roller disco", "rink", "party", "1980s", "1970s", "neon", "retro", "skate", "orange", "blue", "pink"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Muted retro brown. The roller rink is neon brights on blond wood — saturated fun, not a faded '70s tone.",
    referents: [
      { name: "Skate stripe, orange", hex: "#E5822F", hier: "d", note: "The retro roller-skate stripe.", family: "Primary" },
      { name: "Rink wood, blond tan", hex: "#BDA887", hier: "s", note: "The maple rink floor.", family: "Neutral" },
      { name: "Neon pink", hex: "#D3608C", hier: "s", note: "The rink's neon glow.", family: "Secondary" },
      { name: "Electric blue", hex: "#3486CB", hier: "s", note: "A neon-blue stripe." },
      { name: "Chrome wheel, silver", hex: "#B1B5BA", hier: "a", note: "The skate hardware." },
      { name: "Disco light, purple", hex: "#7F51A3", hier: "a", note: "The overhead light.", family: "Tertiary" },
    ],
  },
  {
    id: "city-pop-tokyo-80s",
    category: "music",
    source: 'docs/reference/colors/categories/music.json — K-Pop & J-Pop vol, "City pop · the \'80s Tokyo-night sleeve"',
    theme: "1980s Japanese city pop — a glossy sunset gradient, neon cyan, and chrome over a night drive",
    keywords: ["1980s", "city pop", "tokyo", "japan", "sunset", "neon", "chrome", "night", "retro", "glossy"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Muted retro tone. City pop is a saturated sunset gradient with neon and chrome — glossy '80s glamour, not a faded photo.",
    referents: [
      { name: "Sunset gradient, magenta-orange", hex: "#E37363", hier: "d", note: "The city-pop sunset.", family: "Primary" },
      { name: "Ocean teal", hex: "#279196", hier: "s", note: "The seaside drive teal.", family: "Secondary" },
      { name: "Neon cyan", hex: "#23B9CC", hier: "s", note: "The Tokyo-night neon." },
      { name: "Palm night, purple", hex: "#564178", hier: "s", note: "The dusk palm sky.", family: "Tertiary" },
      { name: "Chrome, silver", hex: "#B1B5BA", hier: "a", note: "The car and type chrome.", family: "Neutral" },
      { name: "Hot pink", hex: "#CC5E93", hier: "a", note: "A neon-pink accent." },
    ],
  },

  // ── NATURE ────────────────────────────────────────────────────────────────────────────────
  {
    id: "siberian-taiga-baikal",
    category: "nature",
    source: 'docs/reference/colors/categories/nature.json — Boreal & Taiga vol, "54° N · September · 16:00 · Larch taiga, Baikal hinterland, Siberia"',
    theme: "Early autumn in the Siberian larch taiga near Lake Baikal — the forest briefly amber before needle-drop",
    keywords: ["siberia", "siberian", "taiga", "russia", "baikal", "forest", "boreal", "wildlife", "cold", "autumn", "larch", "birch"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Uniform evergreen. The larch taiga's defining trick is that it turns gold and bare — a conifer that behaves like a birch.",
    referents: [
      { name: "Larch needles, autumn amber", hex: "#D0944A", hier: "d", note: "Siberian larch — a conifer that turns gold and sheds.", family: "Primary" },
      { name: "Birch leaf, lemon yellow", hex: "#D0BB64", hier: "s", note: "Birch turning alongside the larch.", family: "Secondary" },
      { name: "Background spruce, dark teal", hex: "#243E38", hier: "s", note: "Evergreen taiga behind the deciduous burst.", family: "Neutral" },
      { name: "Peat floor, umber", hex: "#554130", hier: "s", note: "Needle litter and peat underfoot." },
      { name: "Lingonberry, cranberry red", hex: "#9F3930", hier: "a", note: "Ground berries in the moss, small and bright.", family: "Tertiary" },
      { name: "Taiga sky, cold pale blue", hex: "#9FB8C6", hier: "a", note: "Thin continental autumn sky." },
    ],
  },
  {
    id: "bengal-tiger-sundarbans",
    category: "nature",
    source: 'docs/reference/colors/categories/nature.json — Coast/Littoral vol, "22° N · February · 15:00 · Sundarbans mangrove, Bay of Bengal delta"',
    theme: "A tidal mangrove creek in the Sundarbans — grey mud and tannin water, with the rare burnt-orange of a Bengal tiger",
    keywords: ["tiger", "bengal", "wildlife", "mangrove", "jungle", "predator", "apex predator", "stripes", "orange", "delta"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Bright tropical-island colour. The Sundarbans is a grey-green-brown tidal world; its colour is mud and one orange cat.",
    referents: [
      { name: "Mangrove canopy, mid green", hex: "#4F7051", hier: "d", note: "The dense sundari and other mangrove crowns.", family: "Primary" },
      { name: "Tidal mud, grey-brown", hex: "#716457", hier: "s", note: "Exposed delta silt at low tide.", family: "Neutral" },
      { name: "Brackish creek, tannin brown", hex: "#594735", hier: "s", note: "Tea-coloured water threading the forest." },
      { name: "Prop & pneumatophore, root brown", hex: "#593F2F", hier: "s", note: "The breathing roots spiking up through the mud.", family: "Secondary" },
      { name: "Bengal tiger, burnt orange", hex: "#BB5D1B", hier: "a", note: "The forest's apex predator, rarely glimpsed.", family: "Tertiary" },
      { name: "Kingfisher, electric cyan", hex: "#118FAF", hier: "a", note: "A collared kingfisher over the creek." },
    ],
  },
  {
    id: "serengeti-plains",
    category: "nature",
    source: 'docs/reference/colors/categories/nature.json — Grassland/Steppe/Savanna vol, "2° S · August · 17:00 · Serengeti plains, Tanzania, dry season"',
    theme: "The Serengeti in the dry season — cured gold grass, an acacia silhouette, and the tawny of a lion at dusk",
    keywords: ["safari", "savanna", "wildlife", "lion", "plains", "herd", "migration", "africa", "dust", "gold"],
    hierarchy: { d: { pct: 55 }, s: { pct: 35 }, a: { pct: 10 } },
    refuses: "Lush green safari. The Serengeti is gold and dust most of the year; the green flush is a few weeks after rain.",
    referents: [
      { name: "Cured grass, savanna gold", hex: "#BDA46D", hier: "d", note: "Sun-cured short grass covering the plain.", family: "Primary" },
      { name: "Umbrella acacia, dusty green", hex: "#5B6E4C", hier: "s", note: "The flat-topped thorn tree, the plain's one verticality.", family: "Secondary" },
      { name: "Raised dust, ochre haze", hex: "#A58667", hier: "s", note: "Dust kicked up by herds, hanging in low light.", family: "Neutral" },
      { name: "Lion coat, tawny", hex: "#A37F56", hier: "s", note: "The predator that matches the grass exactly." },
      { name: "Roller wing, electric blue", hex: "#3476B4", hier: "a", note: "The lilac-breasted roller's flight flash.", family: "Tertiary" },
      { name: "Storm sky, bruise violet", hex: "#48455C", hier: "a", note: "A distant dry-season thunderhead." },
    ],
  },
  {
    id: "antarctic-gentoo-colony",
    category: "nature",
    source: 'docs/reference/colors/categories/nature.json — Tundra & Polar vol, "64° S · January · 18:00 · Antarctic Peninsula, austral summer evening"',
    // "Penguin Parade" is the real, commonly-used name for a colony's characteristic evening waddle/march
    // (e.g. Phillip Island's nightly Penguin Parade) — a fair, generic descriptive tag, not a claim about
    // this specific corpus entry's species/location.
    theme: "A gentoo penguin colony on the Antarctic Peninsula — blue glacier ice, black basalt, and krill-pink guano stain (the classic waddling 'penguin parade' scene)",
    keywords: ["antarctic", "antarctica", "penguin", "penguin parade", "colony", "parade", "wildlife", "cold", "ice", "glacier", "polar"],
    hierarchy: { d: { pct: 55 }, s: { pct: 35 }, a: { pct: 10 } },
    refuses: "Pure white wilderness. A working penguin colony is pink-stained and black-rocked; the pristine white is a distant view.",
    referents: [
      { name: "Glacier ice, pale blue", hex: "#B7D0DA", hier: "d", note: "Compressed glacial ice, blue where it's dense.", family: "Primary" },
      { name: "Volcanic basalt, black", hex: "#2C2E32", hier: "s", note: "Exposed dark rock where the snow has cleared.", family: "Neutral" },
      { name: "Southern Ocean, steel grey", hex: "#576A74", hier: "s", note: "The cold sea between the bergs.", family: "Secondary" },
      { name: "Snow algae, faint green", hex: "#B0C6A9", hier: "s", note: "Green snow-algae blooming on summer drifts." },
      { name: "Krill guano, salmon pink", hex: "#C57D73", hier: "a", note: "Penguin-colony stain from a krill diet.", family: "Tertiary" },
      { name: "Gentoo beak, coral orange", hex: "#DB7446", hier: "a", note: "The bright bill of the gentoo penguin." },
    ],
  },

  // ── FILM ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "grand-budapest-hotel",
    category: "film",
    source: 'docs/reference/colors/categories/film.json — Pastel Romance & Whimsy vol, "The Grand Budapest Hotel · 1932 era · dir. Wes Anderson · the lobby & funicular"',
    theme: "Wes Anderson's Grand Budapest Hotel — a pink mountain hotel of pastel symmetry and confectionery detail",
    keywords: ["hotel", "pastel", "pink", "confection", "lobby", "resort", "alpine", "whimsy"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Realist period grade. Anderson's world is a deliberate confection of symmetrical pastel; realism erases the doll's-house charm.",
    referents: [
      { name: "Hotel facade, pastel pink", hex: "#E6A9AA", hier: "d", note: "The Grand Budapest's candy exterior.", family: "Primary" },
      { name: "Lobby & uniform, plum red", hex: "#8B353F", hier: "s", note: "The bellhop livery and carpets.", family: "Tertiary" },
      { name: "Mendl's box, powder blue", hex: "#9AC2D7", hier: "s", note: "The pastry-box and packaging blue.", family: "Secondary" },
      { name: "Butter gold, warm", hex: "#D9BE84", hier: "s", note: "Gilt detail and warm interiors." },
      { name: "Alpine forest, deep green", hex: "#316245", hier: "a", note: "The snowy mountain exteriors." },
      { name: "Lobby boy hat, pillbox purple", hex: "#704E84", hier: "a", note: "A small saturated accent." },
    ],
  },
  {
    id: "la-la-land-dusk",
    category: "film",
    source: 'docs/reference/colors/categories/film.json — Pastel Romance & Whimsy vol, "La La Land · 2016 · dir. Chazelle · the Griffith Park dusk"',
    theme: "A Los Angeles musical dusk — twilight magenta sky, primary costume colour, and jazz-club blue",
    keywords: ["los angeles", "hollywood", "twilight", "dusk", "musical", "jazz", "sunset", "purple"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Desaturated indie grade. Chazelle paints with saturated primaries and purple dusk; muting it kills the musical's joy.",
    referents: [
      { name: "Twilight sky, magenta-purple", hex: "#965891", hier: "d", note: "The famous purple dusk gradient.", family: "Primary" },
      { name: "Night, deep cobalt", hex: "#264B7C", hier: "s", note: "The blue of the evening exteriors.", family: "Secondary" },
      { name: "Mia's dress, primary yellow", hex: "#E2BE44", hier: "s", note: "The bold costume colours.", family: "Tertiary" },
      { name: "Lamp gold, warm", hex: "#BF985A", hier: "s", note: "Streetlamps and interiors.", family: "Neutral" },
      { name: "Dress green, emerald", hex: "#318F5D", hier: "a", note: "Another saturated costume read." },
      { name: "Jazz-club red, deep", hex: "#9B3934", hier: "a", note: "The warm club interiors." },
    ],
  },
  {
    id: "vertigo-neon-hotel",
    category: "film",
    source: 'docs/reference/colors/categories/film.json — Technicolor Golden Age vol, "Vertigo · 1958 · dir. Alfred Hitchcock · the green neon hotel"',
    theme: "Hitchcock's Vertigo — an obsession bathed in the eerie green of a hotel's neon sign",
    keywords: ["hotel", "neon", "green", "noir", "obsession", "hitchcock", "san francisco"],
    hierarchy: { d: { pct: 50 }, s: { pct: 40 }, a: { pct: 10 } },
    refuses: "Naturalistic colour. Hitchcock weaponised Technicolor green and red as psychology; realism drains the dread.",
    referents: [
      { name: "Hotel neon, eerie green", hex: "#58AD7F", hier: "d", note: "The Empire Hotel sign bathing the room.", family: "Primary" },
      { name: "Obsession red, feverish", hex: "#B4382F", hier: "s", note: "The recurring saturated red of dread.", family: "Tertiary" },
      { name: "Grey flannel suit, cool", hex: "#6D7379", hier: "s", note: "Scottie's restrained costume grey.", family: "Neutral" },
      { name: "Madeleine's hair, gold", hex: "#C7A766", hier: "s", note: "The famous spiral chignon, warm gold.", family: "Secondary" },
      { name: "Bay dusk, deep blue", hex: "#274D76", hier: "a", note: "San Francisco water at the blue hour." },
      { name: "Bouquet, antique violet", hex: "#826495", hier: "a", note: "The nosegay of the dead woman." },
    ],
  },

  // ── BRAND MOODS ───────────────────────────────────────────────────────────────────────────
  {
    id: "nike-swoosh",
    category: "brands",
    source: 'docs/reference/colors/categories/brands.json — "Nike · The Swoosh · Since 1971"',
    theme: "Nike's identity — jet black and box white held to near-monochrome, lit by one loud swoosh orange",
    keywords: ["nike", "brand", "sport", "monochrome", "black", "white", "orange", "logo", "athletic"],
    hierarchy: { d: { pct: 55 }, s: { pct: 35 }, a: { pct: 10 } },
    refuses: "Not a rainbow of past colorway drops — Nike's brand identity is disciplined black and white, lit by a single orange-red accent, never a full spectrum.",
    referents: [
      { name: "Jet black, PMS Black 6 C", hex: "#101820", hier: "d", note: "The Swoosh and wordmark ink — a blue-black, not flat black.", family: "Primary" },
      { name: "Box white", hex: "#FFFFFF", hier: "s", note: "The negative space the Swoosh floats in.", family: "Neutral" },
      { name: "Cool grey, technical", hex: "#8B9095", hier: "s", note: "The performance-apparel and packaging greys." },
      { name: "Sail, warm bone", hex: "#E4E0D2", hier: "s", note: "The off-white of leather and canvas uppers." },
      { name: "Total Orange, swoosh orange", hex: "#FF6600", hier: "a", note: "The shoebox and Nike+ accent, ≈Pantone 1655 C.", family: "Secondary" },
      { name: "University Red", hex: "#B01717", hier: "a", note: "The deep swoosh red of team kit.", family: "Tertiary" },
    ],
  },
  {
    id: "burger-king-flame",
    category: "brands",
    source: 'docs/reference/colors/categories/brands.json — "Burger King · The Flame Identity · 2021 rebrand"',
    theme: "Burger King's 2021 flame identity — fiery red over char-brown and mayo cream, lit by melty yellow",
    keywords: ["burger king", "brand", "fast food", "flame", "red", "yellow", "brown", "appetite"],
    hierarchy: { d: { pct: 50 }, s: { pct: 38 }, a: { pct: 12 } },
    refuses: "Not the 1990s photoreal, blue-swooshed fast-food logo it replaced — the flame identity is warm and fully analogous, unashamedly appetite-red, with no cool blue anywhere in it.",
    referents: [
      { name: "Fiery Red", hex: "#D62300", hier: "d", note: "The wordmark bun; the brand's primary, appetite-driving red.", family: "Primary" },
      { name: "Flaming Orange", hex: "#FF8732", hier: "s", note: "The flame-grill glow that warms the packaging.", family: "Secondary" },
      { name: "BBQ Brown", hex: "#502314", hier: "s", note: "The char-grilled sear that anchors the whole identity.", family: "Neutral" },
      { name: "Mayo Egg White", hex: "#F5EBDC", hier: "s", note: "The warm cream ground that carries the packaging." },
      { name: "Melty Yellow", hex: "#FFAA00", hier: "a", note: "Molten cheese; the loud secondary highlight.", family: "Tertiary" },
      { name: "Crunchy Green", hex: "#198737", hier: "a", note: "Fresh lettuce; the small, rare fresh-ingredient accent." },
    ],
  },
  {
    id: "bzzr-electric",
    category: "brands",
    source: 'docs/reference/colors/categories/brands.json — "BZZR · The product\'s own design system"',
    theme: "BZZR's live design system — an electric indigo-blue system charged by neon mint, run near-peak chroma throughout",
    keywords: ["bzzr", "brand", "electric", "neon", "vivid", "indigo", "mint", "saas", "product"],
    // BZZR's own corpus entry has NO accent tier — a real 2-tier hierarchy, exactly like Maison (§2 above).
    hierarchy: { d: { pct: 55 }, s: { pct: 45 } },
    refuses: "A calm, desaturated palette. BZZR runs hot and electric by design — near-peak chroma on both its primary and secondary.",
    referents: [
      // Already-parametric corpus numbers (BZZR was built through the app) — used directly, no hex derivation.
      { name: "Primary, electric indigo-blue", hue: 267, chroma: 98, hier: "d", note: "An extremely vivid electric-blue primary, run near-peak chroma.", family: "Primary" },
      { name: "Secondary, neon mint", hue: 165, chroma: 100, hier: "s", note: "A neon-mint secondary, also near-peak chroma.", family: "Secondary" },
      { name: "Tertiary, muted violet", hue: 315, chroma: 44, hier: "s", note: "A muted violet carrying the charge.", family: "Tertiary" },
      { name: "Neutral", hue: 267, chroma: 29, hier: "s", note: "The product's own neutral ramp.", family: "Neutral" },
    ],
  },
  {
    id: "corsa-grand-tour",
    category: "brands",
    source: 'docs/reference/colors/categories/brands.json — "Corsa · Grand Tour cycling · Italy · France · Spain"',
    theme: "Corsa's Grand Tour cycling identity — Giro rosa and Tour yellow over road blue, sourced from real jersey and newsprint history",
    keywords: ["corsa", "cycling", "grand tour", "giro", "tour de france", "brand", "pink", "yellow", "blue", "sport"],
    hierarchy: { d: { pct: 45 }, s: { pct: 35 }, a: { pct: 20 } },
    refuses: "A muted, faded-photograph nostalgia. The Grand Tour's heritage is loud and graphic — maglia-rosa pink, maillot-jaune yellow, and gas-station-signage jersey reds and greens, printed on pink and yellow newsprint, not sepia.",
    referents: [
      // Already-parametric corpus numbers (Corsa was built through the app's own preset system).
      { name: "Neutral, cobbles grey", hue: 248, chroma: 3, hier: "s", note: "Cool pavé cobblestone grey — the road under every tour.", family: "Neutral" },
      { name: "Primary, Giro d'Italia rosa", hue: 356, chroma: 64, hier: "d", note: "The maglia rosa — a vivid poster pink from La Gazzetta's pink pages.", family: "Primary" },
      { name: "Secondary, road blue", hue: 263, chroma: 63, hier: "s", note: "The tarmac-and-signage blue of the race route.", family: "Secondary" },
      // Note: this hue (27) sits exactly on this repo's own Danger default hue (see §5/§8 of the RUBRIC) —
      // a REAL corpus instance of the brand/status collision the core's distinctness gate (#372) resolves.
      { name: "Tertiary, Vuelta a España red", hue: 27, chroma: 66, hier: "a", note: "The maillot rojo — the Vuelta leader jersey, red since 2010.", family: "Tertiary" },
    ],
  },
];

export const EXEMPLARS = RAW_EXEMPLARS.map((e) => ({ ...e, families: familiesFrom(e.referents) }));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CHEAP KEYWORD RETRIEVAL — no embeddings, no dependencies. Tokenize both the query and each
// exemplar's own text (keywords + theme + category + referent names), score by weighted token
// overlap (a hit inside `keywords` counts more than an incidental hit inside prose), return the
// top N. Deterministic; ties keep EXEMPLARS' own array order (Array#sort is a stable sort).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(["the", "a", "an", "of", "in", "on", "at", "and", "or", "to", "for", "with", "by", "from", "is", "this", "that", "it", "its"]);

// tokenize — lowercase, strip punctuation (keep letters/digits/whitespace, any script), split on
// whitespace, drop stopwords, and crudely de-pluralize (trailing "s" on a word longer than 3 chars)
// so "tigers" matches a "tiger" keyword and "1980s" matches a bare "1980s" keyword identically.
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function exemplarTokenSets(exemplar) {
  const keywordTokens = new Set();
  for (const kw of exemplar.keywords) for (const t of tokenize(kw)) keywordTokens.add(t);
  const proseTokens = new Set(tokenize([exemplar.theme, exemplar.category, ...exemplar.referents.map((r) => r.name)].join(" ")));
  return { keywordTokens, proseTokens };
}

// Precomputed once per exemplar (pure data, never mutated) — retrieveExemplars can be called
// repeatedly (once per generate_kit{description} call, in the eventual #371 server) without
// re-tokenizing the whole corpus every time.
const INDEX = EXEMPLARS.map((ex) => ({ ex, ...exemplarTokenSets(ex) }));

// retrieveExemplars(description, n) → the n most theme-adjacent EXEMPLARS entries for a free-text
// description. A query token matching one of an exemplar's own `keywords` scores 3; matching only
// incidental prose (theme/category/referent names) scores 1 — so an exemplar explicitly tagged
// with a concept outranks one that merely happens to share an unrelated word. Each query token
// counts once per exemplar (repeating a word in the description doesn't inflate its score).
export function retrieveExemplars(description, n = 3) {
  const queryTokens = [...new Set(tokenize(description))];
  if (!queryTokens.length) return EXEMPLARS.slice(0, n);
  const scored = INDEX.map(({ ex, keywordTokens, proseTokens }) => {
    let score = 0;
    for (const t of queryTokens) {
      if (keywordTokens.has(t)) score += 3;
      else if (proseTokens.has(t)) score += 1;
    }
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((s) => s.ex);
}
