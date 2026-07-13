#!/usr/bin/env node
// geometry.mjs — verifier for the dimensional engine (src/engine/geometry.mjs). Pure, no DOM.
import * as G from "../../src/engine/geometry.mjs";
import { typeScale } from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── treatments: 5 presets, each a density + radius style + base height ──
ok(G.GEOMETRY_TREATMENTS.length === 5, `5 treatments (got ${G.GEOMETRY_TREATMENTS.length})`);
ok(G.GEOMETRY_TREATMENTS.every((t) => typeof t.density === "number" && t.radiusStyle && t.baseHeight), "every treatment has density/radiusStyle/baseHeight");
ok(["comfortable", "compact", "spacious", "touch", "pill"].every((id) => G.GEOMETRY_TREATMENTS.some((t) => t.id === id)), "has comfortable/compact/spacious/touch/pill");

// ── the reference ramp: the power law reproduces the hand-tuned table (component-sizes.md) to ±1px ──
{
  const s = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const REF = { XS: { height: 20, icon: 14, font: 12 }, SM: { height: 24, icon: 16, font: 13 }, MD: { height: 28, icon: 18, font: 14 }, LG: { height: 36, icon: 20, font: 16 }, XL: { height: 48, icon: 24, font: 18 }, "2XL": { height: 64, icon: 28, font: 20 } };
  for (const [name, r] of Object.entries(REF)) {
    const sz = s.sizes[name];
    ok(sz.height === r.height, `${name} height = ${r.height} (got ${sz.height})`);
    ok(Math.abs(sz.icon - r.icon) <= 1, `${name} icon ≈ ${r.icon} (got ${sz.icon})`);
    ok(Math.abs(sz.font - r.font) <= 1, `${name} font ≈ ${r.font} (got ${sz.font})`);
  }
  // sizes strictly increase XS→2XL
  const heights = ["XS", "SM", "MD", "LG", "XL", "2XL"].map((k) => s.sizes[k].height);
  ok(heights.every((v, i) => i === 0 || v > heights[i - 1]), `heights strictly increase (${heights})`);
}

// ── THE CENTERING LAW: edge padding = (height − icon) / 2 exactly, for every size ──
{
  const s = G.geomScale({ treatment: "comfortable" });
  for (const [name, sz] of Object.entries(s.sizes)) {
    ok(sz.padding === (sz.height - sz.icon) / 2, `${name}: padding = (h−icon)/2 (got ${sz.padding}, want ${(sz.height - sz.icon) / 2})`);
    ok(sz.edgePadding === Math.round(sz.height / 2), `${name}: slotless edge = h/2 (got ${sz.edgePadding})`);
    ok(sz.radiusPill === Math.round(sz.height / 2), `${name}: pill radius = h/2 (got ${sz.radiusPill})`);
    ok(sz.minWidth === sz.height, `${name}: min-width = height (the square floor)`);
    ok(sz.icon > 0 && sz.icon <= sz.height, `${name}: 0 < icon ≤ height`);
  }
}

// ── the two families: caret = font (rhythm); density rides the gap, NOT the frame ──
{
  const comf = G.geomScale({ treatment: "comfortable" });
  const comp = G.geomScale({ treatment: "compact" });
  ok(Object.values(comf.sizes).every((s) => s.caret === s.font), "caret = font at every size (the rhythm rule)");
  // compact (density 0.75) tightens the gap but NOT the centering padding (the frame is geometric).
  // compare at the SAME height so density is the only variable.
  const a = G.geomScale({ treatment: "comfortable", baseHeight: 28 }).sizes.MD;
  const b = G.geomScale({ treatment: "compact", baseHeight: 28 }).sizes.MD;
  ok(b.gap < a.gap, `compact gap < comfortable gap at same height (got ${b.gap} vs ${a.gap})`);
  ok(b.padding === a.padding, `density does NOT change the frame padding (got ${b.padding} vs ${a.padding})`);
  void comp;
}

// ── baseHeight scales the whole ramp uniformly (the shape is preserved) ──
{
  const a = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const b = G.geomScale({ treatment: "comfortable", baseHeight: 40 });
  ok(b.sizes.MD.height > a.sizes.MD.height, "a larger baseHeight scales MD up");
  ok(b.sizes["2XL"].height > a.sizes["2XL"].height, "a larger baseHeight scales 2XL up too");
}

// ── unknown treatment falls back to the first ──
ok(G.geomScale({ treatment: "nope" }).treatment === G.GEOMETRY_TREATMENTS[0].id, "unknown treatment → first treatment");

// ── radius ladder = Material 3's shape-corner scale (fixed across treatments) + radiusDefault ──
{
  const s = G.geomScale({ treatment: "comfortable" });
  // the exact M3 shape-corner scale: none 0 · xs 4 · sm 8 · md 12 · lg 16 · xl 28 · full pill.
  ok(JSON.stringify(s.radii) === JSON.stringify({ none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 9999 }), `radius ladder = M3 corners (got ${JSON.stringify(s.radii)})`);
  // FIXED across treatments — M3 has one shape scale (density doesn't rescale corners).
  for (const t of ["compact", "spacious", "touch", "pill"])
    ok(JSON.stringify(G.geomScale({ treatment: t }).radii) === JSON.stringify(s.radii), `${t} shares the same M3 radius scale (fixed)`);
  // the treatment's FEEL is its default corner LEVEL (the M3 "pick a level" model), not a rescaling.
  ok(G.geomScale({ treatment: "compact" }).radiusDefault === "sm" && s.radiusDefault === "md" && G.geomScale({ treatment: "spacious" }).radiusDefault === "lg" && G.geomScale({ treatment: "pill" }).radiusDefault === "full",
    "radiusDefault reflects the treatment: compact→sm, comfortable→md, spacious→lg, pill→full");
  const sp = Object.values(s.space);
  ok(sp[0] === 0 && sp.every((v, i) => i === 0 || v >= sp[i - 1]), `space scale starts 0 and is monotonic (${sp})`);
}

// ── CSS emit: custom props + a utility class per size ──
{
  const css = G.geomTokensCSS(G.geomScale({ treatment: "comfortable" }));
  ok(css.includes("--size-md-height:") && css.includes("--radius-xs: 4px;") && css.includes("--radius-xl: 28px;") && css.includes("--space-4:"), "CSS has size + the M3 radius scale (xs 4 … xl 28) + space custom props");
  ok(css.includes("--radius-default: var(--radius-md);"), "CSS aliases --radius-default to the treatment's favoured corner (comfortable → md)");
  ok(/\.control-md\s*\{[^}]*block-size: var\(--size-md-height\)[^}]*padding-block: 0/.test(css), "CSS emits a .control-md utility class (block-size lever, padding-block 0)");
  // naming-scheme PREFIX: a Material scheme namespaces the WHOLE dimensional system under one root
  // (--md-sys-size-* · --md-sys-radius-* · --md-sys-inset-* · --md-sys-focus-* · .md-sys-control-*);
  // the --radius-default alias + the .control-* refs thread the prefix. Empty ⇒ native (identity gate).
  const g = G.geomScale({ treatment: "comfortable" });
  const md = G.geomTokensCSS(g, { prefix: "md-sys" });
  ok(md.includes("--md-sys-size-md-height:") && md.includes("--md-sys-radius-md:") && md.includes("--md-sys-space-4:") && md.includes("--md-sys-inset-card:") && md.includes("--md-sys-focus-ring-width:"), "prefix namespaces every geometry family under the scheme root");
  ok(md.includes("--md-sys-radius-default: var(--md-sys-radius-md);"), "the radius-default alias threads the prefix on both sides");
  ok(md.includes(".md-sys-control-md {") && md.includes("var(--md-sys-size-md-height)") && !md.includes("--size-md-height"), "the .control-* class + its refs thread the prefix (no stray --size-*)");
  ok(G.geomTokensCSS(g, { prefix: "" }) === css, "empty prefix is byte-identical to the native default (identity gate)");
  ok(G.geomTokensBreakpointCSS([{ name: "M", minWidth: 768, scale: g }], { prefix: "md-sys" })[0].css.includes("--md-sys-size-md-height:"), "a breakpoint file threads the prefix too");
}

// ── CSS export unit (px/rem/em): even-grid geometry converts clean to rem ──
{
  const g = G.geomScale({ treatment: "comfortable", baseHeight: 32 }); // MD height = 32
  ok(/--size-md-height: 32px;/.test(G.geomTokensCSS(g)), "geomTokensCSS defaults to px");
  ok(/--size-md-height: 2rem;/.test(G.geomTokensCSS(g, { unit: "rem" })), "unit:rem → 32px = 2rem (radii/space convert too)");
  ok(G.geomTokensDTCG(g, { unit: "rem" }).size.MD.height.$value === "2rem" && G.geomTokensDTCG(g).size.MD.height.$value === "32px", "geometry DTCG carries the unit + defaults to px");
}

// ── breakpoint CSS: SEPARATE, self-contained per-mode override FILES (not one @media-embedded file) —
// each bounded on both ends except the narrowest, which stays open below (#264) ──
{
  const base = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const touch = G.geomScale({ treatment: "comfortable", baseHeight: 40 });
  const tablet = G.geomScale({ treatment: "comfortable", baseHeight: 26 });

  const solo = G.geomTokensBreakpointCSS([{ name: "Touch", minWidth: 600, scale: touch }, { name: "NoWidth", scale: touch }]);
  ok(solo.length === 1 && solo[0].name === "Touch", "a mode WITHOUT a minWidth is skipped (preview-only, mirrors the DTCG files)");
  ok(/@media \(max-width: 1279px\) \{\s*:root \{[^}]*--size-md-height: 40px/.test(solo[0].css) && !/min-width/.test(solo[0].css), "a lone mode is the NARROWEST too: open-ended below, bounded above by desktopMinWidth-1 (default 1280)");
  ok(G.geomTokensBreakpointCSS([]).length === 0, "no modes → no files");

  const two = G.geomTokensBreakpointCSS([{ name: "Tablet", minWidth: 992, scale: tablet }, { name: "Mobile", minWidth: 476, scale: touch }]);
  ok(two.length === 2 && two[0].name === "Tablet" && two[1].name === "Mobile", "sorted DESCENDING by minWidth regardless of storage order");
  ok(/@media \(min-width: 992px\) and \(max-width: 1279px\)/.test(two[0].css), "the wider mode is bounded BOTH ends: [own minWidth, desktopMinWidth-1]");
  ok(/@media \(max-width: 991px\)/.test(two[1].css) && !/min-width/.test(two[1].css), "the narrowest mode is open-ended below");
  const reversed = G.geomTokensBreakpointCSS([{ name: "Mobile", minWidth: 476, scale: touch }, { name: "Tablet", minWidth: 992, scale: tablet }]);
  ok(JSON.stringify(reversed) === JSON.stringify(two), "order-independent: reversed storage order yields the identical file set");
}

// ── DTCG emit: size composite + radius + space dimension groups ──
{
  const d = G.geomTokensDTCG(G.geomScale({ treatment: "spacious" }));
  ok(d.size && d.radius && d.space, "DTCG has size/radius/space groups");
  ok(d.size.MD.height.$type === "dimension" && /px$/.test(d.size.MD.height.$value), "DTCG dimension token (px value)");
  ok(d.size.MD.padding.$type === "dimension" && d.radius.full.$type === "dimension", "DTCG padding + radius are dimension tokens");
}

// ── COMPOSITION with typography: the per-step `font` comes from the type Label scale (renamed from "UI"
// 2026-07-13) at a MATCHING step name. Label is now a fixed SM/MD/LG-only ramp, so only geometry's
// SM/MD/LG steps have a real Label counterpart; geometry's XS/XL/2XL have none and fall back to the
// standalone power law (buildSize's pre-existing null-fontOverride path) — the frame
// (height/icon/pad/radius) is untouched either way ──
{
  const ts = typeScale({ treatment: "product", bodyBase: 16 });
  const standalone = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const composed = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { typeScale: ts });
  ok(composed.typed === true && standalone.typed === false, "geomScale reports `typed` only when a type scale is supplied");
  for (const name of ["SM", "MD", "LG"]) {
    ok(composed.sizes[name].font === ts.categories.Label[name].size, `${name}: composed font = type Label ${name} size (${composed.sizes[name].font} vs ${ts.categories.Label[name].size})`);
  }
  for (const name of ["XS", "XL", "2XL"]) {
    ok(composed.sizes[name].font === standalone.sizes[name].font, `${name}: no Label counterpart (Label is SM/MD/LG-only) — falls back to the standalone power law, same as uncomposed`);
  }
  for (const name of ["XS", "SM", "MD", "LG", "XL", "2XL"]) {
    ok(composed.sizes[name].caret === composed.sizes[name].font, `${name}: caret follows the shared font`);
    // the FRAME is unchanged by composition — the centering law still holds with the shared font
    ok(composed.sizes[name].height === standalone.sizes[name].height && composed.sizes[name].padding === standalone.sizes[name].padding, `${name}: composition leaves height + padding (the frame) untouched`);
    ok(composed.sizes[name].padding === (composed.sizes[name].height - composed.sizes[name].icon) / 2, `${name}: centering law holds on the composed scale`);
  }
  // the two engines share ONE number — a bigger body base scales the control text too (for a step with a
  // real Label counterpart — MD does)
  const big = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { typeScale: typeScale({ treatment: "product", bodyBase: 22 }) });
  ok(big.sizes.MD.font > composed.sizes.MD.font, "a larger type bodyBase scales the geometry font (shared source of truth)");
}

// ── per-cell HEIGHT overrides (Tokens-matrix Phase 3): the height lever; icon/font/pad/radius all re-derive ──
{
  const baseline = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  // IDENTITY: no overrides (and an empty map) is byte-identical to the un-overridden scale.
  ok(JSON.stringify(G.geomScale({ treatment: "comfortable", baseHeight: 28 }, {})) === JSON.stringify(baseline), "no overrides ⇒ scale is byte-identical (identity gate)");
  ok(JSON.stringify(G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: {} })) === JSON.stringify(baseline), "empty overrides ⇒ scale is byte-identical (identity gate)");
  // an override feeds buildSize as the rawHeight, so EVERY derived dim re-computes via the laws.
  const ovH = 50;
  const ref = G.geomScale({ treatment: "comfortable", baseHeight: 50 }).sizes.MD; // what a 50px raw height yields through buildSize
  const ov = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: { MD: ovH } }).sizes.MD;
  ok(ov.height === ref.height, `override height drives buildSize (got ${ov.height}, want ${ref.height})`);
  ok(ov.icon === ref.icon && ov.font === ref.font && ov.padding === ref.padding && ov.radiusPill === ref.radiusPill && ov.caret === ref.caret && ov.gap === ref.gap, "icon/font/pad/radius/caret/gap ALL re-derive from the override via the laws");
  ok(ov.padding === (ov.height - ov.icon) / 2, "the centering law still holds on the overridden cell");
  // only the targeted size changes — every other size stays at the baseline.
  const ovScale = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: { MD: ovH } });
  ok(ovScale.sizes.LG.height === baseline.sizes.LG.height && ovScale.sizes.XS.height === baseline.sizes.XS.height, "an override touches only its size, no others");
  // composition still applies on top: the type UI font wins for the overridden cell's `font` (frame re-derives from height).
  const ts = typeScale({ treatment: "product", bodyBase: 16 });
  const comp = G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { typeScale: ts, overrides: { MD: ovH } }).sizes.MD;
  ok(comp.font === ts.categories.Label.MD.size && comp.height === ref.height, "composition + override coexist: font from the type Label scale, frame from the override height");
  // a non-positive / non-numeric override is ignored (no effect).
  ok(JSON.stringify(G.geomScale({ treatment: "comfortable", baseHeight: 28 }, { overrides: { MD: 0, LG: -3, XS: NaN } })) === JSON.stringify(baseline), "non-positive / NaN overrides are ignored (no effect)");
}

// ── Figma number-variable emit: a "Geometry" collection of unitless FLOAT tokens ──
{
  const f = G.geomTokensFigma(G.geomScale({ treatment: "comfortable" }));
  ok(f.Geometry && f.Geometry.size && f.Geometry.radius && f.Geometry.space, "Figma export wraps a Geometry collection (size/radius/space)");
  ok(f.Geometry.size.MD.height.$type === "number" && typeof f.Geometry.size.MD.height.$value === "number", "Figma tokens are number ($type number, numeric unitless value)");
  ok(f.Geometry.radius.full.$type === "number" && f.Geometry.space["4"].$type === "number", "radius + space are number variables too");
}

// ── Figma breakpoint-MODED variables: a single "Geometry" collection, one MODE per breakpoint (5.4b) ──
{
  const base = G.geomScale({ treatment: "comfortable", baseHeight: 28 });
  const wide = G.geomScale({ treatment: "comfortable", baseHeight: 40 }); // a taller mode → bigger size heights
  const out = G.geomTokensFigmaModes(base, [{ name: "Desktop", minWidth: 1024, scale: wide }]);
  const col = out.collections.Geometry;
  ok(col && JSON.stringify(col.modes) === JSON.stringify(["Base", "Desktop"]), `modes = [Base, Desktop] (got ${JSON.stringify(col && col.modes)})`);
  const v = col.variables["size/MD/height"];
  ok(v && v.type === "FLOAT" && typeof v.values.Base === "number" && typeof v.values.Desktop === "number", "size/MD/height is a FLOAT variable with Base + Desktop values");
  ok(["height", "icon", "font", "padding", "radius", "gap"].every((f) => col.variables[`size/MD/${f}`]), "size emits height/icon/font/padding/radius/gap (the geomTokensFigma fields)");
  ok(col.variables["radius/full"] && col.variables["radius/full"].type === "FLOAT" && col.variables["space/4"], "radius + space land as FLOAT variables too");
  // per-mode values DIFFER for a breakpoint with a different baseHeight (40 vs 28) — the Desktop height is taller.
  ok(v.values.Base === base.sizes.MD.height && v.values.Desktop === wide.sizes.MD.height, "Base value = base scale; Desktop value = that mode's scale");
  ok(v.values.Desktop !== v.values.Base, `the breakpoint's height differs from Base (Base ${v.values.Base}, Desktop ${v.values.Desktop})`);
  // IDENTITY: with no modes, a single "Base" mode whose values equal the base export.
  const idn = G.geomTokensFigmaModes(base, []);
  const idCol = idn.collections.Geometry;
  ok(JSON.stringify(idCol.modes) === JSON.stringify(["Base"]), "no modes ⇒ a single \"Base\" mode");
  ok(Object.values(idCol.variables).every((x) => x.type === "FLOAT" && Object.keys(x.values).join() === "Base"), "no modes ⇒ every variable has exactly one Base value");
  ok(idCol.variables["size/MD/height"].values.Base === base.sizes.MD.height && idCol.variables["radius/full"].values.Base === base.radii.full, "no-modes Base values equal the base scale");
}

// ── rampContrast — the responsive-ramp knob (expressive band: geometric ×4/3 ⇄ linear +4) ──
{
  const col = (cfg) => ["XS", "SM", "MD", "LG", "XL", "2XL"].map((n) => G.geomScale(cfg).sizes[n].height);
  // the two reference columns (the responsive geometry spec): full desktop ramp + compressed ≤476 ramp.
  ok(JSON.stringify(col({ baseHeight: 28 })) === JSON.stringify([20, 24, 28, 36, 48, 64]), `contrast 1 (default) at bh28 = the canonical ramp (got ${col({ baseHeight: 28 })})`);
  ok(JSON.stringify(col({ baseHeight: 24, rampContrast: 0 })) === JSON.stringify([18, 20, 24, 28, 32, 36]), `contrast 0 at bh24 = the compressed mobile ramp 18·20·24·28·32·36 (got ${col({ baseHeight: 24, rampContrast: 0 })})`);
  // a mid rung interpolates (the 992 column) — 2XL passes through 48 on its way from 36 to 64.
  ok(G.geomScale({ baseHeight: 26, rampContrast: 0.5 }).sizes["2XL"].height === 48, `bh26 · contrast .5 puts 2XL at 48 (got ${G.geomScale({ baseHeight: 26, rampContrast: 0.5 }).sizes["2XL"].height})`);
  // IDENTITY: absent === 1 === clamped-above-1, byte-identical (existing kits untouched).
  const a = JSON.stringify(G.geomScale({ baseHeight: 28 })), b = JSON.stringify(G.geomScale({ baseHeight: 28, rampContrast: 1 })), c = JSON.stringify(G.geomScale({ baseHeight: 28, rampContrast: 7 }));
  ok(a === b && a === c, "rampContrast absent / 1 / clamped-above-1 are byte-identical (the identity gate)");
  // the compact band (XS·SM·MD) never moves with contrast — only the expressive band changes gear.
  const c0 = col({ baseHeight: 28, rampContrast: 0 }), c1 = col({ baseHeight: 28 });
  ok(c0[0] === c1[0] && c0[1] === c1[1] && c0[2] === c1[2] && c0[5] < c1[5], "contrast moves ONLY the expressive band (compact XS/SM/MD identical; 2XL compresses)");
  // monotone: the ramp still strictly increases at zero contrast.
  ok(c0.every((v, i) => i === 0 || v > c0[i - 1]), `zero-contrast ramp stays strictly increasing (got ${c0})`);
}

// ── the CONTAINER tier — semantic insets/gaps over the space ladder + strokes ──
{
  const s = G.geomScale({ baseHeight: 28 }); // comfortable, spaceBase 4
  ok(JSON.stringify(s.insets) === JSON.stringify({ controlGroup: 8, card: 16, panel: 24, dialog: 32, page: 48 }), `insets are named space-ladder rungs (got ${JSON.stringify(s.insets)})`);
  ok(JSON.stringify(s.gaps) === JSON.stringify({ cluster: 8, stackTight: 12, stack: 16, stackLoose: 24, grid: 16, section: 48 }), `gaps are named space-ladder rungs (got ${JSON.stringify(s.gaps)})`);
  ok(s.insets.card === s.space[4] && s.gaps.section === s.space[7], "the tier is DERIVED from the space ladder (card = space[4], section = space[7]) — no hand-picked values");
  const sp = G.geomScale({ treatment: "spacious", baseHeight: 32 }); // spaceBase 8 — the tier follows the treatment rhythm
  ok(sp.insets.card === 32 && sp.gaps.stack === 32, `the tier scales with the treatment's spaceBase (spacious card ${sp.insets.card}, stack ${sp.gaps.stack})`);
  ok(s.borders.thin === 1 && s.borders.thick === 2 && s.focus.ringWidth === 2 && s.focus.ringOffset === 2, "strokes are constants (borders 1/2; focus ring 2+2)");
  const css = G.geomTokensCSS(s);
  ok(["--inset-control-group: 8px", "--gap-stack-loose: 24px", "--border-thin: 1px", "--focus-ring-offset: 2px"].every((t) => css.includes(t)), "CSS emits the tier as kebab-case custom properties");
  const d = G.geomTokensDTCG(s);
  ok(d.inset && d.inset["control-group"] && d.gap["stack-tight"].$type === "dimension" && d.border.thin.$value === "1px", "DTCG carries inset/gap/border/focus groups as dimension tokens");
  const fm = G.geomTokensFigmaModes(s, []).collections.Geometry.variables;
  ok(fm["inset/card"] && fm["gap/section"].values.Base === 48 && fm["focus/ring-width"], "the Figma-modes collection carries inset/gap/border/focus variables");
}

if (fails.length) { console.error(`geometry FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("geometry PASS — the ramp, the centering law, the two families, treatments, CSS + DTCG + Figma-modes emit");
process.exit(0);
