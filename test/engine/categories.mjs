// categories.mjs — per-palette TYPOGRAPHY pipeline: the generated gallery PRESETS carry a `type` config
// (scripts/gen-categories.mjs design5ToTypeConfig, from each spec palette's `type`), and it survives the
// APPLY path (openConfigAsSet → hydrate → clampType → typeScale) so opening a palette dresses the doc in
// its designed fonts. Guards the seam the "every palette still shows Inter" bug lived in.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { typeScale, DEFAULT_TYPE } from "../../src/engine/type.mjs";
import { hydrate } from "../../src/ui/persist.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPECDIR = join(HERE, "..", "..", ".claude", "docs", "spec", "colors", "categories");
const CATS = ["architecture", "cuisine", "film", "literature", "music", "nature", "travel"];
const ROLES = ["display", "heading", "body", "ui", "mono"];
// the make11 / clampType voice allowlist — a voice NOT here is SILENTLY DROPPED by clampType on hydrate,
// so the mapper emitting an off-list name (e.g. "Mono") would lose that voice with no error. Keep in lockstep.
const VOICES = ["Display", "Heading", "Sub-heading", "Kicker", "Lead", "Body", "Quote", "Caption", "UI", "Code", "Legal"];

const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// order-INSENSITIVE deep equality (clampType re-emits fonts/voices in its own allowlist order — same
// values, different key order — so a stringify compare would false-fail; compare key SETS + field values).
const sameKeys = (a, b) => { const ka = Object.keys(a || {}).sort(), kb = Object.keys(b || {}).sort(); return eq(ka, kb); };
const sameVoices = (a, b) => sameKeys(a, b) && Object.keys(a || {}).every((v) => sameKeys(a[v], b[v]) && Object.keys(a[v]).every((k) => a[v][k] === b[v][k]));

let totalPresets = 0, totalTyped = 0;
for (const slug of CATS) {
  const { PRESETS } = await import(`../../src/ui/categories/${slug}.js`);
  const spec = JSON.parse(readFileSync(join(SPECDIR, `${slug}.json`), "utf8"));
  const specPals = spec.volumes.flatMap((v) => v.palettes); // volume/palette order == preset order

  if (PRESETS.length !== 48) FAIL("count", `${slug} has ${PRESETS.length} presets, want 48`);
  if (specPals.length !== PRESETS.length) FAIL("count", `${slug}: ${specPals.length} spec palettes vs ${PRESETS.length} presets`);
  totalPresets += PRESETS.length;

  PRESETS.forEach((p, i) => {
    const t = p.type;
    if (!t) { FAIL("hastype", `${slug}[${i}] "${p.name}" has no type`); return; }
    totalTyped++;
    // (a) 5 non-empty font roles
    for (const r of ROLES) if (typeof t.fonts?.[r] !== "string" || !t.fonts[r].trim()) FAIL("fonts", `${slug}[${i}] missing font role ${r}`);
    // (b) treatment is a known base
    if (!["product", "luxury", "editorial", "technical", "statement"].includes(t.treatment)) FAIL("base", `${slug}[${i}] bad base ${t.treatment}`);
    // (c) voices present, every name on the allowlist, mono routed to Kicker (NOT Code)
    const vk = Object.keys(t.voices || {});
    if (!vk.length) FAIL("voices", `${slug}[${i}] no voices`);
    for (const v of vk) if (!VOICES.includes(v)) FAIL("voices", `${slug}[${i}] off-allowlist voice "${v}" (clampType would drop it)`);
    if (!vk.includes("Kicker")) FAIL("kicker", `${slug}[${i}] mono did not map to Kicker`);
    // (d) generator FAITHFUL to the spec: preset fonts == the spec palette's design fonts
    const sd = specPals[i]?.type?.slots;
    if (sd) for (const r of ROLES) if (sd[r]?.font && sd[r].font !== t.fonts[r]) FAIL("faithful", `${slug}[${i}] ${r}: preset ${t.fonts[r]} != spec ${sd[r].font}`);
    // (e) typeScale RESOLVES the design fonts (the picker reads scale.fonts[role])
    const sc = typeScale(t);
    if (!eq(sc.fonts, t.fonts)) FAIL("resolve", `${slug}[${i}] typeScale.fonts != type.fonts`);
    // (f) APPLY path: hydrate(preset) == openConfigAsSet → clampType keeps fonts AND voices (no silent drop),
    //     and in-range params are IDENTITY-preserved (not clamped/mutated)
    const doc = hydrate(p);
    if (!sameKeys(doc.type.fonts, t.fonts) || !ROLES.every((r) => doc.type.fonts[r] === t.fonts[r])) FAIL("apply", `${slug}[${i}] hydrate dropped/changed fonts`);
    if (Object.keys(doc.type.voices || {}).length !== vk.length) FAIL("apply", `${slug}[${i}] hydrate dropped a voice`);
    if (!sameVoices(doc.type.voices, t.voices)) FAIL("apply", `${slug}[${i}] hydrate mutated in-range voice params`);
  });
}

// (g) NEGATIVE control: an un-typed palette still yields the global product default (fallback intact)
const noType = hydrate({ palettes: [{ name: "x", hue: 200, chroma: 60, on: true }] });
if (typeScale(noType.type || DEFAULT_TYPE).fonts.display !== "Inter Tight") FAIL("fallback", "un-typed palette lost the product default");

// ── REPORT ──
for (const g of ["count", "hastype", "fonts", "base", "voices", "kicker", "faithful", "resolve", "apply", "fallback"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log(`  (${totalTyped}/${totalPresets} presets carry a per-palette type across ${CATS.length} categories)`);
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: per-palette typography flows spec → preset → apply → scale");
process.exit(0);
