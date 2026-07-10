// gen-categories.mjs — GENERATE the Palette Categories from .claude/docs/spec/colors/categories/*.json
//
// SUPERSEDES gen-travel-presets.mjs. Reads the 7 clean per-category JSON categories (architecture,
// cuisine, film, literature, music, nature, travel) — each 12 volumes × 4 palettes — and emits:
//
//   src/ui/categories/index.js     a SMALL, always-bundled index: one card per category
//                               ({slug, category, eyebrow, tagline, count, strip}) + a lazy loader
//                               (a static map of dynamic import()s → one code-split chunk per category).
//   src/ui/categories/<slug>.js    one LAZY module per category: VOLUMES (per-volume headers) + PRESETS
//                               (the 48 sets as read-only gallery presets the generator opens as copies).
//
// NAMING — per .claude/docs/spec/colors/color-model-function.md:
//   sampled 6 colors → {tier}-{rank}: primary-base/muted, secondary-base/muted, accent-base/muted
//   status 4 colors  → info/success/warning/danger  (NOT in the category JSON — the canonical semantic
//                      status set is appended, matching the product's Info/Success/Warning/Danger families)
//
// 1/3/2 → 2-2-2 MAPPING: dominant → primary-base; supporting nearest the ground → primary-muted;
//   the other two supporting (by chroma) → secondary-base/muted; the two accents → accent-base/muted.
//
// Run via `npm run gen:categories`.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";
import { cam16FromRgb, lstarFromRgb } from "../src/engine/hct.js";
import { toneAt, DEFAULT_CONTROLS } from "../src/engine/tonal.js";
import { deriveNeutral } from "../src/engine/derive.mjs";
import { seedFromKeyColor } from "../src/ui/model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SRCDIR = resolve(here, "../.claude/docs/spec/colors/categories");
const OUTDIR = resolve(here, "../src/ui/categories");
const HIER_ROLE = { d: "dominant", s: "supporting", a: "accent" };

// status colors aren't in the category JSON — a neutral, professional default set, shared by every
// preset. The canonical semantic-status four (matching the product's Info/Success/Warning/Danger
// families), in a single muted register so no preset's status block fights its curated character.
const STATUS = {
  info: { hex: "#346FB8", oklch: [0.54, 0.13, 255] },
  success: { hex: "#2E7D4F", oklch: [0.56, 0.115, 152] },
  warning: { hex: "#A66A00", oklch: [0.62, 0.118, 73] },
  danger: { hex: "#B3261E", oklch: [0.52, 0.176, 27] },
};

const hexToRgb = (hex) => {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
// strip the HTML the authored strings carry (<em>…</em>, &nbsp;, &amp;, numeric entities).
const clean = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
const oklchOf = (s) => String(s || "").trim().split(/\s+/).map(Number);

// tidyVolumeTitle — the source h1s lead with the redundant "Four palettes from …" count (the tile
// strip already shows the count). Strip that lead-in, capitalize, and drop the trailing period so a
// heading reads as the evocative phrase: "Four palettes from the great Russian novels, …" → "The
// great Russian novels, …". The first matching prefix wins (rules are ordered most- → least-specific).
const VOL_LEADINS = [
  [/^Four palettes from\s+/i, ""],
  [/^Four palettes,\s*/i, ""],
  [/^Four more\s+/i, "More "],
  [/^Four\s+/i, ""],
];
function tidyVolumeTitle(s) {
  let t = clean(s).replace(/\.$/, "");
  for (const [re, rep] of VOL_LEADINS) { if (re.test(t)) { t = t.replace(re, rep); break; } }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// The prime role is stop 550; anchor each prime to its SOURCE lightness via `lift` (centred tone bump).
const PRIME_TONE = toneAt(550, 0, 0, DEFAULT_CONTROLS);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const palette = (name, hex, oklch, sw) => {
  const rgb = hexToRgb(hex);
  // chroma is a %-of-peak (hue-space-agnostic) recovered from CAM16; the HUE is now the SOURCE OKLCH
  // hue (oklch[2]) so the baked-in hueSpace:"oklch" renders the curated family at its true OKLCH hue.
  const { chroma } = cam16FromRgb(rgb);
  return {
    name,
    hue: ((Math.round(Number(oklch[2])) % 360) + 360) % 360, // round THEN wrap so 359.7 → 0, not 360
    chroma: Math.round(Math.min(100, Math.max(0, chroma))),
    skew: 0,
    lift: Math.round(clamp(lstarFromRgb(rgb) - PRIME_TONE, -40, 40)),
    hueShift: 0,
    hueSameDir: false,
    // retain the EXACT source color as the `dominant` key color, in OKLCH (less lossy than hex).
    keyColors: [{ role: "dominant", oklch: oklch.map((v) => Number(v)) }],
    // the curated color's STORY: evocative name, one-line description, source role.
    ...(sw ? { colorName: clean(sw.name), description: clean(sw.note), colorRole: HIER_ROLE[sw.hier] || sw.hier } : {}),
    on: true,
  };
};

// ── the deterministic 1/3/2 → 2-2-2 mapping over a palette's 6 swatches (hier d·s·s·s·a·a) ────────
function mapColors(swatches) {
  const sw = swatches.map((s) => ({ ...s, ok: oklchOf(s.oklch), hex: String(s.hex).toUpperCase() }));
  const dom = sw.find((s) => s.hier === "d");
  const sup = sw.filter((s) => s.hier === "s");
  const acc = sw.filter((s) => s.hier === "a");
  const C = (s) => s.ok[1];
  const oklab = (s) => { const [L, c, H] = s.ok; const h = (H * Math.PI) / 180; return [L, c * Math.cos(h), c * Math.sin(h)]; };
  const dE = (a, b) => { const A = oklab(a), B = oklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const byNearGround = [...sup].sort((a, b) => dE(a, dom) - dE(b, dom));
  const primaryMuted = byNearGround[0];
  const secondary = byNearGround.slice(1).sort((a, b) => C(b) - C(a));
  const p = (name, s) => palette(name, s.hex, s.ok, s);
  return [
    p("primary-base", dom),
    p("primary-muted", primaryMuted),
    p("secondary-base", secondary[0]),
    p("secondary-muted", secondary[1]),
    p("accent-base", acc[0]),
    p("accent-muted", acc[1]),
    palette("info", STATUS.info.hex, STATUS.info.oklch),
    palette("success", STATUS.success.hex, STATUS.success.oklch),
    palette("warning", STATUS.warning.hex, STATUS.warning.oklch),
    palette("danger", STATUS.danger.hex, STATUS.danger.oklch),
  ];
}

// the status palettes carry meaning, not character — excluded from the neutral's derivation context
// (same set the New-Palette modal's "Derive from" strip excludes by default).
const STATUS_NAMES = /^(danger|warning|success|error|critical|info|positive|negative)$/i;

// derive the NEUTRAL / environment palette from a preset's character palettes, using the established
// logic of the New-Palette modal's Environmental tab: the chroma-weighted circular-mean hue of the
// key colors + a clamped near-grey chroma (engine/derive.mjs `deriveNeutral`), seeded back into a
// parametric palette (`seedFromKeyColor`) and retaining the derived target as its dominant key color.
function deriveNeutralPalette(palettes) {
  const samples = palettes
    .filter((p) => !STATUS_NAMES.test(p.name) && p.keyColors && p.keyColors[0])
    .map((p) => p.keyColors[0].oklch.map(Number));
  const oklch = deriveNeutral(samples);
  const seed = seedFromKeyColor(oklch) || { hue: 0, chroma: 0 };
  return {
    name: "neutral",
    hue: seed.hue,
    chroma: seed.chroma,
    skew: 0,
    lift: 0,
    hueShift: 0,
    hueSameDir: false,
    keyColors: [{ role: "dominant", oklch: oklch.map((v) => Number(v)) }],
    on: true,
  };
}

const VIVID_MIDS = { damp: 70, dampCurve: 1.5, dampAmp: 55, dampBias: 0 };

// ── per-palette TYPOGRAPHY: map the human 5-slot DESIGN (stored on a spec palette's optional `type`) to an
// engine typeScale config { treatment, bodyBase?, fonts, voices }. The design is designer-friendly (one
// entry per font ROLE); the mapping is the ONE place the vocabulary is translated (persist.clampType +
// engine/type.mjs consume the output verbatim, so opening a preset applies it via hydrate — see the LLD).
// Each font ROLE covers all its voices (fonts are per-role), so 5 families dress all 11 voices; the design's
// per-slot tracking/leading/weight shape the ROLE's PRIMARY voice (secondary editorial voices keep the base
// treatment's character). mono→Kicker (the slot's tracking IS the wide-kicker value; Code stays neutral).
const TYPE_VOICE_OF = { display: "Display", heading: "Heading", body: "Body", ui: "UI", mono: "Kicker" };
const TYPE_BASES = ["product", "luxury", "editorial", "technical", "statement"];
// pct — the STRICT %-string parser for the preset schema's leading/tracking (Kim's 2026-07-10 unit
// transition: `leading: "96%"` = 0.96 × size; `tracking: "-2%"` = -0.02em). Strings only — a bare
// number is the RETIRED shape and is deliberately NOT honored (the schema gate rejects it), so the
// unit can never be ambiguous again.
const pct = (v) => {
  if (typeof v !== "string") return NaN;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(v);
  return m ? Number(m[1]) / 100 : NaN;
};
function design5ToTypeConfig(t) {
  if (!t || typeof t !== "object" || !t.slots || typeof t.slots !== "object") return null;
  const out = { treatment: TYPE_BASES.includes(t.base) ? t.base : "product" };
  // clamp bodyBase to persist.clampType's [10,32] range so the emitted preset matches its hydrated form
  // (an out-of-range designed bodyBase would otherwise differ preset-vs-doc after clampType).
  if (Number.isFinite(t.bodyBase)) out.bodyBase = Math.max(10, Math.min(32, Math.round(t.bodyBase)));
  const fonts = {}, voices = {};
  for (const role of ["display", "heading", "body", "ui", "mono"]) {
    const s = t.slots[role];
    if (!s || typeof s !== "object") continue;
    if (typeof s.font === "string" && s.font.trim()) fonts[role] = s.font.trim();
    const v = {};
    const tr = pct(s.tracking); // "%-of-size" string → em ratio; clampType range [-0.5, 1]
    if (Number.isFinite(tr)) v.tracking = tr;
    const ld = pct(s.leading); //                                 clampType range [0.8, 3]
    if (Number.isFinite(ld)) v.leading = ld;
    if (Number.isFinite(s.weight)) v.weight = s.weight; //        clampType range [100, 1000]
    if (Object.keys(v).length) voices[TYPE_VOICE_OF[role]] = v;
  }
  if (Object.keys(fonts).length) out.fonts = fonts;
  if (Object.keys(voices).length) out.voices = voices;
  // only a genuine design (≥1 custom font) yields a config — a bare/empty `type` is a no-op (identity).
  return out.fonts ? out : null;
}

// ── build one category → { volumes, presets, strip } ─────────────────────────────────────────────
function buildCategory(doc) {
  const volumes = {}, presets = [], strip = [];
  for (const v of doc.volumes || []) {
    const vol = v.roman;
    volumes[vol] = { title: tidyVolumeTitle(v.h1 || v.title), intro: clean((v.preface || []).join(" ")) };
    (v.palettes || []).forEach((p, pi) => {
      const hy = p.hierarchy || {};
      const dom = (p.swatches || []).find((s) => s.hier === "d");
      if (pi === 0 && dom) strip.push(String(dom.hex).toUpperCase()); // one dominant per volume → the card strip
      presets.push({
        // the tile/set name is the KICKER (a clean structured label, e.g. "59° N · January · Lake
        // Baikal corridor"); the long evocative `title` lives in story.title (Story tab + per-color line).
        name: clean(p.kicker) || clean(p.title) || `${doc.slug} ${vol}·${pi + 1}`,
        vol,
        story: {
          title: clean(p.title),
          kicker: clean(p.kicker),
          narrative: clean(p.source),
          refuses: clean(p.refuses),
          groups: ["d", "s", "a"].filter((k) => hy[k]).map((k) => ({ hier: k, pct: hy[k].pct, note: clean(hy[k].text) })),
        },
        ...DEFAULT_CONTROLS, ...VIVID_MIDS,
        // per-palette TYPOGRAPHY — opening this preset (openConfigAsSet → hydrate → clampType) sets the
        // doc's `type`, so the Fonts picker + scale + every export carry this palette's designed system.
        // Absent when the spec palette has no `type` (falls back to the global default treatment).
        ...(design5ToTypeConfig(p.type) ? { type: design5ToTypeConfig(p.type) } : {}),
        // neutral first (derived from the character palettes' key colors), then the named families.
        palettes: (() => { const pals = mapColors(p.swatches || []); return [deriveNeutralPalette(pals), ...pals]; })(),
      });
    });
  }
  return { volumes, presets, strip };
}

// ── emit ──────────────────────────────────────────────────────────────────────────────────────
const files = readdirSync(SRCDIR).filter((f) => f.endsWith(".json")).sort();
mkdirSync(OUTDIR, { recursive: true });
const index = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(resolve(SRCDIR, f), "utf8"));
  const slug = doc.slug || basename(f, ".json");
  const { volumes, presets, strip } = buildCategory(doc);
  const lines = presets.map((p) => "  " + JSON.stringify(p)).join(",\n");
  const body =
    `// categories/${slug}.js — GENERATED by scripts/gen-categories.mjs from .claude/docs/spec/colors/categories/${f}.\n` +
    `// DO NOT EDIT — run \`npm run gen:categories\`. ${presets.length} curated palettes (12 volumes × 4) as\n` +
    `// read-only presets; each carries its \`vol\` + captured \`story\` + per-color name/role. Lazy-loaded.\n` +
    `export const VOLUMES = ${JSON.stringify(volumes)};\n` +
    `export const PRESETS = [\n${lines}\n];\n`;
  writeFileSync(resolve(OUTDIR, `${slug}.js`), body);
  index.push({ slug, category: clean(doc.category), eyebrow: clean(doc.eyebrow), tagline: clean(doc.tagline), count: presets.length, strip });
  console.log(`  categories/${slug}.js  (${presets.length} palettes · ${Object.keys(volumes).length} volumes)`);
}

// the index: a small, always-bundled file (cards + a static lazy-loader map for per-category code-splitting).
const cards = index.map((c) => "  " + JSON.stringify(c)).join(",\n");
const loaders = index.map((c) => `  ${JSON.stringify(c.slug)}: () => import("./${c.slug}.js"),`).join("\n");
const idx =
  "// categories/index.js — GENERATED by scripts/gen-categories.mjs. DO NOT EDIT — run `npm run gen:categories`.\n" +
  "// The Palette Categories hub index: one card per category (always bundled) + a lazy loader that\n" +
  "// code-splits each category's PRESETS/VOLUMES into its own chunk, loaded on demand when opened.\n" +
  "export const CATEGORY_INDEX = [\n" + cards + "\n];\n\n" +
  "const LOADERS = {\n" + loaders + "\n};\n" +
  "// loadCategory(slug) → Promise<{ VOLUMES, PRESETS }>  (null for an unknown slug)\n" +
  "export const loadCategory = (slug) => (LOADERS[slug] ? LOADERS[slug]() : Promise.resolve(null));\n";
writeFileSync(resolve(OUTDIR, "index.js"), idx);
console.log(`wrote ${OUTDIR}/index.js  (${index.length} categories · ${index.reduce((a, c) => a + c.count, 0)} palettes total)`);
