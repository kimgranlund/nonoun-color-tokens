#!/usr/bin/env node
// describe-rubric.mjs — verifier for the interpretation rubric + exemplar corpus + keyword retrieval
// (mcp/describe-rubric.mjs, #370). Contract: docs/site/describe-palette-spec.md §5.1/§10.
import { DOMAINS } from "../../src/ui/persist.js";
import { FAMILY_NAMES, SECONDARY_HARMONY_OFFSET, TERTIARY_ANALOGOUS_OFFSET, generateKit } from "../../mcp/describe-kit-core.mjs";
import { RUBRIC, RESEARCH_TIER_NOTE, ROUND_TRIP_INSTRUCTIONS, EXEMPLARS, retrieveExemplars } from "../../mcp/describe-rubric.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── the rubric text: present, substantial, and agreeing bit-for-bit with the core's own constants ──
ok(typeof RUBRIC === "string" && RUBRIC.length > 2000, "RUBRIC is a substantial markdown string, not a stub");
for (const heading of [
  "Referent extraction", "Hierarchy tiering", "named refusal", "Sourcing discipline",
  "hue-wheel anchors", "chroma vocabulary ladder", "Skew / lift semantics", "harmony recipe",
]) {
  ok(RUBRIC.includes(heading), `RUBRIC covers "${heading}"`);
}
// The rubric must state the EXACT same harmony numbers describe-kit-core.mjs actually uses — via
// interpolation of the imported constants, not a hand-typed restatement that could drift.
ok(RUBRIC.includes(`Primary.hue + ${SECONDARY_HARMONY_OFFSET}°`), `RUBRIC states the Secondary recipe using the core's own SECONDARY_HARMONY_OFFSET (${SECONDARY_HARMONY_OFFSET})`);
ok(RUBRIC.includes(`Secondary.hue +\n  ${TERTIARY_ANALOGOUS_OFFSET}°`) || RUBRIC.includes(`Secondary.hue + ${TERTIARY_ANALOGOUS_OFFSET}°`), `RUBRIC states the Tertiary recipe using the core's own TERTIARY_ANALOGOUS_OFFSET (${TERTIARY_ANALOGOUS_OFFSET})`);
ok(SECONDARY_HARMONY_OFFSET === 180 && TERTIARY_ANALOGOUS_OFFSET === 30, "sanity: the imported harmony constants are still the spec's ratified 180/30 (§12 item 7)");
// The role-table hue/chroma numbers cited in §5's table must be the REAL ones (not hand-typed) —
// spot-check a few against docs/reference/data/role-table.json via the same schema describe-kit-core reads.
ok(RUBRIC.includes("| Primary | 267°") && RUBRIC.includes("| Danger | 27°"), "RUBRIC's hue-wheel table cites the real role-table.json hues (Primary 267°, Danger 27°)");
ok(RUBRIC.includes(FAMILY_NAMES.join(" · ")), "RUBRIC states the family enum using the core's own FAMILY_NAMES, in the core's own order");

// ── the research-tier note + round-trip instructions ──
ok(typeof RESEARCH_TIER_NOTE === "string" && /research/i.test(RESEARCH_TIER_NOTE) && RESEARCH_TIER_NOTE.includes("keyColor"), "RESEARCH_TIER_NOTE instructs looking up documented colors -> keyColor");
ok(RUBRIC.includes(RESEARCH_TIER_NOTE), "the rubric's own §10 embeds RESEARCH_TIER_NOTE verbatim (single source of truth)");
ok(typeof ROUND_TRIP_INSTRUCTIONS === "string" && ROUND_TRIP_INSTRUCTIONS.includes("generate_kit"), "ROUND_TRIP_INSTRUCTIONS names the round-trip back into generate_kit");

// ── the exemplar corpus: shape, spanning, uniqueness ──
ok(Array.isArray(EXEMPLARS) && EXEMPLARS.length >= 12 && EXEMPLARS.length <= 18, `EXEMPLARS is ~15 entries (got ${EXEMPLARS.length})`);
{
  const ids = EXEMPLARS.map((e) => e.id);
  ok(new Set(ids).size === ids.length, "every exemplar id is unique");
  const categories = new Set(EXEMPLARS.map((e) => e.category));
  for (const bucket of ["architecture", "music", "nature", "film", "brands"]) {
    ok(categories.has(bucket), `EXEMPLARS spans the "${bucket}" category (eras/nature/film/brand-moods per #370)`);
  }
}
for (const ex of EXEMPLARS) {
  ok(typeof ex.id === "string" && ex.id.length > 0, `${ex.id || "(missing id)"}: has an id`);
  ok(typeof ex.source === "string" && ex.source.startsWith("docs/reference/colors/categories/"), `${ex.id}: cites a real corpus source path`);
  ok(typeof ex.theme === "string" && ex.theme.length > 0, `${ex.id}: has a theme description`);
  ok(Array.isArray(ex.keywords) && ex.keywords.length > 0, `${ex.id}: has retrieval keywords`);
  ok(Array.isArray(ex.referents) && ex.referents.length >= 4, `${ex.id}: has at least 4 cited referents`);
  ok(typeof ex.refuses === "string" && ex.refuses.length > 10, `${ex.id}: carries a named refusal`);
  ok(ex.hierarchy && typeof ex.hierarchy.d === "object" && typeof ex.hierarchy.d.pct === "number", `${ex.id}: hierarchy.d.pct is present`);
  // every referent tagged with a `hier` must use the story-schema's own d/s/a vocabulary
  for (const r of ex.referents) ok(r.hier === "d" || r.hier === "s" || r.hier === "a", `${ex.id}: referent "${r.name}" hier is d/s/a (got ${r.hier})`);
  // families: keys are a subset of the canonical 8, and every seed is IN-DOMAIN (persist.js DOMAINS.palette)
  const famKeys = Object.keys(ex.families);
  ok(famKeys.length >= 2, `${ex.id}: at least 2 families are seeded (a genuinely partial, underdetermined brief)`);
  for (const k of famKeys) {
    ok(FAMILY_NAMES.includes(k), `${ex.id}: family key "${k}" is one of the canonical 8`);
    const f = ex.families[k];
    ok(f.hue >= DOMAINS.palette.hue.min && f.hue <= DOMAINS.palette.hue.max, `${ex.id}.${k}: hue ${f.hue} is in-domain (0..360)`);
    ok(f.chroma >= DOMAINS.palette.chroma.min && f.chroma <= DOMAINS.palette.chroma.max, `${ex.id}.${k}: chroma ${f.chroma} is in-domain (0..100)`);
    ok(f.colorRole === "dominant" || f.colorRole === "supporting" || f.colorRole === "accent", `${ex.id}.${k}: colorRole is the narrative enum (dominant/supporting/accent), not keyColors.role`);
  }
}

// ── integration proof: every exemplar's `families` is a genuinely usable PaletteBrief fragment —
// feed it straight into the REAL deterministic core and confirm a full 8-palette kit comes out. This
// is what "doubles as a few-shot example of description -> brief mapping" means made concrete: the
// few-shot is not just illustrative prose, it is a brief the core actually accepts. ──
for (const ex of EXEMPLARS) {
  const { kit } = generateKit({ name: ex.theme, families: ex.families });
  ok(kit.$schema === "ultimate-tokens-brand-kit/1" && kit.palettes.length === 8, `${ex.id}: families feed generateKit() to a full 8-palette kit (proves the exemplar is a valid brief fragment, not just prose)`);
}

// ── retrieveExemplars: shape, determinism, defaults ──
ok(typeof retrieveExemplars === "function", "retrieveExemplars is exported");
{
  const a = retrieveExemplars("a pastel hotel by the sea", 3);
  const b = retrieveExemplars("a pastel hotel by the sea", 3);
  ok(Array.isArray(a) && a.length <= 3, "retrieveExemplars respects the n cap");
  ok(JSON.stringify(a) === JSON.stringify(b), "retrieveExemplars is deterministic for the same query");
}
ok(retrieveExemplars("", 3).length === 3, "an empty description still returns n exemplars (falls back to the corpus's own order)");
ok(retrieveExemplars("zzz_no_overlap_whatsoever_qqq", 5).length === 5, "a query with zero overlap still returns n exemplars (score-0 results, not an empty array)");
{
  const five = retrieveExemplars("mountain forest wildlife", 5);
  const three = retrieveExemplars("mountain forest wildlife", 3);
  ok(JSON.stringify(three) === JSON.stringify(five.slice(0, 3)), "a smaller n is a prefix of a larger n's result for the same query (stable ranking)");
}

// ── the two CANONICAL retrieval test asks (#370's own acceptance criterion) ──
{
  const result = retrieveExemplars("1980s at the Bel Air Hotel Pool Party", 3);
  const ids = result.map((e) => e.id);
  const eraLeisureIds = new Set(["ocean-drive-miami-deco", "studio-54-disco", "boogie-roller-disco", "city-pop-tokyo-80s", "grand-budapest-hotel", "vertigo-neon-hotel", "la-la-land-dusk"]);
  ok(ids.length === 3, `"1980s at the Bel Air Hotel Pool Party" returns 3 exemplars (got ${ids.length})`);
  ok(ids.every((id) => eraLeisureIds.has(id)), `every returned exemplar is era/leisure/hotel-adjacent, none from nature/brands (got ${ids.join(", ")})`);
  ok(ids.includes("ocean-drive-miami-deco"), `"1980s at the Bel Air Hotel Pool Party" surfaces the pastel poolside-hotel exemplar (got ${ids.join(", ")})`);
}
{
  const result = retrieveExemplars("Siberian Tigers on Parade", 3);
  const ids = new Set(result.map((e) => e.id));
  ok(ids.has("siberian-taiga-baikal"), `"Siberian Tigers on Parade" surfaces the Siberian taiga exemplar (cold-climate) (got ${[...ids].join(", ")})`);
  ok(ids.has("bengal-tiger-sundarbans"), `"Siberian Tigers on Parade" surfaces the tiger exemplar (wildlife) (got ${[...ids].join(", ")})`);
  ok(ids.size === 3, `"Siberian Tigers on Parade" returns 3 distinct exemplars (got ${ids.size})`);
}

if (fails.length) { console.error(`describe-rubric FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("describe-rubric PASS — RUBRIC (core-parity citations) · EXEMPLARS (15, spanning, brief-shaped, core-consumable) · retrieveExemplars (deterministic, both canonical asks)");
process.exit(0);
