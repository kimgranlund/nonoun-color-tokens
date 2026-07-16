// geometry.mjs — the GEOMETRY / dimensional engine: the spatial analog of the color & type engines.
// A few parameters → a systematic size ramp → derived control geometry → DTCG / CSS tokens. Pure, no DOM.
//
// It encodes ONE law (the centering law) and TWO families, distilled from the agent-ui dimensional spec
// (.claude/docs/references/{geometry.md, geometry-sizing-spec.md, dimensional-standard.md}):
//
//   THE CENTERING LAW — edge padding for a glyph = (height − glyph) / 2. Every glyph centers in a square
//   cell of side = the control height; block-size is the vertical lever, padding-block is 0.
//
//   THE TWO FAMILIES —
//     • Frame  ∝ height : icon, slot, inline-pad, min-inline-size, pill radius (= height/2).
//     • Rhythm ∝ font   : gap = font/2. Density multiplies the RHYTHM only (never the frame — scaling
//       the frame un-centers the glyph and breaks the square).
//
// The six-size ramp (XS·SM·MD·LG·XL·2XL) is two bands that change gear at the MD|LG seam (compact +4
// linear; expressive ×4/3 geometric). The glyphs scale SUBLINEARLY — a power law of height, exponent < 1
// (the optical correction: a glyph occupies a shrinking fraction of the box as it grows):
//
//   icon = 2.49·h^0.58   (round to nearest even)        caret = 3.5·h^0.39   (round to nearest int)
//   font = CONTROL_FONT[step] · (baseHeight/28)          (the ratified control-text ramp, 2026-07-16)
//
// caret got its OWN power law (2026-07-15, at request — retired the old v4 "caret = font" rule): a
// gentler exponent means the affordance mark grows SLOWER than the text at the top of the ramp.
// font is the ratified control-text table (2026-07-16, TKT-0008 — 12·13·15·16·18·20 at the canonical
// baseHeight): SM/MD/LG compose from the type scale's UI-CONTROL voice when one is supplied (value-
// neutral at defaults — the voice carries the same rows — but voice tuning flows into control boxes);
// XS/XL/2XL use the table × baseHeight/28. Control text is DECOUPLED from Label (~2px larger by
// design), and the ramp's MD kink fits no power law — hand-authored IS the law, like type's SIZES.
// icon/caret remain rule-derived — they reproduce the hand-tuned reference ramp (20·24·28·36·48·64)
// to ±1px and generalize to any scaled baseHeight.

const round = (v) => Math.round(v);
const roundEven = (v) => 2 * Math.round(v / 2);

// The six reference sizes and their canonical control heights (component-sizes.md, the authority).
// `baseHeight` (the MD height) scales the whole ramp by baseHeight/28 — the dimensional analog of the
// type engine's `bodyBase`, so the entire spatial system grows/shrinks together while keeping its shape.
const SIZES = [
  ["XS", 20], ["SM", 24], ["MD", 28], ["LG", 36], ["XL", 48], ["2XL", 64],
];
const CANON_MD = 28;

// The FIXED control-text ramp (the ratified magnitude table's `controls` row, 2026-07-16) — per-step
// literal px at the canonical baseHeight 28, scaled by baseHeight/28 in geomScale. Deliberately kinked
// at MD (13→15) and capped at 20, which no power law fits — hand-authored is the law, like type's SIZES.
const CONTROL_FONT = { XS: 12, SM: 13, MD: 15, LG: 16, XL: 18, "2XL": 20 };

// A "treatment" seeds the spatial feel, exactly as the type "treatment" seeds the type params. Each is a
// density + a default radius ladder + a layout-spacing base. Fonts/sizes are universal; the FEEL is the
// product. `density` multiplies the rhythm (gap) only — comfortable 1 · compact 0.75 · spacious 1.25.
export const GEOMETRY_TREATMENTS = [
  { id: "comfortable", label: "Comfortable", note: "Balanced default — generous touch targets, soft corners, 4px spacing rhythm.",
    density: 1, radiusStyle: "soft", baseHeight: 28, spaceBase: 4 },
  { id: "compact", label: "Compact / Dense", note: "Data-dense UI — tighter heights, sharp corners, the rhythm pulled in (×0.75).",
    density: 0.75, radiusStyle: "sharp", baseHeight: 24, spaceBase: 4 },
  { id: "spacious", label: "Spacious / Airy", note: "Editorial calm — taller controls, rounder corners, the rhythm opened up (×1.25), 8px spacing.",
    density: 1.25, radiusStyle: "round", baseHeight: 32, spaceBase: 8 },
  { id: "touch", label: "Touch / Mobile", note: "Thumb-first — 36px+ targets, soft corners, 8px spacing for fat-finger comfort.",
    density: 1.1, radiusStyle: "soft", baseHeight: 36, spaceBase: 8 },
  { id: "pill", label: "Pill / Rounded", note: "Fully-rounded controls — every box a pill (radius = height/2), soft inner corners.",
    density: 1, radiusStyle: "pill", baseHeight: 28, spaceBase: 4 },
];

export const DEFAULT_GEOMETRY = { treatment: "comfortable", baseHeight: 28 };

// The radius ladder = Material 3's shape-corner scale, verbatim (0·4·8·12·16·28 + full pill). M3 uses
// ONE fixed shape scale (it does not vary corners by density), so we adopt it as-is across every
// treatment — the alignment the GAP-01 analysis called for. `full` is the CSS-pill 9999; the control's
// own corner is still the per-size `radiusPill` (height/2), a separate size-linked value.
const M3_CORNERS = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 9999 };
// A treatment's radius FEEL is its default corner LEVEL (the M3 way — pick a level from the one scale,
// don't rescale it): sharp favours a tight corner, round a generous one, pill fully round.
const RADIUS_DEFAULT = { sharp: "sm", soft: "md", round: "lg", pill: "full" };

// the layout-spacing scale (--space-*): page gutters, card/stack gaps, section rhythm. A SEPARATE concern
// from control geometry (the law above) — the space BETWEEN components, not the padding inside one. A
// roughly-geometric ladder of `spaceBase` multiples (0·1·2·3·4·6·8·12·16·24).
const SPACE_STEPS = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24];

// buildSize — derive the full geometry of one size row from its (scaled) control height + the density.
// Everything below the height is DERIVED — icon/caret by their power laws, the pads by the centering law.
// `font` arrives PRE-RESOLVED from geomScale (a per-mode override, the composed UI-control voice size,
// or the fixed CONTROL_FONT ramp × factor — in that precedence; TKT-0008).
function buildSize(rawHeight, density, font) {
  const height = roundEven(rawHeight);
  const icon = roundEven(2.49 * height ** 0.58); // frame family — the leading content-icon / slot side
  // caret has its OWN power law off height (2026-07-15) — independent of the text size.
  const caret = round(3.5 * height ** 0.39);
  return {
    height,
    icon,
    caret,
    font,
    gap: Math.max(1, round((font / 2) * density)), // rhythm — font/2, density rides HERE (and only here)
    padding: (height - icon) / 2, // the centering law: a SLOT edge — ½(height − icon); icon centers in a height² cell
    edgePadding: round(height / 2), // a SLOTLESS edge (bare label) — h/2 (text pad ½(h−font) + the absent slot's gap ½·font)
    radiusPill: round(height / 2), // the one size-linked radius — a fully-round control is a pill
    minWidth: height, // the 1:1 floor — an icon-only control is at least square
  };
}

// geomScale — the resolved geometry for a config { treatment, baseHeight }. `baseHeight` (the MD control
// height) uniformly scales the whole ramp; the treatment seeds density + the radius ladder + spacing.
//
// CONTROL TEXT (2026-07-16, TKT-0008): each size's `font` composes from the type scale's UI-CONTROL
// voice (`opts.typeScale`, SM/MD/LG — the voice's Desktop sizes equal the ratified control table's
// rows, so the composition is value-neutral at defaults and exists so voice-level tuning flows into
// control boxes); geometry's XS/XL/2XL steps have no voice counterpart and fall back to the fixed
// CONTROL_FONT ramp × (baseHeight/28). The old Label composition is retired — control text reads ~2px
// larger than Label by design. The control-text sizes surface in the TYPOGRAPHY Figma collection as
// the UI-control/UI-widget voices' own variables — the Geometry collection no longer carries font rows.
// `opts.overrides` (optional) — a flat per-size HEIGHT override map keyed "<sizeName>", already mode-selected
// by the caller. When a positive number exists for a size, it REPLACES the scaled rawHeight fed to buildSize,
// so icon/pad/radius/caret/gap ALL re-derive via the laws. Absent / non-positive ⇒ no effect, so the scale
// is byte-identical (the identity gate).
// `opts.fontOverrides` (optional) — the same shape for the per-size CONTROL TEXT size (the breakpoint
// tiers' hand columns for the non-composed XS/XL/2XL steps); wins over the composition. Absent ⇒ the
// UI-control composition (SM/MD/LG), then the CONTROL_FONT×factor law. gap re-derives from the
// resolved font either way (gap = font/2 · density).
// `config.rampContrast` (optional, 0…1, default 1) — the RESPONSIVE ramp knob: how hard the expressive
// band (LG·XL·2XL) changes gear at the MD|LG seam. At 1 (or absent — the identity gate) the band is
// today's ×4/3 geometric ramp. At 0 the gear change disappears: the band continues the compact band's
// +4px linear step past MD (LG = bh+4, XL = bh+8, 2XL = bh+12) — the compressed ramp small screens
// want (at bh 24 that's exactly 18·20·24·28·32·36; at bh 28 + contrast 1, the canonical
// 20·24·28·36·48·64). Between, the band blends linearly, so per-breakpoint modes can step contrast
// with width. The compact band (XS·SM·MD) never changes — small controls have no gear to lose.
export function geomScale(config = {}, opts = {}) {
  const t = GEOMETRY_TREATMENTS.find((x) => x.id === config.treatment) || GEOMETRY_TREATMENTS[0];
  const baseHeight = Number(config.baseHeight) || t.baseHeight;
  const factor = baseHeight / CANON_MD;
  const c = Number(config.rampContrast);
  const rampContrast = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
  const overrides = opts.overrides && typeof opts.overrides === "object" ? opts.overrides : null;
  const fontOverrides = opts.fontOverrides && typeof opts.fontOverrides === "object" ? opts.fontOverrides : null;
  const uiSteps = opts.typeScale && opts.typeScale.categories && opts.typeScale.categories["UI-control"];
  const sizes = {};
  let expr = 0; // 0 for the compact band, then 1·2·3 across LG·XL·2XL (the expressive band)
  for (const [name, h] of SIZES) {
    const ovH = overrides && overrides[name];
    const geoRaw = h * factor;
    if (h > CANON_MD) expr += 1;
    // full contrast (the default) takes the geometric path EXACTLY — no float blend on the identity path.
    const blended = rampContrast >= 1 || expr === 0 ? geoRaw : (baseHeight + 4 * expr) * (1 - rampContrast) + geoRaw * rampContrast;
    const rawHeight = (typeof ovH === "number" && Number.isFinite(ovH) && ovH > 0) ? ovH : blended;
    const ovF = fontOverrides && fontOverrides[name];
    const composed = uiSteps && uiSteps[name] ? uiSteps[name].size : null;
    const font = (typeof ovF === "number" && Number.isFinite(ovF) && ovF > 0) ? round(ovF) : (composed != null ? composed : round(CONTROL_FONT[name] * factor));
    sizes[name] = buildSize(rawHeight, t.density, font);
  }
  const radii = { ...M3_CORNERS }; // the fixed M3 shape-corner scale (treatment-independent)
  const radiusDefault = RADIUS_DEFAULT[t.radiusStyle] || "md"; // the treatment's favoured corner level
  const space = {};
  SPACE_STEPS.forEach((m, i) => { space[i] = m * t.spaceBase; });
  // The CONTAINER tier — semantic names over the space ladder, so a consumer never guesses a raw
  // `--space-N` rung. Insets pad INSIDE a container; gaps separate SIBLINGS within one. Each is a
  // named SPACE_STEPS rung × spaceBase (derived, not hand-picked), so the whole tier follows the
  // treatment's rhythm and stays mode-independent like `space`. Control-INTERNAL geometry (pad,
  // pad-edge, the icon↔label gap) lives on the size rows above — a different law (centering).
  const insets = { controlGroup: space[2], card: space[4], panel: space[5], dialog: space[6], page: space[7] };
  const gaps = { cluster: space[2], stackTight: space[3], stack: space[4], stackLoose: space[5], grid: space[4], section: space[7] };
  // Strokes — constants, not rhythm: borders don't scale with spacing (a hairline is a hairline at
  // every density), and the focus ring pair is an accessibility contract (offset keeps the ring
  // clear of the control edge so it survives any radius).
  const borders = { thin: 1, thick: 2 };
  const focus = { ringWidth: 2, ringOffset: 2 };
  return { treatment: t.id, label: t.label, density: t.density, radiusStyle: t.radiusStyle, radiusDefault, baseHeight, rampContrast, sizes, radii, space, insets, gaps, borders, focus };
}

// ── emitters ───────────────────────────────────────────────────────────────────────────────────
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// geomTokensCSS — CSS custom properties (per-size height/icon/caret/font/gap/padding/radius, the radius
// ladder, the space scale, the density) plus a `.control-{size}` utility class that EMBODIES the law:
// block-size off the ramp, padding-block 0, inline padding = the slotless h/2, the pill radius.
// the per-size `--size-*` custom-property lines (no :root) — shared by the base export + the @media
// overrides; only these scale with baseHeight (density/radii/space are treatment-derived, mode-independent).
// dimUnit(px, unit) — a px dimension in the chosen CSS export unit. rem/em = px÷16 (root-relative), stripped
// of trailing zeros (clean thanks to the even-grid geometry); absent / "px" ⇒ `${px}px`. Mirrors type.mjs.
const dimUnit = (px, unit) => (unit === "rem" || unit === "em" ? `${parseFloat((px / 16).toFixed(4))}${unit}` : `${px}px`);

// ns(pfx, name) — a geometry namespace token core: native `size`/`radius`/… by default, or
// `{pfx}-size`/`{pfx}-radius`/… when a scheme prefix is set (so a Material scheme namespaces the whole
// dimensional system under one root: `--md-sys-size-*`, `--md-sys-radius-*`, …). Empty pfx ⇒ native.
const ns = (pfx, name) => (pfx ? `${pfx}-${name}` : name);

function geomSizeVarLines(scale, indent = "  ", unit = "px", pfx = "") {
  const size = ns(pfx, "size");
  return Object.entries(scale.sizes).map(([name, s]) => {
    const p = `--${size}-${kebab(name)}`;
    return `${indent}${p}-height: ${dimUnit(s.height, unit)}; ${p}-icon: ${dimUnit(s.icon, unit)}; ${p}-caret: ${dimUnit(s.caret, unit)}; ${p}-font: ${dimUnit(s.font, unit)}; ${p}-gap: ${dimUnit(s.gap, unit)}; ${p}-pad: ${dimUnit(s.padding, unit)}; ${p}-pad-edge: ${dimUnit(s.edgePadding, unit)}; ${p}-radius: ${dimUnit(s.radiusPill, unit)}; ${p}-min: ${dimUnit(s.minWidth, unit)};`;
  }).join("\n");
}

// camelCase → kebab-case for the container-tier token names (controlGroup → control-group).
const camelKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export function geomTokensCSS(scale, { unit = "px", prefix = "" } = {}) {
  const p = prefix; // "" ⇒ native --size-/--radius-/… ; else --{p}-size-/…
  const lines = [":root {", `  --${ns(p, "density")}: ${scale.density};`, geomSizeVarLines(scale, "  ", unit, p)];
  for (const [k, v] of Object.entries(scale.radii)) lines.push(`  --${ns(p, "radius")}-${k}: ${dimUnit(v, unit)};`);
  // the treatment's favoured corner level, aliased so a consumer can use one name and let the
  // treatment decide (sharp→sm, soft→md, round→lg, pill→full) — the M3 "pick a level" model.
  if (scale.radiusDefault) lines.push(`  --${ns(p, "radius")}-default: var(--${ns(p, "radius")}-${scale.radiusDefault});`);
  for (const [k, v] of Object.entries(scale.space)) lines.push(`  --${ns(p, "space")}-${k}: ${dimUnit(v, unit)};`);
  // the container tier + strokes (semantic names — see geomScale). Absent on a pre-tier scale.
  for (const [k, v] of Object.entries(scale.insets || {})) lines.push(`  --${ns(p, "inset")}-${camelKebab(k)}: ${dimUnit(v, unit)};`);
  for (const [k, v] of Object.entries(scale.gaps || {})) lines.push(`  --${ns(p, "gap")}-${camelKebab(k)}: ${dimUnit(v, unit)};`);
  for (const [k, v] of Object.entries(scale.borders || {})) lines.push(`  --${ns(p, "border")}-${camelKebab(k)}: ${dimUnit(v, unit)};`);
  for (const [k, v] of Object.entries(scale.focus || {})) lines.push(`  --${ns(p, "focus")}-${camelKebab(k)}: ${dimUnit(v, unit)};`);
  lines.push("}");
  const size = ns(p, "size"), control = ns(p, "control");
  for (const name of Object.keys(scale.sizes)) {
    const s = kebab(name);
    lines.push(`.${control}-${s} { box-sizing: border-box; block-size: var(--${size}-${s}-height); min-inline-size: var(--${size}-${s}-min); font-size: var(--${size}-${s}-font); padding-inline: var(--${size}-${s}-pad-edge); padding-block: 0; gap: var(--${size}-${s}-gap); border-radius: var(--${size}-${s}-radius); }`);
  }
  return lines.join("\n") + "\n";
}

// geomTokensBreakpointCSS — ONE self-contained override file PER breakpoint mode, the geometry mirror of
// type.mjs's typeTokensBreakpointCSS: `geomTokensCSS(baseScale)` is a complete, valid stylesheet on its
// own (the DESIGNED — Desktop — ramp, unconditional `:root`), and each entry this returns is an
// independent bolt-on. `desktopMinWidth` (default 1280 — this app's Desktop anchor) splits `modes` into
// NARROW (< desktopMinWidth — Tablet/Mobile) and WIDE (≥ desktopMinWidth — e.g. Desktop Lg/Xl, 2026-07-15).
// Each side is bounded on its own outward-facing edge — narrow modes on the ceiling (pinned to
// `desktopMinWidth - 1` for the widest narrow mode), open on the floor only for the NARROWEST; wide modes
// mirror this on the floor, open on the ceiling only for the WIDEST. Interior modes on both sides are
// bounded both ends, so ranges never overlap — unchanged from the pre-wide-mode shape whenever no mode
// exceeds `desktopMinWidth`. **One real caveat for WIDE modes:** Desktop itself is the unconditional
// `:root` block (no media query) — a wide mode's bounded `@media` must load AFTER that base file to win
// the cascade at its width; narrow modes stay load-order-independent as before. `modes` =
// [{ name, minWidth, scale }]; a mode without a positive minWidth is skipped (preview-only, mirrors the
// DTCG files).
export function geomTokensBreakpointCSS(modes = [], { unit = "px", prefix = "", desktopMinWidth = 1280 } = {}) {
  const valid = (modes || []).filter((m) => m && m.scale && Number(m.minWidth) > 0);
  const narrow = valid.filter((m) => Number(m.minWidth) < desktopMinWidth).sort((a, b) => Number(b.minWidth) - Number(a.minWidth));
  const wide = valid.filter((m) => Number(m.minWidth) >= desktopMinWidth).sort((a, b) => Number(a.minWidth) - Number(b.minWidth));
  const out = [];
  wide.forEach((m, i) => {
    const lower = Math.round(m.minWidth);
    const widest = i === wide.length - 1;
    const upper = widest ? null : Math.round(wide[i + 1].minWidth) - 1;
    const name = m.name || "Mode";
    const cond = widest ? `(min-width: ${lower}px)` : `(min-width: ${lower}px) and (max-width: ${upper}px)`;
    out.push({
      name, minWidth: lower,
      css: `/* ${name} — ${widest ? `${lower}px+` : `${lower}–${upper}`}px — load AFTER the Desktop base file */\n@media ${cond} {\n  :root {\n${geomSizeVarLines(m.scale, "    ", unit, prefix)}\n  }\n}\n`,
    });
  });
  narrow.forEach((m, i) => {
    const lower = Math.round(m.minWidth);
    const upper = (i === 0 ? desktopMinWidth : Math.round(narrow[i - 1].minWidth)) - 1;
    const narrowest = i === narrow.length - 1;
    const name = m.name || "Mode";
    const cond = narrowest ? `(max-width: ${upper}px)` : `(min-width: ${lower}px) and (max-width: ${upper}px)`;
    out.push({
      name, minWidth: lower,
      css: `/* ${name} — ${narrowest ? `≤${upper}` : `${lower}–${upper}`}px */\n@media ${cond} {\n  :root {\n${geomSizeVarLines(m.scale, "    ", unit, prefix)}\n  }\n}\n`,
    });
  });
  return out;
}

// geomTokensDTCG — the geometry as DTCG dimension tokens: a `size` group (one composite of dimensions per
// ramp step), a `radius` ladder group, and a `space` scale group — all the W3C-DTCG `dimension` $type.
export function geomTokensDTCG(scale, { unit = "px" } = {}) {
  const dim = (px) => ({ $type: "dimension", $value: dimUnit(px, unit) });
  const size = {};
  for (const [name, s] of Object.entries(scale.sizes)) {
    size[name] = {
      height: dim(s.height), icon: dim(s.icon), caret: dim(s.caret), font: dim(s.font),
      gap: dim(s.gap), padding: dim(s.padding), edgePadding: dim(s.edgePadding),
      radius: dim(s.radiusPill), minWidth: dim(s.minWidth),
    };
  }
  const radius = {};
  for (const [k, v] of Object.entries(scale.radii)) radius[k] = dim(v);
  const space = {};
  for (const [k, v] of Object.entries(scale.space)) space[k] = dim(v);
  const group = (src) => { const g = {}; for (const [k, v] of Object.entries(src || {})) g[camelKebab(k)] = dim(v); return g; };
  return { size, radius, space, inset: group(scale.insets), gap: group(scale.gaps), border: group(scale.borders), focus: group(scale.focus) };
}

// geomTokensFigma — the geometry as DTCG `number` tokens (UNITLESS values), the shape a Figma variable
// importer turns into **FLOAT (number) variables** — a "Geometry" collection with size/radius/space groups
// (px is 1:1 with Figma's unitless floats). Same numbers as the DTCG dimension export, minus the `px`
// suffix, so height/icon/gap/padding/radius/space land as native number variables you can bind to
// auto-layout, corner radius, gaps, and sizing. NO `font` rows (2026-07-16): control-text sizes moved to
// the TYPOGRAPHY collection as UI-widget/UI-control size variables (typeTokensFigmaModes controlFonts) —
// the Geometry collection is box geometry only.
export function geomTokensFigma(scale) {
  const num = (v) => ({ $type: "number", $value: v });
  const size = {};
  for (const [name, s] of Object.entries(scale.sizes)) {
    size[name] = {
      height: num(s.height), icon: num(s.icon), caret: num(s.caret),
      gap: num(s.gap), padding: num(s.padding), edgePadding: num(s.edgePadding),
      radius: num(s.radiusPill), minWidth: num(s.minWidth),
    };
  }
  const radius = {};
  for (const [k, v] of Object.entries(scale.radii)) radius[k] = num(v);
  const space = {};
  for (const [k, v] of Object.entries(scale.space)) space[k] = num(v);
  const group = (src) => { const g = {}; for (const [k, v] of Object.entries(src || {})) g[camelKebab(k)] = num(v); return g; };
  return { Geometry: { size, radius, space, inset: group(scale.insets), gap: group(scale.gaps), border: group(scale.borders), focus: group(scale.focus) } };
}

// geomTokensFigmaModes — the geometry as a single Figma-variable COLLECTION ("Geometry") with one MODE per
// breakpoint (a "Base" mode + one per supplied breakpoint mode), mirroring the UI3 color shape
// (`exportUI3`): `{ collections: { "Geometry": { modes:[…], variables: { "size/<NAME>/<field>": {
// type:"FLOAT", values:{ Base:…, <modeName>:… } }, "radius/<k>", "space/<k>" } } } }`. So a Figma user
// imports ONE breakpoint-moded collection instead of N separate per-width files. The size fields mirror
// `geomTokensFigma` (height/icon/caret/gap/padding/edgePadding/radius/minWidth — NO font, 2026-07-16:
// control text lives in the Typography collection as UI-widget/UI-control size vars). `modes` = the SAME
// shape `_geomModeScales()` returns: [{ name, scale }] (minWidth, if present, is ignored — Figma modes are
// named, not media-queried). IDENTITY: `modes = []` ⇒ a single base mode whose values equal the base.
// `opts.baseName` (default "Base") NAMES the synthetic base layer (e.g. "Mobile" — the standard set);
// `opts.baseLast` (default false) places it AFTER the breakpoints (Figma's default mode = the FIRST mode).
const GEOM_SIZE_FIELDS = [["height", "height"], ["icon", "icon"], ["caret", "caret"], ["gap", "gap"], ["padding", "padding"], ["edgePadding", "edgePadding"], ["radius", "radiusPill"], ["minWidth", "minWidth"]];
// Figma requires DISTINCT mode names per collection; the synthetic base layer (`baseName`) is reserved +
// de-dup (case-insensitively) so a breakpoint sharing its name / two same-named modes can't collide on import.
function disambiguateModeNames(names, baseName = "Base") {
  const used = new Set([String(baseName).toLowerCase()]);
  return (names || []).map((raw) => {
    const stem = String(raw);
    let n = stem, i = 1;
    while (used.has(n.toLowerCase())) { i += 1; n = `${stem} ${i}`; }
    used.add(n.toLowerCase());
    return n;
  });
}
export function geomTokensFigmaModes(baseScale, modes = [], { baseName = "Base", baseLast = false } = {}) {
  const list = (Array.isArray(modes) ? modes : []).filter((m) => m && m.name && m.scale && m.scale.sizes);
  const names = disambiguateModeNames(list.map((m) => m.name), baseName);
  const modeNames = baseLast ? [...names, baseName] : [baseName, ...names];
  const variables = {};
  const set = (key, mode, value) => {
    if (!variables[key]) variables[key] = { type: "FLOAT", values: {} };
    variables[key].values[mode] = value;
  };
  // for each mode (Base first), write size/<NAME>/<field>, radius/<k>, space/<k>. Only `sizes` scale with
  // baseHeight; radii/space are treatment-derived (mode-independent), but we emit per-mode for completeness.
  const layer = (scale, mode) => {
    for (const [name, s] of Object.entries(scale.sizes))
      for (const [field, src] of GEOM_SIZE_FIELDS) set(`size/${name}/${field}`, mode, s[src]);
    for (const [k, v] of Object.entries(scale.radii)) set(`radius/${k}`, mode, v);
    for (const [k, v] of Object.entries(scale.space)) set(`space/${k}`, mode, v);
    for (const [k, v] of Object.entries(scale.insets || {})) set(`inset/${camelKebab(k)}`, mode, v);
    for (const [k, v] of Object.entries(scale.gaps || {})) set(`gap/${camelKebab(k)}`, mode, v);
    for (const [k, v] of Object.entries(scale.borders || {})) set(`border/${camelKebab(k)}`, mode, v);
    for (const [k, v] of Object.entries(scale.focus || {})) set(`focus/${camelKebab(k)}`, mode, v);
  };
  layer(baseScale, baseName);
  list.forEach((m, i) => layer(m.scale, names[i]));
  return {
    $schema: "figma-ui3-variables.float.schema.v1",
    collections: { "Geometry": { modes: modeNames, variables } },
  };
}
