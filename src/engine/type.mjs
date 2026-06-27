// type.mjs — the perceptual TYPOGRAPHY engine: the type analog of the color engine. A few parameters
// → a systematic type scale → DTCG / CSS tokens. Pure, no DOM. Mirrors the structure of the target
// schema (docs/spec/typography/typography.tokens.json): four role "voices" — Display · Heading · Body
// (Content) · UI — each a size ramp whose every step carries size, line-height, letter-spacing, weight,
// and paragraph spacing, all DERIVED from the treatment's params (no hand-authored magic numbers).
//
// The system relationships (see docs/spec/typography/README.md):
//   size          = base · ratio^n           (a modular scale; n = the step's distance from the base)
//   lineHeight     = round(size · leading)     (per-role leading; single-line = size)
//   letterSpacing = round(size · trackingEm)  (optical: negative tightens big display, positive loosens UI)
//   weight        = the role's weight
//   paragraphSpacing = size, indent = 0       (schema defaults)

const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

// step ramps: [name, exponent] where exponent is the step's distance from the base (size = base·ratio^n).
const STEPS_5 = [["XS", -2], ["SM", -1], ["MD", 0], ["LG", 1], ["XL", 2]];
const STEPS_UI = [["3XS", -4], ["2XS", -3], ["XS", -2], ["SM", -1], ["MD", 0], ["LG", 1], ["XL", 2], ["2XL", 3]];

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
// Each category: { role, base, ratio, leading, weight, trackingEm, steps }. Fonts are swappable; the
// SCALE + tracking + weight + leading relationships are the product. Free/widely-available families only.
const cat = (role, base, ratio, leading, weight, trackingEm, steps = STEPS_5) => ({ role, base, ratio, leading, weight, trackingEm, steps });

export const TYPE_TREATMENTS = [
  { id: "product", label: "Product / Lifestyle", note: "Neutral geometric sans — screen-native, calm, versatile.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: { Display: cat("display", 56, 1.333, 1.05, 800, -0.02), Heading: cat("heading", 22, 1.25, 1.2, 700, -0.01), Body: cat("body", 16, 1.2, 1.5, 450, 0), UI: cat("ui", 14, 1.125, 1.45, 450, 0.01, STEPS_UI) } },
  { id: "luxury", label: "Luxury / Premium", note: "Elegant high-contrast serif display, airy sans, wide tracking.",
    fonts: { display: "Source Serif 4", heading: "Source Serif 4", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: { Display: cat("display", 64, 1.5, 1.1, 400, -0.01), Heading: cat("heading", 24, 1.333, 1.3, 500, 0.02), Body: cat("body", 17, 1.25, 1.65, 400, 0), UI: cat("ui", 13, 1.125, 1.5, 450, 0.04, STEPS_UI) } },
  { id: "editorial", label: "Editorial / Magazine", note: "Serif headlines, sans body, mono metadata.",
    fonts: { display: "Source Serif 4", heading: "Inter Tight", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: { Display: cat("display", 56, 1.414, 1.05, 700, -0.015), Heading: cat("heading", 22, 1.333, 1.2, 700, 0), Body: cat("body", 18, 1.25, 1.55, 400, 0), UI: cat("ui", 13, 1.125, 1.45, 450, 0.02, STEPS_UI) } },
  { id: "technical", label: "Technical / Data", note: "Mono-forward — tabular figures, dense, tight leading.",
    fonts: { display: "Inter", heading: "Inter", body: "Inter", ui: "JetBrains Mono", mono: "JetBrains Mono" },
    categories: { Display: cat("display", 40, 1.25, 1.1, 700, -0.01), Heading: cat("heading", 20, 1.2, 1.25, 600, 0), Body: cat("body", 15, 1.2, 1.5, 450, 0), UI: cat("ui", 13, 1.125, 1.4, 450, 0, STEPS_UI) } },
  { id: "statement", label: "Brutalist / Statement", note: "One heavy grotesque, tight tracking, dramatic jumps.",
    fonts: { display: "Inter Tight", heading: "Inter Tight", body: "Inter", ui: "Inter", mono: "JetBrains Mono" },
    categories: { Display: cat("display", 72, 1.618, 0.95, 900, -0.03), Heading: cat("heading", 24, 1.5, 1.1, 800, -0.02), Body: cat("body", 16, 1.25, 1.45, 500, 0), UI: cat("ui", 14, 1.2, 1.4, 500, 0, STEPS_UI) } },
];

export const DEFAULT_TYPE = { treatment: "product", bodyBase: 16 };

function buildCategory(p, factor) {
  const out = {};
  for (const [name, n] of p.steps) {
    const size = Math.max(8, Math.round(p.base * factor * p.ratio ** n));
    out[name] = {
      size,
      lineHeight: Math.round(size * p.leading),
      letterSpacing: round(size * p.trackingEm, 2),
      weight: p.weight,
      paragraphSpacing: size,
      paragraphIndent: 0,
    };
  }
  return out;
}

// typeScale — the resolved scale for a config { treatment, bodyBase }. `bodyBase` (the Body base size)
// uniformly scales every category so the whole system grows/shrinks together while keeping its ratios.
export function typeScale(config = {}) {
  const t = TYPE_TREATMENTS.find((x) => x.id === config.treatment) || TYPE_TREATMENTS[0];
  const bodyBase = Number(config.bodyBase) || t.categories.Body.base;
  const factor = bodyBase / t.categories.Body.base;
  const categories = {};
  for (const [name, p] of Object.entries(t.categories)) categories[name] = buildCategory(p, factor);
  return { treatment: t.id, label: t.label, fonts: { ...t.fonts }, roleOf: Object.fromEntries(Object.entries(t.categories).map(([k, v]) => [k, v.role])), categories };
}

// ── emitters ───────────────────────────────────────────────────────────────────────────────────
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// typeTokensCSS — CSS custom properties (font families + per-step size/line/tracking/weight) plus a
// utility class per step. Drop-in: `class="type-display-xl"`.
export function typeTokensCSS(scale) {
  const lines = [":root {"];
  for (const [role, family] of Object.entries(scale.fonts)) lines.push(`  --font-${role}: ${family};`);
  for (const [cName, steps] of Object.entries(scale.categories)) {
    for (const [sName, s] of Object.entries(steps)) {
      const p = `--type-${kebab(cName)}-${kebab(sName)}`;
      lines.push(`  ${p}-size: ${s.size}px; ${p}-line: ${s.lineHeight}px; ${p}-tracking: ${s.letterSpacing}px; ${p}-weight: ${s.weight};`);
    }
  }
  lines.push("}");
  for (const [cName, steps] of Object.entries(scale.categories)) {
    const role = scale.roleOf[cName] || "body";
    for (const sName of Object.keys(steps)) {
      const c = kebab(cName), s = kebab(sName);
      lines.push(`.type-${c}-${s} { font-family: var(--font-${role}); font-size: var(--type-${c}-${s}-size); line-height: var(--type-${c}-${s}-line); letter-spacing: var(--type-${c}-${s}-tracking); font-weight: var(--type-${c}-${s}-weight); }`);
    }
  }
  return lines.join("\n") + "\n";
}

// typeTokensDTCG — the type scale as DTCG tokens: a fontFamily group + a typography group per
// category/step (composite `typography` $type, the W3C-DTCG shape).
export function typeTokensDTCG(scale) {
  const fontFamily = {};
  for (const [role, family] of Object.entries(scale.fonts)) fontFamily[role] = { $type: "fontFamily", $value: family };
  const typography = {};
  for (const [cName, steps] of Object.entries(scale.categories)) {
    const role = scale.roleOf[cName] || "body";
    typography[cName] = {};
    for (const [sName, s] of Object.entries(steps)) {
      typography[cName][sName] = {
        $type: "typography",
        $value: { fontFamily: scale.fonts[role], fontSize: `${s.size}px`, lineHeight: `${s.lineHeight}px`, letterSpacing: `${s.letterSpacing}px`, fontWeight: s.weight, paragraphSpacing: `${s.paragraphSpacing}px`, paragraphIndent: `${s.paragraphIndent}px` },
      };
    }
  }
  return { fontFamily, typography };
}
