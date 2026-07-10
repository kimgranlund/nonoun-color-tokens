// type.mjs — the perceptual TYPOGRAPHY engine: the type analog of the color engine. A few parameters
// → a systematic type scale → DTCG / CSS tokens. Pure, no DOM. Seven role "voices" —
// Display · Heading · Sub-heading · Kicker · Body · UI · Code — each a size ramp whose every step
// carries size, line-height, letter-spacing, weight, and paragraph spacing, all DERIVED from the
// treatment's params (no hand-authored magic numbers). (The DTCG shape follows the Figma-variable
// export at .claude/docs/spec/typography/typography.tokens.json, a frozen snapshot kept for reference.)
//
// The system relationships (see .claude/docs/spec/typography/README.md):
//   size          = base · ratio^n           (a modular scale; n = the step's distance from the base)
//   lineHeight     = round(size · leading)     (per-role leading; single-line = size)
//   letterSpacing = round(size · trackingEm)  (optical: negative tightens big display, positive loosens UI)
//   weight        = the role's weight
//   paragraphSpacing = size × (box ? 1.0 : PARA_PROSE[role]≈0.7–0.75) (box = label height; prose = reading), indent = 0
//   singleLineHeight = size (BOX voices only — the control-text intent next to the multi-line lineHeight)

const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

// step ramps: [name, exponent] where exponent is the step's distance from the base (size = base·ratio^n).
const STEPS_5 = [["XS", -2], ["SM", -1], ["MD", 0], ["LG", 1], ["XL", 2]];
const STEPS_UI = [["3XS", -4], ["2XS", -3], ["XS", -2], ["SM", -1], ["MD", 0], ["LG", 1], ["XL", 2], ["2XL", 3]];
// lean editorial ramp (SM·MD·LG) for the four editorial voices — Lead · Quote · Caption · Legal. These
// voices realistically use one-or-two registers, so they get a 3-step ramp (MD = the voice's base), not
// the full XS–XL. Uniform across the four so the token matrix + override UI stay regular.
const STEPS_3 = [["SM", -1], ["MD", 0], ["LG", 1]];

// classic modular ratios (the "musical" scale), for reference + the UI's ratio picker.
export const TYPE_RATIOS = [
  { id: "minor-second", value: 1.067, label: "Minor second" },
  { id: "major-second", value: 1.125, label: "Major second" },
  { id: "minor-third", value: 1.2, label: "Minor third" },
  { id: "major-third", value: 1.25, label: "Major third" },
  { id: "perfect-fourth", value: 1.333, label: "Perfect fourth" },
  { id: "aug-fourth", value: 1.414, label: "Augmented fourth" },
  { id: "perfect-fifth", value: 1.5, label: "Perfect fifth" },
  { id: "golden", value: 1.618, label: "Golden ratio" },
];

// A "treatment" seeds the params, exactly as the color "Color Categories" presets seed palette params.
// Each category: { role, base, ratio, leading, weight, trackingEm, steps, transform, box }. Fonts are
// swappable; the SCALE + tracking + weight + leading + case relationships are the product. Free families only.
// `box` — the presentation FLOW, decoupled from the font role: box voices are CONTROL/label text (they emit
// a single-line height and use label-height paragraph spacing); prose voices wrap (no single-line height,
// reading paragraph spacing). It DEFAULTS from the role (ui/mono ⇒ box) so the 7 original voices are
// unchanged, and is overridable — Caption/Legal ride the ui FONT but are prose (box:false), per the design.
const cat = (role, base, ratio, leading, weight, trackingEm, steps = STEPS_5, transform = "none", box = role === "ui" || role === "mono") => ({ role, base, ratio, leading, weight, trackingEm, steps, transform, box });

// make11 — the ELEVEN named type ROLES (each a FUNCTION, not a size register — the taxonomy in
// .claude/docs/spec/typography): Display · Heading · Sub-heading · Kicker · Lead · Body · Quote · Caption ·
// UI · Code · Legal. A role carries CHARACTER (weight, tracking, leading, case, font cut) that travels
// with it across every LEVEL; the level (the step) is chosen by hierarchy depth and the size is DERIVED
// from it (base × ratio^level), never picked to hit a number. Sub-heading is the secondary heading below
// Heading; Kicker is the smallest overline / section label that sits ABOVE a heading. Shared STRUCTURE
// across treatments; each treatment passes its fonts + a few character knobs. Kicker + Code ride the MONO
// role.
//
// The FOUR editorial voices (ADR-013) add the reading roles the original seven lacked, each on the lean
// SM·MD·LG ramp (STEPS_3): Lead (the standfirst — a larger body intro, body role); Quote (block/pull
// quote — the HEADING role, so it inherits each treatment's display face: a serif pull-quote in the serif
// treatments, a grotesque in Brutalist); Caption (figure/media caption) and Legal (fine-print) — both ride
// the ui FONT but are PROSE (box:false → wrapping, reading leading ~1.5, not the box/control single-line
// treatment). They ride EXISTING font roles (body/heading/ui), so no new font is introduced.
//
// NOTE (character vs name): Sub-heading was "Kicker"; Kicker was "Eyebrow" (a preserved-character rename).
// The internal knob prefixes (`hc-`, `eye-`) still feed Sub-heading and Kicker respectively.
//
// CASE is a per-treatment decision, not a blanket rule. The Display role defaults to TITLE/SENTENCE case
// (o.dTransform) — only the Brutalist/Statement treatment opts its Display into ALL-CAPS. The two genuine
// "caps roles" are Sub-heading and Kicker; those stay uppercase and track POSITIVE so small caps open up.
// Display tracks NEGATIVE — big type tightens. LEADINGS are a system constant (the font.modes.json
// design intent, extended for the editorial voices), uniform across treatments so the same ratio set holds
// everywhere: display 0.8 (< 1 — large type sets tight), heading + sub-heading 1.125, prose (body) 1.5,
// Lead 1.4, Quote 1.35, Caption + Legal 1.5, Kicker 1.4, UI 1.4, mono/code ~1.5; single-line control text
// (the BOX voices UI · Code · Kicker) = 1.0. Treatments express voice through font, weight, tracking, and
// scale — NOT leading, which is fixed to the intent (retune a per-voice `*Lead` knob only for a deliberate
// character exception). The editorial voices keep a few knobs (weight/leading/tracking) for the same
// per-treatment latitude Kicker/Code have — used sparingly (see the treatments below), fixed otherwise.
function make11(o = {}) {
  return {
    "Display": cat("display", o.dBase ?? 60, o.dRatio ?? 1.25, o.dLead ?? 0.8, o.dWeight ?? 700, o.dTrack ?? -0.02, STEPS_5, o.dTransform ?? "none"),
    "Heading": cat("heading", 28, o.heRatio ?? 1.25, o.heLead ?? 1.125, o.heWeight ?? 700, o.heTrack ?? -0.005, STEPS_5, "none"),
    "Sub-heading": cat("heading", 26, o.hcRatio ?? 1.2, o.hcLead ?? 1.125, o.hcWeight ?? 600, o.hcTrack ?? 0.1, STEPS_5, "uppercase"),
    "Kicker": cat("mono", 13, 1.15, o.eyeLead ?? 1.4, o.eyeWeight ?? 600, o.eyeTrack ?? 0.16, STEPS_5, "uppercase"),
    "Lead": cat("body", 20, 1.2, o.leadLead ?? 1.4, o.leadWeight ?? 400, o.leadTrack ?? -0.005, STEPS_3, "none"),
    "Body": cat("body", o.bBase ?? 16, o.bRatio ?? 1.2, o.bLead ?? 1.5, o.bWeight ?? 440, 0, STEPS_5, "none"),
    "Quote": cat("heading", 22, o.quoteRatio ?? 1.2, o.quoteLead ?? 1.35, o.quoteWeight ?? 450, o.quoteTrack ?? -0.005, STEPS_3, "none"),
    "Caption": cat("ui", 13, 1.1, o.capLead ?? 1.5, o.capWeight ?? 440, 0, STEPS_3, "none", false), // ui FONT, prose flow
    "UI": cat("ui", 14, 1.125, o.uiLead ?? 1.4, o.uiWeight ?? 480, o.uiTrack ?? 0.006, STEPS_UI, "none"),
    "Code": cat("mono", 13, 1.125, 1.5, o.codeWeight ?? 460, o.codeTrack ?? 0, STEPS_UI, "none"),
    "Legal": cat("ui", 11, 1.1, o.legalLead ?? 1.5, o.legalWeight ?? 440, 0, STEPS_3, "none", false), // ui FONT, prose flow
  };
}

// Each treatment expresses a distinct VOICE through case, weight contrast, tracking, leading, and scale —
// not just a font swap. Per the directive + ui-compose-typography: Display is title/sentence case
// everywhere except Brutalist (the one earned ALL-CAPS), with bespoke specimen copy living in the UI.
export const TYPE_TREATMENTS = [
  // Product — calm geometric sans, gentle hierarchy, title-case display. The everyday system voice.
  { id: "product", label: "Product / Lifestyle", note: "Neutral geometric sans, title-case display — screen-native, calm, versatile.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make11({ dBase: 54, dRatio: 1.25, dWeight: 700, dTrack: -0.02, heWeight: 620, uiLead: 1.35, eyeTrack: 0.14 }) },
  // Luxury — high-contrast serif set LIGHT and large, airy prose, wide-tracked labels. Restraint, not shout.
  { id: "luxury", label: "Luxury / Premium", note: "High-contrast serif display set light and large, airy sans body, wide-tracked labels — restraint over shout.",
    fonts: { display: "Source Serif 4", heading: "Source Serif 4", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make11({ dBase: 76, dRatio: 1.25, dWeight: 400, dTrack: -0.005, heWeight: 500, heTrack: 0, hcRatio: 1.25, hcWeight: 500, hcTrack: 0.18, bBase: 17, bRatio: 1.25, bWeight: 400, uiTrack: 0.04, uiLead: 1.45, eyeWeight: 500, eyeTrack: 0.26, leadWeight: 300, quoteWeight: 400, quoteLead: 1.4 }) },
  // Editorial — serif headlines in title case, tight sans subheads, sans body tuned for long-form reading.
  { id: "editorial", label: "Editorial / Magazine", note: "Serif headlines in title case, tight sans subheads, sans body for long-form reading, mono metadata.",
    fonts: { display: "Source Serif 4", heading: "Inter Tight", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: make11({ dBase: 60, dRatio: 1.25, dWeight: 650, dTrack: -0.015, heWeight: 750, heTrack: -0.01, bBase: 18, bRatio: 1.25, eyeTrack: 0.2, leadLead: 1.45, quoteLead: 1.3 }) },
  // Technical — mono-forward, tabular, dense, tight leading. Display reads as data, not a slogan.
  { id: "technical", label: "Technical / Data", note: "Mono-forward — tabular figures, dense, tight leading, restrained scale. Display reads as data, not slogan.",
    fonts: { display: "Inter", heading: "Inter", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: make11({ dBase: 42, dRatio: 1.2, dWeight: 650, dTrack: -0.01, heWeight: 600, heRatio: 1.2, hcRatio: 1.18, hcTrack: 0.08, bBase: 15, bRatio: 1.2, uiTrack: 0, uiLead: 1.35 }) },
  // Brutalist — one heavy grotesque, the earned ALL-CAPS display, tight tracking, dramatic size jumps.
  { id: "statement", label: "Brutalist / Statement", note: "One heavy grotesque, ALL-CAPS display, tight tracking, dramatic size jumps — the loud voice, used on purpose.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make11({ dBase: 84, dRatio: 1.5, dWeight: 900, dTrack: -0.04, dTransform: "uppercase", heWeight: 800, heRatio: 1.4, heTrack: -0.02, hcRatio: 1.3, hcWeight: 700, hcTrack: 0.12, bRatio: 1.25, bWeight: 500, uiWeight: 550, uiTrack: 0.02, eyeWeight: 700, eyeTrack: 0.12, quoteWeight: 700, quoteTrack: -0.01, legalWeight: 500 }) },
];

export const DEFAULT_TYPE = { treatment: "product", bodyBase: 16 };
// The families bundled (woff2 in type-fonts.js) — the Fonts combobox menu. A user may also TYPE any custom
// family per role (config.fonts in typeScale); it exports + renders if installed, else falls back to a generic.
export const BUNDLED_FONTS = ["Inter", "Inter Tight", "Source Serif 4", "JetBrains Mono"];

// genericFor(family, role) — the CSS generic a font-family stack should end with, so an unloaded/uninstalled
// face (the Figma plugin, offline, or the brief font-display swap) falls back to the RIGHT style, not always
// sans. A plain `/serif/.test(name)` mislabels almost every serif (Bodoni Moda, Sabon, Playfair, Prata…) and
// every typewriter/mono face (Courier Prime, Prestige Elite, VT323…) as sans, because the category rarely
// lives in the name. So: the mono ROLE forces monospace (a code slot needs mono metrics regardless of face);
// otherwise a curated set (idiosyncratic names) + keyword rules classify the family. Validated against all
// 202 designed families. Unknowns default to sans-serif.
const FONT_GENERIC_SERIF = new Set(["bodoni", "bodoni moda", "sabon", "prata", "spectral", "lora", "bitter", "kazimir", "signifier", "fournier", "plantin", "miller", "miller text", "caledonia", "new caledonia", "charter", "chaparral", "cheltenham", "cheltenham bold", "cooper old style", "cardo", "mrs eaves", "mrs eaves xl", "tiempos text", "freight text", "sentinel", "archer", "giza", "serifa", "rockwell", "abril fatface", "rozha one", "chonburi", "sorts mill goudy", "goudy text", "fette fraktur", "graffonti", "kaufmann", "bello", "davida", "aachen bold", "rosewood", "ultra", "cooper black", "broadway", "p22 secession", "stardos stencil", "amiri", "aref ruqaa", "shippori mincho", "gt sectra", "gt sectra display", "iowan old style", "williams caslon text", "im fell english", "bembo book", "cormorant", "fraunces", "newsreader", "crimson pro", "alegreya", "ff tisa", "itc souvenir", "itc benguiat", "itc serif gothic", "clarendon", "zilla slab", "times new roman", "georgia", "didot", "trajan", "cinzel", "playfair display", "bookman old style", "adobe jenson", "arnold bocklin", "arnold boecklin", "american typewriter", "itc american typewriter", "lxgw wenkai"]);
const FONT_GENERIC_SANS = new Set(["optima", "optima nova", "futura", "jost", "gill sans", "frutiger", "univers", "interstate", "verlag", "gotham", "knockout", "neutraface", "eurostile", "eurostile bold extended", "monument extended", "druk", "druk text", "druk condensed", "clash display", "satoshi", "sohne", "söhne", "marianne", "familjen grotesk", "hanken grotesk", "untitled sans", "pretendard", "national park", "oswald", "architype bayer", "bungee", "data 70", "forma djr", "forma djr micro", "forma djr text", "helvetica now text", "zen kaku gothic antique", "zen kaku gothic new", "cronos", "kanit", "reem kufi", "baloo 2", "mukta", "sarabun", "highway gothic (fhwa series)", "neuzeit grotesk", "copperplate gothic", "alternate gothic"]);
const FONT_GENERIC_MONO = new Set(["courier", "courier prime", "prestige elite", "letter gothic", "nitti", "ff trixie", "trixie", "vt323", "ocr-a", "ocr-b"]);
export function genericFor(family, role) {
  if (role === "mono") return "monospace";
  const k = String(family || "").toLowerCase().trim();
  if (FONT_GENERIC_MONO.has(k)) return "monospace";
  if (FONT_GENERIC_SANS.has(k)) return "sans-serif";
  if (FONT_GENERIC_SERIF.has(k)) return "serif";
  if (/\bmono\b|\bcode\b|courier|consol|typewriter/.test(k)) return "monospace";
  if (/serif|\bslab\b|garamond|caslon|didot|minion|schoolbook|mincho|goudy|fraktur|\bfell\b/.test(k)) return "serif";
  return "sans-serif";
}

// `overrides` (optional) — a flat per-cell SIZE override map keyed "<voiceName>|<stepName>", already
// mode-selected by the caller. When a positive number exists for a step, it REPLACES the derived size and
// the line-height RE-DERIVES from it (lineHeight = round(size · leading)); tracking + weight stay as the
// scale computes them (the ratified "size lever; line re-derives; tracking/weight unchanged"). Absent /
// non-positive ⇒ no effect, so the scale is byte-identical to the un-overridden one (the identity gate).
// ── the "nice number" size ladder ────────────────────────────────────────────────────────────────────
// Emitted font sizes read as FAMILIAR values (…12,13,14,15,16,18,20,22,24,28,32,36,40,44,48…) instead of
// arbitrary modular-scale outputs, at every base + breakpoint. Granularity COARSENS as size grows (step
// 1 ≤16, 2 ≤24, 4 ≤48, 8 ≤96, else 16). nextNice breaks a rare adjacent-step collision so the quantized
// ramp stays strictly increasing. Per-cell overrides bypass it (they're the exact manual escape).
const niceStep = (v) => (v <= 16 ? 1 : v <= 24 ? 2 : v <= 48 ? 4 : v <= 96 ? 8 : 16);
const niceSize = (v) => { const s = niceStep(v); return Math.max(8, Math.round(v / s) * s); };
const nextNice = (v) => { let n = v + 1; while (niceSize(n) <= v) n += 1; return niceSize(n); };

// per-role READING paragraph factor (× the resolved size) for PROSE voices — sourced from the reference
// Figma system: display/heading paragraphs breathe at ~0.7×, body prose at 0.75. BOX voices (control/label
// text) don't consult this — they use a flat 1.0 (a label's "paragraph" is its own height). A prose voice
// on a non-reading role (Caption/Legal ride the ui FONT but are prose) falls back to 0.75.
const PARA_PROSE = { display: 0.7, heading: 0.7, body: 0.75 };

function buildCategory(name, p, factor, overrides, vp, compress) {
  // per-VOICE shaping overrides (vp): ratio · weight · leading · tracking(em) REPLACE the treatment's for the
  // WHOLE voice (the "select a voice, retune it" lever — like a per-palette Hue). Absent ⇒ the treatment
  // values, so a voice with no override is byte-identical (the identity gate). The per-cell size `overrides`
  // are a separate, finer layer that still moves an individual step's size.
  const ratio = vp && Number.isFinite(vp.ratio) ? vp.ratio : p.ratio;
  const weight = vp && Number.isFinite(vp.weight) ? vp.weight : p.weight;
  const leading = vp && Number.isFinite(vp.leading) ? vp.leading : p.leading;
  const trackingEm = vp && Number.isFinite(vp.tracking) ? vp.tracking : p.trackingEm;
  const out = {};
  let prevSize = 0; // running max, for the monotonic bump (quantization can collide adjacent steps)
  for (const [step, n] of p.steps) {
    // breakpoint compression (modeFactor) applies to the RAW modular size before rounding/quantization —
    // it IS a size change (line-height, tracking, paragraph rhythm all re-derive from the compressed size).
    const rawModular = compress ? compress(p.base * factor * ratio ** n) : p.base * factor * ratio ** n;
    const derived = Math.max(8, Math.round(rawModular)); // the modular-scale size — letterSpacing STAYS on this
    const ov = overrides && overrides[name + "|" + step];
    const overridden = typeof ov === "number" && Number.isFinite(ov) && ov > 0;
    // The DERIVED nice size drives the monotonic ramp (so a per-cell override never nudges its neighbours —
    // the bump rides the underlying ladder, not the override). SIZE snaps the ROUNDED modular px to the ladder
    // (smoother than snapping the raw float at .5 boundaries); an override is exact.
    let nice = niceSize(derived);
    if (nice <= prevSize) nice = nextNice(prevSize);
    prevSize = nice;
    const size = overridden ? Math.round(ov) : nice;
    out[step] = {
      size,
      lineHeight: Math.round(size * leading), // line-height TRACKS the override (re-derives from the resolved size)
      letterSpacing: round(derived * trackingEm, 2), // tracking STAYS on the modular-scale size (ratified "size lever; tracking/weight unchanged")
      weight,
      textTransform: p.transform || "none",
      // paragraph rhythm tracks the resolved size, keyed on FLOW not just role: a BOX voice (control/label
      // text — UI · Code · Kicker) uses 1.0×size (its "paragraph" is its own height); a PROSE voice breathes
      // at its reading factor (display/heading ~0.7, body 0.75, and a ui-font prose voice — Caption/Legal —
      // falls back to 0.75). Indent is a constant 0 (schema parity).
      paragraphSpacing: Math.round(size * (p.box ? 1 : (PARA_PROSE[p.role] ?? 0.75))),
      paragraphIndent: 0,
      // single-line height (= size, leading 1.0) — the CONTROL-text intent, distinct from the
      // multi-line lineHeight above. Emitted only for the BOX voices (UI · Code · Kicker), where text
      // sits in a box and the box owns the rhythm — NOT for the ui-FONT prose voices (Caption · Legal).
      ...(p.box ? { singleLineHeight: size } : {}),
    };
  }
  return out;
}

// typeScale — the resolved scale for a config { treatment, bodyBase, modeFactor?, overrides? }. `bodyBase`
// (the Body base size) uniformly scales every category so the whole system grows/shrinks together while
// keeping its ratios. `overrides` (optional) is a flat per-cell size-override map (see buildCategory);
// ABSENT ⇒ identity.
// `modeFactor` (optional, default 1) — the HIERARCHY-AWARE breakpoint compression (Kim's ratified law,
// 2026-07-10): body-class text is frozen across breakpoints while display-class type compresses. The
// factor names the compression at the TOP of the ramp (Tablet 5/6 · Mobile 2/3 canonical — Display 90 →
// 75 → 60); each step's own factor interpolates in LOG-size space from ×1.0 at bodyBase to ×modeFactor at
// the base ramp's largest size, so Body/Label/UI move ±0px, headings compress partially, Display fully.
// modeFactor = 1 (or absent) ⇒ byte-identical scale (the identity gate).
export function typeScale(config = {}) {
  const t = TYPE_TREATMENTS.find((x) => x.id === config.treatment) || TYPE_TREATMENTS[0];
  const bodyBase = Number(config.bodyBase) || t.categories.Body.base;
  const factor = bodyBase / t.categories.Body.base;
  const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : null;
  const voices = config.voices && typeof config.voices === "object" ? config.voices : null; // per-voice shaping overrides
  const mfRaw = Number(config.modeFactor);
  const mf = Number.isFinite(mfRaw) && mfRaw > 0 && mfRaw !== 1 ? mfRaw : 1;
  let compress = null;
  if (mf !== 1) {
    // the base ramp's largest raw size (uncompressed, treatment ratios) anchors the curve's top end; a
    // per-voice ratio override that exceeds it clamps to the full factor (t ≤ 1), never over-compresses.
    let sMax = bodyBase;
    for (const p of Object.values(t.categories)) for (const [, n] of p.steps) sMax = Math.max(sMax, p.base * factor * p.ratio ** n);
    const logSpan = Math.log(Math.max(sMax, bodyBase * 1.01) / bodyBase);
    compress = (S) => {
      if (S <= bodyBase) return S; // body size and below: frozen
      const tt = Math.min(1, Math.log(S / bodyBase) / logSpan);
      return S * (1 - (1 - mf) * tt);
    };
  }
  const categories = {};
  for (const [name, p] of Object.entries(t.categories)) categories[name] = buildCategory(name, p, factor, overrides, voices ? voices[name] : null, compress);
  // fonts: the treatment's families, with optional per-role CUSTOM overrides (config.fonts). A custom family
  // exports as-is + renders if installed/bundled; the specimen falls back to a generic otherwise.
  const fonts = { ...t.fonts };
  if (config.fonts && typeof config.fonts === "object") {
    for (const role of Object.keys(fonts)) { const f = config.fonts[role]; if (typeof f === "string" && f.trim()) fonts[role] = f.trim(); }
  }
  // per-voice weight STYLE NAMES (config.voices[v].styleName) — the Figma-facing style string for
  // NON-VARIABLE families ("Condensed Black Italic"), where a numeric weight can't name the face.
  // Identity-gated: no names ⇒ no styleNames key on the scale, and the primitives emitter skips them.
  const styleNames = {};
  if (voices) for (const [name, v] of Object.entries(voices)) {
    if (t.categories[name] && v && typeof v.styleName === "string" && v.styleName.trim()) styleNames[name] = v.styleName.trim();
  }
  // per-voice SIBLING WEIGHTS (config.voices[v].weights) — named weight variants AROUND the voice's core
  // weight ([{name:"Bold", weight:700}, …]; the core itself is never in the list). They ship as per-voice
  // weight tokens (CSS custom props, DTCG fontWeight group, Figma weight/… primitives) and drive the
  // Figma text-style variants (`Display/xl/Bold`). Validation: finite 1..1000 weight + non-empty name;
  // the kebab slug is the token key (duplicate slugs collapse, first wins). Identity-gated: no valid
  // entries ⇒ no `weights` key on the scale and every emitter is byte-identical.
  const weights = {};
  if (voices) for (const [name, v] of Object.entries(voices)) {
    if (!t.categories[name] || !v || !Array.isArray(v.weights)) continue;
    const list = [], seen = new Set();
    for (const e of v.weights) {
      if (!e || typeof e !== "object") continue;
      const w = Math.round(Number(e.weight));
      const nm = typeof e.name === "string" ? e.name.trim() : "";
      if (!Number.isFinite(w) || w < 1 || w > 1000 || !nm) continue;
      const slug = kebab(nm);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      list.push({ name: nm, slug, weight: w });
    }
    if (list.length) weights[name] = list;
  }
  return { treatment: t.id, label: t.label, fonts, roleOf: Object.fromEntries(Object.entries(t.categories).map(([k, v]) => [k, v.role])), categories, ...(Object.keys(styleNames).length ? { styleNames } : {}), ...(Object.keys(weights).length ? { weights } : {}) };
}

// ── sibling-weight defaults ────────────────────────────────────────────────────────────────────
// The canonical 9-stop weight ladder with its semantic names — the vocabulary the sibling-weight
// UX snaps to and the default names the suggestions carry.
export const WEIGHT_LADDER = [100, 200, 300, 400, 500, 600, 700, 800, 900];
export const WEIGHT_NAMES = { 100: "Thin", 200: "Extra-light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semi-bold", 700: "Bold", 800: "Extra-bold", 900: "Black" };

// siblingWeightDefaults(core) — the SUGGESTED sibling set around a voice's core weight, from the
// ladder (never the core itself). Applied once when the user opts a voice in; after that the list
// is user-owned (add/remove/rename) and never silently regenerated. The shape:
//   heavy cores (≥800, e.g. Black 900) → two below:      900 → Bold 700 · Medium 500
//   light-to-regular cores (≤400)      → one below + two above:  400 → Light 300 · Medium 500 · Semi-bold 600
//   mid cores (500–700)                → one below + one above (±200, clamped): 600 → Regular 400 · Extra-bold 800
export function siblingWeightDefaults(core) {
  const c = Number(core);
  if (!Number.isFinite(c)) return [];
  const snap = WEIGHT_LADDER.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
  let picks;
  if (snap >= 800) picks = [snap - 200, snap - 400];
  else if (snap <= 400) picks = [snap - 100, snap + 100, snap + 200];
  else picks = [snap - 200, snap + 200];
  return picks
    .filter((w) => w >= 100 && w <= 900 && w !== snap)
    .map((w) => ({ name: WEIGHT_NAMES[w], weight: w }));
}

// ── emitters ───────────────────────────────────────────────────────────────────────────────────
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// typeTokensCSS — CSS custom properties (font families + per-step size/line/tracking/weight) plus a
// utility class per step. Drop-in: `class="type-display-xl"`.
// the per-step `--type-*` custom-property lines for a scale (no :root wrapper) — shared by the base export
// and the per-breakpoint @media overrides, since bodyBase scales these and only these.
// dimUnit(px, unit) — format a px dimension in the chosen CSS export unit. rem/em = px ÷ 16 (root-relative),
// stripped of trailing zeros; the nice-number quantization keeps these CLEAN (16px→1rem, 24px→1.5rem,
// 2px→0.125rem, 11px→0.6875rem). Absent / "px" ⇒ `${px}px` (identity — the pre-setting default).
export function dimUnit(px, unit) {
  return unit === "rem" || unit === "em" ? `${parseFloat((px / 16).toFixed(4))}${unit}` : `${px}px`;
}

// Leading (line-height) + tracking (letter-spacing) are ALWAYS relative in EVERY export — never px. A px
// leading breaks the moment the root size changes; a px tracking breaks the moment the font size changes.
// So they ride as ratios of the step's own font size, in each platform's native relative unit:
//   relLine   — line ÷ size, a UNITLESS factor (the CSS `line-height`/DTCG `lineHeight` idiom)
//   relTrackEm— tracking ÷ size as `em` (CSS `letter-spacing` / DTCG — relative to font size)
//   relPct    — the same ratio as a Figma % (Figma line-height/letter-spacing are %-native, not unitless)
// size, paragraphSpacing, paragraphIndent stay ABSOLUTE dims (dimUnit) — they are box metrics, not leading.
// size 0 ⇒ 0 (defensive; a real scale never yields it).
const relLine = (px, size) => (size > 0 ? round(px / size, 3) : 0);
const relTrackEm = (px, size) => `${size > 0 ? round(px / size, 4) : 0}em`;
const relPct = (px, size) => (size > 0 ? round((px / size) * 100, 2) : 0);

// `pfx` — the type-scale custom-property prefix (the `type` in `--type-*` and the `.type-*` class).
// Default "type" (historical); a Material scheme sets "md-sys-typescale". Font families stay `--font-*`
// (the typeface-primitive layer — the M3-ref analog — shared regardless of the scale prefix).
function typeVarLines(scale, indent = "  ", unit = "px", pfx = "type") {
  const out = [];
  for (const [cName, steps] of Object.entries(scale.categories)) {
    for (const [sName, s] of Object.entries(steps)) {
      const p = `--${pfx}-${kebab(cName)}-${kebab(sName)}`;
      const single = s.singleLineHeight != null ? ` ${p}-line-single: ${relLine(s.singleLineHeight, s.size)};` : "";
      out.push(`${indent}${p}-size: ${dimUnit(s.size, unit)}; ${p}-line: ${relLine(s.lineHeight, s.size)}; ${p}-tracking: ${relTrackEm(s.letterSpacing, s.size)}; ${p}-weight: ${s.weight}; ${p}-para: ${dimUnit(s.paragraphSpacing, unit)};${single}`);
    }
  }
  return out.join("\n");
}

export function typeTokensCSS(scale, { unit = "px", prefix = "type" } = {}) {
  const lines = [":root {"];
  for (const [role, family] of Object.entries(scale.fonts)) lines.push(`  --font-${role}: '${family}';`); // quote — names with digits (e.g. "Source Serif 4") are invalid unquoted in strict parsers (Safari)
  // per-voice SIBLING WEIGHTS — one custom prop per named variant (`--type-display-weight-bold: 700`),
  // per VOICE (never duplicated per step). Absent when the kit defines none (identity gate).
  if (scale.weights) for (const [cName, list] of Object.entries(scale.weights)) {
    const c = kebab(cName);
    for (const wv of list) lines.push(`  --${prefix}-${c}-weight-${wv.slug}: ${wv.weight};`);
  }
  lines.push(typeVarLines(scale, "  ", unit, prefix));
  lines.push("}");
  for (const [cName, steps] of Object.entries(scale.categories)) {
    const role = scale.roleOf[cName] || "body";
    for (const [sName, s] of Object.entries(steps)) {
      const c = kebab(cName), sk = kebab(sName);
      const tt = s.textTransform && s.textTransform !== "none" ? ` text-transform: ${s.textTransform};` : "";
      lines.push(`.${prefix}-${c}-${sk} { font-family: var(--font-${role}); font-size: var(--${prefix}-${c}-${sk}-size); line-height: var(--${prefix}-${c}-${sk}-line); letter-spacing: var(--${prefix}-${c}-${sk}-tracking); font-weight: var(--${prefix}-${c}-${sk}-weight);${tt} }`);
    }
  }
  return lines.join("\n") + "\n";
}

// typeTokensResponsiveCSS — the base CSS plus a `@media (min-width: …)` block per breakpoint mode that
// re-declares the per-step size vars at that mode's scale (the utilities + font vars are unchanged, so they
// auto-track). `modes` = [{ name, minWidth, scale }]; a mode without a positive minWidth is skipped.
// Blocks emit ASCENDING by minWidth regardless of array order — mobile-first CSS needs the widest block
// last to win the cascade, and the doc may store modes desktop-first (the standard set's display order).
export function typeTokensResponsiveCSS(scale, modes = [], { unit = "px", prefix = "type" } = {}) {
  let css = typeTokensCSS(scale, { unit, prefix });
  const ordered = [...(modes || [])].sort((a, b) => (Number(a.minWidth) || 0) - (Number(b.minWidth) || 0));
  for (const m of ordered) {
    if (!(Number(m.minWidth) > 0) || !m.scale) continue;
    css += `\n/* ${m.name || "Mode"} */\n@media (min-width: ${Math.round(m.minWidth)}px) {\n  :root {\n${typeVarLines(m.scale, "    ", unit, prefix)}\n  }\n}\n`;
  }
  return css;
}

// typeTokensDTCG — the type scale as DTCG tokens: a fontFamily group + a typography group per
// category/step (composite `typography` $type, the W3C-DTCG shape).
export function typeTokensDTCG(scale, { unit = "px" } = {}) {
  const fontFamily = {};
  for (const [role, family] of Object.entries(scale.fonts)) fontFamily[role] = { $type: "fontFamily", $value: family };
  const typography = {};
  for (const [cName, steps] of Object.entries(scale.categories)) {
    const role = scale.roleOf[cName] || "body";
    typography[cName] = {};
    for (const [sName, s] of Object.entries(steps)) {
      typography[cName][sName] = {
        $type: "typography",
        $value: { fontFamily: scale.fonts[role], fontSize: dimUnit(s.size, unit), lineHeight: relLine(s.lineHeight, s.size), letterSpacing: relTrackEm(s.letterSpacing, s.size), fontWeight: s.weight, textCase: s.textTransform || "none", paragraphSpacing: dimUnit(s.paragraphSpacing, unit), paragraphIndent: dimUnit(s.paragraphIndent, unit), ...(s.singleLineHeight != null ? { singleLineHeight: relLine(s.singleLineHeight, s.size) } : {}) },
      };
    }
  }
  // per-voice SIBLING WEIGHTS — a `weights` group of DTCG fontWeight tokens per voice
  // ({ Display: { Bold: { $type:"fontWeight", $value:700 } } }). Absent when none (identity gate).
  const weights = {};
  if (scale.weights) for (const [cName, list] of Object.entries(scale.weights)) {
    weights[cName] = {};
    for (const wv of list) weights[cName][wv.name] = { $type: "fontWeight", $value: wv.weight };
  }
  return { fontFamily, typography, ...(Object.keys(weights).length ? { weights } : {}) };
}

// typeTokensFigmaModes — the type scale as a single Figma-variable COLLECTION ("Typography") with one MODE
// per breakpoint (a "Base" mode + one per supplied breakpoint mode), mirroring the UI3 color shape
// (`exportUI3`): `{ collections: { "Typography": { modes:[…], variables: { "<voice>/<step>/<prop>": {
// type:"FLOAT", values:{ Base:…, <modeName>:… } } } } }`. So a Figma user imports ONE breakpoint-moded
// collection instead of N separate per-width files. Every voice×step emits four FLOAT variables — size,
// lineHeight, letterSpacing, weight (weight too, since Figma variables are numbers). size/weight are raw;
// lineHeight + letterSpacing ride as a % of font size (relPct) — leading/tracking are ALWAYS relative,
// never px, and % is Figma's native relative unit. `modes` = the SAME
// shape `_typeModeScales()` returns: [{ name, scale }] (minWidth, if present, is ignored — Figma modes are
// named, not media-queried). IDENTITY: `modes = []` ⇒ a single base mode whose values equal the base.
// `opts.baseName` (default "Base") NAMES the synthetic base layer (e.g. "Mobile" — the standard set);
// `opts.baseLast` (default false) places it AFTER the breakpoints: Figma's default mode is the FIRST mode,
// so a desktop-first collection stores modes [Desktop, Tablet] and emits [Desktop, Tablet, Mobile].
const TYPE_FIGMA_PROPS = ["size", "lineHeight", "letterSpacing", "weight", "paragraphSpacing"];
// disambiguateModeNames — Figma requires DISTINCT mode names per collection. The synthetic base layer
// (named `baseName`, default "Base") is reserved, so a breakpoint sharing its name (or any duplicate of
// another breakpoint) is renamed ("Mobile 2", …) before it would silently shadow another mode / emit
// duplicate mode names (which Figma rejects on import).
export function disambiguateModeNames(names, baseName = "Base") {
  const used = new Set([String(baseName).toLowerCase()]); // reserve the base mode (compared case-insensitively)
  return (names || []).map((raw) => {
    const stem = String(raw);
    let n = stem, i = 1;
    while (used.has(n.toLowerCase())) { i += 1; n = `${stem} ${i}`; }
    used.add(n.toLowerCase());
    return n;
  });
}
export function typeTokensFigmaModes(baseScale, modes = [], { baseName = "Base", baseLast = false } = {}) {
  const list = (Array.isArray(modes) ? modes : []).filter((m) => m && m.name && m.scale && m.scale.categories);
  const names = disambiguateModeNames(list.map((m) => m.name), baseName);
  const modeNames = baseLast ? [...names, baseName] : [baseName, ...names];
  const variables = {};
  // for each mode (the base layer + each breakpoint), write every voice×step×prop value under that mode key.
  const layer = (scale, mode) => {
    for (const [cName, steps] of Object.entries(scale.categories)) {
      for (const [sName, s] of Object.entries(steps)) {
        for (const prop of TYPE_FIGMA_PROPS) {
          const key = `${cName}/${sName}/${prop}`;
          if (!variables[key]) variables[key] = { type: "FLOAT", values: {} };
          // leading + tracking ride as a % of font size (Figma's native relative unit); size/weight/para stay raw.
          variables[key].values[mode] = prop === "lineHeight" || prop === "letterSpacing" ? relPct(s[prop], s.size) : s[prop];
        }
        // singleLineHeight exists only on the BOX voices (UI · Code · Kicker) — emit as a % of size too.
        if (s.singleLineHeight != null) {
          const key = `${cName}/${sName}/singleLineHeight`;
          if (!variables[key]) variables[key] = { type: "FLOAT", values: {} };
          variables[key].values[mode] = relPct(s.singleLineHeight, s.size);
        }
      }
    }
  };
  layer(baseScale, baseName);
  list.forEach((m, i) => layer(m.scale, names[i]));
  return {
    $schema: "figma-ui3-variables.float.schema.v1",
    collections: { "Typography": { modes: modeNames, variables } },
  };
}

// typeTokensFigmaPrimitives — the "Font Primitives" COMPANION collection to typeTokensFigmaModes: the
// distinct font families deduped into `family/<role>` STRING primitives, a `font/<voice>` ALIAS per
// voice pointing at its family primitive (edit the primitive; every voice follows), and a
// `weight/<voice>` FLOAT primitive (the voice's uniform weight — one edit point per voice). Alias
// entries carry `{ type:"ALIAS", target:"<variable key>" }` INSTEAD of `values` — a consumer resolves
// them within the same collection. Single "Value" mode (families/weights don't vary by breakpoint;
// breakpoints live in the Typography collection). This file is an IMPORT artifact only — the in-Figma
// apply path (`_figmaFloatPlans`) never consumes it, so the plugin executor stays float-only.
export function typeTokensFigmaPrimitives(scale) {
  const variables = {};
  const famKey = {}; // family string → the primitive key that owns it (first role wins = dedupe)
  for (const [role, fam] of Object.entries(scale.fonts || {})) {
    if (!fam || famKey[fam]) continue;
    famKey[fam] = `family/${role}`;
    variables[famKey[fam]] = { type: "STRING", values: { Value: fam } };
  }
  for (const [voice, steps] of Object.entries(scale.categories || {})) {
    const fam = (scale.fonts || {})[(scale.roleOf || {})[voice]];
    if (fam && famKey[fam]) variables[`font/${voice}`] = { type: "ALIAS", target: famKey[fam] };
    const first = Object.values(steps)[0];
    if (first && Number.isFinite(first.weight)) variables[`weight/${voice}`] = { type: "FLOAT", values: { Value: first.weight } };
    // the weight STYLE NAME (non-variable families) — a STRING primitive beside the numeric weight,
    // present only when the kit names one (scale.styleNames via config.voices[v].styleName).
    const sn = scale.styleNames && scale.styleNames[voice];
    if (sn) variables[`weight-style/${voice}`] = { type: "STRING", values: { Value: sn } };
    // SIBLING WEIGHTS — one FLOAT + one STRING primitive per named variant (`weight/Display/bold`,
    // `weight-style/Display/bold`); the core keeps the un-suffixed names above (backward compatible).
    // These are the binding targets for the sibling text styles (`Display/xl/Bold`).
    const sibs = scale.weights && scale.weights[voice];
    if (sibs) for (const wv of sibs) {
      variables[`weight/${voice}/${wv.slug}`] = { type: "FLOAT", values: { Value: wv.weight } };
      variables[`weight-style/${voice}/${wv.slug}`] = { type: "STRING", values: { Value: wv.name } };
    }
  }
  return {
    $schema: "figma-ui3-variables.primitives.schema.v1",
    collections: { "Font Primitives": { modes: ["Value"], variables } },
  };
}
