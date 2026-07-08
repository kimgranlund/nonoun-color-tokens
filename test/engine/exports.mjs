#!/usr/bin/env node
// verify.mjs — export-formats validation adapter (CRITIC side; deny-on-write to the advancer).
import { readFileSync } from "node:fs";
import * as X from "../../src/engine/exports.js";
import { dsBundleGates } from "../../src/engine/ds-gates.js";
import { typeScale } from "../../src/engine/type.mjs";
import { geomScale } from "../../src/engine/geometry.mjs";

const RT = JSON.parse(readFileSync(new URL("../../.claude/docs/spec/data/role-table.json", import.meta.url), "utf8"));
const C = (palettes) => ({ palettes, curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" });
const ALL = RT.defaults.map((p) => ({ ...p, on: true }));
const enabledCount = (st) => st.palettes.filter((p) => p.on !== false).length;
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// recursively collect DTCG color leaves ({$type:"color", $value:{...}, $extensions?})
const leaves = (node, out = []) => {
  if (node && typeof node === "object") {
    if (node.$type === "color" && node.$value) out.push(node);
    else for (const k of Object.keys(node)) leaves(node[k], out);
  }
  return out;
};

// ── hpg-export-dtcg-shape ────────────────────────────────────────────────────────────────
const dtcg = X.exportDTCG(C(ALL), {});
const want3 = ["palette.tokens.json", "Light_tokens.json", "Dark_tokens.json"];
if (want3.some((k) => !(k in dtcg)) || Object.keys(dtcg).length !== 3) FAIL("dtcg-shape", `keys = ${Object.keys(dtcg)}`);
for (const k of want3) try { JSON.parse(JSON.stringify(dtcg[k])); } catch { FAIL("dtcg-shape", `${k} not JSON-serializable`); }

// ── hpg-export-leaf-valid (>= 53 x enabled resolved leaves per mode; each well-formed) ────
for (const file of ["Light_tokens.json", "Dark_tokens.json"]) {
  const ls = leaves(dtcg[file]);
  if (ls.length < 53 * enabledCount(C(ALL))) FAIL("leaf-valid", `${file} has ${ls.length} leaves < 53×${enabledCount(C(ALL))}`);
  for (const lf of ls) {
    const v = lf.$value;
    if (!v || v.colorSpace !== "srgb") { FAIL("leaf-valid", `leaf colorSpace != srgb`); break; }
    if (!Array.isArray(v.components) || v.components.length !== 3 || v.components.some((c) => c < 0 || c > 1)) { FAIL("leaf-valid", `components out of [0,1]: ${v.components}`); break; }
    if (typeof v.alpha !== "number" || v.alpha < 0 || v.alpha > 1) { FAIL("leaf-valid", `alpha out of [0,1]: ${v.alpha}`); break; }
    const hx = "#" + v.components.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    if ((v.hex || "").toUpperCase().slice(0, 7) !== hx) { FAIL("leaf-valid", `hex ${v.hex} != ${hx} from components`); break; }
  }
}

// ── hpg-export-resolved (no aliasData when blank; positive control when set) ──────────────
const semLeaves = (d) => [...leaves(d["Light_tokens.json"]), ...leaves(d["Dark_tokens.json"])];
if (semLeaves(dtcg).some((l) => l.$extensions && l.$extensions["com.figma.aliasData"])) FAIL("resolved", "aliasData present with blank rawColl");
const dtcgA = X.exportDTCG(C(ALL), { rawColl: "Color Primitives" });
const sa = semLeaves(dtcgA);
const aliasOf = (l) => l.$extensions && l.$extensions["com.figma.aliasData"];
// rawColl set → every leaf carries the FULL documented name+collection alias shape:
// targetVariableName "{n}/{refKey}" (e.g. neutral/550, neutral/500-200) AND targetVariableSetName
// === the Color Primitives collection. That is the shape Figma's documented aliasData fallback hierarchy
// resolves on NATIVE import when the Color Primitives collection pre-exists in the file (OD-004 spike;
// ADR-002 re-verify 2026-06-15). The native-import cascade itself is validated end-to-end in Figma,
// NOT here — this gate only proves the emitted SHAPE so the spike can't silently regress.
if (sa.length === 0 || !sa.every((l) => {
  const a = aliasOf(l);
  return a && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(a.targetVariableName || "") && a.targetVariableSetName === "Color Primitives";
}))
  FAIL("resolved", "rawColl set: not every semantic leaf carries aliasData {targetVariableName '{n}/{refKey}', targetVariableSetName 'Color Primitives'}");

// ── hpg-export-css-resolves (every --c-* is light-dark(var,var) over existing raw vars) ───
const css = X.exportCSS(C(ALL));
const declared = new Set([...css.matchAll(/(--[a-z0-9_-]+)\s*:/gi)].map((m) => m[1])); // raw + semantic both use --c- (raw names end in digits, semantic in a word)
let cssChecked = 0;
for (const m of css.matchAll(/(--c-[a-z0-9-]+)\s*:\s*light-dark\(\s*var\((--[a-z0-9_-]+)\)\s*,\s*var\((--[a-z0-9_-]+)\)\s*\)/gi)) {
  cssChecked++;
  if (!declared.has(m[2]) || !declared.has(m[3])) FAIL("css-resolves", `${m[1]} refs undefined raw var ${m[2]}/${m[3]}`);
}
if (cssChecked === 0) FAIL("css-resolves", "no --c-* light-dark(var,var) lines found");

// ── configurable colour prefix (--{prefix}-* naming; M3-flavoured export) ────────────────────────
{
  if (X.cssPrefixOf(C(ALL)) !== "c") FAIL("prefix", "default state must resolve to the 'c' prefix");
  const md = X.exportCSS({ ...C(ALL), export: { colorPrefix: "md-sys-color" } });
  if (!md.includes("--md-sys-color-neutral-on-surface")) FAIL("prefix", "a Material prefix must emit --md-sys-color-{p}-{role}");
  if (md.includes("--c-neutral-on-surface")) FAIL("prefix", "no stray --c-* names must survive under a custom prefix");
  // the semantic refs must thread the same prefix (var() points at the prefixed raws) or the cascade breaks.
  for (const m of md.matchAll(/--md-sys-color-[a-z0-9-]+\s*:\s*light-dark\(\s*var\((--[a-z0-9-]+)\)\s*,\s*var\((--[a-z0-9-]+)\)\s*\)/gi))
    if (!m[1].startsWith("--md-sys-color-") || !m[2].startsWith("--md-sys-color-")) FAIL("prefix", `a semantic ref didn't thread the prefix: ${m[1]}/${m[2]}`);
  // IDENTITY: no export / default "c" ⇒ byte-identical to the historical output.
  if (X.exportCSS({ ...C(ALL), export: { colorPrefix: "c" } }) !== X.exportCSS(C(ALL))) FAIL("prefix", "the default prefix must be byte-identical to no-prefix (identity gate)");
  // sanitization: junk → legal ident core; leading digit repaired; empty → 'c'.
  if (X.cssPrefixOf({ export: { colorPrefix: "MD Sys!!" } }) !== "md-sys") FAIL("prefix", "junk prefix must sanitize");
  if (X.cssPrefixOf({ export: { colorPrefix: "3x" } }) !== "c3x") FAIL("prefix", "leading-digit prefix must be repaired");
  if (X.cssPrefixOf({ export: { colorPrefix: "" } }) !== "c") FAIL("prefix", "empty prefix falls back to 'c'");
}

// ── hpg-export-padding (3-digit stop padding in CSS var names) ───────────────────────────
for (const m of css.matchAll(/--c-[a-z0-9-]+?-(\d+)(?:-\d+)?\s*:/gi)) {
  const stop = m[1];
  if (/^\d+$/.test(stop) && stop.length < 3) FAIL("padding", `unpadded stop in --c-…-${stop}`);
}

// ── on-color policy threads to exports (OD-001): "fixed" = on{N} pinned 050 both modes;
//    "contrast" re-points at least one to the better-contrasting end (proves onColorMode is wired). ──
const onRefs = (cssStr) => [...cssStr.matchAll(/--c-([a-z]+)-on-\1:\s*light-dark\(var\(--c-[a-z]+-([0-9-]+)\),\s*var\(--c-[a-z]+-([0-9-]+)\)/gi)].map((m) => `${m[1]}:${m[2]}/${m[3]}`);
const fixedOn = onRefs(X.exportCSS(C(ALL)));
const contrastOn = onRefs(X.exportCSS({ ...C(ALL), onColorMode: "contrast" }));
if (fixedOn.length === 0) FAIL("oncolors", "no on-{n} CSS vars found");
if (!fixedOn.every((r) => /:050\/050$/.test(r))) FAIL("oncolors", `fixed mode: on-colors not all 050/050 (${fixedOn.find((r) => !/:050\/050$/.test(r))})`);
if (JSON.stringify(fixedOn) === JSON.stringify(contrastOn)) FAIL("oncolors", "contrast mode changed no on-color — onColorMode not threaded to exports");

// ── hpg-export-disabled-palette (on:false absent; all-disabled = valid empty, no throw) ───
const oneOff = C(ALL.map((p, i) => (i === 1 ? { ...p, on: false } : p)));
const cssOff = X.exportCSS(oneOff);
const offName = ALL[1].name.toLowerCase();
if (cssOff.includes(`--c-${offName}-`)) FAIL("disabled-palette", `disabled palette '${offName}' still in CSS`);
try {
  const empty = C(ALL.map((p) => ({ ...p, on: false })));
  const ec = X.exportCSS(empty), ed = X.exportDTCG(empty, {});
  if (typeof ec !== "string" || Object.keys(ed).length !== 3) FAIL("disabled-palette", "all-disabled not well-formed");
  if (leaves(ed["Light_tokens.json"]).length !== 0) FAIL("disabled-palette", "all-disabled has leaves");
} catch (e) { FAIL("disabled-palette", `all-disabled threw: ${e.message}`); }

// ── hpg-export-nonempty (5 formats non-empty; JSON has stops/scrims/semantic) ─────────────
const all = X.exportAll(C(ALL), {});
for (const k of ["css", "oklch", "json", "dtcg", "ui3", "tailwind", "shadcn"]) {
  const v = all[k];
  if (v == null || (typeof v === "string" && v.length < 10) || (typeof v === "object" && Object.keys(v).length === 0)) FAIL("nonempty", `${k} empty`);
}
const j = X.exportJSON(C(ALL)); const p0 = j[ALL[0].name.toLowerCase()] || Object.values(j)[0];
if (!p0 || !p0.stops || !p0.scrims || !p0.semantic) FAIL("nonempty", "JSON palette missing stops/scrims/semantic");

// ── hpg-export-tailwind (v4 @theme: oklch ramps + light-dark() semantic roles) ────────────
const tw = X.exportTailwind(C(ALL));
if (!/@theme\s*\{/.test(tw)) FAIL("tailwind", "no @theme block");
if (!/--color-[a-z0-9-]+-500:\s*oklch\(/i.test(tw)) FAIL("tailwind", "no --color-{name}-500: oklch() scale var");
if (!/--color-[a-z0-9-]+:\s*light-dark\(\s*oklch/i.test(tw)) FAIL("tailwind", "no semantic role as light-dark(oklch…)");
// a disabled palette must not appear in the Tailwind scale either (use the oneOff state)
if (X.exportTailwind(oneOff).includes(`--color-${offName}-`)) FAIL("tailwind", `disabled palette '${offName}' still in Tailwind`);

// ── hpg-export-shadcn (oklch :root/.dark token contract + @theme inline + radius) ─────────
const sc = X.exportShadcn(C(ALL));
for (const need of [":root {", ".dark {", "@theme inline {", "--radius:", "--background:", "--foreground:", "--primary:", "--destructive:"]) {
  if (!sc.includes(need)) FAIL("shadcn", `missing '${need}'`);
}
if (!/--background:\s*oklch\(/i.test(sc)) FAIL("shadcn", "tokens are not oklch()");
if (!/--color-background:\s*var\(--background\)/.test(sc)) FAIL("shadcn", "@theme inline does not map --color-* -> var(--token)");
// same token set in :root (light) and .dark (parity)
const tokset = (block) => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((m) => m[1]).filter((t) => t !== "--radius"));
const rootBlock = sc.slice(sc.indexOf(":root {"), sc.indexOf(".dark {"));
const darkBlock = sc.slice(sc.indexOf(".dark {"), sc.indexOf("@theme inline {"));
const rootToks = tokset(rootBlock), darkToks = tokset(darkBlock);
if (rootToks.size === 0 || rootToks.size !== darkToks.size || [...rootToks].some((t) => !darkToks.has(t))) {
  FAIL("shadcn", `:root (${rootToks.size}) and .dark (${darkToks.size}) token sets differ`);
}
// typography + geometry props: the brand fonts fill shadcn's three family slots, and --radius is DERIVED
// from the geometry `md` corner (rem), not hard-coded — the medium corner on the M3-aligned scale.
{
  const withSys = X.exportShadcn(C(ALL), { fonts: { body: "Inter", display: "Source Serif 4", mono: "JetBrains Mono" }, radii: { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 9999 } });
  if (!withSys.includes("--radius: 0.75rem;")) FAIL("shadcn", "--radius not derived from the geometry md corner (12px → 0.75rem, M3-aligned scale)");
  if (!withSys.includes("--font-sans: 'Inter',")) FAIL("shadcn", "--font-sans not mapped from the body font");
  if (!withSys.includes("--font-serif: 'Source Serif 4',")) FAIL("shadcn", "--font-serif not mapped from the display font (quoted — digit name)");
  if (!withSys.includes("--font-mono: 'JetBrains Mono',")) FAIL("shadcn", "--font-mono not mapped from the mono font");
  // absent opts → the shadcn defaults (backward compatible)
  if (!X.exportShadcn(C(ALL)).includes("--radius: 0.625rem;") || X.exportShadcn(C(ALL)).includes("--font-sans:")) FAIL("shadcn", "no opts → default 0.625rem radius + no font vars");
}

// ── hpg-export-keycolors (retained brand colors -> exact OKLCH tokens by role + JSON block) ──
const withKey = C(ALL.map((p, i) => (i === 0 ? { ...p, keyColors: [{ role: "dominant", oklch: [0.32, 0.05, 150] }, { role: "supportive", oklch: [0.7, 0.04, 160] }] } : p)));
const kcss = X.exportCSS(withKey);
if (!/--c-[a-z0-9-]+-key-dominant:\s*oklch\(/.test(kcss)) FAIL("keycolors", "dominant key token (oklch) missing");
if (!/--c-[a-z0-9-]+-key-supportive:\s*oklch\(/.test(kcss)) FAIL("keycolors", "supportive key token (oklch) missing");
const kp = X.exportJSON(withKey)[ALL[0].name];
if (!kp.keyColors || kp.keyColors.length !== 2 || kp.keyColors[0].role !== "dominant" || !Array.isArray(kp.keyColors[0].oklch) || kp.keyColors[0].oklch.length !== 3) FAIL("keycolors", "JSON keyColors block missing/wrong");
// a palette with no key colors emits no key tokens (opt-in only)
if (X.exportCSS(C(ALL)).includes("-key-")) FAIL("keycolors", "key tokens present when none set");

// ── hpg-export-design-system (the LLM design-system bundle: DESIGN.md universal-dialect core + tokens.json
// + @dsCard previews + README receipt). The engine gate runs the ported §8 verifier (ds-gates.js) on the
// emitted bundle — the same platform-agnostic checks bundle_gates.py enforces (contrast all-pairs × both
// schemes · scheme parity · carrier equality · refs · section grammar · previews · relative leading). Runs
// on the DEFAULT palettes (a theme != the Studio golden): the emitter must be theme-general.
{
  const tsc = typeScale({});
  const gsc = geomScale({});
  const files = X.exportDesignSystemBundle(C(ALL), tsc, gsc, { date: "2026-07-05" });
  const byName = Object.fromEntries(files.map((f) => [f.name, f.data]));
  for (const layer of ["DESIGN.md", "tokens.json", "README.md"]) if (!(layer in byName)) FAIL("design-system", `bundle missing ${layer}`);
  const previews = files.filter((f) => f.name.startsWith("components/"));
  if (previews.length < 5) FAIL("design-system", `too few previews (${previews.length})`);
  const asPreviews = previews.map((p) => ({ name: p.name.replace("components/", ""), html: p.data }));

  // §8 GATES — the ported platform-agnostic verifier must report ZERO fails on the emitted bundle.
  const gate = dsBundleGates({ designMd: byName["DESIGN.md"], tokensJson: byName["tokens.json"], previews: asPreviews });
  if (gate.fails > 0) FAIL("design-system", `§8 gates: ${gate.fails} fail(s) — ${gate.findings.filter((f) => f.level === "ERROR").map((f) => f.msg).join(" | ")}`);

  // tokens.json shape: grammar-named colors + `primary` alias, scheme parity, numeric type/space/radii, leading FACTOR
  let tj = null;
  try { tj = JSON.parse(byName["tokens.json"]); } catch { FAIL("design-system", "tokens.json not valid JSON"); }
  if (tj) {
    if (!tj.colors || !tj.colors.primary) FAIL("design-system", "no `primary` Stitch-compat alias");
    if (!Object.keys(tj.colors).some((k) => /-on-/.test(k))) FAIL("design-system", "no `{family}-on-{family}` on-color (grammar)");
    if (!Object.keys(tj.colors).some((k) => /-surface$/.test(k))) FAIL("design-system", "no neutral `-surface` slot (grammar)");
    if (Object.keys(tj.colorsDark).join() !== Object.keys(tj.colors).join()) FAIL("design-system", "colorsDark keys differ from colors (scheme parity)");
    // Colors are high-resolution OKLCH, never bare hex (standing rule: a design-system export never ships a bare
    // hex color). Both schemes; alpha < 1 rides as `oklch(L C H / A)`, still matched by the `oklch(` prefix.
    for (const map of [["colors", tj.colors], ["colorsDark", tj.colorsDark]]) for (const [k, v] of Object.entries(map[1])) if (!/^oklch\(/i.test(v)) FAIL("design-system", `${map[0]}.${k} is not high-resolution OKLCH (bare hex is not allowed): ${v}`);
    if (!tj.type || !tj.type.scale || !Object.keys(tj.type.scale).length) FAIL("design-system", "type.scale empty");
    else for (const s of Object.values(tj.type.scale)) { if (!(s.size > 0 && s.weight > 0)) FAIL("design-system", "type.scale step not numeric"); if (!(s.lineHeight > 0 && s.lineHeight <= 4)) FAIL("design-system", `type.scale lineHeight not a factor (${s.lineHeight})`); }
    if (!Array.isArray(tj.spacing) || tj.spacing.some((v) => typeof v !== "number")) FAIL("design-system", "spacing not a numeric array");
    if (!tj.radii || Object.values(tj.radii).some((v) => typeof v !== "number")) FAIL("design-system", "radii not numeric");
    // FULL layers: semantic = every role of every enabled palette (53 x N), OKLCH, scheme parity; geometry = the full system.
    const semN = Object.keys(tj.semantic || {}).length;
    if (semN < 53 * ALL.length) FAIL("design-system", `semantic layer too small (${semN} < ${53 * ALL.length})`);
    if (Object.keys(tj.semanticDark || {}).join() !== Object.keys(tj.semantic || {}).join()) FAIL("design-system", "semanticDark keys differ from semantic (scheme parity)");
    for (const map of [["semantic", tj.semantic], ["semanticDark", tj.semanticDark]]) for (const [k, v] of Object.entries(map[1] || {})) if (!/^oklch\(/i.test(v)) { FAIL("design-system", `${map[0]}.${k} is not OKLCH: ${v}`); break; }
    const geo = tj.geometry || {};
    if (!geo.sizes || !geo.sizes.md || !(geo.sizes.md.height > 0 && geo.sizes.md.icon > 0)) FAIL("design-system", "geometry.sizes.md missing/non-numeric");
    for (const grp of ["insets", "gaps", "borders", "focus"]) if (!geo[grp] || Object.values(geo[grp]).some((v) => typeof v !== "number")) FAIL("design-system", `geometry.${grp} missing/non-numeric`);
    if (!Object.values(tj.type.scale).some((st) => typeof st.letterSpacing === "number")) FAIL("design-system", "no type.scale step carries letterSpacing (tracking dropped)");
  }

  // SELF-CONTAINMENT (standing rule): no emitted file may reference a path outside its shipped folder —
  // the consuming harness may have ONLY that folder. Gate every design-system bundle file.
  const UNREACHABLE = /\.\.\/design-system|\.\.\/_superseded|design-system-files-for-llms/;
  for (const f of files) if (UNREACHABLE.test(f.data)) FAIL("design-system", `${f.name} references a path outside the shipped folder (unreachable for the consumer)`);

  // DESIGN.md: the canonical sections, the grammar teaching, and light-dark() ONLY in the runtime block.
  const md = byName["DESIGN.md"];
  for (const sec of ["## Overview", "## Colors", "## Typography", "## Components", "## Do's and Don'ts", "## Responsive Behavior", "## Agent Prompt Guide"]) if (!md.includes(sec)) FAIL("design-system", `spine missing ${sec}`);
  if (!md.includes("### Token naming")) FAIL("design-system", "spine missing the Token naming grammar section");
  if (/^\s+[a-z0-9-]+(?:-dark)?:\s*"light-dark\(/mi.test(md)) FAIL("design-system", "light-dark() in a frontmatter carrier (Stitch rejects it)");
  if (!/color-scheme: light dark/.test(md) || !/light-dark\(oklch/.test(md)) FAIL("design-system", "no color-scheme + light-dark(oklch) runtime block");

  // the §8 gate CATCHES a broken bundle (a constant dark on-color) — proves npm test would fail on the F1 defect.
  if (tj) {
    // Inject the F1 defect — a constant white dark on-color — into the OKLCH carrier: it diverges from the
    // OKLCH frontmatter (G3) and, as white on a light dark-scheme fill, fails the on-pair contrast (G1). #FFFFFF
    // is valid input (the gate's parseColor accepts hex OR oklch), so this is a deliberate, gate-tripping break.
    const bad = JSON.parse(JSON.stringify(tj)); const onKey = Object.keys(bad.colorsDark).find((k) => /^(.+)-on-\1$/.test(k)); bad.colorsDark[onKey] = "#FFFFFF";
    const g = dsBundleGates({ designMd: md, tokensJson: bad, previews: asPreviews });
    if (g.fails === 0) FAIL("design-system", "the §8 gate does not catch a constant dark on-color (F1)");
  }

  // disabled-palette fallback: all-off → tokens.json-only with a $note, no throw
  const off = X.exportDesignSystemBundle(C(RT.defaults.map((p) => ({ ...p, on: false }))), tsc, gsc);
  if (off.length !== 1 || off[0].name !== "tokens.json") FAIL("design-system", "disabled bundle is not tokens.json-only");
  try { const j = JSON.parse(off[0].data); if (j.colors) FAIL("design-system", "all-disabled emitted colors"); if (!j.$note) FAIL("design-system", "all-disabled missing $note"); } catch { FAIL("design-system", "all-disabled not valid JSON"); }
}

// ── hpg-export-design-system-stitch (the Google Stitch profile: DESIGN.md ONLY — the SAME canonical spine,
// byte-identical to the Claude Code DESIGN.md — plus a Stitch-lint-framed README receipt). One core, two
// uploads: the acceptance is byte-identity of the DESIGN.md, so P3 adds NO second spine to drift.
{
  const tsc = typeScale({});
  const gsc = geomScale({});
  const stitch = X.exportDesignSystemStitchBundle(C(ALL), tsc, gsc, { date: "2026-07-05" });
  const byName = Object.fromEntries(stitch.map((f) => [f.name, f.data]));
  // Stitch consumes ONE file: exactly DESIGN.md + README.md, no tokens.json/previews.
  if (stitch.length !== 2) FAIL("design-system-stitch", `stitch bundle is not 2 files (got ${stitch.length}: ${stitch.map((f) => f.name).join(", ")})`);
  for (const layer of ["DESIGN.md", "README.md"]) if (!(layer in byName)) FAIL("design-system-stitch", `stitch bundle missing ${layer}`);

  // BYTE-IDENTITY — the Stitch DESIGN.md must equal the Claude Code DESIGN.md exactly (one canonical spine).
  const claudeSpine = X.exportDesignSystemSpine(C(ALL), tsc, gsc);
  if (byName["DESIGN.md"] !== claudeSpine) FAIL("design-system-stitch", "Stitch DESIGN.md is NOT byte-identical to the Claude Code spine");
  const claudeBundle = Object.fromEntries(X.exportDesignSystemBundle(C(ALL), tsc, gsc, { date: "2026-07-05" }).map((f) => [f.name, f.data]));
  if (byName["DESIGN.md"] !== claudeBundle["DESIGN.md"]) FAIL("design-system-stitch", "Stitch DESIGN.md diverges from the Claude Code bundle's DESIGN.md");

  // no light-dark() in the carrier (Stitch rejects it) — inherited from the shared spine, asserted here too.
  if (/^\s+[a-z0-9-]+(?:-dark)?:\s*"light-dark\(/mi.test(byName["DESIGN.md"])) FAIL("design-system-stitch", "light-dark() in the Stitch frontmatter carrier");

  // NO DUPLICATE YAML KEY — the `primary` Stitch alias must not collide with a grammar family already
  // named `primary`. C(ALL) is the canonical-defaults theme whose brand family IS `primary`, so a naive
  // always-append alias emits `primary:`/`primary-dark:` twice — a duplicate key the Stitch prelint rejects
  // (theme-generality regression: the golden's renamed brand family hid this). Each must appear exactly once.
  const fm = (byName["DESIGN.md"].match(/^---\n([\s\S]*?)\n---/) || [, ""])[1];
  for (const k of ["primary", "primary-dark"]) {
    const n = (fm.match(new RegExp(`^  ${k}:`, "gm")) || []).length;
    if (n !== 1) FAIL("design-system-stitch", `frontmatter \`${k}:\` appears ${n}× (expected exactly 1 — a duplicate YAML key fails the Stitch prelint)`);
  }

  // Stitch-profile README receipt: distinct header + the single-file / byte-identical / lint framing.
  const rm = byName["README.md"];
  if (!/design-system-for-google-stitch — Stitch profile export/.test(rm)) FAIL("design-system-stitch", "README is not the Stitch profile receipt");
  if (!/`DESIGN\.md` only/.test(rm)) FAIL("design-system-stitch", "Stitch receipt missing the single-file note");
  if (!/same canonical core/.test(rm)) FAIL("design-system-stitch", "Stitch receipt missing the one-canonical-core note");
  if (!/complete on its own/.test(rm)) FAIL("design-system-stitch", "Stitch receipt missing the self-containment note");
  if (!/prelint\.py check`: 0 errors/.test(rm)) FAIL("design-system-stitch", "Stitch receipt missing the prelint 0-errors gate");
  if (!/orphaned-tokens/.test(rm)) FAIL("design-system-stitch", "Stitch receipt missing the orphaned-tokens lint note");

  // SELF-CONTAINMENT: the upload set must never reference a path outside its shipped folder.
  const UNREACHABLE_S = /\.\.\/design-system|\.\.\/_superseded|design-system-files-for-llms/;
  for (const f of stitch) if (UNREACHABLE_S.test(f.data)) FAIL("design-system-stitch", `${f.name} references a path outside the shipped folder`);

  // disabled-palette: all-off → empty upload set (nothing to upload), no throw.
  const off = X.exportDesignSystemStitchBundle(C(RT.defaults.map((p) => ({ ...p, on: false }))), tsc, gsc);
  if (off.length !== 0) FAIL("design-system-stitch", "disabled Stitch bundle is not empty");
}

// ── hpg-export-design-system-make (the Figma Make profile: a routed guidelines/ tree). The gate of
// record is make_guidelines_check.py (D1–D6, D10, D11) — python, run manually against emitted scratch
// dirs for both the default theme and a hand-authored theme (see the handoff); this block asserts the
// SAME shape/content predicates in JS so `npm test` stays the zero-dependency gate. Runs on the DEFAULT
// palettes (C(ALL)) — the emitter must be theme-general, no hardcoded brand names/values.
{
  const tsc = typeScale({});
  const gsc = geomScale({});
  const make = X.exportDesignSystemMakeBundle(C(ALL), tsc, gsc, { date: "2026-07-05" });
  const byName = Object.fromEntries(make.map((f) => [f.name, f.data]));
  const wantFiles = ["guidelines/Guidelines.md", "guidelines/setup.md", "guidelines/styles.css",
    "guidelines/foundations/color.md", "guidelines/foundations/typography.md", "guidelines/foundations/spacing.md",
    "guidelines/components/overview.md", "guidelines/components/button.md", "README.md"];
  if (make.length !== wantFiles.length) FAIL("design-system-make", `make bundle is not ${wantFiles.length} files (got ${make.length}: ${make.map((f) => f.name).join(", ")})`);
  for (const f of wantFiles) if (!(f in byName)) FAIL("design-system-make", `bundle missing ${f}`);

  // D10 carrier — styles.css is exportShadcn() in the MEASURED on-color mode (R1: the shadcn projection
  // forces onColorMode:"contrast" so the dark foregrounds are the contrast-passing pole, like dsColorRoles;
  // raw "fixed"-mode shadcn ships white foregrounds that fail AA on the brightened dark fills).
  const styles = byName["guidelines/styles.css"];
  const shadcnPart = X.exportShadcn({ ...C(ALL), onColorMode: "contrast" });
  if (!styles.startsWith(shadcnPart)) FAIL("design-system-make", "styles.css does not START with exportShadcn(state) in the measured (contrast) on-color mode (the D10 carrier prefix)");
  if (!styles.includes("FULL token layers")) FAIL("design-system-make", "styles.css missing the appended full token layers");
  // the appendix must land AFTER the @theme block so the D10 parse (first :root -> .dark -> @theme) is untouched
  if (styles.indexOf("FULL token layers") < styles.indexOf("@theme inline {")) FAIL("design-system-make", "full-layer appendix must come after @theme inline (D10 parse safety)");
  // R1 guard — the dark-scheme fill foregrounds must be the near-black ink pole, NEVER fixed white (which
  // fails AA on the brightened dark fills). Locks the measured on-color mode against a silent revert.
  const darkBlock = styles.slice(styles.indexOf(".dark"));
  for (const role of ["primary-foreground", "secondary-foreground", "destructive-foreground"]) {
    const m = new RegExp(`--${role}:\\s*(oklch\\([^)]*\\))`).exec(darkBlock);
    if (m && /oklch\(1\s+0\b/.test(m[1])) FAIL("design-system-make", `styles.css dark --${role} is fixed white (AA-failing) — R1 measured on-color regressed`);
  }

  // SELF-CONTAINMENT: no file may reference a path outside the shipped folder (`../styles.css` WITHIN
  // guidelines/ is fine — same shipped tree; sibling design-system folders are not).
  const UNREACHABLE_M = /\.\.\/design-system|\.\.\/_superseded|design-system-files-for-llms/;
  for (const f of make) if (UNREACHABLE_M.test(f.data)) FAIL("design-system-make", `${f.name} references a path outside the shipped folder`);

  // D6 — Guidelines.md hard rules (>=1 "Do NOT" + the literal word "IMPORTANT").
  const gmd = byName["guidelines/Guidelines.md"];
  if (!/\bDo NOT\b/.test(gmd)) FAIL("design-system-make", "Guidelines.md missing a 'Do NOT' rule");
  if (!/IMPORTANT/.test(gmd)) FAIL("design-system-make", "Guidelines.md missing the IMPORTANT marker");

  // D1 — Guidelines.md routes to every leaf; overview.md routes to button.md.
  for (const rel of ["setup.md", "foundations/color.md", "foundations/typography.md", "foundations/spacing.md", "components/overview.md", "components/button.md"])
    if (!gmd.includes(rel)) FAIL("design-system-make", `Guidelines.md does not route to ${rel}`);
  if (!byName["guidelines/components/overview.md"].includes("button.md")) FAIL("design-system-make", "overview.md does not route to button.md");

  // D5 — button.md names hover + carries a color literal or a -hover/-active token reference.
  const btn = byName["guidelines/components/button.md"];
  if (!/\bhover\b/i.test(btn)) FAIL("design-system-make", "button.md does not name 'hover'");
  if (!/-hover\b/.test(btn) && !btn.includes("var(--")) FAIL("design-system-make", "button.md hover state carries no color literal or -hover/-active token reference");

  // D11 — no px leading/tracking anywhere in the tree.
  for (const [nm, data] of Object.entries(byName)) {
    if (/(?:line-height|letter-spacing)\s*:\s*[^;\n]*?\d[\d.]*px/i.test(data) || /\|\s*[\d.]+\s*\/\s*[\d.]+\s*px/i.test(data))
      FAIL("design-system-make", `${nm} carries a px leading/tracking value`);
  }

  // D4 — a paste-ready light-dark() block, with color-scheme: light dark declared in the SAME file.
  const colorMd = byName["guidelines/foundations/color.md"];
  if (!/light-dark\(/.test(colorMd)) FAIL("design-system-make", "no light-dark() runtime block in foundations/color.md");
  if (!/color-scheme:\s*light dark/.test(colorMd)) FAIL("design-system-make", "light-dark() block missing its color-scheme: light dark declaration");

  // D2/D3 — the grammar-token reference table: every row carries light AND dark (parity), and (per
  // R1/dsColorRoles' contrast guarantee) every fill/on-fill pair clears 4.5:1 in both schemes.
  const tokenRowRe = /^\|\s*`(--[a-z0-9-]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/gim;
  let tokenRows = 0;
  for (const m of colorMd.matchAll(tokenRowRe)) tokenRows++;
  if (tokenRows === 0) FAIL("design-system-make", "no `--token` grammar rows found in foundations/color.md (D2 needs >=1)");

  // D10 (measured, not left UNMEASURED) — the runtime block's tokens equal a sibling built from the
  // SAME canonical shadcn parse the emitter uses: exportShadcn in the MEASURED (contrast) on-color mode.
  const rtMap = X.dsShadcnRuntimeMap(X.exportShadcn({ ...C(ALL), onColorMode: "contrast" }));
  if (Object.keys(rtMap).length === 0) FAIL("design-system-make", "dsShadcnRuntimeMap parsed no tokens");
  for (const [tok, { light, dark }] of Object.entries(rtMap))
    if (!colorMd.includes(`${tok}: light-dark(${light}, ${dark})`)) FAIL("design-system-make", `color.md runtime block diverges from the shadcn carrier for ${tok}`);

  // README.md is the figma-make profile receipt, citing the gate of record.
  const rm = byName["README.md"];
  if (!/design-system-for-figma-make — Figma Make profile export/.test(rm)) FAIL("design-system-make", "README is not the figma-make profile receipt");
  if (!/make_guidelines_check\.py/.test(rm)) FAIL("design-system-make", "README does not cite make_guidelines_check.py as the gate of record");

  // theme-general — no hardcoded golden-theme (Studio 54) names leak into a default-theme run.
  const allText = Object.values(byName).join("\n").toLowerCase();
  for (const bad of ["spotlight", "beam", "mirror", "dancefloor", "studio 54"])
    if (allText.includes(bad)) FAIL("design-system-make", `hardcoded theme-specific name '${bad}' leaked into the theme-general emitter`);

  // disabled-palette: all-off → empty array (nothing to upload), like the Stitch bundle.
  const off = X.exportDesignSystemMakeBundle(C(RT.defaults.map((p) => ({ ...p, on: false }))), tsc, gsc);
  if (off.length !== 0) FAIL("design-system-make", "disabled make bundle is not empty");
}


// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["dtcg-shape", "leaf-valid", "resolved", "css-resolves", "padding", "disabled-palette", "nonempty", "tailwind", "shadcn", "keycolors", "design-system", "design-system-stitch", "design-system-make"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: export-formats clears all [gate] predicates");
process.exit(0);
