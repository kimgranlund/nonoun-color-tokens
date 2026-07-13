// type.mjs — the perceptual TYPOGRAPHY engine: the type analog of the color engine. A few parameters
// → a systematic type scale → DTCG / CSS tokens. Pure, no DOM. Eleven named "voices" — Display ·
// Headline · Sub-heading · Title · Sub-title · Lead · Body · Code · Label · Kicker · Tiny — each a
// 3-step SM/MD/LG ramp whose every step carries size, line-height, letter-spacing, weight, and
// paragraph spacing. (The DTCG shape follows the Figma-variable export at
// docs/reference/typography/typography.tokens.json, a frozen snapshot kept for reference.)
//
// 2026-07-13 — SIZE IS NOW A FIXED, HAND-AUTHORED TABLE, not a modular scale. Previously every voice
// derived its sizes from base·ratio^n (a treatment's own base+ratio gave it a distinct scale feel).
// Now each voice's SM/MD/LG are literal px values (SIZES below), shared identically across all 5
// treatments — matching how Google's own Material 3 scale works (one fixed scale; theme varies
// styling, not the numbers). Treatments now differ ONLY in font/weight/tracking/leading/case, never
// size. `bodyBase` still scales the WHOLE fixed table proportionally (factor = bodyBase/15); the
// per-cell `overrides` escape hatch (see buildCategory) is still how a user moves an individual cell
// off the fixed default — untouched by this change.
//
// The system relationships (see docs/reference/typography/README.md):
//   size          = FIXED_SIZE(voice, step) × factor     (factor = bodyBase/15; see typeScale)
//   lineHeight     = round(size · leading)     (per-role leading; single-line = size)
//   letterSpacing = round(size · trackingEm)  (optical: negative tightens big display, positive loosens UI)
//   weight        = the role's weight
//   paragraphSpacing = size × (box ? 1.0 : PARA_PROSE[role]≈0.7–0.75) (box = label height; prose = reading), indent = 0
//   singleLineHeight = size (BOX voices only — the control-text intent next to the multi-line lineHeight)

const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

// FIXED SIZE TABLE — [SM, MD, LG] literal px, shared across all 5 treatments. Code aliases Body's own
// triplet (mono role, same numbers); Kicker aliases Label's (mono role, same numbers) — both are the
// SAME voice-scale, dressed in the mono font, not a distinct size register of their own.
const SIZES = {
  Display: [72, 96, 120],
  Headline: [32, 40, 48],
  "Sub-heading": [28, 34, 40],
  Title: [24, 32, 40],
  "Sub-title": [18, 24, 32],
  Lead: [20, 24, 28],
  Body: [14, 15, 16],
  Label: [12, 13, 14],
  Tiny: [10, 11, 12],
};
const RANKS = ["SM", "MD", "LG"];
const stepsFor = (sizeKey) => RANKS.map((r, i) => [r, SIZES[sizeKey][i]]);

// A "treatment" seeds the CHARACTER params, exactly as the color "Color Categories" presets seed
// palette params. Each category: { role, base, leading, weight, trackingEm, steps, transform, box }.
// `base` = the voice's MD-step literal (kept for typeScale's bodyBase→factor math, since Body's base
// must still equal 15 for `factor = bodyBase/15` to mean what it says). Fonts are swappable; the
// WEIGHT/TRACKING/LEADING/CASE relationships are the product now, not the scale. Free families only.
// `box` — the presentation FLOW, decoupled from the font role: box voices are CONTROL/label text (they
// emit a single-line height and use label-height paragraph spacing); prose voices wrap (no single-line
// height, reading paragraph spacing). It DEFAULTS from the role (ui/mono ⇒ box), overridable — Tiny
// rides the ui FONT but is prose (box:false); Sub-title rides mono but is prose too (a small heading,
// not a control label).
const cat = (role, sizeKey, leading, weight, trackingEm, transform = "none", box = role === "ui" || role === "mono") => ({ role, base: SIZES[sizeKey][1], leading, weight, trackingEm, steps: stepsFor(sizeKey), transform, box });

// make11 — the ELEVEN named type VOICES (docs/reference/typography): Display · Headline · Sub-heading ·
// Title · Sub-title · Lead · Body · Code · Label · Kicker · Tiny. A voice carries CHARACTER (weight,
// tracking, leading, case, font cut) that travels with it across every step; the SIZE is now a fixed
// literal per voice+step (SIZES above), never derived. Sub-heading is a bold, all-caps CONTEXT heading
// (a section label like "LATEST STORIES" sitting above a list/grid — not a subordinate H2); Title is a
// smaller Headline; Sub-title is a smaller sub-heading in an alternate (mono-by-default) typeface; Lead
// is a larger body intro (a former "Quote" folds in here — both are large, single-emphasis body-
// adjacent text); Code and Kicker ride the MONO role at Body's and Label's own sizes respectively
// (former "Legal" folds into Body; former "Caption" folds into Tiny).
//
// CASE is a per-treatment decision, not a blanket rule. The Display role defaults to TITLE/SENTENCE case
// (o.dTransform) — only the Brutalist/Statement treatment opts its Display into ALL-CAPS. The one
// genuine "caps role" left is Sub-heading; it stays uppercase and tracks POSITIVE so small caps open up
// (Kicker, now pegged to Label's smaller size, keeps the same uppercase/positive-tracking character).
// Display tracks NEGATIVE — big type tightens. LEADINGS are a system constant, uniform across
// treatments: display 0.8 (< 1 — large type sets tight), heading-family (Headline/Sub-heading/Title)
// 1.125, prose (Body/Lead/Sub-title/Tiny) 1.4–1.5, single-line control text (Label/Kicker/Code) 1.0.
// Treatments express voice through font, weight, tracking, and case — NOT leading, which is fixed to
// the intent (retune a per-voice `*Lead` knob only for a deliberate character exception).
function make11(o = {}) {
  return {
    "Display": cat("display", "Display", o.dLead ?? 0.8, o.dWeight ?? 700, o.dTrack ?? -0.02, o.dTransform ?? "none"),
    "Headline": cat("heading", "Headline", o.hLead ?? 1.125, o.hWeight ?? 700, o.hTrack ?? -0.005, "none"),
    "Sub-heading": cat("heading", "Sub-heading", o.shLead ?? 1.125, o.shWeight ?? 600, o.shTrack ?? 0.1, "uppercase"),
    "Title": cat("heading", "Title", o.tLead ?? 1.125, o.tWeight ?? 650, o.tTrack ?? -0.005, "none"),
    "Sub-title": cat("mono", "Sub-title", o.stLead ?? 1.3, o.stWeight ?? 500, o.stTrack ?? 0.02, "none", false), // mono-by-default but PROSE (a small heading, not a control label)
    "Lead": cat("body", "Lead", o.leadLead ?? 1.4, o.leadWeight ?? 400, o.leadTrack ?? -0.005, "none"),
    "Body": cat("body", "Body", o.bLead ?? 1.5, o.bWeight ?? 440, 0, "none"),
    "Code": cat("mono", "Body", o.codeLead ?? 1.5, o.codeWeight ?? 460, o.codeTrack ?? 0, "none"),
    "Label": cat("ui", "Label", o.labelLead ?? 1.4, o.labelWeight ?? 480, o.labelTrack ?? 0.006, "none"),
    "Kicker": cat("mono", "Label", o.kickLead ?? 1.4, o.kickWeight ?? 600, o.kickTrack ?? 0.16, "uppercase"),
    "Tiny": cat("ui", "Tiny", o.tinyLead ?? 1.5, o.tinyWeight ?? 440, 0, "none", false), // ui FONT, prose flow (former Caption's job)
  };
}

// Each treatment expresses a distinct VOICE through case, weight contrast, and tracking — not scale
// (fixed/shared, 2026-07-13) or a font swap alone. Per the directive + ui-compose-typography: Display
// is title/sentence case everywhere except Brutalist (the one earned ALL-CAPS), with bespoke specimen
// copy living in the UI.
export const TYPE_TREATMENTS = [
  // Product — calm geometric sans, gentle hierarchy, title-case display. The everyday system voice.
  { id: "product", label: "Product / Lifestyle", note: "Neutral geometric sans, title-case display — screen-native, calm, versatile.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make11({ dWeight: 700, dTrack: -0.02, hWeight: 620, labelLead: 1.35, kickTrack: 0.14 }) },
  // Luxury — high-contrast serif set LIGHT and large, airy prose, wide-tracked labels. Restraint, not shout.
  { id: "luxury", label: "Luxury / Premium", note: "High-contrast serif display set light and large, airy sans body, wide-tracked labels — restraint over shout.",
    fonts: { display: "Source Serif 4", heading: "Source Serif 4", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make11({ dWeight: 400, dTrack: -0.005, hWeight: 500, hTrack: 0, shWeight: 500, shTrack: 0.18, bWeight: 400, labelTrack: 0.04, labelLead: 1.45, kickWeight: 500, kickTrack: 0.26, leadWeight: 300 }) },
  // Editorial — serif headlines in title case, tight sans subheads, sans body tuned for long-form reading.
  { id: "editorial", label: "Editorial / Magazine", note: "Serif headlines in title case, tight sans subheads, sans body for long-form reading, mono metadata.",
    fonts: { display: "Source Serif 4", heading: "Inter Tight", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: make11({ dWeight: 650, dTrack: -0.015, hWeight: 750, hTrack: -0.01, kickTrack: 0.2, leadLead: 1.45 }) },
  // Technical — mono-forward, tabular, dense, tight leading. Display reads as data, not a slogan.
  { id: "technical", label: "Technical / Data", note: "Mono-forward — tabular figures, dense, tight leading, restrained scale. Display reads as data, not slogan.",
    fonts: { display: "Inter", heading: "Inter", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: make11({ dWeight: 650, dTrack: -0.01, hWeight: 600, shTrack: 0.08, labelTrack: 0, labelLead: 1.35 }) },
  // Brutalist — one heavy grotesque, the earned ALL-CAPS display, tight tracking, dramatic size jumps.
  { id: "statement", label: "Brutalist / Statement", note: "One heavy grotesque, ALL-CAPS display, tight tracking, dramatic size jumps — the loud voice, used on purpose.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: make11({ dWeight: 900, dTrack: -0.04, dTransform: "uppercase", hWeight: 800, hTrack: -0.02, shWeight: 700, shTrack: 0.12, bWeight: 500, labelWeight: 550, labelTrack: 0.02, kickWeight: 700, kickTrack: 0.12 }) },
];

export const DEFAULT_TYPE = { treatment: "product", bodyBase: 15 };
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
// on a non-reading role (Tiny/Sub-title ride the ui/mono FONT but are prose) falls back to 0.75.
const PARA_PROSE = { display: 0.7, heading: 0.7, body: 0.75 };

function buildCategory(name, p, factor, overrides, vp, compress) {
  // per-VOICE shaping overrides (vp): weight · leading · tracking(em) REPLACE the treatment's for the
  // WHOLE voice (the "select a voice, retune it" lever — like a per-palette Hue). Absent ⇒ the treatment
  // values, so a voice with no override is byte-identical (the identity gate). The per-cell size `overrides`
  // are a separate, finer layer that still moves an individual step's size.
  const weight = vp && Number.isFinite(vp.weight) ? vp.weight : p.weight;
  const leading = vp && Number.isFinite(vp.leading) ? vp.leading : p.leading;
  const trackingEm = vp && Number.isFinite(vp.tracking) ? vp.tracking : p.trackingEm;
  const out = {};
  let prevSize = 0; // running max, for the monotonic bump (quantization can collide adjacent steps)
  for (const [step, n] of p.steps) {
    // `n` is now the voice's FIXED literal size at this step (SIZES table) — no longer an exponent.
    // breakpoint compression (modeFactor) applies to the raw scaled size before rounding/quantization —
    // it IS a size change (line-height, tracking, paragraph rhythm all re-derive from the compressed size).
    const rawScaled = compress ? compress(n * factor) : n * factor;
    const derived = Math.max(8, Math.round(rawScaled)); // the scaled fixed size — letterSpacing STAYS on this
    const ov = overrides && overrides[name + "|" + step];
    const overridden = typeof ov === "number" && Number.isFinite(ov) && ov > 0;
    // The DERIVED nice size drives the monotonic ramp (so a per-cell override never nudges its neighbours —
    // the bump rides the underlying ladder, not the override). SIZE snaps the ROUNDED scaled px to the ladder
    // (smoother than snapping the raw float at .5 boundaries); an override is exact. UNSCALED (factor 1, no
    // breakpoint compression) skips the snap entirely — `n` is already the hand-authored literal (SIZES),
    // and niceSize's coarser-as-size-grows bucketing would otherwise re-round an already-nice number to a
    // DIFFERENT nice number (120 → 128, 34 → 36) for no reason — only genuinely SCALED sizes need re-snapping.
    let nice = factor === 1 && !compress ? derived : niceSize(derived);
    if (nice <= prevSize) nice = nextNice(prevSize);
    prevSize = nice;
    const size = overridden ? Math.round(ov) : nice;
    out[step] = {
      size,
      lineHeight: Math.round(size * leading), // line-height TRACKS the override (re-derives from the resolved size)
      letterSpacing: round(derived * trackingEm, 2), // tracking STAYS on the scaled fixed size (ratified "size lever; tracking/weight unchanged")
      weight,
      textTransform: p.transform || "none",
      // paragraph rhythm tracks the resolved size, keyed on FLOW not just role: a BOX voice (control/label
      // text — Label · Kicker · Code) uses 1.0×size (its "paragraph" is its own height); a PROSE voice
      // breathes at its reading factor (display/heading ~0.7, body 0.75, and a ui/mono-font prose voice —
      // Tiny/Sub-title — falls back to 0.75). Indent is a constant 0 (schema parity).
      paragraphSpacing: Math.round(size * (p.box ? 1 : (PARA_PROSE[p.role] ?? 0.75))),
      paragraphIndent: 0,
      // single-line height (= size, leading 1.0) — the CONTROL-text intent, distinct from the
      // multi-line lineHeight above. Emitted only for the BOX voices (Label · Kicker · Code), where text
      // sits in a box and the box owns the rhythm — NOT for the prose voices (Tiny · Sub-title).
      ...(p.box ? { singleLineHeight: size } : {}),
    };
  }
  return out;
}

// typeScale — the resolved scale for a config { treatment, bodyBase, modeFactor?, overrides? }. `bodyBase`
// (the Body base size) uniformly scales the WHOLE fixed size table so the system grows/shrinks together
// (factor = bodyBase/15 — Body's MD literal). `overrides` (optional) is a flat per-cell size-override map
// (see buildCategory); ABSENT ⇒ identity.
// `modeFactor` (optional, default 1) — the HIERARCHY-AWARE breakpoint compression (Kim's ratified law,
// 2026-07-10): body-class text is frozen across breakpoints while display-class type compresses. The
// factor names the compression at the TOP of the ramp (Tablet 5/6 · Mobile 2/3 canonical — Display 90 →
// 75 → 60); each step's own factor interpolates in LOG-size space from ×1.0 at bodyBase to ×modeFactor at
// the ramp's largest fixed size, so Body/Label/Kicker move ±0px, headings compress partially, Display fully.
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
    // the fixed table's largest literal size anchors the curve's top end (always Display/LG today, but
    // computed generically so a future re-authoring of SIZES never has to touch this).
    let sMax = bodyBase;
    for (const p of Object.values(t.categories)) for (const [, n] of p.steps) sMax = Math.max(sMax, n * factor);
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
  // per-voice FONT overrides (config.voices[v].font) — the escape hatch off the 5 shared ROLES: any of the
  // 11 voices may carry its own family instead of riding its role's default (TKT-0002 — e.g. Sub-heading no
  // longer forced to share Heading's font). Identity-gated like styleNames/weights: absent ⇒ no voiceFonts
  // key, and every emitter below stays byte-identical. Resolve via `resolvedFontFor`, never read directly.
  const voiceFonts = {};
  if (voices) for (const [name, v] of Object.entries(voices)) {
    if (t.categories[name] && v && typeof v.font === "string" && v.font.trim()) voiceFonts[name] = v.font.trim();
  }
  return { treatment: t.id, label: t.label, fonts, roleOf: Object.fromEntries(Object.entries(t.categories).map(([k, v]) => [k, v.role])), categories, ...(Object.keys(styleNames).length ? { styleNames } : {}), ...(Object.keys(weights).length ? { weights } : {}), ...(Object.keys(voiceFonts).length ? { voiceFonts } : {}) };
}

// resolvedFontFor(scale, voice) — the ONE resolution point for a voice's actual family: its own per-voice
// override (config.voices[v].font, scale.voiceFonts) if set, else its role's shared default
// (scale.fonts[scale.roleOf[voice]]). Every consumer that needs a voice's real font (emitters, the Figma
// style planner, the UI specimen) calls this instead of reading scale.fonts[role] directly, so an override
// can never be silently bypassed by a new call site.
export function resolvedFontFor(scale, voice) {
  return (scale.voiceFonts && scale.voiceFonts[voice]) || scale.fonts[scale.roleOf[voice]];
}

// ── sibling-weight defaults ────────────────────────────────────────────────────────────────────
// The canonical 9-stop weight ladder with its semantic names — the vocabulary the sibling-weight
// UX snaps to and the default names the suggestions carry.
export const WEIGHT_LADDER = [100, 200, 300, 400, 500, 600, 700, 800, 900];
export const WEIGHT_NAMES = { 100: "Thin", 200: "Extra-light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semi-bold", 700: "Bold", 800: "Extra-bold", 900: "Black" };

// siblingWeightDefaults(core) — the SUGGESTED sibling set around a voice's core weight: the two
// LADDER-ADJACENT stops (immediate neighbors, never a skipped step), stepping from the core TOWARD
// the ladder's center — the 400–600 band real UIs actually reach for when they need an emphasis
// variant next to a body/label weight. Below-center cores step up, above-center cores step down; the
// nearer neighbor is listed first, matching how a designer would name them ("Regular → Medium, then
// Semi-bold"). The core itself is never in the list. Applied once when the user opts a voice in;
// after that the list is user-owned (add/remove/rename) and never silently regenerated. The shape:
//   core < 550 (Thin…Medium)  → two ABOVE, nearer first:  400 → Medium 500 · Semi-bold 600
//   core ≥ 550 (Semi-bold…Black) → two BELOW, nearer first: 700 → Semi-bold 600 · Medium 500
export function siblingWeightDefaults(core) {
  const c = Number(core);
  if (!Number.isFinite(c)) return [];
  const snap = WEIGHT_LADDER.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
  const picks = snap < 550 ? [snap + 100, snap + 200] : [snap - 100, snap - 200];
  return picks
    .filter((w) => w >= 100 && w <= 900 && w !== snap)
    .map((w) => ({ name: WEIGHT_NAMES[w], weight: w }));
}

// weightNameFor(weight) — the SAME nearest-ladder-stop snap siblingWeightDefaults uses, exposed
// standalone so a consumer can name the CORE weight itself (siblingWeightDefaults deliberately EXCLUDES
// the core — it only suggests neighbors). Used to give the core an explicit, symmetric weight segment
// alongside its siblings in a Figma text-style path (TKT-0001) — e.g. core weight 620 snaps to 600
// ("Semi-bold" / "semi-bold"). Non-finite ⇒ null (defensive; a real scale never yields it).
export function weightNameFor(weight) {
  const c = Number(weight);
  if (!Number.isFinite(c)) return null;
  const snap = WEIGHT_LADDER.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
  return { weight: snap, name: WEIGHT_NAMES[snap], slug: kebab(WEIGHT_NAMES[snap]) };
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
  // per-voice FONT — one custom prop per VOICE (`--font-voice-sub-heading: '...'`), resolved via
  // resolvedFontFor so every one of the 11 voices is directly addressable by name, not just the ones
  // carrying an explicit override (TKT-0006: matches typeTokensFigmaPrimitives's existing density —
  // an un-overridden voice's variable simply repeats its role's family, same value the utility classes
  // below already apply). Quoted like the role fonts above (same Safari trap).
  for (const voice of Object.keys(scale.categories)) lines.push(`  --font-voice-${kebab(voice)}: '${resolvedFontFor(scale, voice)}';`);
  // per-voice SIBLING WEIGHTS — one custom prop per named variant (`--type-display-weight-bold: 700`),
  // per VOICE (never duplicated per step). Absent when the kit defines none (identity gate).
  if (scale.weights) for (const [cName, list] of Object.entries(scale.weights)) {
    const c = kebab(cName);
    for (const wv of list) lines.push(`  --${prefix}-${c}-weight-${wv.slug}: ${wv.weight};`);
  }
  lines.push(typeVarLines(scale, "  ", unit, prefix));
  lines.push("}");
  for (const [cName, steps] of Object.entries(scale.categories)) {
    // every voice's utility classes bind to its own --font-voice-* prop (now emitted for all 11,
    // not just overridden ones — TKT-0006) — one point of truth per voice, same resolved value
    // either way.
    const fontVar = `--font-voice-${kebab(cName)}`;
    for (const [sName, s] of Object.entries(steps)) {
      const c = kebab(cName), sk = kebab(sName);
      const tt = s.textTransform && s.textTransform !== "none" ? ` text-transform: ${s.textTransform};` : "";
      lines.push(`.${prefix}-${c}-${sk} { font-family: var(${fontVar}); font-size: var(--${prefix}-${c}-${sk}-size); line-height: var(--${prefix}-${c}-${sk}-line); letter-spacing: var(--${prefix}-${c}-${sk}-tracking); font-weight: var(--${prefix}-${c}-${sk}-weight);${tt} }`);
    }
  }
  return lines.join("\n") + "\n";
}

// typeTokensBreakpointCSS — ONE self-contained override file PER breakpoint mode, the SEPARATE-FILE
// alternative to a single @media-embedded stylesheet: `typeTokensCSS(baseScale)` is a complete, valid
// stylesheet on its own (the DESIGNED — Desktop — scale, unconditional `:root`, no media query needed),
// and each entry this returns is an independent bolt-on a consumer may or may not add. Every entry is
// BOUNDED on the ceiling — always `max-width`, so its condition can never leak into a wider mode's band
// — and on the floor too EXCEPT the NARROWEST mode, which stays open-ended below (`max-width` only, so
// the smallest viewports — narrower than any configured mode — still land somewhere instead of falling
// through to the unconditional Desktop values). A consumer can add any subset, in ANY load order (even
// one <link> per file, or all concatenated), and the cascade still resolves correctly; nothing here
// depends on file/rule order. `desktopMinWidth` (default 1280 — this app's own Desktop anchor, the same
// constant `addStandardTypeModes` commits and Figma's default mode uses) bounds the WIDEST mode's
// ceiling, since Desktop itself is the unconditional base and never appears in `modes`. `modes` =
// [{ name, minWidth, scale }] (the same shape typeTokensFigmaModes / the per-breakpoint DTCG files
// take); a mode without a positive minWidth is skipped (preview-only, mirrors the DTCG files). Sorted
// DESCENDING by minWidth regardless of storage order, so a narrower mode's ceiling is always its
// next-wider sibling's floor minus one.
export function typeTokensBreakpointCSS(modes = [], { unit = "px", prefix = "type", desktopMinWidth = 1280 } = {}) {
  const ordered = (modes || []).filter((m) => m && m.scale && Number(m.minWidth) > 0).sort((a, b) => (Number(b.minWidth) || 0) - (Number(a.minWidth) || 0));
  return ordered.map((m, i) => {
    const lower = Math.round(m.minWidth);
    const upper = (i === 0 ? desktopMinWidth : Math.round(ordered[i - 1].minWidth)) - 1;
    const narrowest = i === ordered.length - 1;
    const name = m.name || "Mode";
    const cond = narrowest ? `(max-width: ${upper}px)` : `(min-width: ${lower}px) and (max-width: ${upper}px)`;
    return {
      name, minWidth: lower,
      css: `/* ${name} — ${narrowest ? `≤${upper}` : `${lower}–${upper}`}px */\n@media ${cond} {\n  :root {\n${typeVarLines(m.scale, "    ", unit, prefix)}\n  }\n}\n`,
    };
  });
}

// typeTokensDTCG — the type scale as DTCG tokens: a fontFamily group + a typography group per
// category/step (composite `typography` $type, the W3C-DTCG shape).
export function typeTokensDTCG(scale, { unit = "px" } = {}) {
  // fontFamily is keyed by VOICE (11), not role (5) — TKT-0006: a consumer scanning this group for
  // "every font family this kit actually applies" should see the real per-voice picture (matching
  // the per-step typography tokens below, and typeTokensFigmaPrimitives's existing density), not
  // just the 5 shared defaults. Un-overridden voices repeat their role's family — same value the
  // composite typography tokens below already carry.
  const fontFamily = {};
  for (const voice of Object.keys(scale.categories)) fontFamily[voice] = { $type: "fontFamily", $value: resolvedFontFor(scale, voice) };
  const typography = {};
  for (const [cName, steps] of Object.entries(scale.categories)) {
    typography[cName] = {};
    for (const [sName, s] of Object.entries(steps)) {
      typography[cName][sName] = {
        $type: "typography",
        // fontFamily resolves the per-voice override (if any) — an overridden voice's DTCG carries its own
        // family; an un-overridden voice still reads its role's family (identical to before this channel).
        $value: { fontFamily: resolvedFontFor(scale, cName), fontSize: dimUnit(s.size, unit), lineHeight: relLine(s.lineHeight, s.size), letterSpacing: relTrackEm(s.letterSpacing, s.size), fontWeight: s.weight, textCase: s.textTransform || "none", paragraphSpacing: dimUnit(s.paragraphSpacing, unit), paragraphIndent: dimUnit(s.paragraphIndent, unit), ...(s.singleLineHeight != null ? { singleLineHeight: relLine(s.singleLineHeight, s.size) } : {}) },
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
// distinct font families deduped into `family/<role>` STRING primitives (plus a `family/voice/<voice>`
// primitive for a family that's ONLY reached via a per-voice override — never shared with a role or
// another voice), a `font/<voice>` ALIAS per voice pointing at its resolved family primitive (edit the
// primitive; every voice sharing it follows), and a `weight/<voice>` FLOAT primitive (the voice's uniform
// weight — one edit point per voice). Alias entries carry `{ type:"ALIAS", target:"<variable key>" }`
// INSTEAD of `values` — a consumer resolves them within the same collection. Single "Value" mode
// (families/weights don't vary by breakpoint; breakpoints live in the Typography collection). This file is
// an IMPORT artifact only — the in-Figma apply path (`_figmaFloatPlans`) never consumes it, so the plugin
// executor stays float-only.
export function typeTokensFigmaPrimitives(scale) {
  const variables = {};
  const famKey = {}; // family string → the primitive key that owns it (dedupe by VALUE — first writer wins)
  for (const [role, fam] of Object.entries(scale.fonts || {})) {
    if (!fam || famKey[fam]) continue;
    famKey[fam] = `family/${role}`;
    variables[famKey[fam]] = { type: "STRING", values: { Value: fam } };
  }
  for (const [voice, steps] of Object.entries(scale.categories || {})) {
    const fam = resolvedFontFor(scale, voice);
    if (fam) {
      // a family already owned by a role (or an earlier voice override) aliases that SAME primitive; a
      // genuinely distinct override family (matching no existing primitive's value) mints its own —
      // dedupe by VALUE, not by source, so two voices overridden to the same custom family share one.
      if (!famKey[fam]) {
        const key = `family/voice/${kebab(voice)}`;
        famKey[fam] = key;
        variables[key] = { type: "STRING", values: { Value: fam } };
      }
      variables[`font/${voice}`] = { type: "ALIAS", target: famKey[fam] };
    }
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
