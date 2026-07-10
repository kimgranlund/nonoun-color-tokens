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

  // TEXT-RENDERING BASELINE — "always include" is a GATE, not a hope (the standing rule, 2026-07-10):
  // the DESIGN.md Typography section mandates the block (smoothing pair · optimizeLegibility · optical
  // sizing · font-synthesis none · kerning + common ligatures · the code/pre/kbd no-ligatures exception),
  // and EVERY @dsCard preview actually renders under it.
  {
    const md = byName["DESIGN.md"] || "";
    for (const probe of ["-webkit-font-smoothing: antialiased", "-moz-osx-font-smoothing: grayscale", "text-rendering: optimizeLegibility", "font-optical-sizing: auto", "font-synthesis: none", "font-kerning: normal", "font-variant-ligatures: common-ligatures", "code, pre, kbd { font-variant-ligatures: none; }"])
      if (!md.includes(probe)) FAIL("design-system", `DESIGN.md Typography is missing the text-rendering baseline line: ${probe}`);
    for (const p of previews) {
      if (!p.data.includes("font-synthesis:none") || !p.data.includes("-webkit-font-smoothing:antialiased") || !p.data.includes("font-variant-ligatures:common-ligatures"))
        FAIL("design-system", `preview ${p.name} is missing the text-rendering baseline props`);
      if (!p.data.includes(".cd code,.cd pre,.cd kbd") || !p.data.includes("font-variant-ligatures:none"))
        FAIL("design-system", `preview ${p.name} is missing the code/pre/kbd no-ligatures exception`);
    }
  }

  // §8 GATES — KIT FIDELITY: G1 (contrast) is a MEASUREMENT of the kit's own onColorMode choice
  // (fixed = uniform brand labels, sub-4.5 pairs accepted per ADR-003) and is DISCLOSED in the
  // receipt; every OTHER gate (G0 parse, G2 parity, G3 carrier equality, G5 refs, G6 sections,
  // G7 roles, G8 leading) stays a hard ZERO.
  const gate = dsBundleGates({ designMd: byName["DESIGN.md"], tokensJson: byName["tokens.json"], previews: asPreviews });
  const nonG1 = gate.findings.filter((f) => f.level === "ERROR" && f.gate !== "G1");
  if (nonG1.length > 0) FAIL("design-system", `§8 non-G1 gates: ${nonG1.length} fail(s) — ${nonG1.map((f) => `[${f.gate}] ${f.msg}`).join(" | ")}`);
  const g1Count = gate.findings.filter((f) => f.level === "ERROR" && f.gate === "G1").length;
  const receipt = byName["README.md"];
  if (g1Count > 0) {
    if (!/🟡 Contrast measured/.test(receipt)) FAIL("design-system", "G1 misses exist but the receipt has no 🟡 contrast disclosure");
    if (!receipt.includes(`${g1Count} derivable fill/on-pair(s) below 4.5:1`)) FAIL("design-system", `receipt disclosure count does not match the gate (${g1Count})`);
    if (!/ADR-003/.test(receipt)) FAIL("design-system", "contrast disclosure missing the ADR-003 brand-override citation");
  } else if (!/🟢 Contrast/.test(receipt)) FAIL("design-system", "all pairs pass but the receipt has no 🟢 contrast line");

  // KIT FIDELITY — the reduced grammar is a NAME reduction of the semantic layer: values VERBATIM.
  {
    const tjF = JSON.parse(byName["tokens.json"]);
    for (const [nm, sem] of [["primary", "primary"], ["primary-on-primary", "primary-on-primary"], ["primary-hover", "primary-hover"], ["neutral-background", "neutral-background"]]) {
      if (tjF.colors[nm] !== tjF.semantic[sem]) FAIL("design-system", `colors.${nm} !== semantic.${sem} — the export adjusted a kit value (fidelity broken)`);
      if (tjF.colorsDark[nm] !== tjF.semanticDark[sem]) FAIL("design-system", `colorsDark.${nm} !== semanticDark.${sem} — the export adjusted a kit value (fidelity broken)`);
    }
  }

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
    // ICONS — always present (an agent must never pick its own library); sizes come FROM geometry, never
    // redefined, so the icon ramp must equal the geometry ramp's per-size icon px.
    if (!tj.icons || tj.icons.family !== "Phosphor" || tj.icons.variant !== "regular") FAIL("design-system", `tokens.icons is not the default Phosphor·regular: ${JSON.stringify(tj.icons)}`);
    const geoIcons = Object.fromEntries(Object.entries(gsc.sizes).map(([k, v]) => [k.toLowerCase(), v.icon]));
    if (JSON.stringify(tj.icons.sizes) !== JSON.stringify(geoIcons)) FAIL("design-system", "tokens.icons.sizes diverges from the geometry ramp (icon sizes must never be redefined)");
    // MOTION — always present. Easings are cubic-bezier strings (an agent binds, never types); the ms
    // ladder is 4 tiers × 4 steps, strictly ascending; only compositor properties are animatable.
    const mo = tj.motion || {};
    if (!mo.easing || !mo.duration || !Array.isArray(mo.animatable)) FAIL("design-system", "tokens.motion missing easing/duration/animatable");
    else {
      for (const [k, v] of Object.entries(mo.easing)) if (!/^cubic-bezier\(/.test(v)) FAIL("design-system", `motion.easing.${k} is not a cubic-bezier(): ${v}`);
      for (const need of ["standard", "standard-decelerate", "standard-accelerate", "emphasized-decelerate", "emphasized-accelerate", "linear"]) if (!mo.easing[need]) FAIL("design-system", `motion.easing missing ${need}`);
      const ds = Object.values(mo.duration);
      if (ds.length !== 16 || ds.some((n) => !Number.isFinite(n) || n <= 0)) FAIL("design-system", `motion.duration is not 16 positive ms values (got ${ds.length})`);
      if (ds.some((n, i) => i > 0 && n <= ds[i - 1])) FAIL("design-system", "motion.duration ladder is not strictly ascending");
      if (mo.duration.short2 !== 100) FAIL("design-system", "motion.duration.short2 must be the 100ms instant floor");
      if (JSON.stringify(mo.animatable) !== JSON.stringify(["transform", "opacity"])) FAIL("design-system", "motion.animatable must be exactly transform+opacity (compositor-only)");
    }
  }

  // SELF-CONTAINMENT (standing rule): no emitted file may reference a path outside its shipped folder —
  // the consuming harness may have ONLY that folder. Gate every design-system bundle file.
  const UNREACHABLE = /\.\.\/design-system|\.\.\/_superseded|design-system-files-for-llms/;
  for (const f of files) if (UNREACHABLE.test(f.data)) FAIL("design-system", `${f.name} references a path outside the shipped folder (unreachable for the consumer)`);

  // DESIGN.md: the canonical sections, the grammar teaching, and light-dark() ONLY in the runtime block.
  const md = byName["DESIGN.md"];
  for (const sec of ["## Overview", "## Colors", "## Typography", "## Iconography", "## Motion", "## Components", "## Do's and Don'ts", "## Responsive Behavior", "## Agent Prompt Guide"]) if (!md.includes(sec)) FAIL("design-system", `spine missing ${sec}`);
  // the Motion section is the four-part contract: durations · easings · what never animates · reduced motion.
  {
    const mo = md.split("## Motion")[1].split("## Components")[0];
    if (!/100ms is the "instant" floor/.test(mo)) FAIL("design-system", "Motion section states no duration guidance");
    if (!/Entrances decelerate\. Exits accelerate/.test(mo)) FAIL("design-system", "Motion section states no enter/exit asymmetry law");
    if (!/Never animate:/.test(mo) || !/CLS defect/.test(mo)) FAIL("design-system", "Motion section carries no never-animate list");
    if (!/prefers-reduced-motion: reduce/.test(mo) || !/reduce, don't remove/.test(mo)) FAIL("design-system", "Motion section carries no reduced-motion policy");
    if (!/cubic-bezier\(/.test(mo)) FAIL("design-system", "Motion section names no easing curve");
  }
  // the icon system is a binding RULE in PROSE, never a frontmatter key (a frontmatter `icons:` trips the
  // Stitch schema linter's unknown-key check; the extra prose section rides its unknown-section tolerance).
  if (/^icons:/m.test(md.split("---")[1] || "")) FAIL("design-system", "icons must not appear as a frontmatter key (Stitch unknown-key)");
  if (!md.includes("Phosphor") || !/Icon SIZES come from the control ramp/.test(md)) FAIL("design-system", "the Iconography section does not name the library + fence sizes to the control ramp");
  if (!md.includes("### Token naming")) FAIL("design-system", "spine missing the Token naming grammar section");
  if (/^\s+[a-z0-9-]+(?:-dark)?:\s*"light-dark\(/mi.test(md)) FAIL("design-system", "light-dark() in a frontmatter carrier (Stitch rejects it)");
  if (!/color-scheme: light dark/.test(md) || !/light-dark\(oklch/.test(md)) FAIL("design-system", "no color-scheme + light-dark(oklch) runtime block");

  // BRIGHT-BRAND regression fixture (the real ADIA kit params): base fills luminous enough that the
  // MEASURED light-scheme label is the INK pole. The role table's mode-mirrored hover (darker in light)
  // then moves AGAINST the ink label — pre-fix, 7/8 families failed AA on the light hover pair (the
  // default theme masked it: its labels are white, so darkening hover *gains* contrast). dsStateFills
  // must keep every emitted state pair ≥4.5 for THIS shape too, not just the default.
  {
    const BRIGHT = { curve: "logistic", tension: 0, lmin: 4, lmax: 100, damp: 80, dampCurve: 1.2, dampAmp: 90, dampBias: -30, hueSpace: "oklch", relChroma: false, chromaFloor: 40, toneMode: "perceptual", vibrancy: 0, onColorMode: "fixed", accentRef: "single", theme: "auto", palettes: [{ name: "Neutral", hue: 225, chroma: 10, skew: -20, lift: 0, hueShift: 15, hueSameDir: false, on: true, cuspPull: 0 }, { name: "Primary", hue: 225, chroma: 85, skew: -20, lift: 0, hueShift: 10, hueSameDir: false, on: true, cuspPull: 26 }, { name: "Secondary", hue: 205, chroma: 40, skew: 0, lift: 0, hueShift: 20, hueSameDir: false, on: true, cuspPull: 25 }, { name: "Tertiary", hue: 285, chroma: 45, skew: -20, lift: 0, hueShift: 20, hueSameDir: false, on: true }, { name: "Info", hue: 265, chroma: 45, skew: -20, lift: 0, hueShift: 20, hueSameDir: false, on: true }, { name: "Success", hue: 150, chroma: 40, skew: -20, lift: -5, hueShift: 0, hueSameDir: false, on: true }, { name: "Warning", hue: 75, chroma: 50, skew: 40, lift: 15, hueShift: 30, hueSameDir: true, on: true, cuspPull: 100 }, { name: "Danger", hue: 25, chroma: 40, skew: -20, lift: -5, hueShift: 0, hueSameDir: false, on: true, cuspPull: 0 }] };
    const bf = X.exportDesignSystemBundle(BRIGHT, tsc, gsc);
    const bByName = Object.fromEntries(bf.map((f) => [f.name, f.data]));
    const bPrev = bf.filter((f) => f.name.startsWith("components/")).map((p) => ({ name: p.name.replace("components/", ""), html: p.data }));
    const bg = dsBundleGates({ designMd: bByName["DESIGN.md"], tokensJson: bByName["tokens.json"], previews: bPrev });
    const bNonG1 = bg.findings.filter((f) => f.level === "ERROR" && f.gate !== "G1");
    if (bNonG1.length > 0) FAIL("design-system", `bright-brand fixture: non-G1 gates ${bNonG1.length} fail(s) — ${bNonG1.slice(0, 4).map((f) => `[${f.gate}] ${f.msg}`).join(" | ")}`);
    // fidelity: the bright kit's values ship VERBATIM (fixed-mode G1 misses are the kit's own, disclosed)
    const bTj = JSON.parse(bByName["tokens.json"]);
    if (bTj.colors["primary"] !== bTj.semantic["primary"] || bTj.colors["primary-on-primary"] !== bTj.semantic["primary-on-primary"]) FAIL("design-system", "bright-brand fixture: export adjusted a kit value (fidelity broken)");
    const bG1 = bg.findings.filter((f) => f.level === "ERROR" && f.gate === "G1").length;
    if (bG1 > 0 && !bByName["README.md"].includes(`${bG1} derivable fill/on-pair(s) below 4.5:1`)) FAIL("design-system", "bright-brand fixture: receipt does not disclose the measured G1 count");
  }

  // the §8 gate CATCHES a broken bundle (a constant dark on-color) — proves npm test would fail on the F1 defect.
  if (tj) {
    // Inject a carrier-divergence defect into the OKLCH tokens.json: a value no kit token plausibly is
    // (#123456), so it MUST diverge from the OKLCH frontmatter and trip G3. (The old #FFFFFF injection went
    // vacuous under kit fidelity — fixed-mode dark on-colors can BE white, making white a no-op mutation.)
    const bad = JSON.parse(JSON.stringify(tj)); const onKey = Object.keys(bad.colorsDark).find((k) => /^(.+)-on-\1$/.test(k)); bad.colorsDark[onKey] = "#123456";
    const g = dsBundleGates({ designMd: md, tokensJson: bad, previews: asPreviews });
    if (!g.findings.some((f) => f.level === "ERROR" && f.gate === "G3")) FAIL("design-system", "the §8 gate does not catch a constant dark on-color (F1 — G3 carrier divergence)");
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
  // The projection is exportShadcn in contrast mode with the LINKING opts the bundle passes: aliasPrefix
  // (every color value a var() into the token layer), radii (--radius from the real geometry, never the
  // 0.625rem fallback), fonts (the @theme font slots setup.md promises).
  const shadcnPart = X.exportShadcn({ ...C(ALL), onColorMode: "contrast" }, { aliasPrefix: "c", radii: Object.fromEntries(Object.entries(gsc.radii)), fonts: tsc.fonts });
  if (!styles.startsWith(shadcnPart)) FAIL("design-system-make", "styles.css does not START with the aliased contrast-mode shadcn projection");
  if (!/--primary:\s*var\(--c-primary\);/.test(styles)) FAIL("design-system-make", "shadcn tokens are not LINKED (var()) to the design-token layer");
  if (/--radius:\s*0\.625rem/.test(styles)) FAIL("design-system-make", "--radius fell back to the shadcn default instead of the geometry md corner");
  if (!/--font-sans:/.test(styles)) FAIL("design-system-make", "@theme font slots missing (setup.md promises them)");
  if (!styles.includes("FULL token layers")) FAIL("design-system-make", "styles.css missing the appended full token layers");
  // the appendix must land AFTER the @theme block so the D10 parse (first :root -> .dark -> @theme) is untouched
  if (styles.indexOf("FULL token layers") < styles.indexOf("@theme inline {")) FAIL("design-system-make", "full-layer appendix must come after @theme inline (D10 parse safety)");
  // TEXT-RENDERING BASELINE — Make carries it as REAL CSS in styles.css AND as prose in typography.md.
  for (const probe of ["-webkit-font-smoothing:antialiased", "font-synthesis:none", "font-optical-sizing:auto", "code, pre, kbd { font-variant-ligatures: none; }"])
    if (!styles.includes(probe)) FAIL("design-system-make", `styles.css missing the text-rendering baseline: ${probe}`);
  const makeTypo = byName["guidelines/foundations/typography.md"];
  for (const probe of ["font-synthesis: none", "-webkit-font-smoothing: antialiased", "code, pre, kbd { font-variant-ligatures: none; }"])
    if (!makeTypo.includes(probe)) FAIL("design-system-make", `typography.md missing the text-rendering baseline: ${probe}`);
  // every var() link must RESOLVE to a concrete value in both schemes (the map contract survives aliasing)
  const rmap = X.dsShadcnRuntimeMap(styles);
  for (const tok of ["--background", "--primary", "--primary-foreground", "--destructive", "--border"]) {
    const e = rmap[tok];
    if (!e || !/^(oklch\(|#)/.test(e.light) || !/^(oklch\(|#)/.test(e.dark)) FAIL("design-system-make", `${tok} does not resolve to concrete values through the link layer`);
  }
  // KIT-FIDELITY guard — the resolved shadcn foregrounds must equal the kit's own on-role values
  // (tokens.json semantic layer, same state): the projection may never re-measure or re-point a label.
  {
    const tjm = JSON.parse(X.exportDesignSystemTokens(C(ALL), tsc, gsc));
    for (const [tok, sem] of [["--primary-foreground", "primary-on-primary"], ["--primary", "primary"], ["--background", "neutral-background"]]) {
      const e = rmap[tok];
      if (!e) { FAIL("design-system-make", `${tok} missing from the resolved runtime map`); continue; }
      if (e.light !== tjm.semantic[sem] || e.dark !== tjm.semanticDark[sem]) FAIL("design-system-make", `resolved ${tok} != the kit's ${sem} role — the projection adjusted a kit value (fidelity broken)`);
    }
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

  // D10 (measured, not left UNMEASURED) — the runtime block's tokens equal the SHIPPED styles.css
  // parse (kit fidelity: same state, same carrier, links resolved — never a re-forced mode).
  const rtMap = X.dsShadcnRuntimeMap(styles);
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
