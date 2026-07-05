#!/usr/bin/env node
// verify.mjs — export-formats validation adapter (CRITIC side; deny-on-write to the advancer).
import { readFileSync } from "node:fs";
import * as X from "../../src/engine/exports.js";
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

// ── hpg-export-leaf-valid (>= 59 x enabled resolved leaves per mode; each well-formed) ────
for (const file of ["Light_tokens.json", "Dark_tokens.json"]) {
  const ls = leaves(dtcg[file]);
  if (ls.length < 59 * enabledCount(C(ALL))) FAIL("leaf-valid", `${file} has ${ls.length} leaves < 59×${enabledCount(C(ALL))}`);
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

// ── hpg-export-claude-design (claude.ai/design FULL bundle: tokens.json + DESIGN.md spine + @dsCard ──
// previews). The engine gate re-implements ds_check.py's D1/D2/D3 so the bundle can't drift checker-dirty
// without npm test catching it — one shared colour source must stay consistent across all three layers.
{
  const tsc = typeScale({});
  const gsc = geomScale({});
  let cd;
  try { cd = JSON.parse(X.exportClaudeDesign(C(ALL), tsc, gsc)); } catch { FAIL("claude-design", "not valid JSON"); cd = null; }
  if (cd) {
    // the GENERATION colour role set — a REDUCTION of the 59 roles (background/surface/foreground/…), NOT
    // all 59; light in `colors`, dark in `colorsDark`, both flat {role:"#hex"} for ds_check.py's D3 gate.
    const needRoles = ["background", "surface", "foreground", "muted", "border", "primary", "primary-foreground", "danger", "danger-foreground"];
    if (!cd.colors || typeof cd.colors !== "object") FAIL("claude-design", "no colors block");
    else {
      for (const role of needRoles) if (!(role in cd.colors)) FAIL("claude-design", `colors missing '${role}'`);
      // #rrggbb solids, or #rrggbbaa where the source role is faithfully translucent (e.g. a subtle
      // outline-variant border) — both valid CSS hex, both accepted by ds_check.py's D3 (#{3,8}).
      for (const [k, v] of Object.entries(cd.colors)) if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) FAIL("claude-design", `colors.${k} not #rrggbb(aa): ${v}`);
    }
    // colorsDark mirrors colors' keys exactly (every light role has its dark end, same order)
    if (!cd.colorsDark || Object.keys(cd.colorsDark).join() !== Object.keys(cd.colors || {}).join()) FAIL("claude-design", "colorsDark keys differ from colors");
    // GOLDEN ANCHOR — the published role SEQUENCE (all 8 palettes on) is locked to the #207 contract; a
    // self-consistent reorder would still pass D3 but silently change tokens.json, so pin it explicitly.
    const CD_ROLE_ORDER = "background,surface,surface-raised,foreground,muted,border,primary,primary-foreground,secondary,secondary-foreground,accent,accent-foreground,ring,danger,danger-foreground,success,success-foreground,warning,warning-foreground,info,info-foreground";
    if (cd.colors && Object.keys(cd.colors).join(",") !== CD_ROLE_ORDER) FAIL("claude-design", `colors role order drifted from #207: ${Object.keys(cd.colors).join(",")}`);
    // ALL defaults enabled → info/success/warning are full palettes, so their intent roles appear
    for (const role of ["success", "warning", "info"]) if (cd.colors && !(role in cd.colors)) FAIL("claude-design", `colors missing intent '${role}' (all palettes enabled)`);
    // composed TYPE: fonts + a per-voice·step size scale (numeric px size/lineHeight + numeric weight) from typeScale
    if (!cd.type || !cd.type.fonts || !cd.type.scale || !Object.keys(cd.type.scale).length) FAIL("claude-design", "type.scale empty (typeScale not composed)");
    else for (const s of Object.values(cd.type.scale)) if (![s.size, s.lineHeight, s.weight].every((n) => typeof n === "number" && n > 0)) FAIL("claude-design", "type.scale step not numeric px");
    // composed GEOMETRY: spacing (numeric-px ARRAY, per the format's example) + radii (NAMED numeric-px tiers)
    if (!Array.isArray(cd.spacing) || !cd.spacing.length || cd.spacing.some((v) => typeof v !== "number")) FAIL("claude-design", "spacing not a numeric array");
    if (!cd.radii || !Object.keys(cd.radii).length || Object.values(cd.radii).some((v) => typeof v !== "number")) FAIL("claude-design", "radii not numeric px");
  }
  // disabled-palette safety: all-off → the $note fallback (no throw, no colors block)
  try { const j = JSON.parse(X.exportClaudeDesign(C(RT.defaults.map((p) => ({ ...p, on: false }))), tsc, gsc)); if (j.colors) FAIL("claude-design", "all-disabled emitted colors"); if (!j.$note) FAIL("claude-design", "all-disabled missing $note"); }
  catch { FAIL("claude-design", "all-disabled not valid JSON"); }
  // scales omitted → colours still emit (type/space/radii just empty), never throws
  try { const bare = JSON.parse(X.exportClaudeDesign(C(ALL))); if (!bare.colors || !bare.colors.primary) FAIL("claude-design", "colours absent when scales omitted"); }
  catch { FAIL("claude-design", "throws when scales omitted"); }

  // ── the DESIGN.md spine + the @dsCard previews + the bundle — reconciled against tokens.json canon ──
  if (cd && cd.colors) {
    const norm = (v) => { v = String(v).trim().replace(/;$/, "").trim().toLowerCase(); const m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/); return m ? "#" + m.slice(1).map((c) => c + c).join("") : v; };
    const canon = {}; for (const [k, v] of Object.entries(cd.colors)) canon["color-" + k] = norm(v); // ds_check keys roles as color-{k}

    // SPINE — the 9 sections present, and every authoritative colour table row (one --color-* + one hex)
    // equals the tokens.json canon (ds_check.py D3, the shakedown case: a spine-table hex that drifts).
    const spine = X.exportClaudeDesignSpine(C(ALL), tsc, gsc);
    for (let n = 1; n <= 9; n++) if (!spine.includes(`## ${n}. `)) FAIL("claude-design", `spine missing section ${n}`);
    for (const line of spine.split("\n")) {
      if (!/^\s*\|.*\|/.test(line)) continue;                       // a markdown table row
      const vars = [...new Set(line.match(/--[A-Za-z0-9-]+/g) || [])];
      const hexes = line.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      if (vars.length === 1 && hexes.length === 1 && canon[vars[0].slice(2)] && norm(hexes[0]) !== canon[vars[0].slice(2)])
        FAIL("claude-design", `spine ${vars[0]}=${hexes[0]} drifts from tokens ${canon[vars[0].slice(2)]}`);
    }
    const spineOff = X.exportClaudeDesignSpine(C(RT.defaults.map((p) => ({ ...p, on: false }))), tsc, gsc);
    if (spineOff.includes("--color-")) FAIL("claude-design", "disabled spine is not the palette-less placeholder");

    // PREVIEWS — ds_check.py D1 (first-line @dsCard + gallery group) · D2 (self-contained, ≤256KiB) ·
    // D3 (every light-scope --color-* def, and any var() fallback, equals canon).
    const REMOTE = /(?:src\s*=\s*["']?(?:https?:)?\/\/)|(?:<link\b[^>]*?href\s*=\s*["']?(?:https?:)?\/\/)|(?:@import\s+(?:url\()?\s*["']?(?:https?:)?\/\/)|(?:url\(\s*["']?(?:https?:)?\/\/)/i;
    const GROUPS = ["Type", "Colors", "Spacing", "Components", "Brand"];
    const comps = X.exportClaudeDesignComponents(C(ALL), tsc, gsc);
    if (!Array.isArray(comps) || comps.length < 4) FAIL("claude-design", `too few previews (${comps && comps.length})`);
    const seen = new Set();
    for (const c of comps || []) {
      if (!c.name || !c.name.startsWith("components/") || !c.name.endsWith(".html")) FAIL("claude-design", `bad preview name ${c && c.name}`);
      const first = c.data.split("\n").find((l) => l.trim()) || "";
      const m = /^\s*<!--\s*@dsCard\b([^>]*?)-->/.exec(first);
      if (!m) { FAIL("claude-design", `${c.name}: first line is not an @dsCard marker`); continue; }
      const g = (m[1].match(/group\s*=\s*"([^"]*)"/) || [])[1];
      if (!g) FAIL("claude-design", `${c.name}: @dsCard has no group`);
      else if (!GROUPS.includes(g)) FAIL("claude-design", `${c.name}: group "${g}" not a gallery group`);
      else seen.add(g);
      const nbytes = Buffer.byteLength(c.data);
      if (REMOTE.test(c.data)) FAIL("claude-design", `${c.name}: loads an external resource`);
      if (nbytes > 256 * 1024) FAIL("claude-design", `${c.name}: ${nbytes} > 256KiB`);
      if (nbytes < 300) FAIL("claude-design", `${c.name}: looks thin (${nbytes}B)`);
      const lightScope = c.data.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");   // drop @media (dark) — a scheme override, not drift
      for (const d of lightScope.matchAll(/--([A-Za-z0-9-]+)\s*:\s*([^;}"'\n]+)/g))
        if (canon["color-" + d[1].replace(/^color-/, "")] && d[1].startsWith("color-") && norm(d[2]) !== canon[d[1]])
          FAIL("claude-design", `${c.name}: --${d[1]}=${d[2]} drifts from canon`);
      for (const u of c.data.matchAll(/var\(\s*--(color-[A-Za-z0-9-]+)\s*,\s*([^)]+)\)/g))
        if (canon[u[1]] && norm(u[2]) !== canon[u[1]]) FAIL("claude-design", `${c.name}: var(--${u[1]}) fallback drifts`);
    }
    if (seen.size < 3) FAIL("claude-design", `previews cover only ${seen.size} gallery group(s)`);

    // BUNDLE — the folder carries all three layers; a palette-less doc degrades to tokens.json only.
    const names = X.exportClaudeDesignBundle(C(ALL), tsc, gsc).map((f) => f.name);
    if (!names.includes("tokens.json") || !names.includes("DESIGN.md") || !names.some((n) => n.startsWith("components/")))
      FAIL("claude-design", `bundle missing a layer: ${names.join(",")}`);
    const off = X.exportClaudeDesignBundle(C(RT.defaults.map((p) => ({ ...p, on: false }))), tsc, gsc);
    if (off.length !== 1 || off[0].name !== "tokens.json") FAIL("claude-design", "disabled bundle is not tokens.json-only");
  }
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["dtcg-shape", "leaf-valid", "resolved", "css-resolves", "padding", "disabled-palette", "nonempty", "tailwind", "shadcn", "keycolors", "claude-design"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: export-formats clears all [gate] predicates");
process.exit(0);
