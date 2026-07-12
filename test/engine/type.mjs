#!/usr/bin/env node
// type.mjs — verifier for the typography engine (src/engine/type.mjs). Pure, no DOM.
import * as T from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── treatments: 5 presets, each with the ELEVEN named voices (7 original + 4 editorial, ADR-013) ──
const GROUPS = ["Display", "Heading", "Sub-heading", "Kicker", "Lead", "Body", "Quote", "Caption", "UI", "Code", "Legal"];
ok(T.TYPE_TREATMENTS.length === 5, `5 treatments (got ${T.TYPE_TREATMENTS.length})`);
ok(T.TYPE_TREATMENTS.every((t) => t.fonts && GROUPS.every((c) => t.categories[c])), "every treatment has the 11 voices (Display · Heading · Sub-heading · Kicker · Lead · Body · Quote · Caption · UI · Code · Legal) + fonts");
ok(T.TYPE_TREATMENTS.some((t) => t.id === "product") && T.TYPE_TREATMENTS.some((t) => t.id === "luxury") && T.TYPE_TREATMENTS.some((t) => t.id === "editorial"), "has product/luxury/editorial");

// ── the taxonomy: role mapping (Kicker + Code ride MONO) + the UPPERCASE caps voices ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  ok(s.roleOf["Kicker"] === "mono" && s.roleOf["Code"] === "mono", "Kicker + Code map to the mono font role");
  ok(s.roleOf["Display"] === "display" && s.roleOf["Heading"] === "heading" && s.roleOf["Body"] === "body" && s.roleOf["UI"] === "ui", "Display/Heading/Body/UI map to their roles");
  // CASE is per-treatment now: Sub-heading + Kicker are the standing UPPERCASE "caps voices"; Display is
  // title/sentence case by default (only Brutalist opts Display into caps — checked below).
  ok(s.categories["Sub-heading"].MD.textTransform === "uppercase" && s.categories["Kicker"].MD.textTransform === "uppercase", "Sub-heading + Kicker are the UPPERCASE caps voices");
  ok(s.categories["Display"].MD.textTransform === "none" && s.categories["Heading"].MD.textTransform === "none" && s.categories["Body"].MD.textTransform === "none", "Display + Heading + Body are title/sentence case by default (Display no longer forced ALL-CAPS)");
  // only the Brutalist/Statement treatment earns the ALL-CAPS display
  const st = T.typeScale({ treatment: "statement" });
  ok(st.categories["Display"].MD.textTransform === "uppercase", "Brutalist/Statement is the one treatment whose Display is ALL-CAPS");
  ok(T.TYPE_TREATMENTS.filter((t) => t.categories["Display"].transform === "uppercase").length === 1, "exactly ONE treatment (Brutalist) sets an uppercase Display");
  // Sub-heading/Kicker caps track POSITIVE (open up); Display caps track NEGATIVE (tighten)
  ok(s.categories["Sub-heading"].XL.letterSpacing > 0 && s.categories["Kicker"].XL.letterSpacing > 0, "caps headings track positive (open)");
  ok(s.categories["Display"].XL.letterSpacing < 0, "Display caps track negative (tighten)");
  // Code mirrors the UI ramp (8 steps, 3XS..2XL)
  ok(["3XS", "2XS", "XS", "SM", "MD", "LG", "XL", "2XL"].every((k) => s.categories.Code[k]), "Code has the 8-step UI ramp 3XS..2XL");
}

// ── the FOUR editorial voices (ADR-013): 11-voice count, roles, the lean SM·MD·LG ramp, box/prose decoupling ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const c = s.categories;
  ok(Object.keys(c).length === 11, `11 voices total (got ${Object.keys(c).length})`);
  ok(s.roleOf.Lead === "body" && s.roleOf.Quote === "heading" && s.roleOf.Caption === "ui" && s.roleOf.Legal === "ui", "editorial roles: Lead→body · Quote→heading (display cut) · Caption/Legal→ui font");
  for (const v of ["Lead", "Quote", "Caption", "Legal"]) ok(Object.keys(c[v]).join() === "SM,MD,LG", `${v} rides the lean 3-step ramp SM·MD·LG (got ${Object.keys(c[v])})`);
  // the box/prose DECOUPLING is the load-bearing decision: Caption + Legal ride the ui FONT but are PROSE —
  // reading leading (~1.5) + reading paragraph spacing (0.75×) + NO single-line height — unlike the ui voice.
  ok(!("singleLineHeight" in c.Caption.MD) && !("singleLineHeight" in c.Legal.MD), "Caption/Legal ride the ui role but do NOT emit a single-line height (box:false — prose flow)");
  ok(c.Caption.MD.lineHeight === Math.round(c.Caption.MD.size * 1.5) && c.Legal.MD.lineHeight === Math.round(c.Legal.MD.size * 1.5), "Caption/Legal use prose leading 1.5 (not the ui box leading 1.4)");
  ok(c.Caption.MD.paragraphSpacing === Math.round(c.Caption.MD.size * 0.75), `Caption paragraphSpacing = prose 0.75×size (not the ui box 1.0×) — got ${c.Caption.MD.paragraphSpacing} for size ${c.Caption.MD.size}`);
  // Quote rides the heading role → inherits each treatment's display face (a serif pull-quote in serif treatments)
  const ed = T.typeScale({ treatment: "editorial" });
  ok(ed.fonts[ed.roleOf.Quote] === ed.fonts.heading, "Quote uses the heading/display font, so a serif treatment yields a serif pull-quote");
  ok(c.Lead.MD.size === 20 && c.Quote.MD.size === 22 && c.Caption.MD.size === 13 && c.Legal.MD.size === 11, `editorial MD base sizes (Lead 20 · Quote 22 · Caption 13 · Legal 11) — got ${[c.Lead.MD.size, c.Quote.MD.size, c.Caption.MD.size, c.Legal.MD.size]}`);
}

// ── the modular scale: size = base · ratio^n, monotonic, MD = base ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const body = s.categories.Body;
  ok(body.MD.size === 16, `Body MD = bodyBase 16 (got ${body.MD.size})`);
  const sizes = ["XS", "SM", "MD", "LG", "XL"].map((k) => body[k].size);
  ok(sizes.every((v, i) => i === 0 || v > sizes[i - 1]), `Body sizes strictly increase XS→XL (${sizes})`);
  // ratio check: LG/MD ≈ the treatment ratio (1.2 for product Body) within rounding
  ok(Math.abs(body.LG.size / body.MD.size - 1.2) < 0.08, `Body LG/MD ≈ 1.2 (got ${(body.LG.size / body.MD.size).toFixed(3)})`);
  // line-height = size × leading (Body prose leading 1.5 — the font.modes.json design intent, uniform across treatments)
  ok(body.MD.lineHeight === Math.round(16 * 1.5), `Body MD line-height = size×1.5 (got ${body.MD.lineHeight})`);
  // Display leading is TIGHT (< 1 — large type sets sub-single); the design-intent retune. Every Display step.
  ok(Object.values(s.categories.Display).every((c) => c.lineHeight < c.size), `Display line-height < size on every step (leading < 1)`);
  // Heading + Body land on the intent ratios (1.125 · 1.5)
  ok(s.categories.Heading.MD.lineHeight === Math.round(s.categories.Heading.MD.size * 1.125), `Heading MD line-height = size×1.125`);
  // UI has 8 steps incl. 3XS..2XL
  ok(["3XS", "2XS", "XS", "SM", "MD", "LG", "XL", "2XL"].every((k) => s.categories.UI[k]), "UI has the 8-step ramp 3XS..2XL");
}

// ── the "nice number" ladder: every emitted size is a familiar value, at every base/breakpoint ──
{
  // a value is ON the ladder iff it equals its own band-step snap (step 1 ≤16, 2 ≤24, 4 ≤48, 8 ≤96, 16 else)
  const step = (v) => (v <= 16 ? 1 : v <= 24 ? 2 : v <= 48 ? 4 : v <= 96 ? 8 : 16);
  const onLadder = (v) => v === Math.round(v / step(v)) * step(v);
  for (const t of ["product", "luxury", "editorial", "technical", "statement"]) {
    for (const base of [13, 16, 20]) {
      const sc = T.typeScale({ treatment: t, bodyBase: base });
      for (const [voice, steps] of Object.entries(sc.categories)) {
        const sizes = Object.values(steps).map((x) => x.size);
        ok(sizes.every(onLadder), `${t} @${base} ${voice}: every size is on the ladder (${sizes})`);
        ok(sizes.every((v, i) => i === 0 || v > sizes[i - 1]), `${t} @${base} ${voice}: strictly increases (${sizes})`);
      }
    }
  }
  // a concrete example (product Display) reads as familiar numbers, not arbitrary modular outputs
  const disp = T.typeScale({ treatment: "product", bodyBase: 16 }).categories.Display;
  ok(["XS", "SM", "MD", "LG", "XL"].map((k) => disp[k].size).join(",") === "36,44,56,72,88", `product Display snaps to 36,44,56,72,88 (got ${["XS", "SM", "MD", "LG", "XL"].map((k) => disp[k].size)})`);
}

// ── optical tracking: Display tightens (negative), UI loosens (positive) in the product treatment ──
{
  const s = T.typeScale({ treatment: "product" });
  ok(s.categories.Display.XL.letterSpacing < 0, `Display XL tracking negative (got ${s.categories.Display.XL.letterSpacing})`);
  ok(s.categories.UI.XS.letterSpacing > 0, `UI XS tracking positive (got ${s.categories.UI.XS.letterSpacing})`);
  // tracking scales with size (Display XL more negative than Display XS)
  ok(s.categories.Display.XL.letterSpacing < s.categories.Display.XS.letterSpacing, "Display tracking scales with size (XL tighter than XS)");
  // Display weight is heavy
  ok(s.categories.Display.XL.weight >= 700, `Display weight heavy (got ${s.categories.Display.XL.weight})`);
}

// ── bodyBase scales the whole system uniformly (ratios preserved) ──
{
  const a = T.typeScale({ treatment: "product", bodyBase: 16 });
  const b = T.typeScale({ treatment: "product", bodyBase: 20 });
  ok(b.categories.Body.MD.size === 20, `bodyBase 20 → Body MD 20 (got ${b.categories.Body.MD.size})`);
  ok(b.categories.Display.XL.size > a.categories.Display.XL.size, "a larger bodyBase scales Display up too");
}

// ── unknown treatment falls back to the first ──
ok(T.typeScale({ treatment: "nope" }).treatment === T.TYPE_TREATMENTS[0].id, "unknown treatment → first treatment");

// ── fonts: a per-role CUSTOM override (config.fonts) replaces that family; blanks ignored; absent ⇒ treatment ──
{
  const baseF = T.typeScale({ treatment: "product" });
  const ovF = T.typeScale({ treatment: "product", fonts: { body: "Custom Sans", display: "   " } });
  ok(ovF.fonts.body === "Custom Sans", "typeScale: config.fonts overrides that role's family");
  ok(ovF.fonts.display === baseF.fonts.display && ovF.fonts.mono === baseF.fonts.mono, "typeScale: a blank override is ignored + un-overridden roles keep the treatment family");
  ok(Array.isArray(T.BUNDLED_FONTS) && T.BUNDLED_FONTS.includes("Inter"), "BUNDLED_FONTS lists the bundled families");
}

// ── per-voice shaping: config.voices overrides a voice's weight/leading/ratio/tracking for the WHOLE voice;
// other voices untouched; absent / empty ⇒ byte-identical (the identity gate) ──
{
  const baseV = T.typeScale({ treatment: "product" });
  const ovV = T.typeScale({ treatment: "product", voices: { Body: { weight: 600, leading: 1.8 } } });
  ok(ovV.categories.Body.MD.weight === 600, "typeScale: a per-voice weight override applies to every step of that voice");
  ok(ovV.categories.Body.MD.lineHeight === Math.round(ovV.categories.Body.MD.size * 1.8), "typeScale: a per-voice leading override re-derives line-height");
  ok(ovV.categories.Display.MD.weight === baseV.categories.Display.MD.weight, "typeScale: a voice override doesn't touch OTHER voices");
  const ovR = T.typeScale({ treatment: "product", voices: { Display: { ratio: 1.5 } } });
  ok(ovR.categories.Display.XL.size !== baseV.categories.Display.XL.size, "typeScale: a per-voice ratio override re-scales that voice");
  ok(JSON.stringify(T.typeScale({ treatment: "product", voices: {} }).categories) === JSON.stringify(baseV.categories), "typeScale: an empty voices map is identity (byte-identical to the un-tuned scale)");
}

// ── CSS emit: custom props + a utility class per step ──
{
  const css = T.typeTokensCSS(T.typeScale({ treatment: "product" }));
  ok(css.includes("--font-display:") && css.includes("--type-body-md-size:"), "CSS has font + size custom props");
  ok(/\.type-display-xl\s*\{[^}]*font-size: var\(--type-display-xl-size\)/.test(css), "CSS emits a .type-display-xl utility class");
  // font family names MUST be QUOTED — a name with a digit ("Source Serif 4") is invalid unquoted in
  // strict parsers (Safari drops the whole declaration → fallback). luxury uses Source Serif 4.
  const lux = T.typeTokensCSS(T.typeScale({ treatment: "luxury" }));
  ok(lux.includes("--font-display: 'Source Serif 4'"), "CSS quotes font family names (digit names like 'Source Serif 4' are invalid unquoted in Safari)");
}

// ── CSS export unit (px/rem/em): rem = px÷16, clean thanks to the nice-number ladder ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 }); // Body MD = 16
  ok(/--type-body-md-size: 16px;/.test(T.typeTokensCSS(s)), "typeTokensCSS defaults to px (no unit)");
  ok(/--type-body-md-size: 1rem;/.test(T.typeTokensCSS(s, { unit: "rem" })), "unit:rem → 16px = 1rem");
  ok(/--type-body-md-size: 1em;/.test(T.typeTokensCSS(s, { unit: "em" })), "unit:em → 16px = 1em");
  ok(T.dimUnit(24, "rem") === "1.5rem" && T.dimUnit(18, "rem") === "1.125rem" && T.dimUnit(2, "rem") === "0.125rem", "dimUnit: 24→1.5rem · 18→1.125rem · 2→0.125rem (rem-clean)");
  // naming-scheme PREFIX (the `type` in --type-*/.type-*): a Material scheme namespaces the scale; fonts
  // stay --font-* (the family layer). Default "type" ⇒ byte-identical (identity gate). Responsive too.
  const md = T.typeTokensCSS(s, { prefix: "md-sys-typescale" });
  ok(md.includes("--md-sys-typescale-body-md-size:") && md.includes(".md-sys-typescale-body-md {") && !md.includes("--type-body-md"), "prefix rewrites --type-*/.type-* to the scheme prefix (no stray --type-*)");
  ok(md.includes("--font-body:") && md.includes("var(--font-body)"), "font families stay --font-* under a scale prefix");
  ok(T.typeTokensCSS(s, { prefix: "type" }) === T.typeTokensCSS(s), "prefix 'type' is byte-identical to the default (identity gate)");
  ok(T.typeTokensResponsiveCSS(s, [{ name: "M", minWidth: 768, scale: s }], { prefix: "md-sys-typescale" }).includes("--md-sys-typescale-body-md-size:"), "responsive CSS threads the prefix into the @media blocks");
  ok(T.typeTokensDTCG(s, { unit: "rem" }).typography.Body.MD.$value.fontSize === "1rem" && T.typeTokensDTCG(s).typography.Body.MD.$value.fontSize === "16px", "DTCG carries the unit (fontSize 1rem) + defaults to px");
  ok(T.typeTokensResponsiveCSS(s, [{ name: "M", minWidth: 768, scale: T.typeScale({ treatment: "product", bodyBase: 13 }) }], { unit: "rem" }).includes("--type-body-md-size: 0.8125rem;"), "the @media breakpoint block honors the unit (13px = 0.8125rem)");
}

// ── responsive CSS: per-breakpoint @media blocks re-declaring the size vars (Phase 5.4) ──
{
  const base = T.typeScale({ treatment: "product", bodyBase: 16 });
  const mobile = T.typeScale({ treatment: "product", bodyBase: 13 });
  const css = T.typeTokensResponsiveCSS(base, [{ name: "Mobile", minWidth: 768, scale: mobile }, { name: "NoWidth", scale: mobile }]);
  ok(css.startsWith(T.typeTokensCSS(base)), "responsive CSS begins with the full base CSS");
  ok(/@media \(min-width: 768px\) \{\s*:root \{[^}]*--type-body-md-size: 13px/.test(css), "a mode with minWidth emits @media (min-width) re-declaring the size vars at the mode's body size");
  ok((css.match(/@media/g) || []).length === 1, "a mode WITHOUT a minWidth is skipped (no @media)");
  ok(T.typeTokensResponsiveCSS(base, []) === T.typeTokensCSS(base), "no modes → identical to the base CSS");
}

// ── per-cell SIZE overrides (Tokens-matrix Phase 3): the size lever; line re-derives; tracking+weight stay ──
{
  const baseline = T.typeScale({ treatment: "product", bodyBase: 16 });
  // IDENTITY: no overrides (and an empty map) is byte-identical to the un-overridden scale.
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: undefined })) === JSON.stringify(baseline), "no overrides ⇒ scale is byte-identical (identity gate)");
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: {} })) === JSON.stringify(baseline), "empty overrides ⇒ scale is byte-identical (identity gate)");
  // an override REPLACES the size and the line-height RE-DERIVES (round(size · leading)); tracking + weight stay.
  const bodyP = T.TYPE_TREATMENTS.find((x) => x.id === "product").categories.Body; // the Body treatment params (leading 1.5)
  const ov = T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Body|MD": 40 } });
  ok(ov.categories.Body.MD.size === 40, `override sets the size (got ${ov.categories.Body.MD.size}, want 40)`);
  ok(ov.categories.Body.MD.lineHeight === Math.round(40 * bodyP.leading), `line-height re-derives from the override (got ${ov.categories.Body.MD.lineHeight}, want ${Math.round(40 * bodyP.leading)})`);
  ok(ov.categories.Body.MD.weight === baseline.categories.Body.MD.weight && ov.categories.Body.MD.letterSpacing === baseline.categories.Body.MD.letterSpacing, "tracking + weight are UNCHANGED by a size override (the ratified rule)");
  // only the targeted cell changes — every other step is identical to the baseline.
  ok(ov.categories.Body.LG.size === baseline.categories.Body.LG.size && ov.categories.Display.XL.size === baseline.categories.Display.XL.size, "an override touches only its (voice|step) cell, no others");
  // a non-positive / non-numeric override is ignored (no effect) — the cell stays derived.
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Body|MD": 0, "Body|LG": -5, "Display|XL": NaN } })) === JSON.stringify(baseline), "non-positive / NaN overrides are ignored (no effect)");
  // NON-ZERO-TRACKING pin (Body|MD has trackingEm 0 → 0===0 masks the bug). Display tracks NEGATIVE, so
  // overriding a Display step's SIZE must NOT move tracking (it stays on the modular-scale size) or weight —
  // only size changes and line-height re-derives. This pins the "size lever; tracking/weight stay" rule.
  const displayP = T.TYPE_TREATMENTS.find((x) => x.id === "product").categories.Display; // leading 0.8 (< 1), trackingEm -0.02 (non-zero)
  const ovD = T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Display|MD": 88 } });
  ok(displayP.trackingEm !== 0, `Display tracking is non-zero (got ${displayP.trackingEm}) — the assertion below is meaningful`);
  ok(ovD.categories.Display.MD.size === 88, `Display override sets the size (got ${ovD.categories.Display.MD.size}, want 88)`);
  ok(ovD.categories.Display.MD.size !== baseline.categories.Display.MD.size, "the Display override actually moves the size off baseline");
  ok(ovD.categories.Display.MD.letterSpacing === baseline.categories.Display.MD.letterSpacing, `Display tracking is UNCHANGED by a size override (got ${ovD.categories.Display.MD.letterSpacing}, baseline ${baseline.categories.Display.MD.letterSpacing}) — tracking stays on the modular-scale size`);
  ok(ovD.categories.Display.MD.weight === baseline.categories.Display.MD.weight, "Display weight is UNCHANGED by a size override");
  ok(ovD.categories.Display.MD.lineHeight === Math.round(88 * displayP.leading), `Display line-height re-derives from the override (got ${ovD.categories.Display.MD.lineHeight}, want ${Math.round(88 * displayP.leading)})`);
}

// ── DTCG emit: fontFamily group + composite typography tokens ──
{
  const d = T.typeTokensDTCG(T.typeScale({ treatment: "editorial" }));
  ok(d.fontFamily && d.fontFamily.display.$type === "fontFamily", "DTCG fontFamily group");
  const tok = d.typography.Body.MD;
  ok(tok.$type === "typography" && /px$/.test(tok.$value.fontSize) && typeof tok.$value.fontWeight === "number", "DTCG composite typography token (px sizes + numeric weight)");
}

// ── Figma breakpoint-MODED variables: a single "Typography" collection, one MODE per breakpoint (5.4b) ──
{
  const base = T.typeScale({ treatment: "product", bodyBase: 16 });
  const mobile = T.typeScale({ treatment: "product", bodyBase: 13 });
  const out = T.typeTokensFigmaModes(base, [{ name: "Mobile", minWidth: 768, scale: mobile }]);
  const col = out.collections.Typography;
  ok(col && JSON.stringify(col.modes) === JSON.stringify(["Base", "Mobile"]), `modes = [Base, Mobile] (got ${JSON.stringify(col && col.modes)})`);
  // four FLOAT variables per voice×step: size/lineHeight/letterSpacing/weight (weight too — Figma numbers).
  const v = col.variables["Body/MD/size"];
  ok(v && v.type === "FLOAT" && typeof v.values.Base === "number" && typeof v.values.Mobile === "number", "Body/MD/size is a FLOAT variable with Base + Mobile values");
  ok(col.variables["Body/MD/weight"] && col.variables["Body/MD/weight"].type === "FLOAT" && typeof col.variables["Body/MD/weight"].values.Base === "number", "weight is emitted as a FLOAT variable too (Figma numbers)");
  ok(["size", "lineHeight", "letterSpacing", "weight"].every((p) => col.variables[`Body/MD/${p}`]), "every voice×step emits size/lineHeight/letterSpacing/weight");
  // per-mode values DIFFER for a breakpoint with a different bodyBase (13 vs 16) — the Mobile size is smaller.
  ok(v.values.Base === base.categories.Body.MD.size && v.values.Mobile === mobile.categories.Body.MD.size, "Base value = base scale; Mobile value = that mode's scale (per-mode values DIFFER)");
  ok(v.values.Mobile !== v.values.Base, `the breakpoint's value differs from Base (Base ${v.values.Base}, Mobile ${v.values.Mobile})`);
  // IDENTITY: with no modes, a single "Base" mode whose values equal the base export.
  const idn = T.typeTokensFigmaModes(base, []);
  const idCol = idn.collections.Typography;
  ok(JSON.stringify(idCol.modes) === JSON.stringify(["Base"]), "no modes ⇒ a single \"Base\" mode");
  ok(Object.values(idCol.variables).every((x) => x.type === "FLOAT" && Object.keys(x.values).join() === "Base"), "no modes ⇒ every variable has exactly one Base value");
  const dxl = base.categories.Display.XL;
  ok(idCol.variables["Body/MD/size"].values.Base === base.categories.Body.MD.size && idCol.variables["Display/XL/letterSpacing"].values.Base === Math.round((dxl.letterSpacing / dxl.size) * 10000) / 100, "no-modes Base values equal the base scale (size raw px; letterSpacing as % of size — the relative-units rule)");
  // DISTINCT mode names: a breakpoint named "Base" (reserved) and duplicate names are disambiguated, so
  // Figma never sees modes:["Base","Base"] (which it rejects on import) or a silently-shadowed mode.
  const dup = T.typeTokensFigmaModes(base, [{ name: "Base", scale: mobile }, { name: "Wide", scale: base }, { name: "Wide", scale: mobile }]).collections.Typography;
  ok(JSON.stringify(dup.modes) === JSON.stringify(["Base", "Base 2", "Wide", "Wide 2"]), `clashing/duplicate mode names are disambiguated (got ${JSON.stringify(dup.modes)})`);
  ok(new Set(dup.modes.map((s) => s.toLowerCase())).size === dup.modes.length, "every mode name is distinct (case-insensitively)");
  ok(dup.variables["Body/MD/size"].values["Base 2"] === mobile.categories.Body.MD.size, "the breakpoint renamed off \"Base\" keeps its own value (didn't overwrite the synthetic Base)");
}

// ── paragraphSpacing (box=1.0 / prose factor) + singleLineHeight (BOX voices only) — the schema-parity props ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 }).categories;
  const near = (a, b) => Math.abs(a - b) <= 0.5;
  ok(near(s.Display.MD.paragraphSpacing, Math.round(s.Display.MD.size * 0.7)), `Display paragraphSpacing = 0.7×size (got ${s.Display.MD.paragraphSpacing} for size ${s.Display.MD.size})`);
  ok(near(s["Heading"].MD.paragraphSpacing, Math.round(s["Heading"].MD.size * 0.7)), "Heading paragraphSpacing = 0.7×size");
  ok(near(s.Body.MD.paragraphSpacing, Math.round(s.Body.MD.size * 0.75)), `Body (prose) paragraphSpacing = 0.75×size (got ${s.Body.MD.paragraphSpacing})`);
  ok(s.UI.MD.paragraphSpacing === s.UI.MD.size && s.Code.MD.paragraphSpacing === s.Code.MD.size, "the BOX voices (UI/Code) paragraphSpacing = 1.0×size");
  // singleLineHeight: control-text intent — present IFF a voice is a BOX voice (UI/Code/Kicker), equal to size.
  ok(s.UI.MD.singleLineHeight === s.UI.MD.size && s.Code.SM.singleLineHeight === s.Code.SM.size && s["Kicker"].MD.singleLineHeight === s["Kicker"].MD.size, "singleLineHeight = size on the BOX voices UI/Code/Kicker");
  ok(["Display", "Heading", "Sub-heading", "Lead", "Body", "Quote", "Caption", "Legal"].every((v) => !("singleLineHeight" in s[v].MD)), "singleLineHeight is ABSENT on every PROSE voice — incl. Caption/Legal, which ride the ui role but are prose (box:false)");
  // the emitters carry both: CSS -para (+ -line-single where present), DTCG composite, Figma-modes vars.
  const css = T.typeTokensCSS(T.typeScale({ treatment: "product" }));
  ok(css.includes("-para:") && css.includes("--type-ui-md-line-single:") && !css.includes("--type-display-md-line-single") && !css.includes("--type-caption-md-line-single"), "CSS emits -para everywhere and -line-single only on the BOX voices (absent on Caption, though it rides ui)");
  const dt = T.typeTokensDTCG(T.typeScale({ treatment: "product" })).typography;
  ok(dt.UI.MD.$value.singleLineHeight && !dt.Display.MD.$value.singleLineHeight && /px$/.test(dt.Display.MD.$value.paragraphSpacing), "DTCG composite carries paragraphSpacing (px) + singleLineHeight on ui/mono");
  const fv = T.typeTokensFigmaModes(T.typeScale({ treatment: "product" }), []).collections.Typography.variables;
  ok(fv["Display/MD/paragraphSpacing"] && fv["UI/MD/singleLineHeight"] && !fv["Display/MD/singleLineHeight"], "Figma modes carry paragraphSpacing (all) + singleLineHeight (ui/mono only)");
}

// ── leading + tracking are ALWAYS relative — never px — in every emitter (the units rule; overhaul P1) ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const b = s.categories.Body.MD;
  const relLine = (px, sz) => Math.round((px / sz) * 1000) / 1000; // unitless factor, 3dp (mirrors engine round(,3))
  const relPct = (px, sz) => Math.round((px / sz) * 10000) / 100; // % of size, 2dp (mirrors engine round(,2))
  // CSS: -line is a UNITLESS factor (= line ÷ size), -tracking is `em`, -line-single unitless — and NO px on either.
  const css = T.typeTokensCSS(s);
  ok(css.includes(`--type-body-md-line: ${relLine(b.lineHeight, b.size)};`), `CSS -line is a unitless factor line÷size (= ${relLine(b.lineHeight, b.size)})`);
  ok(/--type-body-md-tracking: -?\d+(?:\.\d+)?em;/.test(css), "CSS -tracking is em (relative to font size)");
  ok(/--type-ui-md-line-single: \d+(?:\.\d+)?;/.test(css), "CSS -line-single is a unitless factor");
  ok(!/-line: -?\d+(?:\.\d+)?px/.test(css) && !/-tracking: -?\d+(?:\.\d+)?px/.test(css) && !/-line-single: -?\d+(?:\.\d+)?px/.test(css), "NO px leading or tracking anywhere in the CSS export");
  // the SIZE / paragraph dims are still absolute px (only leading/tracking go relative).
  ok(/--type-body-md-size: \d+px;/.test(css) && /--type-body-md-para: \d+px;/.test(css), "size + paragraph spacing stay absolute px (box metrics, not leading)");
  // DTCG: lineHeight a unitless NUMBER (multiplier), letterSpacing an `em` string, size/para still px.
  const dt = T.typeTokensDTCG(s).typography.Body.MD.$value;
  ok(typeof dt.lineHeight === "number" && dt.lineHeight === relLine(b.lineHeight, b.size), "DTCG lineHeight is a unitless number (= line ÷ size)");
  ok(typeof dt.letterSpacing === "string" && /em$/.test(dt.letterSpacing), "DTCG letterSpacing is an em string (relative)");
  ok(/px$/.test(dt.fontSize) && /px$/.test(dt.paragraphSpacing), "DTCG fontSize + paragraphSpacing stay px (absolute dims)");
  ok(typeof T.typeTokensDTCG(s).typography.UI.MD.$value.singleLineHeight === "number", "DTCG singleLineHeight is a unitless number too");
  // Figma: leading + tracking ride as a % of font size (Figma's native relative unit); size/weight raw.
  const gv = T.typeTokensFigmaModes(s, []).collections.Typography.variables;
  ok(gv["Body/MD/lineHeight"].values.Base === relPct(b.lineHeight, b.size), "Figma lineHeight is % of size");
  ok(gv["Body/MD/letterSpacing"].values.Base === relPct(b.letterSpacing, b.size), "Figma letterSpacing is % of size");
  ok(gv["UI/MD/singleLineHeight"].values.Base === relPct(s.categories.UI.MD.singleLineHeight, s.categories.UI.MD.size), "Figma singleLineHeight is % of size");
  ok(gv["Body/MD/size"].values.Base === b.size && gv["Body/MD/weight"].values.Base === b.weight, "Figma size + weight stay raw (absolute)");
}

// ── Figma "Font Primitives" companion collection: deduped family primitives + per-voice aliases (5.4c) ──
{
  const base = T.typeScale({ treatment: "product", bodyBase: 16 });
  const out = T.typeTokensFigmaPrimitives(base);
  const col = out.collections["Font Primitives"];
  ok(col && JSON.stringify(col.modes) === JSON.stringify(["Value"]), "one \"Value\" mode (families/weights don't vary by breakpoint)");
  // product: display+heading are BOTH Inter Tight → deduped into ONE family primitive (first role wins).
  ok(col.variables["family/display"] && col.variables["family/display"].type === "STRING" && col.variables["family/display"].values.Value === "Inter Tight", "family/display is a STRING primitive carrying the family");
  ok(!col.variables["family/heading"], "a duplicate family dedupes into one primitive (no family/heading — Inter Tight is owned by display)");
  // every voice gets a font/<voice> ALIAS to its family primitive + a weight/<voice> FLOAT primitive.
  const voices = Object.keys(base.categories);
  ok(voices.every((v) => col.variables[`font/${v}`] && col.variables[`font/${v}`].type === "ALIAS"), "every voice emits a font/<voice> ALIAS");
  ok(voices.every((v) => col.variables[`weight/${v}`] && col.variables[`weight/${v}`].type === "FLOAT" && Number.isFinite(col.variables[`weight/${v}`].values.Value)), "every voice emits a weight/<voice> FLOAT primitive");
  ok(voices.every((v) => col.variables[col.variables[`font/${v}`].target]), "every alias target resolves to a primitive in the same collection");
  ok(col.variables["font/Heading"].target === "family/display", "Heading aliases the deduped Inter Tight primitive (family/display)");
  ok(col.variables["font/Kicker"].target === col.variables["font/Code"].target, "Kicker and Code alias the SAME mono primitive (roleOf → mono)");
  ok(col.variables["weight/Display"].values.Value === base.categories.Display.MD.weight, "weight/Display carries the voice's uniform weight");
  // weight STYLE NAMES (slice 4): config.voices[v].styleName → scale.styleNames → weight-style/<voice>
  // STRING primitives; absent names ⇒ no styleNames key and no weight-style vars (the identity gate).
  ok(!("styleNames" in base) && !Object.keys(col.variables).some((k) => k.startsWith("weight-style/")), "no styleName config ⇒ no styleNames on the scale, no weight-style vars");
  const named = T.typeScale({ treatment: "product", voices: { Display: { styleName: "Condensed Black Italic" }, "Kicker": { styleName: "  Medium  " }, Body: { styleName: "" } } });
  ok(named.styleNames && named.styleNames.Display === "Condensed Black Italic" && named.styleNames["Kicker"] === "Medium" && !("Body" in named.styleNames), "styleNames collect trimmed non-empty names only");
  const nCol = T.typeTokensFigmaPrimitives(named).collections["Font Primitives"];
  ok(nCol.variables["weight-style/Display"] && nCol.variables["weight-style/Display"].type === "STRING" && nCol.variables["weight-style/Display"].values.Value === "Condensed Black Italic", "the primitives collection emits weight-style/<voice> STRING vars");
  ok(!nCol.variables["weight-style/Body"] && nCol.variables["weight/Body"], "an unnamed voice keeps its numeric weight primitive but gets no style var");
}

// ── SIBLING WEIGHTS: siblingWeightDefaults + the voices[].weights channel + emitter coverage ──
{
  // defaults table — the ratified derivation: the two LADDER-ADJACENT stops, stepping from the core
  // toward the ladder's center (< 550 → up, ≥ 550 → down), nearer neighbor first.
  const w = (list) => list.map((x) => x.weight).join(",");
  ok(w(T.siblingWeightDefaults(900)) === "800,700", "defaults: core 900 → Extra-bold 800 + Bold 700");
  ok(w(T.siblingWeightDefaults(400)) === "500,600", "defaults: core 400 (Regular) → Medium 500 + Semi-bold 600");
  ok(w(T.siblingWeightDefaults(600)) === "500,400", "defaults: core 600 (Semi-bold) → Medium 500 + Regular 400");
  ok(w(T.siblingWeightDefaults(700)) === "600,500", "defaults: core 700 (Bold) → Semi-bold 600 + Medium 500");
  ok(w(T.siblingWeightDefaults(100)) === "200,300", "defaults: floor core 100 → above only (no 0 weight)");
  ok(w(T.siblingWeightDefaults(440)) === "500,600", "defaults: non-ladder core snaps (440→400)");
  ok(T.siblingWeightDefaults(900)[0].name === "Extra-bold" && T.siblingWeightDefaults(400)[1].name === "Semi-bold", "defaults carry the ladder's semantic names");
  ok(T.siblingWeightDefaults(NaN).length === 0, "defaults: non-finite core → empty");

  // identity gate — no weights config ⇒ no `weights` key, emitters byte-identical
  const base = T.typeScale({ treatment: "product" });
  const withEmpty = T.typeScale({ treatment: "product", voices: { Display: { weights: [] }, Body: { weights: [{ name: "", weight: 700 }, { name: "Bad", weight: 0 }] } } });
  ok(!("weights" in base) && !("weights" in withEmpty), "identity gate: absent/empty/invalid weights ⇒ no weights key on the scale");
  ok(T.typeTokensCSS(base) === T.typeTokensCSS(withEmpty), "identity gate: CSS byte-identical without valid siblings");

  // the channel — validation, slugs, dedupe
  const sc = T.typeScale({ treatment: "product", voices: { Display: { weights: [{ name: "Bold", weight: 700 }, { name: "Semi-bold", weight: 600 }, { name: "bold ", weight: 650 }, { name: "Medium", weight: "500" }] }, Body: { weights: [{ name: "Light", weight: 300 }] } } });
  ok(sc.weights && sc.weights.Display && sc.weights.Display.length === 3, "weights channel: valid entries kept, duplicate slug collapsed (bold vs Bold)");
  ok(sc.weights.Display[0].slug === "bold" && sc.weights.Display[1].slug === "semi-bold" && sc.weights.Display[2].weight === 500, "weights channel: kebab slugs + numeric coercion");

  // CSS — per-voice custom props, never per-step duplication
  const css = T.typeTokensCSS(sc);
  ok(css.includes("--type-display-weight-bold: 700;") && css.includes("--type-display-weight-semi-bold: 600;") && css.includes("--type-body-weight-light: 300;"), "CSS emits per-voice sibling weight props");
  ok((css.match(/--type-display-weight-bold:/g) || []).length === 1, "CSS sibling props appear once per voice (not per step)");

  // DTCG — a weights group of fontWeight tokens
  const dtcg = T.typeTokensDTCG(sc);
  ok(dtcg.weights && dtcg.weights.Display && dtcg.weights.Display.Bold && dtcg.weights.Display.Bold.$type === "fontWeight" && dtcg.weights.Display.Bold.$value === 700, "DTCG emits the weights group");
  ok(!("weights" in T.typeTokensDTCG(base)), "DTCG identity: no siblings ⇒ no weights group");

  // Figma primitives — FLOAT + STRING per sibling, core un-suffixed names unchanged
  const col = T.typeTokensFigmaPrimitives(sc).collections["Font Primitives"];
  ok(col.variables["weight/Display/bold"] && col.variables["weight/Display/bold"].type === "FLOAT" && col.variables["weight/Display/bold"].values.Value === 700, "primitives emit weight/<voice>/<slug> FLOAT per sibling");
  ok(col.variables["weight-style/Display/bold"] && col.variables["weight-style/Display/bold"].values.Value === "Bold", "primitives emit weight-style/<voice>/<slug> STRING per sibling");
  ok(col.variables["weight/Display"], "the core un-suffixed weight primitive is unchanged");
}

// ── genericFor: the CSS generic a font stack falls back to (serif/sans/mono) when the face isn't loaded/
//    installed. The old `/serif/.test(name)` mislabelled nearly every serif + typewriter face as sans.
ok(T.genericFor("Bodoni Moda") === "serif" && T.genericFor("Playfair Display") === "serif" && T.genericFor("Sabon") === "serif" && T.genericFor("Times New Roman") === "serif" && T.genericFor("Clarendon") === "serif" && T.genericFor("American Typewriter") === "serif", "genericFor: serif/slab faces → serif (even with no 'serif' in the name)");
ok(T.genericFor("Futura") === "sans-serif" && T.genericFor("Jost") === "sans-serif" && T.genericFor("Optima") === "sans-serif" && T.genericFor("Gill Sans") === "sans-serif" && T.genericFor("Inter") === "sans-serif" && T.genericFor("Kanit") === "sans-serif", "genericFor: sans faces → sans-serif");
ok(T.genericFor("Courier Prime") === "monospace" && T.genericFor("Prestige Elite") === "monospace" && T.genericFor("VT323") === "monospace" && T.genericFor("IBM Plex Mono") === "monospace", "genericFor: mono/typewriter faces → monospace (even with no 'mono' in the name)");
ok(T.genericFor("Playfair Display", "mono") === "monospace", "genericFor: the mono ROLE forces monospace regardless of the face (code slot needs mono metrics)");
ok(T.genericFor("Space Mono") === "monospace" && T.genericFor("Space Grotesk") === "sans-serif" && T.genericFor("Zilla Slab") === "serif", "genericFor: keyword rules (mono→mono, grotesk→sans, slab→serif)");
ok(T.genericFor("Some Unknown Face") === "sans-serif" && T.genericFor("") === "sans-serif" && T.genericFor(undefined) === "sans-serif", "genericFor: unknown/empty → sans-serif default");

if (fails.length) { console.error(`type FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("type PASS — modular scale, optical tracking, treatments, CSS + DTCG + Figma-modes emit");
process.exit(0);
