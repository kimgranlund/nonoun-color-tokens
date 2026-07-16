#!/usr/bin/env node
// type.mjs — verifier for the typography engine (src/engine/type.mjs). Pure, no DOM.
import * as T from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── treatments: 5 presets, each with the THIRTEEN named voices (2026-07-13 taxonomy + Body-mono/
// Label-mono/Tiny-mono) ──
const GROUPS = ["Display", "Headline", "Sub-heading", "Title", "Sub-title", "Lead", "Body", "Body-mono", "Label", "Label-mono", "Kicker", "Tiny", "Tiny-mono"];
ok(T.TYPE_TREATMENTS.length === 5, `5 treatments (got ${T.TYPE_TREATMENTS.length})`);
ok(T.TYPE_TREATMENTS.every((t) => t.fonts && GROUPS.every((c) => t.categories[c])), "every treatment has the 13 voices (Display · Headline · Sub-heading · Title · Sub-title · Lead · Body · Body-mono · Label · Label-mono · Kicker · Tiny · Tiny-mono) + fonts");
ok(T.TYPE_TREATMENTS.some((t) => t.id === "product") && T.TYPE_TREATMENTS.some((t) => t.id === "luxury") && T.TYPE_TREATMENTS.some((t) => t.id === "editorial"), "has product/luxury/editorial");

// ── every voice is now a FIXED, uniform 3-step SM/MD/LG ramp (2026-07-13 — was 5/3/8 steps by voice) ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const c = s.categories;
  ok(Object.keys(c).length === 13, `13 voices total (got ${Object.keys(c).length})`);
  for (const v of GROUPS) ok(Object.keys(c[v]).join() === "SM,MD,LG", `${v} rides the uniform 3-step ramp SM·MD·LG (got ${Object.keys(c[v])})`);
}

// ── the taxonomy: role mapping (Sub-title/Body-mono/Label-mono/Kicker ride MONO) + the UPPERCASE caps voices ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  ok(s.roleOf["Body-mono"] === "mono" && s.roleOf["Label-mono"] === "mono" && s.roleOf["Kicker"] === "mono" && s.roleOf["Sub-title"] === "mono", "Body-mono/Label-mono/Kicker/Sub-title map to the mono font role");
  ok(s.roleOf["Display"] === "display" && s.roleOf["Headline"] === "heading" && s.roleOf["Sub-heading"] === "heading" && s.roleOf["Title"] === "heading", "Display/Headline/Sub-heading/Title map to their roles");
  ok(s.roleOf["Body"] === "body" && s.roleOf["Lead"] === "body" && s.roleOf["Label"] === "ui" && s.roleOf["Tiny"] === "ui", "Body/Lead/Label/Tiny map to their roles");
  // CASE is per-treatment now: Sub-heading + Kicker + Sub-title (2026-07-15, at request) are the standing
  // UPPERCASE "caps voices"; Display is title/sentence case by default (only Brutalist opts Display into
  // caps — checked below).
  ok(s.categories["Sub-heading"].MD.textTransform === "uppercase" && s.categories["Kicker"].MD.textTransform === "uppercase" && s.categories["Sub-title"].MD.textTransform === "uppercase", "Sub-heading + Kicker + Sub-title are the UPPERCASE caps voices");
  ok(s.categories["Sub-title"].MD.letterSpacing > 0 && Math.abs(s.categories["Sub-title"].MD.trackingRatio - 0.30) < 1e-9, `Sub-title tracks positive at the 30% em default (got trackingRatio=${s.categories["Sub-title"].MD.trackingRatio})`);
  ok(s.categories["Display"].MD.textTransform === "none" && s.categories["Headline"].MD.textTransform === "none" && s.categories["Body"].MD.textTransform === "none", "Display + Headline + Body are title/sentence case by default (Display no longer forced ALL-CAPS)");
  // only the Brutalist/Statement treatment earns the ALL-CAPS display
  const st = T.typeScale({ treatment: "statement" });
  ok(st.categories["Display"].MD.textTransform === "uppercase", "Brutalist/Statement is the one treatment whose Display is ALL-CAPS");
  ok(T.TYPE_TREATMENTS.filter((t) => t.categories["Display"].transform === "uppercase").length === 1, "exactly ONE treatment (Brutalist) sets an uppercase Display");
  // Sub-heading/Kicker caps track POSITIVE (open up); Display caps track NEGATIVE (tighten)
  ok(s.categories["Sub-heading"].LG.letterSpacing > 0 && s.categories["Kicker"].LG.letterSpacing > 0, "caps headings track positive (open)");
  ok(s.categories["Display"].LG.letterSpacing < 0, "Display caps track negative (tighten)");
}

// ── the FIXED SIZE TABLE (2026-07-13): literal per-voice px, shared across ALL 5 treatments; Body-mono
// aliases Body's own triplet, Label-mono + Kicker alias Label's, Tiny-mono aliases Tiny's — same numbers, mono font only ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 }).categories;
  const sizes = (v) => ["SM", "MD", "LG"].map((k) => s[v][k].size);
  ok(sizes("Display").join() === "72,96,120", `Display fixed sizes 72/96/120 (got ${sizes("Display")})`);
  ok(sizes("Headline").join() === "32,40,48", `Headline fixed sizes 32/40/48 (got ${sizes("Headline")})`);
  ok(sizes("Sub-heading").join() === "28,34,40", `Sub-heading fixed sizes 28/34/40 (got ${sizes("Sub-heading")})`);
  ok(sizes("Title").join() === "24,32,40", `Title fixed sizes 24/32/40 (got ${sizes("Title")})`);
  ok(sizes("Sub-title").join() === "18,24,32", `Sub-title fixed sizes 18/24/32 (got ${sizes("Sub-title")})`);
  ok(sizes("Lead").join() === "20,24,28", `Lead fixed sizes 20/24/28 (got ${sizes("Lead")})`);
  ok(sizes("Body").join() === "14,16,18", `Body fixed sizes 14/16/18 (got ${sizes("Body")})`);
  ok(sizes("Label").join() === "12,13,14", `Label fixed sizes 12/13/14 (got ${sizes("Label")})`);
  ok(sizes("Tiny").join() === "9,10,11", `Tiny fixed sizes 9/10/11 (got ${sizes("Tiny")})`);
  // Body-mono aliases Body's triplet; Label-mono + Kicker alias Label's; Tiny-mono aliases Tiny's — SAME numbers, mono font only.
  ok(sizes("Body-mono").join() === sizes("Body").join(), "Body-mono's sizes alias Body's own triplet exactly");
  ok(sizes("Label-mono").join() === sizes("Label").join(), "Label-mono's sizes alias Label's own triplet exactly");
  ok(sizes("Kicker").join() === sizes("Label").join(), "Kicker's sizes alias Label's own triplet exactly");
  ok(sizes("Tiny-mono").join() === sizes("Tiny").join(), "Tiny-mono's sizes alias Tiny's own triplet exactly");
  // this table is IDENTICAL across all 5 treatments (confirmed decision: treatments differ only in
  // font/weight/tracking/leading/case, never size).
  for (const t of ["luxury", "editorial", "technical", "statement"]) {
    const sc = T.typeScale({ treatment: t, bodyBase: 16 }).categories;
    ok(sizes("Display").join() === ["SM", "MD", "LG"].map((k) => sc.Display[k].size).join(), `${t}'s Display sizes match product's (shared fixed table)`);
    ok(sizes("Body").join() === ["SM", "MD", "LG"].map((k) => sc.Body[k].size).join(), `${t}'s Body sizes match product's (shared fixed table)`);
  }
}

// ── box/prose decoupling: Label/Label-mono/Kicker/Body-mono are BOX (control text); Tiny/Tiny-mono/
// Sub-title ride ui/mono FONTS but are PROSE (box:false) — the same decoupling the old Caption/Legal voices demonstrated ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 }).categories;
  ok(!("singleLineHeight" in s.Tiny.MD) && !("singleLineHeight" in s["Tiny-mono"].MD) && !("singleLineHeight" in s["Sub-title"].MD), "Tiny/Tiny-mono/Sub-title ride ui/mono roles but do NOT emit a single-line height (box:false — prose flow)");
  ok(s.Tiny.MD.lineHeight === Math.round(s.Tiny.MD.size * 1.5), "Tiny uses prose leading 1.5 (not the ui box leading 1.4)");
  ok(s.Tiny.MD.paragraphSpacing === Math.round(s.Tiny.MD.size * 0.75), `Tiny paragraphSpacing = prose 0.75×size (not the ui box 1.0×) — got ${s.Tiny.MD.paragraphSpacing} for size ${s.Tiny.MD.size}`);
  ok(s.Label.MD.paragraphSpacing === s.Label.MD.size && s["Body-mono"].MD.paragraphSpacing === s["Body-mono"].MD.size && s["Label-mono"].MD.paragraphSpacing === s["Label-mono"].MD.size && s.Kicker.MD.paragraphSpacing === s.Kicker.MD.size, "the BOX voices (Label/Body-mono/Label-mono/Kicker) paragraphSpacing = 1.0×size");
  ok(s.Label.MD.singleLineHeight === s.Label.MD.size && s["Body-mono"].SM.singleLineHeight === s["Body-mono"].SM.size && s["Label-mono"].MD.singleLineHeight === s["Label-mono"].MD.size && s.Kicker.MD.singleLineHeight === s.Kicker.MD.size, "singleLineHeight = size on the BOX voices Label/Body-mono/Label-mono/Kicker");
  ok(GROUPS.filter((v) => !["Label", "Body-mono", "Label-mono", "Kicker"].includes(v)).every((v) => !("singleLineHeight" in s[v].MD)), "singleLineHeight is ABSENT on every PROSE voice — incl. Tiny/Tiny-mono/Sub-title, which ride ui/mono roles but are prose (box:false)");
  // Title/Sub-heading ride the heading role → inherit each treatment's display face (e.g. serif in Editorial)
  const ed = T.typeScale({ treatment: "editorial" });
  ok(ed.fonts[ed.roleOf.Title] === ed.fonts.heading, "Title uses the heading font role");
}

// ── size = FIXED_SIZE(voice, step) × factor (factor = bodyBase/16); MD = Body's own base ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const body = s.categories.Body;
  ok(body.MD.size === 16, `Body MD = bodyBase 16 (got ${body.MD.size})`);
  const sizes = ["SM", "MD", "LG"].map((k) => body[k].size);
  ok(sizes.every((v, i) => i === 0 || v > sizes[i - 1]), `Body sizes strictly increase SM→LG (${sizes})`);
  // line-height = size × leading (Body prose leading 1.5 — the font.modes.json design intent, uniform across treatments)
  ok(body.MD.lineHeight === Math.round(16 * 1.5), `Body MD line-height = size×1.5 (got ${body.MD.lineHeight})`);
  // Display leading is TIGHT (< 1 — large type sets sub-single); the design-intent retune. Every Display step.
  ok(Object.values(s.categories.Display).every((c) => c.lineHeight < c.size), `Display line-height < size on every step (leading < 1)`);
  // Headline + Body land on the intent ratios (1.125 · 1.5)
  ok(s.categories.Headline.MD.lineHeight === Math.round(s.categories.Headline.MD.size * 1.125), `Headline MD line-height = size×1.125`);
}

// ── the "nice number" quantizer only engages when the fixed table is actually SCALED (factor≠1) or
// breakpoint-compressed — an UNSCALED literal (factor 1, no compression) passes through EXACTLY, never
// re-snapped to a different "nice" number (the 2026-07-13 fix: 120 must stay 120, not round to 128) ──
{
  const disp = T.typeScale({ treatment: "product", bodyBase: 16 }).categories.Display;
  ok(["SM", "MD", "LG"].map((k) => disp[k].size).join(",") === "72,96,120", `unscaled Display is the EXACT literal 72,96,120, not quantizer-rounded (got ${["SM", "MD", "LG"].map((k) => disp[k].size)})`);
  const subhead = T.typeScale({ treatment: "product", bodyBase: 16 }).categories["Sub-heading"];
  ok(["SM", "MD", "LG"].map((k) => subhead[k].size).join(",") === "28,34,40", `unscaled Sub-heading is the EXACT literal 28,34,40 (got ${["SM", "MD", "LG"].map((k) => subhead[k].size)})`);
  // a value is ON the ladder iff it equals its own band-step snap (step 1 ≤16, 2 ≤24, 4 ≤48, 8 ≤96, 16 else)
  const step = (v) => (v <= 16 ? 1 : v <= 24 ? 2 : v <= 48 ? 4 : v <= 96 ? 8 : 16);
  const onLadder = (v) => v === Math.round(v / step(v)) * step(v);
  for (const t of ["product", "luxury", "editorial", "technical", "statement"]) {
    for (const base of [13, 20]) { // SCALED cases (13/20 ≠ 15) — the quantizer must engage here
      const sc = T.typeScale({ treatment: t, bodyBase: base });
      for (const [voice, steps] of Object.entries(sc.categories)) {
        const sizes = Object.values(steps).map((x) => x.size);
        ok(sizes.every(onLadder), `${t} @${base} ${voice}: every SCALED size is on the ladder (${sizes})`);
        ok(sizes.every((v, i) => i === 0 || v > sizes[i - 1]), `${t} @${base} ${voice}: strictly increases (${sizes})`);
      }
    }
  }
}

// ── optical tracking: Display tightens (negative), Label loosens (positive) in the product treatment ──
{
  const s = T.typeScale({ treatment: "product" });
  ok(s.categories.Display.LG.letterSpacing < 0, `Display LG tracking negative (got ${s.categories.Display.LG.letterSpacing})`);
  ok(s.categories.Label.SM.letterSpacing > 0, `Label SM tracking positive (got ${s.categories.Label.SM.letterSpacing})`);
  // tracking scales with size (Display LG more negative than Display SM)
  ok(s.categories.Display.LG.letterSpacing < s.categories.Display.SM.letterSpacing, "Display tracking scales with size (LG tighter than SM)");
  // Display weight is heavy
  ok(s.categories.Display.LG.weight >= 700, `Display weight heavy (got ${s.categories.Display.LG.weight})`);
}

// ── bodyBase scales the whole FIXED table uniformly (factor = bodyBase/16) ──
{
  const a = T.typeScale({ treatment: "product", bodyBase: 16 });
  const b = T.typeScale({ treatment: "product", bodyBase: 20 });
  ok(a.categories.Body.MD.size === 16, `bodyBase 16 (identity) → Body MD 16, unscaled (got ${a.categories.Body.MD.size})`);
  ok(b.categories.Body.MD.size > a.categories.Body.MD.size, `a larger bodyBase scales Body up too (got ${b.categories.Body.MD.size})`);
  ok(b.categories.Display.LG.size > a.categories.Display.LG.size, "a larger bodyBase scales Display up too");
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

// ── per-voice shaping: config.voices overrides a voice's weight/leading/tracking for the WHOLE voice;
// other voices untouched; absent / empty ⇒ byte-identical (the identity gate). `ratio` is RETIRED
// (2026-07-13 — size is a fixed table now, nothing left to re-scale per voice) ──
{
  const baseV = T.typeScale({ treatment: "product" });
  const ovV = T.typeScale({ treatment: "product", voices: { Body: { weight: 600, leading: 1.8 } } });
  ok(ovV.categories.Body.MD.weight === 600, "typeScale: a per-voice weight override applies to every step of that voice");
  ok(ovV.categories.Body.MD.lineHeight === Math.round(ovV.categories.Body.MD.size * 1.8), "typeScale: a per-voice leading override re-derives line-height");
  ok(ovV.categories.Display.MD.weight === baseV.categories.Display.MD.weight, "typeScale: a voice override doesn't touch OTHER voices");
  ok(JSON.stringify(T.typeScale({ treatment: "product", voices: {} }).categories) === JSON.stringify(baseV.categories), "typeScale: an empty voices map is identity (byte-identical to the un-tuned scale)");
}

// ── CSS emit: custom props + a utility class per step ──
{
  const css = T.typeTokensCSS(T.typeScale({ treatment: "product" }));
  ok(css.includes("--font-display:") && css.includes("--type-body-md-size:"), "CSS has font + size custom props");
  ok(/\.type-display-lg\s*\{[^}]*font-size: var\(--type-display-lg-size\)/.test(css), "CSS emits a .type-display-lg utility class");
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
  ok(md.includes("--font-body:") && md.includes("var(--font-voice-body)"), "font families stay --font-*/--font-voice-* under a scale prefix (utility classes bind to the per-voice prop, TKT-0006)");
  ok(T.typeTokensCSS(s, { prefix: "type" }) === T.typeTokensCSS(s), "prefix 'type' is byte-identical to the default (identity gate)");
  ok(T.typeTokensDTCG(s, { unit: "rem" }).typography.Body.MD.$value.fontSize === "1rem" && T.typeTokensDTCG(s).typography.Body.MD.$value.fontSize === "16px", "DTCG carries the unit (fontSize 1rem) + defaults to px");
}

// ── breakpoint CSS: SEPARATE, self-contained per-mode override FILES (not one @media-embedded file) —
// each bounded on both ends except the narrowest, which stays open below (#264) ──
{
  const base = T.typeScale({ treatment: "product", bodyBase: 16 });
  const mobile = T.typeScale({ treatment: "product", bodyBase: 13 });
  const tablet = T.typeScale({ treatment: "product", bodyBase: 15 });

  const solo = T.typeTokensBreakpointCSS([{ name: "Mobile", minWidth: 768, scale: mobile }, { name: "NoWidth", scale: mobile }]);
  ok(solo.length === 1 && solo[0].name === "Mobile", "a mode WITHOUT a minWidth is skipped (preview-only, mirrors the DTCG files)");
  ok(/@media \(max-width: 1279px\) \{\s*:root \{[^}]*--type-body-md-size: 13px/.test(solo[0].css) && !/min-width/.test(solo[0].css), "a lone mode is the NARROWEST too: open-ended below, bounded above by desktopMinWidth-1 (default 1280), no min-width");
  ok(T.typeTokensBreakpointCSS([]).length === 0, "no modes → no files");

  const two = T.typeTokensBreakpointCSS([{ name: "Tablet", minWidth: 992, scale: tablet }, { name: "Mobile", minWidth: 476, scale: mobile }]);
  ok(two.length === 2 && two[0].name === "Tablet" && two[1].name === "Mobile", "sorted DESCENDING by minWidth regardless of storage order");
  ok(/@media \(min-width: 992px\) and \(max-width: 1279px\)/.test(two[0].css), "the wider mode is bounded BOTH ends: [own minWidth, desktopMinWidth-1]");
  ok(/@media \(max-width: 991px\)/.test(two[1].css) && !/min-width/.test(two[1].css), "the narrowest mode is open-ended below: (max-width: next-wider.minWidth-1) only");
  const reversed = T.typeTokensBreakpointCSS([{ name: "Mobile", minWidth: 476, scale: mobile }, { name: "Tablet", minWidth: 992, scale: tablet }]);
  ok(JSON.stringify(reversed) === JSON.stringify(two), "order-independent: reversed storage order yields the identical file set");

  ok(T.typeTokensBreakpointCSS([{ name: "M", minWidth: 768, scale: base }], { prefix: "md-sys-typescale" })[0].css.includes("--md-sys-typescale-body-md-size:"), "the prefix threads into a breakpoint file too");
  ok(T.typeTokensBreakpointCSS([{ name: "M", minWidth: 768, scale: T.typeScale({ treatment: "product", bodyBase: 13 }) }], { unit: "rem" })[0].css.includes("--type-body-md-size: 0.8125rem;"), "a breakpoint file honors the unit (13px = 0.8125rem)");
  ok(T.typeTokensBreakpointCSS([{ name: "Wide", minWidth: 1400, scale: base }], { desktopMinWidth: 1600 })[0].css.includes("@media (max-width: 1599px)"), "desktopMinWidth is overridable (a custom mode wider than the app's own 1280 default)");
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
  ok(ov.categories.Body.LG.size === baseline.categories.Body.LG.size && ov.categories.Display.LG.size === baseline.categories.Display.LG.size, "an override touches only its (voice|step) cell, no others");
  // a non-positive / non-numeric override is ignored (no effect) — the cell stays derived.
  ok(JSON.stringify(T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Body|MD": 0, "Body|LG": -5, "Display|LG": NaN } })) === JSON.stringify(baseline), "non-positive / NaN overrides are ignored (no effect)");
  // NON-ZERO-TRACKING pin (Body|MD has trackingEm 0 → 0===0 masks the bug). Display tracks NEGATIVE, so
  // overriding a Display step's SIZE must NOT move tracking (it stays on the underlying fixed size) or
  // weight — only size changes and line-height re-derives. This pins the "size lever; tracking/weight stay" rule.
  const displayP = T.TYPE_TREATMENTS.find((x) => x.id === "product").categories.Display; // leading 0.8 (< 1), trackingEm -0.02 (non-zero)
  const ovD = T.typeScale({ treatment: "product", bodyBase: 16, overrides: { "Display|MD": 88 } });
  ok(displayP.trackingEm !== 0, `Display tracking is non-zero (got ${displayP.trackingEm}) — the assertion below is meaningful`);
  ok(ovD.categories.Display.MD.size === 88, `Display override sets the size (got ${ovD.categories.Display.MD.size}, want 88)`);
  ok(ovD.categories.Display.MD.size !== baseline.categories.Display.MD.size, "the Display override actually moves the size off baseline");
  ok(ovD.categories.Display.MD.letterSpacing === baseline.categories.Display.MD.letterSpacing, `Display tracking is UNCHANGED by a size override (got ${ovD.categories.Display.MD.letterSpacing}, baseline ${baseline.categories.Display.MD.letterSpacing}) — tracking stays on the fixed size`);
  ok(ovD.categories.Display.MD.weight === baseline.categories.Display.MD.weight, "Display weight is UNCHANGED by a size override");
  ok(ovD.categories.Display.MD.lineHeight === Math.round(88 * displayP.leading), `Display line-height re-derives from the override (got ${ovD.categories.Display.MD.lineHeight}, want ${Math.round(88 * displayP.leading)})`);
}

// ── DTCG emit: fontFamily group + composite typography tokens ──
{
  const d = T.typeTokensDTCG(T.typeScale({ treatment: "editorial" }));
  ok(d.fontFamily && d.fontFamily.Display.$type === "fontFamily", "DTCG fontFamily group (voice-keyed, TKT-0006)");
  ok(Object.keys(d.fontFamily).length === 13, `DTCG fontFamily group carries all 13 voices (got ${Object.keys(d.fontFamily).length})`);
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
  const dlg = base.categories.Display.LG;
  ok(idCol.variables["Body/MD/size"].values.Base === base.categories.Body.MD.size && idCol.variables["Display/LG/letterSpacing"].values.Base === dlg.letterSpacing, "no-modes Base values equal the base scale (size + letterSpacing both raw px — Figma's own relative-units rule)");
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
  ok(near(s.Headline.MD.paragraphSpacing, Math.round(s.Headline.MD.size * 0.7)), "Headline paragraphSpacing = 0.7×size");
  ok(near(s.Body.MD.paragraphSpacing, Math.round(s.Body.MD.size * 0.75)), `Body (prose) paragraphSpacing = 0.75×size (got ${s.Body.MD.paragraphSpacing})`);
  ok(s.Label.MD.paragraphSpacing === s.Label.MD.size && s["Body-mono"].MD.paragraphSpacing === s["Body-mono"].MD.size, "the BOX voices (Label/Body-mono) paragraphSpacing = 1.0×size");
  // singleLineHeight: control-text intent — present IFF a voice is a BOX voice (Label/Body-mono/Label-mono/Kicker), equal to size.
  ok(s.Label.MD.singleLineHeight === s.Label.MD.size && s["Body-mono"].SM.singleLineHeight === s["Body-mono"].SM.size && s.Kicker.MD.singleLineHeight === s.Kicker.MD.size, "singleLineHeight = size on the BOX voices Label/Body-mono/Kicker");
  ok(["Display", "Headline", "Sub-heading", "Title", "Sub-title", "Lead", "Body", "Tiny"].every((v) => !("singleLineHeight" in s[v].MD)), "singleLineHeight is ABSENT on every PROSE voice — incl. Tiny/Sub-title, which ride ui/mono roles but are prose (box:false)");
  // the emitters carry both: CSS -para (+ -line-single where present), DTCG composite, Figma-modes vars.
  const css = T.typeTokensCSS(T.typeScale({ treatment: "product" }));
  ok(css.includes("-para:") && css.includes("--type-label-md-line-single:") && !css.includes("--type-display-md-line-single") && !css.includes("--type-tiny-md-line-single"), "CSS emits -para everywhere and -line-single only on the BOX voices (absent on Tiny, though it rides ui)");
  const dt = T.typeTokensDTCG(T.typeScale({ treatment: "product" })).typography;
  ok(dt.Label.MD.$value.singleLineHeight && !dt.Display.MD.$value.singleLineHeight && /px$/.test(dt.Display.MD.$value.paragraphSpacing), "DTCG composite carries paragraphSpacing (px) + singleLineHeight on ui/mono box voices");
  const fv = T.typeTokensFigmaModes(T.typeScale({ treatment: "product" }), []).collections.Typography.variables;
  ok(fv["Display/MD/paragraphSpacing"] && fv["Label/MD/singleLineHeight"] && !fv["Display/MD/singleLineHeight"], "Figma modes carry paragraphSpacing (all) + singleLineHeight (ui/mono box voices only)");
}

// ── leading + tracking are ALWAYS relative — never px — in every emitter (the units rule; overhaul P1) ──
{
  const s = T.typeScale({ treatment: "product", bodyBase: 16 });
  const b = s.categories.Body.MD;
  const relLine = (ratio) => Math.round(ratio * 1000) / 1000; // unitless factor, 3dp (mirrors engine round(,3))
  // CSS: -line is a UNITLESS factor (= the voice's exact leadingRatio), -tracking is `em`, -line-single
  // unitless — and NO px on either.
  const css = T.typeTokensCSS(s);
  ok(css.includes(`--type-body-md-line: ${relLine(b.leadingRatio)};`), `CSS -line is the exact leadingRatio, not line÷size (= ${relLine(b.leadingRatio)})`);
  ok(/--type-body-md-tracking: -?\d+(?:\.\d+)?em;/.test(css), "CSS -tracking is em (relative to font size)");
  ok(/--type-label-md-line-single: \d+(?:\.\d+)?;/.test(css), "CSS -line-single is a unitless factor");
  ok(!/-line: -?\d+(?:\.\d+)?px/.test(css) && !/-tracking: -?\d+(?:\.\d+)?px/.test(css) && !/-line-single: -?\d+(?:\.\d+)?px/.test(css), "NO px leading or tracking anywhere in the CSS export");
  // the SIZE / paragraph dims are still absolute px (only leading/tracking go relative).
  ok(/--type-body-md-size: \d+px;/.test(css) && /--type-body-md-para: \d+px;/.test(css), "size + paragraph spacing stay absolute px (box metrics, not leading)");
  // DTCG: lineHeight a unitless NUMBER (multiplier), letterSpacing an `em` string, size/para still px.
  const dt = T.typeTokensDTCG(s).typography.Body.MD.$value;
  ok(typeof dt.lineHeight === "number" && dt.lineHeight === relLine(b.leadingRatio), "DTCG lineHeight is a unitless number (= the exact leadingRatio)");
  ok(typeof dt.letterSpacing === "string" && /em$/.test(dt.letterSpacing), "DTCG letterSpacing is an em string (relative)");
  ok(/px$/.test(dt.fontSize) && /px$/.test(dt.paragraphSpacing), "DTCG fontSize + paragraphSpacing stay px (absolute dims)");
  ok(typeof T.typeTokensDTCG(s).typography.Label.MD.$value.singleLineHeight === "number", "DTCG singleLineHeight is a unitless number too");
  // Figma: leading + tracking ride as ABSOLUTE PIXELS (unlike CSS/DTCG) — a Figma-bound percent FLOAT
  // displays as a bare, unit-less number in Figma's own Properties panel, indistinguishable from a pixel
  // value at a glance; an absolute pixel reads unambiguously there instead. size/weight/singleLineHeight
  // are raw px too (unchanged from before).
  const gv = T.typeTokensFigmaModes(s, []).collections.Typography.variables;
  ok(gv["Body/MD/lineHeight"].values.Base === b.lineHeight, "Figma lineHeight is the absolute pixel value, not a %");
  ok(gv["Body/MD/letterSpacing"].values.Base === b.letterSpacing, "Figma letterSpacing is the absolute pixel value, not a %");
  ok(gv["Label/MD/singleLineHeight"].values.Base === s.categories.Label.MD.singleLineHeight, "Figma singleLineHeight is the absolute pixel value too");
  ok(gv["Body/MD/size"].values.Base === b.size && gv["Body/MD/weight"].values.Base === b.weight, "Figma size + weight stay raw (absolute)");
  // CSS/DTCG still use the exact ratio (unaffected by Figma's pixel choice): a voice with ONE configured
  // leading ratio must show the SAME constant number at every step — never drift, because
  // round(size·leading)/size ≠ leading at most sizes. Sub-heading's fixed sizes (28/34/40) don't all
  // divide evenly by 1.125 — exactly the shape that silently drifted before leadingRatio/trackingRatio
  // existed (found live via BZZR's real Figma Styles panel).
  const drift = T.typeScale({ treatment: "statement", voices: { "Sub-heading": { leading: 1.125, tracking: "-5%" } } });
  const shCss = T.typeTokensCSS(drift);
  const shLines = ["lg", "md", "sm"].map((step) => (shCss.match(new RegExp(`--type-sub-heading-${step}-line: ([\\d.]+);`)) || [])[1]);
  ok(shLines.every((v) => v === "1.125"), `Sub-heading's CSS -line is a CONSTANT 1.125 at every step, not drifting per size (got ${shLines})`);
  const shTracking = ["lg", "md", "sm"].map((step) => (shCss.match(new RegExp(`--type-sub-heading-${step}-tracking: (-?[\\d.]+)em;`)) || [])[1]);
  ok(shTracking.every((v) => v === "-0.05"), `Sub-heading's CSS -tracking is a CONSTANT -0.05em at every step (from the "-5%" percent-string override), got ${shTracking}`);
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
  // the core's weight/weight-style primitive key NESTS under the voice's own weight-name slug
  // (coreWeightKey) — the SAME per-voice group its siblings live in, so it's never bare (2026-07-13:
  // a bare core sat OUTSIDE the "Display" folder its siblings created in Figma's own "/" grouping).
  const coreKeyOf = (v) => T.coreWeightKey(v, T.weightNameFor(base.categories[v].MD.weight), base.weights && base.weights[v]);
  ok(voices.every((v) => col.variables[`weight/${coreKeyOf(v)}`] && col.variables[`weight/${coreKeyOf(v)}`].type === "FLOAT" && Number.isFinite(col.variables[`weight/${coreKeyOf(v)}`].values.Value)), "every voice emits a weight/<voice>/<slug> FLOAT primitive, nested under its own weight-name slug");
  ok(voices.every((v) => col.variables[col.variables[`font/${v}`].target]), "every alias target resolves to a primitive in the same collection");
  ok(col.variables["font/Headline"].target === "family/display", "Headline aliases the deduped Inter Tight primitive (family/display)");
  ok(col.variables["font/Kicker"].target === col.variables["font/Body-mono"].target, "Kicker and Body-mono alias the SAME mono primitive (roleOf → mono)");
  ok(col.variables[`weight/${coreKeyOf("Display")}`].values.Value === base.categories.Display.MD.weight, "weight/Display/<slug> carries the voice's uniform weight");
  // weight STYLE NAMES (slice 4): config.voices[v].styleName → scale.styleNames → weight-style/<voice>
  // STRING primitives; absent names ⇒ no styleNames key and no weight-style vars (the identity gate).
  ok(!("styleNames" in base) && !Object.keys(col.variables).some((k) => /^weight-style\/[^/]+$/.test(k)), "no styleName config ⇒ no styleNames on the scale, no BARE weight-style/<voice> var (sibling weight-style/<voice>/<slug> vars still exist — every voice auto-populates siblings, 2026-07-13)");
  const named = T.typeScale({ treatment: "product", voices: { Display: { styleName: "Condensed Black Italic" }, Kicker: { styleName: "  Medium  " }, Body: { styleName: "" } } });
  ok(named.styleNames && named.styleNames.Display === "Condensed Black Italic" && named.styleNames.Kicker === "Medium" && !("Body" in named.styleNames), "styleNames collect trimmed non-empty names only");
  const nCol = T.typeTokensFigmaPrimitives(named).collections["Font Primitives"];
  const displayKey = coreKeyOf("Display"); // reuses the SAME base scale's Display weight (700, unaffected by `named`'s styleName-only override)
  ok(nCol.variables[`weight-style/${displayKey}`] && nCol.variables[`weight-style/${displayKey}`].type === "STRING" && nCol.variables[`weight-style/${displayKey}`].values.Value === "Condensed Black Italic", "the primitives collection emits weight-style/<voice>/<slug> STRING vars, nested like the numeric weight");
  const bodyKey = coreKeyOf("Body");
  ok(!nCol.variables[`weight-style/${bodyKey}`] && nCol.variables[`weight/${bodyKey}`], "an unnamed voice keeps its numeric weight primitive but gets no style var");
}

// ── SIBLING WEIGHTS: siblingWeightDefaults + the voices[].weights channel + emitter coverage ──
{
  // defaults table — 2026-07-13: THREE ladder-adjacent stops (one AWAY from the ladder's center, two
  // TOWARD it, nearer-toward first) — below-center cores step up toward center (away = down);
  // above-center cores step down toward center (away = up).
  const w = (list) => list.map((x) => x.weight).join(",");
  ok(w(T.siblingWeightDefaults(900)) === "800,700", "defaults: core 900 (edge) → Extra-bold 800 + Bold 700 (away clips off-ladder, 2 stops)");
  ok(w(T.siblingWeightDefaults(400)) === "300,500,600", "defaults: core 400 (Regular) → Light 300 (away) + Medium 500 + Semi-bold 600 (toward)");
  ok(w(T.siblingWeightDefaults(600)) === "700,500,400", "defaults: core 600 (Semi-bold) → Bold 700 (away) + Medium 500 + Regular 400 (toward)");
  ok(w(T.siblingWeightDefaults(700)) === "800,600,500", "defaults: core 700 (Bold) → Extra-bold 800 (away) + Semi-bold 600 + Medium 500 (toward)");
  ok(w(T.siblingWeightDefaults(100)) === "200,300", "defaults: floor core 100 (edge) → above only (no 0 weight, 2 stops)");
  ok(w(T.siblingWeightDefaults(440)) === "300,500,600", "defaults: non-ladder core snaps (440→400)");
  ok(T.siblingWeightDefaults(900)[0].name === "Extra-bold" && T.siblingWeightDefaults(400)[2].name === "Semi-bold", "defaults carry the ladder's semantic names");
  ok(T.siblingWeightDefaults(NaN).length === 0, "defaults: non-finite core → empty");

  // weightNameFor — the SAME snap, exposed standalone to name the CORE weight itself (TKT-0001: the
  // symmetric Figma text-style naming, core alongside its siblings).
  ok(JSON.stringify(T.weightNameFor(900)) === JSON.stringify({ weight: 900, name: "Black", slug: "black" }), "weightNameFor: an exact ladder stop names itself");
  ok(JSON.stringify(T.weightNameFor(620)) === JSON.stringify({ weight: 600, name: "Semi-bold", slug: "semi-bold" }), "weightNameFor: a non-ladder core snaps to its nearest stop (620→600)");
  ok(T.weightNameFor(NaN) === null, "weightNameFor: non-finite → null");

  // AUTO-POPULATE (2026-07-13): every voice's `weights` seeds from siblingWeightDefaults on its OWN
  // resolved core weight, with NO config at all — replacing the old opt-in identity gate.
  const base = T.typeScale({ treatment: "product" });
  ok(base.weights && Object.keys(base.weights).length === 13, `every voice auto-populates weights with zero config (got ${base.weights && Object.keys(base.weights).length})`);
  ok(w(base.weights.Display) === w(T.siblingWeightDefaults(base.categories.Display.MD.weight)), "a non-BODY_CLASS voice's auto weights derive from siblingWeightDefaults on its own RESOLVED core weight (post per-voice override)");
  // BODY_CLASS_VOICES (Lead/Body*/Label*/Tiny*, 2026-07-13 at request) auto-populate from
  // bodyClassSiblingDefaults instead — capped at 2 siblings, BOTH heavier than the core (never lighter).
  ok(w(base.weights.Body) === w(T.bodyClassSiblingDefaults(base.categories.Body.MD.weight)), "a BODY_CLASS_VOICE's auto weights derive from bodyClassSiblingDefaults, not siblingWeightDefaults");
  ok(base.weights.Body.length === 2 && base.weights.Body.every((wv) => wv.weight > base.categories.Body.MD.weight), `Body auto-populates exactly 2 siblings, BOTH heavier than its core (got ${JSON.stringify(base.weights.Body)})`);
  ok(T.BODY_CLASS_VOICES.has("Body") && T.BODY_CLASS_VOICES.has("Body-mono") && T.BODY_CLASS_VOICES.has("Label") && T.BODY_CLASS_VOICES.has("Label-mono") && T.BODY_CLASS_VOICES.has("Lead") && T.BODY_CLASS_VOICES.has("Tiny") && T.BODY_CLASS_VOICES.has("Tiny-mono") && !T.BODY_CLASS_VOICES.has("Display") && !T.BODY_CLASS_VOICES.has("Headline") && !T.BODY_CLASS_VOICES.has("Sub-heading") && !T.BODY_CLASS_VOICES.has("Title") && !T.BODY_CLASS_VOICES.has("Sub-title") && !T.BODY_CLASS_VOICES.has("Kicker"), "BODY_CLASS_VOICES is exactly the 7 named voices — Sub-title/Kicker stay on the full Lighter/Light/Heavy/Heavier scale");
  // explicit weights:[] (or an array with no valid entries) is the one remaining opt-OUT lever.
  const withEmpty = T.typeScale({ treatment: "product", voices: { Display: { weights: [] }, Body: { weights: [{ name: "", weight: 700 }, { name: "Bad", weight: 0 }] } } });
  ok(!("Display" in withEmpty.weights) && !("Body" in withEmpty.weights), "explicit [] (or all-invalid entries) opts a voice OUT of weights entirely");
  ok(Object.keys(withEmpty.weights).length === 11, "every OTHER voice still auto-populates (13 total − 2 opted out)");
  ok(T.typeTokensCSS(T.typeScale({ treatment: "product" })) === T.typeTokensCSS(T.typeScale({ treatment: "product" })), "determinism: identical config ⇒ byte-identical CSS, including auto-populated weights");

  // the channel — validation, slugs, dedupe
  const sc = T.typeScale({ treatment: "product", voices: { Display: { weights: [{ name: "Bold", weight: 700 }, { name: "Semi-bold", weight: 600 }, { name: "bold ", weight: 650 }, { name: "Medium", weight: "500" }] }, Body: { weights: [{ name: "Light", weight: 300 }] } } });
  ok(sc.weights && sc.weights.Display && sc.weights.Display.length === 3, "weights channel: valid entries kept, duplicate slug collapsed (bold vs Bold)");
  ok(sc.weights.Display[0].slug === "bold" && sc.weights.Display[1].slug === "semi-bold" && sc.weights.Display[2].weight === 500, "weights channel: kebab slugs + numeric coercion");

  // relativeWeightLabel — default 4-word scale, a custom `words` vocabulary (BODY_WEIGHT_LABELS), and
  // the collision-safety fallback when `total` exceeds the custom vocabulary's own length.
  ok(T.relativeWeightLabel(0, 4) === "Lighter" && T.relativeWeightLabel(1, 4) === "Light" && T.relativeWeightLabel(2, 4) === "Heavy" && T.relativeWeightLabel(3, 4) === "Heavier", "relativeWeightLabel: default 4-word scale maps every rank 1:1 at total=4");
  ok(T.relativeWeightLabel(0, 2) === "Lighter" && T.relativeWeightLabel(1, 2) === "Heavier", "relativeWeightLabel: total=2 picks the two extremes of the default scale");
  ok(T.relativeWeightLabel(0, 3, T.BODY_WEIGHT_LABELS) === "Regular" && T.relativeWeightLabel(1, 3, T.BODY_WEIGHT_LABELS) === "Bolder" && T.relativeWeightLabel(2, 3, T.BODY_WEIGHT_LABELS) === "Boldest", "relativeWeightLabel: a custom 3-word vocabulary (BODY_WEIGHT_LABELS) maps 1:1 at total=3");
  ok(T.relativeWeightLabel(0, 5, T.BODY_WEIGHT_LABELS) === "Lighter", "relativeWeightLabel: total EXCEEDING the custom vocabulary's length falls back to the full 4-word scale (never collides)");
  ok(T.relativeWeightLabel(0, 1) === null && T.relativeWeightLabel(NaN, 4) === null, "relativeWeightLabel: total ≤ 1 or non-finite rank ⇒ null (nothing to disambiguate)");

  // CSS — per-voice custom props, never per-step duplication
  const css = T.typeTokensCSS(sc);
  ok(css.includes("--type-display-weight-bold: 700;") && css.includes("--type-display-weight-semi-bold: 600;") && css.includes("--type-body-weight-light: 300;"), "CSS emits per-voice sibling weight props");
  ok((css.match(/--type-display-weight-bold:/g) || []).length === 1, "CSS sibling props appear once per voice (not per step)");

  // DTCG — a weights group of fontWeight tokens
  const dtcg = T.typeTokensDTCG(sc);
  ok(dtcg.weights && dtcg.weights.Display && dtcg.weights.Display.Bold && dtcg.weights.Display.Bold.$type === "fontWeight" && dtcg.weights.Display.Bold.$value === 700, "DTCG emits the weights group");
  ok("weights" in T.typeTokensDTCG(base) && Object.keys(T.typeTokensDTCG(base).weights).length === 13, "DTCG weights group covers every auto-populated voice by default (no siblings config needed)");
  ok(!("Display" in T.typeTokensDTCG(withEmpty).weights), "DTCG: a voice opted OUT (Display) carries no weights entry");

  // Figma primitives — FLOAT + STRING per sibling, core un-suffixed names unchanged
  const col = T.typeTokensFigmaPrimitives(sc).collections["Font Primitives"];
  ok(col.variables["weight/Display/bold"] && col.variables["weight/Display/bold"].type === "FLOAT" && col.variables["weight/Display/bold"].values.Value === 700, "primitives emit weight/<voice>/<slug> FLOAT per sibling");
  ok(col.variables["weight-style/Display/bold"] && col.variables["weight-style/Display/bold"].values.Value === "Bold", "primitives emit weight-style/<voice>/<slug> STRING per sibling (no custom styleName here ⇒ bare name, unaffected by templating)");
  ok(col.variables["weight/Display"], "the core un-suffixed weight primitive is unchanged");

  // REGRESSION (found via BZZR's real Figma export): a sibling's weight-style/<voice>/<slug>
  // primitive must go through the SAME custom-face templating the text-style planner uses
  // (src/engine/type.mjs's siblingStyleName) — this shipped once with the planner fixed but this
  // engine-level primitive still emitting the bare sibling name ("Bold" instead of "Condensed Bold
  // Italic"), because the two had their own separate, independently-drifting implementations.
  const bzzrDisplay = T.typeScale({ treatment: "statement", voices: { Display: { weight: 900, styleName: "Condensed Black Italic", weights: [{ name: "Extra-bold", weight: 800 }, { name: "Bold", weight: 700 }] } } });
  const bzzrCol = T.typeTokensFigmaPrimitives(bzzrDisplay).collections["Font Primitives"];
  ok(bzzrCol.variables["weight-style/Display/black"].values.Value === "Condensed Black Italic", "core weight-style keeps the full custom name, nested under its own weight-name slug");
  ok(bzzrCol.variables["weight-style/Display/extra-bold"].values.Value === "Condensed Extra-bold Italic", `sibling weight-style primitive templates the custom name, not a bare "Extra-bold" (got ${bzzrCol.variables["weight-style/Display/extra-bold"].values.Value})`);
  ok(bzzrCol.variables["weight-style/Display/bold"].values.Value === "Condensed Bold Italic", `sibling weight-style primitive templates the custom name, not a bare "Bold" (got ${bzzrCol.variables["weight-style/Display/bold"].values.Value})`);
}

// ── per-voice FONT overrides (TKT-0002): config.voices[v].font escapes a voice off its shared ROLE font
// (e.g. Sub-heading no longer forced to share Headline's family); resolvedFontFor is the ONE resolution
// point; absent ⇒ no voiceFonts key + BYTE-IDENTICAL CSS/DTCG/Figma-primitives (the identity gate) ──
{
  const baseline = T.typeScale({ treatment: "product" });
  ok(!("voiceFonts" in baseline), "no font overrides ⇒ no voiceFonts key on the scale");
  const noFontVoices = T.typeScale({ treatment: "product", voices: { Body: { weight: 600 } } }); // a non-font override present
  ok(!("voiceFonts" in noFontVoices), "a voice override WITHOUT .font ⇒ still no voiceFonts key");
  // BYTE-IDENTICAL: with no voice fonts set anywhere, the whole-scale CSS/DTCG/Figma-primitives output is
  // identical to a scale built without this channel at all (an empty voices map ⇒ the pre-feature shape).
  const emptyV = T.typeScale({ treatment: "product", voices: {} });
  ok(T.typeTokensCSS(baseline) === T.typeTokensCSS(emptyV), "CSS byte-identical with an empty voices map (identity gate)");
  // TKT-0006: --font-voice-* is now emitted for ALL 13 voices unconditionally (not just overridden
  // ones), so this is no longer an absence check — it's a completeness + correctness check: every
  // voice gets one, and an un-overridden voice's value matches its role's shared default exactly.
  const baseCss = T.typeTokensCSS(baseline);
  // count DECLARATIONS only (`  --font-voice-x: '...';`) — utility classes below also REFERENCE
  // these vars (`var(--font-voice-x)`), which would otherwise inflate the count past 11.
  ok((baseCss.match(/ {2}--font-voice-[a-z0-9-]+: '/g) || []).length === 13, `--font-voice-* is declared for all 13 voices even with no overrides (got ${(baseCss.match(/ {2}--font-voice-[a-z0-9-]+: '/g) || []).length})`);
  ok(baseCss.includes(`--font-voice-sub-heading: '${baseline.fonts[baseline.roleOf["Sub-heading"]]}';`), "an un-overridden voice's --font-voice-* repeats its role's shared default");
  ok(JSON.stringify(T.typeTokensDTCG(baseline)) === JSON.stringify(T.typeTokensDTCG(emptyV)), "DTCG byte-identical with an empty voices map");
  ok(JSON.stringify(T.typeTokensFigmaPrimitives(baseline)) === JSON.stringify(T.typeTokensFigmaPrimitives(emptyV)), "Figma primitives byte-identical with an empty voices map");
  // resolvedFontFor: an un-overridden voice resolves to its role's shared default.
  ok(T.resolvedFontFor(baseline, "Sub-heading") === baseline.fonts[baseline.roleOf["Sub-heading"]], "resolvedFontFor: no override ⇒ the role's shared default");

  // ── the override itself: Sub-heading gets its OWN font, distinct from Headline (its shared role today) ──
  const ov = T.typeScale({ treatment: "product", voices: { "Sub-heading": { font: "  Fraunces  " } } });
  ok(ov.voiceFonts && ov.voiceFonts["Sub-heading"] === "Fraunces", "voiceFonts collects a trimmed non-empty per-voice font");
  ok(T.resolvedFontFor(ov, "Sub-heading") === "Fraunces", "resolvedFontFor: an override resolves to the voice's own font");
  ok(T.resolvedFontFor(ov, "Headline") === ov.fonts[ov.roleOf.Headline], "resolvedFontFor: an UN-overridden voice sharing the same role (Headline) is untouched");
  ok(ov.fonts.heading === baseline.fonts.heading, "the shared ROLE font itself is untouched by a per-voice override (config.fonts is a separate channel)");

  // CSS: a --font-voice-sub-heading prop carries the override; Headline's own --font-voice-headline
  // still carries the shared role default (TKT-0006: every voice's utility class now binds to its
  // OWN --font-voice-* prop, overridden or not — one point of truth per voice).
  const cssOv = T.typeTokensCSS(ov);
  ok(cssOv.includes("--font-voice-sub-heading: 'Fraunces';"), "CSS emits a quoted --font-voice-* prop for the overridden voice (same Safari digit-name trap as --font-*)");
  ok(cssOv.includes(`--font-voice-headline: '${ov.fonts.heading}';`), "an un-overridden voice sharing the same role (Headline) still gets its own --font-voice-* prop, at the role's value");
  ok(/\.type-sub-heading-md\s*\{[^}]*font-family: var\(--font-voice-sub-heading\)/.test(cssOv), "the overridden voice's utility classes reference its OWN --font-voice-* prop");
  ok(/\.type-headline-md\s*\{[^}]*font-family: var\(--font-voice-headline\)/.test(cssOv), "an un-overridden voice's utility classes ALSO reference its own --font-voice-* prop now (TKT-0006), not --font-{role} directly");

  // DTCG: the composite fontFamily for the overridden voice carries its own family; the top-level
  // fontFamily group is voice-keyed (TKT-0006) — BOTH Sub-heading and Headline get their own entry.
  const dtOv = T.typeTokensDTCG(ov);
  ok(dtOv.typography["Sub-heading"].MD.$value.fontFamily === "Fraunces", "DTCG composite fontFamily resolves the per-voice override");
  ok(dtOv.typography.Headline.MD.$value.fontFamily === ov.fonts.heading, "DTCG composite fontFamily for an un-overridden voice still reads its role's family");
  ok(dtOv.fontFamily["Sub-heading"].$value === "Fraunces", "the top-level fontFamily group carries the overridden voice's own family");
  ok(dtOv.fontFamily.Headline.$value === ov.fonts.heading, "the top-level fontFamily group ALSO carries the un-overridden voice, at the role's value");

  // Figma primitives: a genuinely distinct override family mints its OWN family/voice/<voice> primitive,
  // aliased by font/<voice>; two voices overridden to the SAME custom family share ONE primitive (dedupe by
  // VALUE); an override that happens to equal an EXISTING primitive's family aliases that one instead of
  // minting a redundant duplicate.
  const colOv = T.typeTokensFigmaPrimitives(ov).collections["Font Primitives"];
  ok(colOv.variables["family/voice/sub-heading"] && colOv.variables["family/voice/sub-heading"].type === "STRING" && colOv.variables["family/voice/sub-heading"].values.Value === "Fraunces", "a distinct override family mints its own family/voice/<voice> primitive");
  ok(colOv.variables["font/Sub-heading"].target === "family/voice/sub-heading", "font/Sub-heading aliases the new voice-specific primitive");
  ok(colOv.variables["font/Headline"].target === "family/display", "font/Headline is UNCHANGED — still aliases the shared role primitive (Inter Tight, product treatment)");

  const twoSame = T.typeScale({ treatment: "product", voices: { "Sub-heading": { font: "Fraunces" }, Title: { font: "Fraunces" } } });
  const colTwo = T.typeTokensFigmaPrimitives(twoSame).collections["Font Primitives"];
  ok(colTwo.variables["font/Sub-heading"].target === colTwo.variables["font/Title"].target, "two voices overridden to the SAME custom family share ONE primitive (dedupe by value)");
  ok(!colTwo.variables["family/voice/title"], "the second voice with the same override family does NOT mint a redundant duplicate primitive");

  // an override that happens to equal an EXISTING role's family aliases that primitive — no duplicate.
  const eqRole = T.typeScale({ treatment: "product", voices: { "Sub-heading": { font: baseline.fonts.body } } }); // body="Inter", distinct from heading's "Inter Tight"
  const colEq = T.typeTokensFigmaPrimitives(eqRole).collections["Font Primitives"];
  ok(colEq.variables["font/Sub-heading"].target === "family/body", "an override matching an EXISTING role's family aliases THAT primitive (dedupe by value, not just by source)");
  ok(!colEq.variables["family/voice/sub-heading"], "no redundant primitive is minted when the override equals an existing family's value");
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
console.log("type PASS — fixed size table, optical tracking, treatments, CSS + DTCG + Figma-modes emit");
process.exit(0);
