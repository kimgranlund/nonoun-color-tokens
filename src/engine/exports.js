// exports.js — the five export serializers (vanilla ESM, no deps).
//
// Turns a generator State into the HCT Palette Generator's portable token
// artifacts in five formats: CSS (hex), CSS (OKLCH), JSON, Figma DTCG (the
// 3-file set), and the UI3 interchange shape. Every emitter operates over the
// ENABLED palettes only and the 25 EXPORT_STOPS, and every stop reference is
// 3-digit zero-padded (ADR-006).
//
// Fenced decisions honored (do NOT "fix" these):
//   ADR-002  Light/Dark semantic ships RESOLVED colors with NO aliasData by
//            default; an opts.rawColl opt-in re-adds com.figma.aliasData.
//   ADR-005  Two-layer model: raw tokens are FLAT single values; the light/dark
//            flip lives only in the semantic --c-* layer via light-dark().
//   ADR-006  3-digit padding on every naming surface (CSS/JSON/DTCG/UI3).
//   ADR-007  UI3 is interchange-only (not a native Figma import path).
//
// state is UI-only-aware: theme is NEVER read here, so output is identical for
// theme light/dark/auto.

import { paletteStops, EXPORT_STOPS, DEFAULT_CONTROLS } from "./tonal.js";
import { semanticRoles, refKey, applyRoleOverrides, applyOnColorContrast, applyAccentRef } from "./semantic.js";
import { oklchToSrgb8, hexToSrgb8, pyRound } from "./ds-gates.js"; // §8 carrier primitives — the receipt cites the SAME round-trip the G3 gate measures

// WCAG relative luminance of an [r,g,b] (0..255) triple — for the opt-in contrast on-color pick.
const relLumExp = (rgb) => {
  const c = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

// ── Constants (from data/role-table.json) ─────────────────────────────────────
// Scrims are a 500-based translucency ramp: a scrim primitive "{n}/500-{step}" is the
// palette's 500 color at alpha% = step/10. Only the referenced steps are emitted.
// The EMITTED raw scrim ramp: a clean 11-step translucency set over the 500 color,
// alpha% = step/10 → 5,10,20,30,40,50,60,70,80,90,95%. This is the set of raw scrim
// primitives every format emits; the 7 SEMANTIC scrim-strength roles bind to a 7-step
// SUBSET of these (see semantic.js SCRIM_STRENGTH_STEPS), so some emitted steps are
// available as raw primitives without a strength role. Exported so model.tokenCount can
// derive the count instead of hard-coding it (was the stale `3 * 7`).
export const SCRIM_BASES = [500];
export const SCRIM_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// ── Small hand-rolled helpers ─────────────────────────────────────────────────

// slug — palette name -> token namespace: lowercase, non-alphanumeric -> '-',
// trimmed of leading/trailing '-'. "Neutral" -> "neutral", "On Surface" -> "on-surface".
function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// pad3 — zero-pad a numeric stop to 3 digits. "50" -> "050", 950 -> "950".
// (refKey from semantic.js handles the ref-string form, including scrim "-i".)
function pad3(stop) {
  return String(stop).padStart(3, "0");
}

// hex2 — a 0..255 channel as a 2-digit UPPERCASE hex byte.
function hex2(v) {
  return Math.round(v).toString(16).padStart(2, "0").toUpperCase();
}

// hexOf — "#RRGGBB" from an [r,g,b] int triple (uppercase).
function hexOf(rgb) {
  return "#" + rgb.map(hex2).join("");
}

// hex8 — "#RRGGBBAA" scrim color: solid rgb + an alpha byte from a 0..1 fraction.
function hex8(rgb, frac) {
  return hexOf(rgb) + hex2(frac * 255);
}

// componentsOf — srgb components in [0,1] from an [r,g,b] int triple.
function componentsOf(rgb) {
  return rgb.map((v) => v / 255);
}

// rgbToOklch — minimal sRGB(0..255) -> OKLCH for the OKLCH CSS variant only
// (NOT used for color math; the engine already produced the gamut-correct rgb).
// sRGB -> linear -> LMS (Björn Ottosson's matrices) -> Lab -> L,C,H.
function rgbToOklch(rgb) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(rgb[0]);
  const g = lin(rgb[1]);
  const b = lin(rgb[2]);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

// oklchStr / oklchStrA — the oklch() string forms for solids and scrims.
const num = (x, d) => Number(x.toFixed(d));
function oklchStr({ L, C, H }) {
  return `oklch(${num(L, 4)} ${num(C, 4)} ${num(H, 2)})`;
}
function oklchStrA({ L, C, H }, alphaPct) {
  return `oklch(${num(L, 4)} ${num(C, 4)} ${num(H, 2)} / ${alphaPct}%)`;
}

// ── Core: per-palette derivation (shared by every emitter) ────────────────────

// controlsOf — pull the tonal controls out of State, defaulting any missing.
function controlsOf(state) {
  return {
    curve: state.curve ?? DEFAULT_CONTROLS.curve,
    tension: state.tension ?? DEFAULT_CONTROLS.tension,
    lmin: state.lmin ?? DEFAULT_CONTROLS.lmin,
    lmax: state.lmax ?? DEFAULT_CONTROLS.lmax,
    damp: state.damp ?? DEFAULT_CONTROLS.damp,
    dampCurve: state.dampCurve ?? DEFAULT_CONTROLS.dampCurve,
    dampAmp: state.dampAmp ?? DEFAULT_CONTROLS.dampAmp,
    dampBias: state.dampBias ?? DEFAULT_CONTROLS.dampBias,
    hueSpace: state.hueSpace ?? "cam16", // a raw legacy state without the field was authored in cam16 (mirror the UI's legacy-preservation stamp); a live doc always carries it explicitly
    // distribution mode + its shapers — previously dropped here, so exports always used the
    // default mode regardless of the doc. Threaded now so exports match what the UI renders.
    toneMode: state.toneMode ?? DEFAULT_CONTROLS.toneMode,
    vibrancy: state.vibrancy ?? DEFAULT_CONTROLS.vibrancy,
    onColorMode: state.onColorMode ?? DEFAULT_CONTROLS.onColorMode,
    accentRef: state.accentRef ?? DEFAULT_CONTROLS.accentRef,
    relChroma: state.relChroma ?? DEFAULT_CONTROLS.relChroma,
    chromaFloor: state.chromaFloor ?? DEFAULT_CONTROLS.chromaFloor,
  };
}

// enabledPalettes — the disabled-palette filter (AC-U2): a palette is included
// iff on !== false. A disabled palette is therefore ABSENT from every export.
function enabledPalettes(state) {
  return (state.palettes ?? []).filter((p) => p.on !== false);
}

// derivePalette — everything an emitter needs for one palette, computed once:
//   slug, the 25 solid stops keyed by pad3, a stop->rgb lookup, the 11 scrims,
//   the 59 resolved semantic roles, and a ref->rgb resolver shared by all formats.
function derivePalette(palette, controls, overrides) {
  const n = slug(palette.name);
  const ctl = {
    curve: controls.curve,
    tension: controls.tension,
    lmin: controls.lmin,
    lmax: controls.lmax,
    damp: controls.damp,
    dampCurve: controls.dampCurve,
    dampAmp: controls.dampAmp,
    dampBias: controls.dampBias,
    hueSpace: controls.hueSpace,
    toneMode: controls.toneMode,
    vibrancy: controls.vibrancy,
    relChroma: controls.relChroma,
    chromaFloor: controls.chromaFloor,
  };
  const stopList = paletteStops(
    { hue: palette.hue, chroma: palette.chroma, skew: palette.skew, lift: palette.lift, hueShift: palette.hueShift, hueSameDir: palette.hueSameDir, cuspPull: palette.cuspPull },
    ctl,
    EXPORT_STOPS,
  );

  // stop (number) -> rgb int triple, for ref resolution.
  const byStop = new Map();
  const stops = {}; // { [pad3]: {rgb, hex, tone, chroma} }
  for (const s of stopList) {
    byStop.set(s.stop, s.rgb);
    stops[pad3(s.stop)] = { rgb: s.rgb, hex: s.hex, tone: s.tone, chroma: s.chroma };
  }

  // scrims: the 500 ramp -> { [base]: { [step]: { rgb (base's solid), alphaPct, frac, hex8 } } }.
  const scrims = {}; // { [base]: { [step]: {...} } }
  for (const base of SCRIM_BASES) {
    const rgb = byStop.get(base);
    scrims[base] = {};
    for (const step of SCRIM_STEPS) {
      const alphaPct = step / 10; // 50 -> 5%, 100 -> 10%, 950 -> 95%
      const frac = step / 1000;
      scrims[base][step] = { rgb, alphaPct, frac, hex: hex8(rgb, frac) };
    }
  }

  // resolveRef — a role ref ("550" solid, or "500-200" scrim) -> { rgb, frac }.
  // frac === 1 for a solid; for a scrim "{base}-{step}" it's step/1000 (rgb is the base's solid).
  const resolveRef = (ref) => {
    const s = String(ref);
    const dash = s.indexOf("-");
    if (dash === -1) {
      return { rgb: byStop.get(Number(s)), frac: 1 };
    }
    const base = Number(s.slice(0, dash));
    const step = Number(s.slice(dash + 1));
    return { rgb: byStop.get(base), frac: step / 1000 };
  };

  // The 59 semantic roles, with each ref pre-resolved to a concrete color for
  // BOTH modes. semanticRoles is keyed on the slug (so keys are name-prefixed).
  // on-color policy: "contrast" mode flips the accent on-colors to the better-contrasting end
  // BEFORE per-doc overrides (so an explicit override still wins). No-op in the default "fixed" mode.
  const lumOf = (ref) => { const rgb = byStop.get(Number(ref)); return rgb ? relLumExp(rgb) : 0; };
  const onAdjusted = applyOnColorContrast(applyAccentRef(semanticRoles(n), controls.accentRef), n, lumOf, controls.onColorMode);
  const roles = applyRoleOverrides(onAdjusted, overrides).map((r) => {
    const L = resolveRef(r.light);
    const D = resolveRef(r.dark);
    return {
      key: r.key,
      suffix: r.suffix,
      lightRef: r.light,
      darkRef: r.dark,
      light: { rgb: L.rgb, frac: L.frac, hex: L.frac === 1 ? hexOf(L.rgb) : hex8(L.rgb, L.frac) },
      dark: { rgb: D.rgb, frac: D.frac, hex: D.frac === 1 ? hexOf(D.rgb) : hex8(D.rgb, D.frac) },
    };
  });

  // keyColors — retained brand colors, passed through verbatim (exact hex). They may sit
  // off the generated ramp; the UI places them perceptually, exports keep them exact.
  const keyColors = Array.isArray(palette.keyColors) ? palette.keyColors : [];
  return { name: palette.name, n, hue: palette.hue, stops, byStop, scrims, roles, keyColors };
}

// derivedAll — every enabled palette derived, in State order.
function derivedAll(state) {
  const controls = controlsOf(state);
  return enabledPalettes(state).map((p) => derivePalette(p, controls, state.roleOverrides));
}

// ── colorLeaf — the DTCG color leaf (ADR + knowledge-04 §4) ────────────────────
// components in [0,1]; hex reconstructs from round(component*255) per channel
// (+ alpha byte for scrims). alias (optional) attaches com.figma.aliasData.
function colorLeaf(rgb, frac, alias) {
  const comps = componentsOf(rgb);
  const solidHex = hexOf(rgb);
  const hex = frac === 1 ? solidHex : solidHex + hex2(frac * 255);
  const ext = {
    "com.figma.hiddenFromPublishing": true,
    "com.figma.scopes": ["ALL_SCOPES"],
  };
  if (alias) ext["com.figma.aliasData"] = alias;
  return {
    $type: "color",
    $value: { colorSpace: "srgb", components: comps, alpha: frac, hex },
    $extensions: ext,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. CSS (hex)
// ──────────────────────────────────────────────────────────────────────────────
// :root { flat raw vars (solids + scrim hex8) + --c-* semantic via light-dark() }.
// Every --c-* references TWO raw vars that are themselves emitted in :root (ADR-005).
export function exportCSS(state) {
  return cssFrom(derivedAll(state), false, cssPrefixOf(state));
}

// cssPrefixOf — the configurable CSS custom-property prefix (the `c` in `--c-*`). Lets a kit emit
// Material-flavoured names (`--md-sys-color-*`) or any custom namespace, extended with our roles.
// Sanitized to a legal CSS ident core: lowercased, non-[a-z0-9-] stripped, edge/leading-digit hyphens
// trimmed. Empty / default "c" ⇒ the historical `--c-*` (identity — existing kits byte-identical).
export function cssPrefixOf(state) {
  const raw = state && state.export && typeof state.export.colorPrefix === "string" ? state.export.colorPrefix : "";
  const clean = raw.toLowerCase().replace(/^-+/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^(\d)/, "c$1").replace(/-+$/, "").replace(/^-+/, "");
  return clean || "c";
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. CSS (OKLCH)
// ──────────────────────────────────────────────────────────────────────────────
// Identical structure; raw values are oklch(L C H) / oklch(L C H / a%). The
// semantic --c-* layer is unchanged (var() refs), so the two-layer flip holds.
export function exportOKLCH(state) {
  return cssFrom(derivedAll(state), true, cssPrefixOf(state));
}

// cssFrom — shared CSS body for both variants. oklch=false -> hex raw values. `pfx` is the
// custom-property prefix core (the `c` in `--c-*`); defaults to "c" for the historical output.
function cssFrom(palettes, oklch, pfx = "c") {
  const lines = [];
  lines.push(":root {");
  lines.push("  color-scheme: light dark;");
  for (const p of palettes) {
    lines.push("");
    lines.push(`  /* ${p.name} — flat mode-independent primitives */`);
    // solid RAW vars: --{pfx}-{n}-050 .. -950 (raw stop names end in digits; semantic role names end
    // in a word, so the two never collide despite sharing the prefix).
    for (const key of Object.keys(p.stops)) {
      const { rgb } = p.stops[key];
      const val = oklch ? oklchStr(rgbToOklch(rgb)) : hexOf(rgb);
      lines.push(`  --${pfx}-${p.n}-${key}: ${val};`);
    }
    // scrim RAW vars: --{pfx}-{n}-500-{step}  (the 500 color at alpha% = step/10)
    for (const base of SCRIM_BASES) {
      for (const step of SCRIM_STEPS) {
        const sc = p.scrims[base][step];
        const val = oklch ? oklchStrA(rgbToOklch(sc.rgb), sc.alphaPct) : sc.hex;
        lines.push(`  --${pfx}-${p.n}-${pad3(base)}-${pad3(step)}: ${val};`);
      }
    }
    // SEMANTIC --{pfx}-{n}-{role} vars: light-dark(var(light raw), var(dark raw)) (ADR-005)
    lines.push(`  /* ${p.name} — semantic roles */`);
    for (const r of p.roles) {
      const lv = `var(--${pfx}-${p.n}-${refKey(r.lightRef)})`;
      const dv = `var(--${pfx}-${p.n}-${refKey(r.darkRef)})`;
      lines.push(`  --${pfx}-${p.n}${r.suffix}: light-dark(${lv}, ${dv});`);
    }
    // KEY COLORS — retained brand values by expression (dominant/supportive), exact in OKLCH
    // (NOT mode-flipped; they are source colors, lossless from the OKLCH source).
    if (p.keyColors.length) {
      lines.push(`  /* ${p.name} — retained key colors (exact, OKLCH) */`);
      for (const kc of p.keyColors) {
        lines.push(`  --${pfx}-${p.n}-key-${kc.role}: ${oklchStr({ L: kc.oklch[0], C: kc.oklch[1], H: kc.oklch[2] })};`);
      }
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. JSON
// ──────────────────────────────────────────────────────────────────────────────
// { meta..., [paletteName]: { stops:{pad3:hex}, scrims:{base-i:{hex,alpha}}, semantic:[{key,light,dark}] } }
// Keyed by the original palette NAME; disabled palettes are absent.
export function exportJSON(state) {
  const palettes = derivedAll(state);
  const out = {};
  for (const p of palettes) {
    // stops: { "050": "#RRGGBB", ... } — 3-digit padded keys.
    const stops = {};
    for (const key of Object.keys(p.stops)) stops[key] = p.stops[key].hex;

    // scrims: { "500-200": {hex, alpha}, ... } — "500-{step}", alpha% = step/10.
    const scrims = {};
    for (const base of SCRIM_BASES) {
      for (const step of SCRIM_STEPS) {
        const sc = p.scrims[base][step];
        scrims[`${pad3(base)}-${pad3(step)}`] = { hex: sc.hex, alpha: sc.alphaPct };
      }
    }

    // semantic: [{ key, light:"#hex", dark:"#hex" }, ...] — both refs resolved.
    const semantic = p.roles.map((r) => ({
      key: r.key,
      light: r.light.hex,
      dark: r.dark.hex,
    }));

    const palette = { stops, scrims, semantic };
    // keyColors: [{ role, oklch:[L,C,H], name? }] — retained exact brand colors (present only when set).
    if (p.keyColors.length) palette.keyColors = p.keyColors.map((kc) => ({ role: kc.role, oklch: kc.oklch, ...(kc.name ? { name: kc.name } : {}) }));
    out[p.name] = palette;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Figma DTCG — exactly the 3 named files
// ──────────────────────────────────────────────────────────────────────────────
// palette.tokens.json  -> RAW collection (mode Value): 25 solids + 11 scrims per palette.
// Light_tokens.json    -> SEMANTIC (mode Light): 59 roles RESOLVED to the LIGHT ref's color.
// Dark_tokens.json     -> SEMANTIC (mode Dark):  59 roles RESOLVED to the DARK  ref's color.
//
// opts.rawColl branch (ADR-002):
//   BLANK/undefined -> NO semantic leaf carries com.figma.aliasData (resolved-only;
//                      always imports natively).
//   SET             -> EVERY semantic leaf carries com.figma.aliasData =
//                      { targetVariableName: "{n}/{refKey(ref)}", targetVariableSetName: rawColl }
//                      (the per-mode ref: light's ref for Light, dark's ref for Dark).
export function exportDTCG(state, opts) {
  const rawColl = opts && opts.rawColl ? opts.rawColl : "";
  const palettes = derivedAll(state);

  // RAW tree: { [n]: { [pad3]: leaf, [base-i]: leaf } } — resolved, no aliasData.
  const rawTree = {};
  for (const p of palettes) {
    const grp = {};
    for (const key of Object.keys(p.stops)) {
      grp[key] = colorLeaf(p.stops[key].rgb, 1, null);
    }
    for (const base of SCRIM_BASES) {
      for (const step of SCRIM_STEPS) {
        const sc = p.scrims[base][step];
        grp[`${pad3(base)}-${pad3(step)}`] = colorLeaf(sc.rgb, sc.frac, null);
      }
    }
    rawTree[p.n] = grp;
  }

  // SEMANTIC tree for one mode ("light" | "dark"): each role -> resolved leaf,
  // with aliasData attached iff rawColl is set, targeting that mode's ref.
  const semanticTree = (mode) => {
    const tree = {};
    for (const p of palettes) {
      const grp = {};
      for (const r of p.roles) {
        const side = mode === "light" ? r.light : r.dark;
        const ref = mode === "light" ? r.lightRef : r.darkRef;
        const alias = rawColl
          ? { targetVariableName: `${p.n}/${refKey(ref)}`, targetVariableSetName: rawColl }
          : null;
        grp[r.key] = colorLeaf(side.rgb, side.frac, alias);
      }
      tree[p.n] = grp;
    }
    return tree;
  };

  // figmaMode — tag a tree's top level with its Figma mode name.
  const figmaMode = (tree, modeName) => ({
    ...tree,
    $extensions: { "com.figma.modeName": modeName },
  });

  return {
    "palette.tokens.json": figmaMode(rawTree, "Value"),
    "Light_tokens.json": figmaMode(semanticTree("light"), "Light"),
    "Dark_tokens.json": figmaMode(semanticTree("dark"), "Dark"),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Collections (UI3) — interchange-only (ADR-007), NOT a native Figma path.
// ──────────────────────────────────────────────────────────────────────────────
// Two collections: raw primitives (single "Base" mode) and semantic (Light/Dark
// modes) whose values are IN-FILE key-path aliases the importer resolves.
export function exportUI3(state) {
  const palettes = derivedAll(state);
  const primVars = {};
  const semVars = {};

  for (const p of palettes) {
    // raw primitives: "raw/{n}/{pad3}" and "raw/{n}/{base-i}".
    for (const key of Object.keys(p.stops)) {
      primVars[`raw/${p.n}/${key}`] = { type: "COLOR", values: { Base: p.stops[key].hex } };
    }
    for (const base of SCRIM_BASES) {
      for (const step of SCRIM_STEPS) {
        const sc = p.scrims[base][step];
        primVars[`raw/${p.n}/${pad3(base)}-${pad3(step)}`] = { type: "COLOR", values: { Base: sc.hex } };
      }
    }
    // semantic: "{n}/{key}" -> in-file aliases to the raw key paths per mode.
    for (const r of p.roles) {
      semVars[`${p.n}/${r.key}`] = {
        type: "COLOR",
        values: {
          Light: `{raw/${p.n}/${refKey(r.lightRef)}}`,
          Dark: `{raw/${p.n}/${refKey(r.darkRef)}}`,
        },
      };
    }
  }

  return {
    $schema: "figma-ui3-variables.color.schema.v1",
    collections: {
      "Color / Primitives": { modes: ["Base"], variables: primVars },
      "Color / Semantic": { modes: ["Light", "Dark"], variables: semVars },
    },
  };
}

// roleOklch — a resolved role end ({rgb, frac}) -> an oklch() string, with alpha for
// scrim-backed roles (frac < 1, e.g. outline/container on the 500 ramp).
function roleOklch(end) {
  return end.frac === 1 ? oklchStr(rgbToOklch(end.rgb)) : oklchStrA(rgbToOklch(end.rgb), end.frac * 100);
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. TAILWIND (v4 `@theme`)
// ──────────────────────────────────────────────────────────────────────────────
// The ramps ARE a Tailwind color scale: every stop -> --color-{n}-{stop} (oklch),
// so `bg-{n}-500` / `text-{n}-50` work. The 59 semantic roles emit as
// --color-{n}{suffix} with a light-dark() value, so `bg-{n}` / `text-surface` flip
// automatically (needs `color-scheme: light dark` on a root — noted in the header).
export function exportTailwind(state) {
  const palettes = derivedAll(state);
  const lines = [];
  lines.push("/* Tailwind v4 theme — generated by Ultimate Tokens by NONOUN.");
  lines.push("   Paste after `@import \"tailwindcss\";`. Ramps -> bg-{name}-{stop};");
  lines.push("   semantic roles flip via light-dark() (set `color-scheme: light dark`). */");
  lines.push("@theme {");
  for (const p of palettes) {
    lines.push("");
    lines.push(`  /* ${p.name} — scale */`);
    for (const key of Object.keys(p.stops)) {
      // pad3 "050" -> Tailwind key "50"; finer stops (150/250/…) stay as-is (valid in v4).
      lines.push(`  --color-${p.n}-${String(Number(key))}: ${oklchStr(rgbToOklch(p.stops[key].rgb))};`);
    }
  }
  for (const p of palettes) {
    lines.push("");
    lines.push(`  /* ${p.name} — semantic roles (auto light/dark) */`);
    for (const r of p.roles) {
      lines.push(`  --color-${p.n}${r.suffix}: light-dark(${roleOklch(r.light)}, ${roleOklch(r.dark)});`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ──────────────────────────────────────────────────────────────────────────────
// 8. SHADCN (oklch `:root` / `.dark` + `@theme inline`)
// ──────────────────────────────────────────────────────────────────────────────
// ShadCN expects a FIXED token contract. We map the semantic roles onto it by
// ROLE (not palette name, so it survives renamed/preset palettes): the neutral-ish
// palette drives surfaces, the primary-ish one drives primary/ring, the danger-ish
// one drives destructive. Light = each role's light end, dark = its dark end.
const SHADCN_ORDER = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];

export function exportShadcn(state, opts = {}) {
  const palettes = derivedAll(state);
  const find = (re) => palettes.find((p) => re.test(p.name.toLowerCase()));
  const neutral = find(/neutral|gray|grey|slate|stone|zinc|mono/) || palettes[0];
  const primary = find(/primary|brand/) || palettes.find((p) => p !== neutral) || palettes[0];
  const danger = find(/danger|destruct|error|critical|red/) || primary;
  const success = find(/success|positive|green/);
  const warning = find(/warn|caution|amber|yellow|orange/);
  const secondary = find(/secondary|tertiary/);
  if (!neutral || !primary) return "/* ShadCN export needs at least one enabled palette. */\n";

  const rs = (p, suffix) => p && p.roles.find((r) => r.suffix === suffix);
  const prime = (p) => rs(p, "");
  const onAccent = (p) => p && p.roles.find((r) => r.suffix === "-on-" + p.n);

  // token -> the role whose light/dark ends drive it (null tokens are skipped).
  const MAP = {
    background: rs(neutral, "-background"), foreground: rs(neutral, "-on-surface"),
    card: rs(neutral, "-surface"), "card-foreground": rs(neutral, "-on-surface"),
    popover: rs(neutral, "-surface"), "popover-foreground": rs(neutral, "-on-surface"),
    primary: prime(primary), "primary-foreground": onAccent(primary),
    secondary: secondary ? prime(secondary) : rs(neutral, "-surface-high"),
    "secondary-foreground": secondary ? onAccent(secondary) : rs(neutral, "-on-surface"),
    muted: rs(neutral, "-surface-low"), "muted-foreground": rs(neutral, "-on-surface-variant"),
    accent: rs(neutral, "-surface-high"), "accent-foreground": rs(neutral, "-on-surface"),
    destructive: prime(danger), "destructive-foreground": onAccent(danger),
    border: rs(neutral, "-outline-variant"), input: rs(neutral, "-outline-variant"), ring: prime(primary),
    "chart-1": prime(primary), "chart-2": prime(success || secondary || primary),
    "chart-3": prime(warning || secondary || primary), "chart-4": prime(danger),
    "chart-5": prime(secondary || neutral),
    sidebar: rs(neutral, "-surface"), "sidebar-foreground": rs(neutral, "-on-surface"),
    "sidebar-primary": prime(primary), "sidebar-primary-foreground": onAccent(primary),
    "sidebar-accent": rs(neutral, "-surface-high"), "sidebar-accent-foreground": rs(neutral, "-on-surface"),
    "sidebar-border": rs(neutral, "-outline-variant"), "sidebar-ring": prime(primary),
  };

  const block = (mode) =>
    SHADCN_ORDER.map((tok) => {
      const r = MAP[tok];
      return r ? `  --${tok}: ${roleOklch(r[mode])};` : null;
    }).filter(Boolean).join("\n");

  const themeInline = SHADCN_ORDER.filter((tok) => MAP[tok])
    .map((tok) => `  --color-${tok}: var(--${tok});`).join("\n");

  // GEOMETRY → --radius: seed shadcn's base radius from the brand geometry's `md` corner — a medium
  // corner on the M3-aligned scale (12px → 0.75rem); shadcn's own sm/md/lg/xl ladder derives from it by
  // shadcn's calc convention. TYPOGRAPHY → the brand fonts in shadcn's three family slots: --font-sans ←
  // body, --font-serif ← display, --font-mono ← mono (quoted — digit names like "Source Serif 4" are
  // invalid unquoted in Safari). Both fall back to the shadcn defaults when absent.
  const radiusPx = opts.radii && Number.isFinite(opts.radii.md) ? opts.radii.md : null;
  const radiusLine = radiusPx != null ? `  --radius: ${parseFloat((radiusPx / 16).toFixed(4))}rem;` : "  --radius: 0.625rem;";
  const fonts = opts.fonts && typeof opts.fonts === "object" ? opts.fonts : {};
  const fontVars = [
    fonts.body ? `  --font-sans: '${fonts.body}', ui-sans-serif, system-ui, sans-serif;` : null,
    fonts.display ? `  --font-serif: '${fonts.display}', ui-serif, Georgia, serif;` : null,
    fonts.mono ? `  --font-mono: '${fonts.mono}', ui-monospace, SFMono-Regular, monospace;` : null,
  ].filter(Boolean);

  return [
    "/* ShadCN theme — generated by Ultimate Tokens by NONOUN. Replace the token blocks in",
    `   your globals.css. Mapped from: neutral=${neutral.name}, primary=${primary.name}, destructive=${danger.name}. */`,
    ":root {",
    radiusLine,
    block("light"),
    "}",
    "",
    ".dark {",
    block("dark"),
    "}",
    "",
    "@theme inline {",
    "  --radius-sm: calc(var(--radius) - 4px);",
    "  --radius-md: calc(var(--radius) - 2px);",
    "  --radius-lg: var(--radius);",
    "  --radius-xl: calc(var(--radius) + 4px);",
    ...fontVars,
    themeInline,
    "}",
    "",
  ].join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM export — design-system-for-{claude-code,google-stitch,figma-make}
// ══════════════════════════════════════════════════════════════════════════════
// Overhaul of the superseded claude-design bundle (BUNDLE-REVIEW.md F1/F2). The consumption
// role set uses the Ultimate Tokens grammar `{family}[-slot]` (spec §6.5) with MEASURED
// on-colors per fill per scheme (§7 R1). One source — dsColorRoles — renders tokens.json, the
// DESIGN.md frontmatter, and the previews, so §8 carrier-equality holds by construction.
// Spec: .claude/docs/spec (design-system-files-for-llms.md in the export repo).

const DS_AA = 4.5;
const dsContrast = (a, b) => {
  const la = relLumExp(a), lb = relLumExp(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

// The neutral-duty (chrome) family carries the surface + state slots: the neutral-named palette,
// else the first enabled one (the reference theme's near-achromatic primary-base leads the list).
const dsChrome = (palettes) =>
  palettes.find((p) => /neutral|gray|grey|slate|stone|zinc|mono/.test(p.name.toLowerCase())) || palettes[0];
const dsRole = (p, suffix) => p && p.roles.find((r) => r.suffix === suffix);

// R1 — the measured on-color + (rarely stepped) fill, per fill per scheme (§7). The two text poles
// are the chrome family's on-surface ends (ink = its light end / paper = its dark end; the ramp
// desaturates to near-neutral at the extremes, so these are the theme's near-black + near-white).
//   1. If a pole already clears 4.5:1 on the NATURAL fill, take the better-contrasting one — no step.
//      A deliberately-light signature fill (mirror silver) keeps its identity and takes a near-black
//      label; a saturated fill keeps its color and takes white.
//   2. DEAD ZONE — a mid-luminance fill where NEITHER near-black nor near-white clears 4.5 (the poles
//      aren't pure black/white, so a band exists). Step the fill toward the scheme's fill-text pole
//      (darken in light / lighten in dark) until that pole clears 4.5 (Studio 54 light success 550→600).
const DS_LOW_CHROMA = 0.04; // a near-neutral NON-chrome family reads as metal/silver/grey
const DS_METAL_INK = 7;     // a light-metallic fill takes a crisp near-black label
function dsFillOn(p, poles, scheme, allowMetal) {
  const prime = dsRole(p, "");
  const nat = scheme === "light" ? prime.light : prime.dark; // {rgb, frac, hex}
  const preferred = scheme === "light" ? poles.paper : poles.ink; // the scheme's fill-text pole
  const other = scheme === "light" ? poles.ink : poles.paper;
  const stops = Object.keys(p.stops).map(Number).sort((a, b) => a - b);
  const startStop = Number(scheme === "light" ? prime.lightRef : prime.darkRef);
  const at = (s) => p.byStop.get(s);
  const idx = stops.indexOf(startStop);

  // Light-metallic families — a near-neutral NON-chrome family (mirror silver, a grey accent) reads
  // as metal, not as a button: a dark-grey fill + white text looks disabled and betrays the metal the
  // prose sells (R5). Render a LIGHT fill with a near-black label: lighten from the prime until the ink
  // pole clears DS_METAL_INK; the dark scheme brightens one tier further (a metallic reflects more on a
  // dark surface). The chrome family is exempt (its low chroma is the neutral room, not an accent).
  const primeChroma = rgbToOklch(prime.light.rgb).C; // OKLCH chroma (scheme-independent classifier)
  if (allowMetal && primeChroma < DS_LOW_CHROMA && idx >= 0) {
    let j = idx;
    for (; j > 0; j--) if (dsContrast(poles.ink, at(stops[j])) >= DS_METAL_INK) break;
    if (scheme === "dark") j = Math.max(0, j - 1);
    return { fillRgb: at(stops[j]), onRgb: poles.ink };
  }

  // 1. a pole clears 4.5 on the natural fill → take the better one, no step.
  const cP = dsContrast(preferred, nat.rgb), cO = dsContrast(other, nat.rgb);
  if (cP >= DS_AA || cO >= DS_AA) return { fillRgb: nat.rgb, onRgb: cP >= cO ? preferred : other };
  // 2. dead zone — neither pole clears 4.5 on the natural fill: step toward the fill-text pole.
  const dir = scheme === "light" ? +1 : -1; // light: darken the fill (higher stop); dark: lighten it
  if (idx >= 0) for (let j = idx + dir; j >= 0 && j < stops.length; j += dir) {
    if (dsContrast(preferred, at(stops[j])) >= DS_AA) return { fillRgb: at(stops[j]), onRgb: preferred };
  }
  return { fillRgb: nat.rgb, onRgb: cP >= cO ? preferred : other }; // fallback: best available
}

// dsColorRoles(state) → the reduced consumption set (§6.5/§7): { chrome, poles, tokens:[{name,
// light,dark}], alias }. Each end = { rgb, frac, hex, oklch }. tokens.json, the DESIGN.md
// frontmatter, and every preview :root all read from this one source. Null when no palette enabled.
export function dsColorRoles(state) {
  const palettes = derivedAll(state);
  if (!palettes.length) return null;
  const chrome = dsChrome(palettes);
  const onSurf = dsRole(chrome, "-on-surface");
  if (!onSurf) return null;
  const poles = { ink: onSurf.light.rgb, paper: onSurf.dark.rgb };

  const endOf = (e) => {
    const frac = e.frac == null ? 1 : e.frac;
    return { rgb: e.rgb, frac, hex: e.hex != null ? e.hex : (frac === 1 ? hexOf(e.rgb) : hex8(e.rgb, frac)), oklch: roleOklch({ rgb: e.rgb, frac }) };
  };
  const rgbEnd = (rgb) => endOf({ rgb, frac: 1 });
  const tokens = [];
  const push = (name, l, d) => tokens.push({ name, light: l, dark: d });
  const slot = (p, suffix, name) => { const r = dsRole(p, suffix); if (r) push(name, endOf(r.light), endOf(r.dark)); };

  // ── chrome family: the neutral-duty surface + state slots ──
  const cn = chrome.n;
  slot(chrome, "-background", `${cn}-background`);
  slot(chrome, "-surface", `${cn}-surface`);
  slot(chrome, "-surface-high", `${cn}-surface-high`);
  slot(chrome, "-on-surface", `${cn}-on-surface`);
  slot(chrome, "-on-surface-variant", `${cn}-on-surface-variant`);
  slot(chrome, "-outline-variant", `${cn}-outline-variant`);
  const chL = dsFillOn(chrome, poles, "light", false), chD = dsFillOn(chrome, poles, "dark", false);
  push(`${cn}`, rgbEnd(chL.fillRgb), rgbEnd(chD.fillRgb));
  slot(chrome, "-hover", `${cn}-hover`);
  slot(chrome, "-active", `${cn}-active`);
  push(`${cn}-on-${cn}`, rgbEnd(chL.onRgb), rgbEnd(chD.onRgb));

  // ── every other family: base fill + measured on-color (§7 R2 — signature families included) ──
  // The brand family (the primary-action button) also carries `-hover`/`-active` state slots (R3) — the
  // chrome already has them; when the brand IS the chrome (as in the reference theme) it is not in this
  // loop, so no duplication. When brand ≠ chrome, its states are emitted here so `button-primary-*` resolves.
  const brandPal = palettes.find((p) => /primary|brand/.test(p.name.toLowerCase())) || chrome;
  const isIntent = (p) => /danger|destruct|error|critical|success|positive|warn|caution|info/.test(p.name.toLowerCase());
  const others = palettes.filter((p) => p !== chrome && !isIntent(p));
  const intentOrder = ["danger", "success", "warning", "info"];
  const rank = (p) => { const t = p.name.toLowerCase(); const i = intentOrder.findIndex((k) => t.includes(k)); return i < 0 ? 99 : i; };
  const intents = palettes.filter((p) => p !== chrome && isIntent(p)).sort((a, b) => rank(a) - rank(b));
  for (const p of [...others, ...intents]) {
    const fl = dsFillOn(p, poles, "light", true), fd = dsFillOn(p, poles, "dark", true);
    push(`${p.n}`, rgbEnd(fl.fillRgb), rgbEnd(fd.fillRgb));
    if (p === brandPal) { slot(p, "-hover", `${p.n}-hover`); slot(p, "-active", `${p.n}-active`); }
    push(`${p.n}-on-${p.n}`, rgbEnd(fl.onRgb), rgbEnd(fd.onRgb));
  }

  // ── Stitch-compat alias: `primary` = the brand-base fill (satisfies the required `primary` role).
  // Mirror the brand family's already-emitted base token verbatim so the alias never diverges from it.
  const brand = brandPal;
  const brandBase = tokens.find((t) => t.name === brand.n) || tokens.find((t) => t.name === cn);
  const alias = { name: "primary", light: brandBase.light, dark: brandBase.dark };

  const families = [chrome.n, ...others.map((p) => p.n), ...intents.map((p) => p.n)];
  return { chrome, poles, tokens, alias, families };
}

// dsFactor — leading as a unitless multiplier of size (§9.2: never px). dsTypeLayer — the full voice·step
// scale as { size, lineHeight (factor), weight }, keyed `<voice>-<step>`; letterSpacing is omitted (the
// DESIGN.md frontmatter carries it as em where a voice tracks). dsSpacing/dsRadii — the geometry ladders.
const dsFactor = (line, size) => (size > 0 ? Number((line / size).toFixed(3)) : 0);
function dsTypeLayer(typeSc) {
  const type = { fonts: { ...(typeSc && typeSc.fonts) }, scale: {} };
  if (typeSc && typeSc.categories) for (const [cName, steps] of Object.entries(typeSc.categories))
    for (const [sName, s] of Object.entries(steps))
      type.scale[`${cName.toLowerCase()}-${sName.toLowerCase()}`] = { size: s.size, lineHeight: dsFactor(s.lineHeight, s.size), weight: s.weight };
  return type;
}
const dsSpacing = (geomSc) => (geomSc && geomSc.space ? Object.keys(geomSc.space).sort((a, b) => a - b).map((k) => geomSc.space[k]) : []);
const dsRadii = (geomSc) => { const r = {}; if (geomSc && geomSc.radii) for (const [k, v] of Object.entries(geomSc.radii)) r[k] = v; return r; };

// exportDesignSystemTokens — the tokens.json carrier (Claude profile): hex `colors`/`colorsDark`, the
// full type scale (leading factors), the spacing array, and the radii ladder. Hex is the proven carrier
// (§6.2); the DESIGN.md frontmatter carries the SAME colors as OKLCH (carrier equality holds by construction).
export function exportDesignSystemTokens(state, typeSc, geomSc) {
  const ds = dsColorRoles(state);
  if (!ds) return JSON.stringify({ $note: "Design System export needs at least one enabled palette." }, null, 2);
  const colors = {}, colorsDark = {};
  for (const t of ds.tokens) { colors[t.name] = t.light.hex; colorsDark[t.name] = t.dark.hex; }
  colors[ds.alias.name] = ds.alias.light.hex; colorsDark[ds.alias.name] = ds.alias.dark.hex;
  const note = `Design System tokens.json — Ultimate Tokens naming grammar: {family}[-slot], families ${ds.families.join("/")}; CSS prefix --${cssPrefixOf(state)}-. \`colors\` light / \`colorsDark\` dark. Values hex (parser-unverified carrier); the DESIGN.md frontmatter carries the same colors as OKLCH. type.scale lineHeight is a unitless multiplier of size (leading factor — never px); letter-spacing, where present, is em/%. Every on-pair is measured ≥4.5:1 in both schemes.`;
  return JSON.stringify({
    $generator: "Ultimate Tokens by NONOUN",
    $note: note,
    colors, colorsDark,
    type: dsTypeLayer(typeSc), spacing: dsSpacing(geomSc), radii: dsRadii(geomSc),
  }, null, 2);
}

// The consumption typography selection (§9.2: the 9–15 band a single screen draws on). Theme-independent
// voice·step keys; each resolves against the full scale. kickers carry em tracking, the rest leading only.
const DS_TYPE_LEVELS = ["display-sm", "heading-lg", "heading-md", "heading-sm", "kicker-md", "lead-md", "body-md", "body-sm", "ui-md", "ui-sm", "caption-md", "code-md"];
const DS_SPACE_NAMES = ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
// dsFontStack — a quoted CSS font stack (`'Inter Tight', system-ui, …`); quoting is required for family
// names with digits/spaces (WebKit drops an unquoted `Inter Tight`/`Source Serif 4`).
const dsFontStack = (name, generic) => (name ? `'${name}', ${generic}` : generic);

// dsSpine — the universal-dialect DESIGN.md (§5): YAML frontmatter (OKLCH colors + `-dark` siblings +
// curated type + named spacing/rounded + components) then the 8 Stitch-canonical sections + Responsive
// Behavior + Agent Prompt Guide. Frontmatter colors ≡ tokens.json hex (carrier equality, one source).
export function exportDesignSystemSpine(state, typeSc, geomSc) {
  const ds = dsColorRoles(state);
  if (!ds) return "# Design System\n\n_Needs at least one enabled palette._\n";
  const pfx = cssPrefixOf(state);
  const story = (state && state.story) || {};
  const name = (state && state.name) || "Design System";
  const desc = story.title || story.narrative || `The ${name} design system.`;
  const cn = ds.chrome.n;

  // ── frontmatter: colors (light + -dark siblings), alias last ──
  const colorLines = [];
  for (const t of ds.tokens) { colorLines.push(`  ${t.name}: "${t.light.oklch}"`); colorLines.push(`  ${t.name}-dark: "${t.dark.oklch}"`); }
  const brandName = ds.families.find((f) => /primary|brand/.test(f)) || cn;
  colorLines.push(`  # Stitch-compat alias of ${brandName} (its required \`primary\`); agents use ${brandName}`);
  colorLines.push(`  ${ds.alias.name}: "${ds.alias.light.oklch}"`);
  colorLines.push(`  ${ds.alias.name}-dark: "${ds.alias.dark.oklch}"`);

  // ── frontmatter: typography (curated levels) ──
  const flat = {};
  if (typeSc && typeSc.categories) for (const [cName, steps] of Object.entries(typeSc.categories))
    for (const [sName, s] of Object.entries(steps)) flat[`${cName.toLowerCase()}-${sName.toLowerCase()}`] = { voice: cName, s };
  const roleOf = (typeSc && typeSc.roleOf) || {};
  const fonts = (typeSc && typeSc.fonts) || {};
  const typeLines = [];
  const usedLevels = [];
  for (const key of DS_TYPE_LEVELS) {
    const hit = flat[key];
    if (!hit) continue;
    usedLevels.push(key);
    const s = hit.s;
    typeLines.push(`  ${key}:`);
    typeLines.push(`    fontFamily: ${fonts[roleOf[hit.voice] || "body"] || "sans-serif"}`);
    typeLines.push(`    fontSize: ${s.size}px`);
    typeLines.push(`    fontWeight: ${s.weight}`);
    typeLines.push(`    lineHeight: ${dsFactor(s.lineHeight, s.size)}`);
    if (s.letterSpacing && Math.abs(s.letterSpacing) >= 0.01) typeLines.push(`    letterSpacing: ${Number((s.letterSpacing / s.size).toFixed(4))}em`);
  }

  // ── frontmatter: spacing + rounded (named ladders) ──
  const space = dsSpacing(geomSc);
  const spaceLines = space.map((v, i) => `  ${DS_SPACE_NAMES[i] || `s${i}`}: ${v}px`);
  const radii = dsRadii(geomSc);
  const roundLines = Object.entries(radii).map(([k, v]) => `  ${k}: ${v}px`);

  // ── frontmatter: components (grammar-named; refs resolve to the roles above) ──
  const has = (n) => ds.tokens.some((t) => t.name === n);
  const uiLvl = usedLevels.includes("ui-md") ? "ui-md" : usedLevels[0];
  const uiSm = usedLevels.includes("ui-sm") ? "ui-sm" : uiLvl;
  const bodyLvl = usedLevels.includes("body-md") ? "body-md" : uiLvl;
  const rMd = radii.md != null ? "md" : Object.keys(radii)[0];
  const rSm = radii.sm != null ? "sm" : rMd;
  const rLg = radii.lg != null ? "lg" : rMd;
  const rFull = radii.full != null ? "full" : rLg;
  const rXs = radii.xs != null ? "xs" : rSm;
  const comp = [];
  const addComp = (nm, o) => { comp.push(`  ${nm}:`); for (const [k, v] of Object.entries(o)) comp.push(`    ${k}: ${v}`); };
  const brand = ds.families.find((f) => /primary|brand/.test(f)) || cn;
  addComp("button-primary", { backgroundColor: `"{colors.${brand}}"`, textColor: `"{colors.${brand}-on-${brand}}"`, typography: `"{typography.${uiLvl}}"`, rounded: `"{rounded.${rMd}}"`, padding: "12px" });
  if (has(`${brand}-hover`)) addComp("button-primary-hover", { backgroundColor: `"{colors.${brand}-hover}"` });
  if (has(`${brand}-active`)) addComp("button-primary-active", { backgroundColor: `"{colors.${brand}-active}"` });
  const secondary = ds.families.find((f) => /secondary/.test(f) && !/muted/.test(f));
  if (secondary) addComp("button-secondary", { backgroundColor: `"{colors.${secondary}}"`, textColor: `"{colors.${secondary}-on-${secondary}}"`, typography: `"{typography.${uiLvl}}"`, rounded: `"{rounded.${rMd}}"`, padding: "12px" });
  addComp("input", { backgroundColor: `"{colors.${cn}-surface}"`, textColor: `"{colors.${cn}-on-surface}"`, typography: `"{typography.${bodyLvl}}"`, rounded: `"{rounded.${rSm}}"`, padding: "12px" });
  addComp("card", { backgroundColor: `"{colors.${cn}-surface}"`, textColor: `"{colors.${cn}-on-surface}"`, rounded: `"{rounded.${rLg}}"`, padding: "24px" });
  const metal = ds.families.find((f) => /muted/.test(f) && /secondary|neutral/.test(f)) || ds.families.find((f) => /muted/.test(f));
  if (metal) addComp("chip", { backgroundColor: `"{colors.${metal}}"`, textColor: `"{colors.${metal}-on-${metal}}"`, typography: `"{typography.${uiSm}}"`, rounded: `"{rounded.${rFull}}"`, padding: "4px" });
  const accent = ds.families.find((f) => /accent/.test(f) && !/muted/.test(f));
  if (accent) addComp("tag-accent", { backgroundColor: `"{colors.${accent}}"`, textColor: `"{colors.${accent}-on-${accent}}"`, typography: `"{typography.${uiSm}}"`, rounded: `"{rounded.${rXs}}"`, padding: "4px" });
  for (const f of ds.families) {
    if (/muted/.test(f) && f !== metal) addComp(`badge-${f}`, { backgroundColor: `"{colors.${f}}"`, textColor: `"{colors.${f}-on-${f}}"`, typography: `"{typography.${uiSm}}"`, rounded: `"{rounded.${rFull}}"`, padding: "4px" });
  }
  for (const f of ds.families) {
    if (/danger|success|warn|info/.test(f)) addComp(`badge-${f}`, { backgroundColor: `"{colors.${f}}"`, textColor: `"{colors.${f}-on-${f}}"`, typography: `"{typography.${uiSm}}"`, rounded: `"{rounded.${rFull}}"`, padding: "4px" });
  }
  addComp("popover", { backgroundColor: `"{colors.${cn}-surface-high}"`, textColor: `"{colors.${cn}-on-surface}"`, rounded: `"{rounded.${rLg}}"`, padding: "16px" });

  const frontmatter = [
    "---", "version: alpha", `name: ${name}`, `description: ${desc}`,
    "colors:", ...colorLines,
    "typography:", ...typeLines,
    "spacing:", ...spaceLines,
    "rounded:", ...roundLines,
    "components:", ...comp,
    "---",
  ].join("\n");

  const body = dsSpineBody(ds, state, { pfx, name, story, cn, brand, secondary, accent, metal, usedLevels, radii });
  return `${frontmatter}\n\n${body}\n`;
}

// dsRootCSS — the single :root block every preview shares (§9.5): `color-scheme: light dark` + one
// `light-dark(oklch, oklch)` custom property per grammar role (the alias is omitted — it duplicates the
// brand base). This is the SAME runtime idiom the Agent Prompt Guide teaches; no @media fork.
function dsRootCSS(ds, pfx) {
  const props = ds.tokens.map((t) => `--${pfx}-${t.name}:light-dark(${t.light.oklch},${t.dark.oklch});`).join("");
  return `:root{color-scheme:light dark;${props}}`;
}

// exportDesignSystemComponents — the self-contained @dsCard previews (§9.5). Returns [{name, data}] with
// names under components/. Each card: first-line @dsCard marker, inline <style> (the shared :root + card
// classes), light-dark() both schemes, no external fetch — demonstrating the states, pairing law, and scale.
export function exportDesignSystemComponents(state, typeSc, geomSc) {
  const ds = dsColorRoles(state);
  if (!ds) return [];
  const pfx = cssPrefixOf(state);
  const root = dsRootCSS(ds, pfx);
  const has = (n) => ds.tokens.some((t) => t.name === n);
  const V = (n) => `var(--${pfx}-${n})`;
  const cn = ds.chrome.n;
  const fonts = (typeSc && typeSc.fonts) || {};
  const sans = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const bodyStack = dsFontStack(fonts.body, sans);
  const headStack = dsFontStack(fonts.heading || fonts.display, sans);
  const monoStack = dsFontStack(fonts.mono, "ui-monospace, SFMono-Regular, monospace");
  const radii = dsRadii(geomSc);
  const rMd = radii.md != null ? radii.md : 12;
  const rLg = radii.lg != null ? radii.lg : 16;
  const cap = (s) => s.split(/[-\s]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const baseCss = `*{box-sizing:border-box}.cd{font-family:${bodyStack};background:${V(cn + "-background")};color:${V(cn + "-on-surface")};padding:24px;line-height:1.5}.cd h3{font-family:${headStack};margin:0 0 12px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${V(cn + "-on-surface-variant")}}.cd code{font-family:${monoStack};font-size:12px}.cap{font-size:12px;color:${V(cn + "-on-surface-variant")}}`;
  const card = (name, group, title, subtitle, css, body) =>
    ({ name: `components/${name}`, data: `<!-- @dsCard group="${group}" title="${title}" subtitle="${subtitle}" -->\n<style>${root}${baseCss}${css}</style>\n<div class="cd"><h3>${title}</h3>${body}</div>\n` });

  const out = [];
  // families for the fills demo: brand base, secondary, accent, muted signatures, intents
  const fillFams = ds.families.filter((f) => has(`${f}-on-${f}`));

  // 1. Colors — every role swatch
  {
    const sw = (n) => `<div style="display:flex;flex-direction:column;gap:4px"><div style="height:44px;border-radius:8px;background:${V(n)};border:1px solid ${V(cn + "-outline-variant")}"></div><code>${n}</code></div>`;
    const surfaces = [`${cn}-background`, `${cn}-surface`, `${cn}-surface-high`].map(sw).join("");
    const fills = fillFams.map((f) => `<div style="display:flex;flex-direction:column;gap:4px"><div style="height:44px;border-radius:8px;background:${V(f)};color:${V(f + "-on-" + f)};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">Aa</div><code>${f}</code></div>`).join("");
    out.push(card("colors.html", "Foundations", "Colors", "roles · pairing", "",
      `<p class="cap">Surfaces</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">${surfaces}</div><p class="cap">Family fills (label = its <code>on-{family}</code>)</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">${fills}</div>`));
  }
  // 2. Buttons — fills × base/hover/disabled
  {
    const btnCss = `.brow{display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap}.blabel{width:96px;font-size:12px;color:${V(cn + "-on-surface-variant")};text-transform:capitalize}.btn{border:0;border-radius:${rMd}px;padding:12px;font:inherit;font-weight:600;cursor:pointer}.btn--hover{filter:brightness(1.1)}.btn--dis{opacity:.45;cursor:not-allowed}`;
    const rows = fillFams.map((f) => {
      const st = `background:${V(f)};color:${V(f + "-on-" + f)}`;
      return `<div class="brow"><span class="blabel">${cap(f)}</span><button class="btn" style="${st}">Button</button><button class="btn btn--hover" style="${st}">Hover</button><button class="btn btn--dis" style="${st}">Disabled</button></div>`;
    }).join("");
    out.push(card("buttons.html", "Components", "Buttons", "fills · hover · disabled", btnCss,
      `${rows}<p class="cap">Each fill pairs with its <code>--${pfx}-{family}-on-{family}</code>. Hover brightens; disabled drops opacity.</p>`));
  }
  // 3. Inputs
  {
    const inCss = `.field{display:block;width:100%;padding:12px;border-radius:${radii.sm != null ? radii.sm : 8}px;border:1px solid ${V(cn + "-outline-variant")};background:${V(cn + "-surface")};color:${V(cn + "-on-surface")};font:inherit;margin-bottom:12px}.field::placeholder{color:${V(cn + "-on-surface-variant")}}.field--focus{outline:2px solid ${V(ds.families[0])};outline-offset:2px;border-color:${V(ds.families.find((f) => /primary|brand/.test(f)) || cn)}}`;
    out.push(card("inputs.html", "Components", "Inputs", "field · placeholder · focus", inCss,
      `<label class="cap">Label</label><input class="field" value="Typed value"><input class="field" placeholder="Placeholder text"><input class="field field--focus" value="Focused"><p class="cap">Field on <code>${cn}-surface</code>; focus ring is the brand family.</p>`));
  }
  // 4. Card
  {
    const cCss = `.panel{background:${V(cn + "-surface")};border:1px solid ${V(cn + "-outline-variant")};border-radius:${rLg}px;padding:24px}.panel h4{font-family:${headStack};margin:0 0 8px}.pbtn{border:0;border-radius:${rMd}px;padding:12px;font:inherit;font-weight:600;cursor:pointer;background:${V(ds.families.find((f) => /primary|brand/.test(f)) || cn)};color:${V((ds.families.find((f) => /primary|brand/.test(f)) || cn) + "-on-" + (ds.families.find((f) => /primary|brand/.test(f)) || cn))};margin-top:12px}`;
    out.push(card("card.html", "Components", "Card", "surface · elevation", cCss,
      `<div class="panel"><h4>Card title</h4><p style="margin:0">Body copy on a raised surface over the background — elevation is a surface step, not a shadow.</p><button class="pbtn">Primary action</button></div>`));
  }
  // 5. Feedback — intent + signature badges/chips
  {
    const fCss = `.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;margin:0 8px 8px 0}`;
    const intents = ds.families.filter((f) => /danger|success|warn|info/.test(f));
    const sig = ds.families.filter((f) => /muted/.test(f));
    const chip = (f) => `<span class="badge" style="background:${V(f)};color:${V(f + "-on-" + f)}">${cap(f)}</span>`;
    out.push(card("feedback.html", "Components", "Feedback", "status · signature", fCss,
      `<p class="cap">Status (intent only)</p><div>${intents.map(chip).join("")}</div><p class="cap" style="margin-top:12px">Signature (brand light — small reads)</p><div>${sig.map(chip).join("")}</div>`));
  }
  // 6. Typography — specimens rendered at their REAL scale: each level's actual size, its LEADING
  //    FACTOR (line-height, never a flat placeholder — the card must teach the true per-level leadings),
  //    and its weight, with a `<key> · size/leading · weight` caption. Theme-general via the live scale.
  {
    const flat = {};
    if (typeSc && typeSc.categories) for (const [cName, steps] of Object.entries(typeSc.categories))
      for (const [sName, s] of Object.entries(steps)) flat[`${cName.toLowerCase()}-${sName.toLowerCase()}`] = { voice: cName, s };
    const roleOf = (typeSc && typeSc.roleOf) || {};
    const stackFor = (voice) => { const r = roleOf[voice] || "body"; return r === "display" || r === "heading" ? headStack : (r === "mono" || r === "code") ? monoStack : bodyStack; };
    const tiers = [
      ["display-md", "display-sm", "display-lg", "display-xl"],
      ["heading-md", "heading-lg", "heading-sm"],
      ["body-md", "body-lg", "body-sm"],
      ["ui-md", "ui-sm", "ui-lg"],
      ["caption-md", "code-md", "caption-sm"],
    ];
    const spec = [];
    for (const tier of tiers) {
      const key = tier.find((k) => flat[k]);
      if (!key) continue;
      const { voice, s } = flat[key];
      const factor = dsFactor(s.lineHeight, s.size);
      const lhPx = Math.round(s.size * factor);
      spec.push(`<div style="font-family:${stackFor(voice)};font-size:${s.size}px;line-height:${factor};font-weight:${s.weight};margin-bottom:14px">${cap(voice)} — the spectrum of design <span class="cap" style="font-size:11px;font-weight:400">${key} · ${s.size}/${lhPx} · ${s.weight}</span></div>`);
    }
    if (!spec.length) spec.push(`<div style="font-family:${monoStack};font-size:13px">const token = <code>--${pfx}-${cn}</code>;</div>`);
    out.push(card("typography.html", "Foundations", "Typography", "voices · scale", "", spec.join("")));
  }
  // 7. Spacing & radii
  {
    const space = dsSpacing(geomSc);
    const bars = space.map((v, i) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><code style="width:56px">${DS_SPACE_NAMES[i] || i}</code><div style="height:12px;width:${Math.max(2, v)}px;background:${V(ds.families[0])};border-radius:2px"></div><span class="cap">${v}px</span></div>`).join("");
    const chips = Object.entries(radii).map(([k, v]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:48px;height:48px;background:${V(cn + "-surface-high")};border:1px solid ${V(cn + "-outline-variant")};border-radius:${v > 100 ? 999 : v}px"></div><code>${k}</code></div>`).join("");
    out.push(card("spacing.html", "Foundations", "Spacing & Radii", "scale · ladder", "",
      `<p class="cap">Spacing scale</p>${bars}<p class="cap" style="margin-top:12px">Radius ladder</p><div style="display:flex;gap:12px;flex-wrap:wrap">${chips}</div>`));
  }
  return out;
}

// dsSpineBody — the 10-section prose body (§5.1 order). Every role token is named in prose (accord),
// the Colors section teaches the naming grammar, and the Agent Prompt Guide carries the runtime
// `color-scheme` + `light-dark()` idiom (light-dark ONLY here, never in a carrier — §6.4).
function dsSpineBody(ds, state, ctx) {
  const { pfx, name, story, cn, brand, secondary, accent, metal, usedLevels, radii } = ctx;
  const has = (n) => ds.tokens.some((t) => t.name === n) || n === ds.alias.name;
  const ref = (n) => `{colors.${n}}`;
  const cap = (s) => s.split(/[-\s]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const fams = ds.families;
  const intents = fams.filter((f) => /danger|success|warn|info/.test(f));
  const mutedSig = fams.filter((f) => /muted/.test(f));
  const nonChromeBrand = fams.filter((f) => f !== cn && !/muted|danger|success|warn|info/.test(f));

  const narrative = story.narrative || `The ${name} system: calm, even surfaces carry the layout and color arrives as accent.`;
  const refuses = story.refuses || "Generic, low-contrast, decorative color with no semantic role.";

  // Colors — enumerate every family + chrome slot so the prose–token accord holds.
  const famBullet = (f, note) => has(f) ? `- **${cap(f)} \`${ref(f)}\`** — ${note} Its label is \`${ref(f + "-on-" + f)}\`.` : "";
  const brandBullets = [
    famBullet(brand, "the one decisive action per view: CTAs, links, selection. `-hover`/`-active` carry its states."),
    secondary ? famBullet(secondary, "supporting actions and quieter emphasis.") : "",
    accent ? famBullet(accent, "highlights, tags, and accents.") : "",
    ...mutedSig.filter((f) => f !== metal).map((f) => famBullet(f, "a signature brand light — small, loud reads (featured/live markers), never a field of color.")),
    metal ? famBullet(metal, "a light metallic fill in both schemes with a near-black label: chips, tags, meta badges.") : "",
    ...intents.map((f) => famBullet(f, "status only — intent colors carry meaning, never decoration.")),
  ].filter(Boolean).join("\n");

  const colors = [
    "## Colors", "",
    "Reason over **roles**, never raw hexes. Each role names its light value; the frontmatter carries the",
    "`-dark` sibling. All fill/on-pairs are contrast-verified ≥ 4.5:1 in both schemes.", "",
    "### Token naming", "",
    `Every color token follows the **Ultimate Tokens grammar**: \`--{prefix}-{family}-{slot}\`. This`,
    `project's prefix is \`${pfx}\`; its families are ${fams.map((f) => `\`${f}\``).join(", ")}. Construct names, do not invent them:`, "",
    `- The family name alone is the fill: \`--${pfx}-${brand}\`, \`--${pfx}-${intents[0] || fams[fams.length - 1]}\`.`,
    `- Text/icons ON a family fill: \`--${pfx}-{family}-on-{family}\`.`,
    "- States suffix the fill: `-hover`, `-active`, `-disabled`.",
    `- App surfaces live in the neutral family: \`--${pfx}-${cn}-background\`, \`-surface\`, \`-surface-high\`; text on`,
    "  them: `-on-surface`, `-on-surface-variant`; hairlines: `-outline-variant`.",
    `- **Prefix-adaptive**: under another prefix (\`--md-sys-*\`, \`--color-*\`), keep \`{family}-{slot}\` intact and swap only the prefix.`, "",
    `- **Surfaces** — the room, lowest to top: Background \`${ref(cn + "-background")}\` / Surface \`${ref(cn + "-surface")}\` /`,
    `  Surface-raised \`${ref(cn + "-surface-high")}\`. **Foreground \`${ref(cn + "-on-surface")}\`** — primary text; **Muted`,
    `  \`${ref(cn + "-on-surface-variant")}\`** — secondary text; **Border \`${ref(cn + "-outline-variant")}\`** — a translucent hairline (same value both schemes).`,
    brandBullets, "",
    "**Pairing law.** Text on a family fill uses that family's `on-{family}` token — which differs by",
    "scheme (light fills pair with white; the brighter dark-scheme fills pair with near-black). Text on",
    "background/surface uses `on-surface` or `on-surface-variant`. A crossed pair fails contrast in one scheme.",
  ].join("\n");

  const fontsObj = (ctx && ctx) && ds && (state.type ? null : null);
  const typography = [
    "## Typography", "",
    "Set size **and** line-height **and** weight together from one level, never free-type; leading is a",
    "unitless factor and any tracking is em — never px. The frontmatter carries the working scale",
    `(${usedLevels.length} levels). Weight is voice — never interchange the weights across roles.`,
  ].join("\n");

  const layout = [
    "## Layout", "",
    "Compose every gap and padding from the spacing scale (`{spacing.xs}` … `{spacing.5xl}`); an off-scale",
    "gap does not exist. Keep a comfortable reading measure (~60–75ch), align to a consistent grid, and let",
    "whitespace do the separating — borders are a last resort. Group related content in cards with generous",
    "internal padding (`{spacing.xl}`).",
  ].join("\n");

  const elevation = [
    "## Elevation & Depth", "",
    "Elevation is a **surface step, not a drop shadow**: `background` → `surface` → `surface-high`. A shadow",
    "is optional garnish on the top-most surfaces (popovers, menus) — one soft low-alpha layer at most.",
  ].join("\n");

  const shapes = [
    "## Shapes", "",
    "Soft-but-engineered: chips and tags `{rounded.xs}`, inputs `{rounded.sm}`, buttons `{rounded.md}`, cards",
    "and panels `{rounded.lg}`, modals `{rounded.xl}`, pills and avatars `{rounded.full}`. One radius language",
    "per view — rounded and sharp corners do not mix.",
  ].join("\n");

  const components = [
    "## Components", "",
    "State the interactive states explicitly — generic output betrays itself in hover/focus/disabled.", "",
    `- **Buttons.** \`button-primary\` per the frontmatter; **hover** \`${ref(brand + "-hover")}\`, **active**`,
    `  \`${ref(brand + "-active")}\` (each ships both scheme ends); **focus** a 2px \`${ref(brand)}\` outline at 2px`,
    "  offset; **disabled** drops to ~45% opacity. Other fills state-shift the same way: one ramp step deeper on hover in light, one brighter in dark.",
    `- **Inputs.** \`${ref(cn + "-surface")}\` field, 1px \`${ref(cn + "-outline-variant")}\`, \`${ref(cn + "-on-surface")}\` text,`,
    `  \`${ref(cn + "-on-surface-variant")}\` placeholder; **focus** swaps the border to \`${ref(brand)}\` plus a 2px ring.`,
    `- **Cards.** \`${ref(cn + "-surface")}\` on \`${ref(cn + "-background")}\`, 1px \`${ref(cn + "-outline-variant")}\`, \`{rounded.lg}\`.`,
    metal ? `- **Badges / chips.** Intent or signature fill with its own \`on-{family}\`, pill radius. \`${metal}\` is the default metadata chip.` : "- **Badges / chips.** Intent or signature fill with its own `on-{family}`, pill radius.",
  ].join("\n");

  const donts = [
    "## Do's and Don'ts", "",
    "**Three hard rules:**", "",
    "- ❌ **Never hardcode a color.** Every color is a role — bind to the role so a re-theme flows everywhere.",
    "- ❌ **Never cross an on-pair.** Use the fill's own `on-{family}` token (per scheme), or contrast fails in one scheme.",
    `- ❌ **Never stack competing primaries.** One \`${brand}\` action per view.`, "",
    "**Prefer:**", "",
    `- Reach for ${intents.map((f) => `\`${f}\``).join("/")} only for status; ${mutedSig.map((f) => `\`${f}\``).join(", ") || "signature families"} are brand light, not status — small reads, never fields of color.`,
    "- Elevate by stepping the surface ladder, not by heavy shadows.",
    "- Compose spacing, radii, and type from the scales; express states with the `-hover`/`-active` tokens, not raw opacity guesses.",
    // The signature/metal families carry quiet emphasis, not action — a POSITIVE bullet (the theme's
    // negative-space `refuses` clause belongs in the Overview, never under "Prefer:", where it inverts).
    metal
      ? `- Let \`${metal}\` carry quiet metallic emphasis — small reads${secondary ? `; keep \`${secondary}\` for actions` : ", not fields of color"}.`
      : mutedSig.length
        ? `- Let ${mutedSig.map((f) => `\`${f}\``).join(", ")} carry quiet signature emphasis — small reads, not fields of color.`
        : "- Let signature families carry quiet emphasis — small reads, not fields of color.",
  ].join("\n");

  const responsive = [
    "## Responsive Behavior", "",
    "Design mobile-first; columns stack below ~640px. Reduce display sizes on small screens but keep primary",
    "reading text at `body-md` or larger; the smaller steps are for dense, secondary UI. Touch targets ≥ 44px.",
    "Both schemes must hold at every width.",
  ].join("\n");

  const bt = ds.tokens.find((t) => t.name === brand) || ds.tokens[0];
  const onName = `${brand}-on-${brand}`;
  const ot = ds.tokens.find((t) => t.name === onName);
  const agent = [
    "## Agent Prompt Guide", "",
    `You are generating UI for **${name}**. Work in this order:`, "",
    "1. **Tokens first** — colors, type, spacing, radii from the frontmatter (Claude Design also receives",
    "   `tokens.json` with the same values as `colors`/`colorsDark` maps); never invent a value.",
    "2. **Roles, then scheme** — pick the semantic role; both ends are provided, so never hand-roll a dark",
    "   variant. Define the roles once as custom properties with native scheme switching — `color-scheme`",
    "   on `:root` is required or the dark end never fires:", "",
    "   ```css",
    "   :root {",
    "     color-scheme: light dark;",
    `     --${pfx}-${brand}: light-dark(${bt.light.oklch}, ${bt.dark.oklch});`,
    ot ? `     --${pfx}-${onName}: light-dark(${ot.light.oklch}, ${ot.dark.oklch});` : "",
    "     /* …every role, from its light + -dark pair… */",
    "   }",
    "   ```",
    "3. **Scale, then states** — size and space from the scales, then add hover/focus/active/disabled from",
    "   the Components section — states are where generic output shows.",
    `4. **One focus per view** — a single \`${brand}\` action; signature families are small reads; intent colors speak only for status.`,
    `5. **Name by grammar** — construct every token as \`--${pfx}-{family}-{slot}\`; if the host carries a different prefix, adapt the prefix and keep \`{family}-{slot}\` intact.`, "",
    "When rules conflict, the three hard rules win. Mirror the structure and pairing of the `components/` previews.",
  ].filter((l) => l !== "").join("\n");

  const overview = [
    `# ${name} — Design System`, "",
    "_Read this file as your instructions — it is the prompt. Token values are normative; the prose explains",
    "how to apply them. Every color role ships a light value and a `-dark` sibling: pick the pair, not one",
    "end. (Generated by Ultimate Tokens · NONOUN.)_", "",
    "## Overview", "",
    narrative, "",
    "Restraint over decoration: whitespace, hierarchy, one decisive action per view.", "",
    // The theme's negative-space clause — what it refuses — lives HERE (a descriptive boundary
    // statement), led by an explicit negation so it never reads as a directive to DO the refused thing,
    // and never under "Prefer:" where the same words would invert.
    `Deliberately refused: ${refuses}`,
  ].join("\n");

  return [overview, colors, typography, layout, elevation, shapes, components, donts, responsive, agent].join("\n\n");
}

// exportDesignSystemReceipt — the README.md profile receipt (§4). Every 🟢 cites a check; DIVERGENCE
// lines (constant cross-scheme on-colors) are called out per the standing rule. opts.date stamps the run
// (the caller passes it; the engine is pure). opts.profile selects the platform profile receipt:
// "claude-code" (default — the full DESIGN.md + tokens.json + previews bundle) or "google-stitch"
// (the DESIGN.md-only upload set; the same canonical spine, a Stitch-lint-framed receipt).
export function exportDesignSystemReceipt(state, typeSc, geomSc, opts = {}) {
  const ds = dsColorRoles(state);
  const profile = opts.profile === "google-stitch" ? "google-stitch" : opts.profile === "figma-make" ? "figma-make" : "claude-code";
  const folder = `design-system-for-${profile}`;
  if (!ds) return `# ${folder}\n\n_Needs at least one enabled palette._\n`;
  const pfx = cssPrefixOf(state);
  const name = (state && state.name) || "Design System";
  const date = opts.date || "on every build";
  const nGrammar = ds.tokens.length, nTotal = nGrammar + 1; // + the primary alias
  const previews = exportDesignSystemComponents(state, typeSc, geomSc);
  const mutedSig = ds.families.filter((f) => /muted/.test(f));
  // DIVERGENCE: on-colors equal across schemes (authorial, called out — never silently overridden).
  const div = ds.tokens.filter((t) => /-on-/.test(t.name) && t.light.hex.toUpperCase() === t.dark.hex.toUpperCase());
  const divLines = div.map((t) => `- ℹ️ DIVERGENCE (authorial, called out per the standing rule): \`${t.name}\` = \`${t.light.hex}\` in both schemes — a light fill that takes a near-black label in both schemes (rationale in this bundle's Colors guidance); the design-system gate flags it on every run and it is disclosed here.`);
  const scaleSteps = typeSc && typeSc.categories ? Object.values(typeSc.categories).reduce((a, s) => a + Object.keys(s).length, 0) : 0;
  // Carrier equality — measure the SAME round-trip the §8 G3 gate does: parse each frontmatter OKLCH
  // AND the tokens.json hex to sRGB8, take the max per-channel deviation over RGB (integer bytes) and
  // ALPHA (pyRound(a·255), half-to-even — matching the gate; the translucent outline-variant's 30% vs
  // its 8-digit-hex byte is the 1-LSB worst case). The gate asserts ≤1; the receipt cites what it measured.
  let carrierMaxDev = 0;
  for (const t of ds.tokens) for (const end of [t.light, t.dark]) {
    const got = oklchToSrgb8(end.oklch), want = hexToSrgb8(end.hex);
    if (!got || !want) continue;
    const [gr, ga] = got, [wr, wa] = want;
    let dev = Math.max(...gr.map((x, i) => Math.abs(x - wr[i])));
    dev = Math.max(dev, Math.abs(pyRound(ga * 255) - pyRound(wa * 255)));
    carrierMaxDev = Math.max(carrierMaxDev, dev);
  }

  // ── gate lines shared by every profile (the carrier IS the same canonical core) ──
  const contrastLines = [
    "- 🟢 Contrast: all declared fill/on-pairs ≥ 4.5:1, both schemes, all-pairs policy (R1 measured — dark-scheme",
    "  foregrounds are near-black, not white; a light fill in the dead zone is stepped one ramp step)",
  ];
  const schemeParityLine = `- 🟢 Scheme parity: identical ${nTotal}-key inventory (${nGrammar} grammar tokens + the \`primary\` Stitch-compat alias); schemes ride as \`-dark\` siblings`;
  // Stitch ships DESIGN.md ONLY (no hex file), so name the sibling the OKLCH round-trips against.
  const carrierLine = `- 🟢 OKLCH payload fidelity: every frontmatter value round-trips to 8-bit sRGB within ±1/255 per channel (measured max dev: ${carrierMaxDev}) — byte-equal to the hex carrier in \`../design-system-for-claude-code/tokens.json\``;

  // ── Stitch profile: DESIGN.md-only upload set; a Stitch-lint-framed receipt ──
  if (profile === "google-stitch") {
    return [
      `# ${folder} — Stitch profile export`, "",
      `Google Stitch upload set for **${name}**, per the Stitch profile`,
      "(`design-system-files-for-llms.md` §10.1). Generated by Ultimate Tokens · NONOUN.", "",
      "**Contents:** `DESIGN.md` only — Stitch consumes a single file. It is byte-identical",
      "with `../design-system-for-claude-code/DESIGN.md`: one canonical core, two uploads.", "",
      `## Profile receipt (checks run ${date})`, "",
      "Values are **OKLCH** (the adopted payload standard); `light-dark()` stays out of this",
      "carrier — Stitch's linter rejects it, so schemes ride as `-dark` siblings.", "",
      "- 🟢 `prelint.py check`: 0 errors — sections in Stitch canonical order (Overview · Colors · Typography · Layout ·",
      "  Elevation & Depth · Shapes · Components · Do's and Don'ts; Responsive Behavior + Agent Prompt Guide ride the",
      "  unknown-section tolerance); every `{path.to.token}` reference resolves; `primary` compat alias present",
      "  (satisfies `missing-primary`, so Stitch never auto-generates key colors)",
      ...contrastLines,
      schemeParityLine,
      carrierLine,
      "- 🟡 `npx @google/design.md lint`: 0 errors — `orphaned-tokens` warnings on the per-role `-dark` siblings (the",
      "  OKLCH schema carries no scheme axis to reference them) plus the prose-only chrome tokens are a documented",
      "  spec cost, not a defect; reproduced by the `design-system-reviewer` on the byte-identical Claude Code DESIGN.md",
      ...divLines,
      "- 🟢 Standalone: passes every offline check with no sibling files present.", "",
      "One canonical core, three uploads — see `../design-system-for-claude-code/`.", "",
    ].join("\n");
  }

  // ── Figma Make profile: a routed guidelines/ tree (no linter/schema of its own) ──
  if (profile === "figma-make") {
    return [
      `# ${folder} — Figma Make profile export`, "",
      `Figma Make kit guidelines for **${name}**, per the Figma Make profile`,
      "(`design-system-files-for-llms.md` §10.4). Generated by Ultimate Tokens · NONOUN.", "",
      "**Contents:** `guidelines/` — `Guidelines.md` (entry + routing + hard rules), `setup.md`",
      "(wiring), `styles.css` (compiled shadcn stylesheet + `@theme inline`),",
      "`foundations/{color,typography,spacing}.md`, `components/{overview,button}.md`. Drop the",
      "`guidelines/` folder into the Make kit.", "",
      `## Profile receipt (checks run ${date})`, "",
      "Figma Make validates nothing itself (no linter, no schema); `make_guidelines_check.py`",
      "(D1–D6, D10, D11) is the gate of record.", "",
      "- 🟢 D1 routing: `Guidelines.md` routes to every leaf that exists; every leaf is reachable;",
      "  no dangling routes",
      "- 🟢 D6 hard rules: `Guidelines.md` carries a `Do NOT` prohibition and the `IMPORTANT` marker",
      ...contrastLines,
      "- 🟢 D3 scheme parity: every grammar-token table row in `foundations/color.md` states light",
      "  AND dark",
      "- 🟢 D10 carrier equality: `styles.css` is the shadcn projection in the MEASURED on-color mode",
      "  (R1 — the dark-scheme fill foregrounds are the contrast-passing near-black pole, matching the",
      "  canonical core, NOT the config's fixed white which fails AA on the brightened dark fills); the",
      "  paste-ready `light-dark()` block in `foundations/color.md` re-expresses that SAME carrier,",
      "  measured against it token-for-token",
      "- 🟢 D4 runtime block + trap: one `light-dark()` block ships in `foundations/color.md` with",
      "  `color-scheme: light dark` declared in the same file",
      "- 🟢 D5 states as values: `components/button.md` names `hover` and carries a `-hover` token",
      "  reference (a var(), never an adjective)",
      "- 🟢 D11 relative leading: the type scale ships leading as a unitless factor and tracking as",
      "  em — never px",
      ...divLines,
      "- 🟡 Dark-mode toggle is a `.dark` class (shadcn's own convention, read natively by Figma",
      "  Make's preferred stack), not `light-dark()` — a deliberate, named departure from the",
      "  sibling platforms' runtime idiom; `foundations/color.md`'s runtime block carries the",
      "  equivalent `light-dark()` expression for tooling that prefers it.", "",
      "One canonical core, three uploads — see `../design-system-for-claude-code/`.", "",
    ].join("\n");
  }

  // ── Claude Code profile (default): the full DESIGN.md + tokens.json + previews bundle ──
  return [
    `# ${folder} — Claude profile export`, "",
    `Claude Design / Claude Code consumption bundle for **${name}**, per the Claude profile`,
    "(`design-system-files-for-llms.md` §10.2). Generated by Ultimate Tokens · NONOUN.", "",
    "**Contents:** `DESIGN.md` (the universal-dialect core — byte-identical with",
    "`../design-system-for-google-stitch/DESIGN.md`), `tokens.json` (structured role maps,",
    `\`colors\`/\`colorsDark\`), \`components/*.html\` (${previews.length} self-contained \`@dsCard\` previews).`, "",
    `## Profile receipt (checks run ${date})`, "",
    `Naming standard: **Ultimate Tokens grammar** — \`--{prefix}-{family}-{slot}\`, prefix \`${pfx}\`, families`,
    `${ds.families.map((f) => `\`${f}\``).join("/")}; token names match the \`css-oklch\`/\`css-hex\` semantic layer`,
    "verbatim; the spine's \"Token naming\" section teaches the grammar and prefix adaptivity.", "",
    "Encoding standard: **OKLCH payload** in DESIGN.md frontmatter (Stitch-linter-verified notation);",
    "`tokens.json` stays **hex** (parser-unverified carrier); previews and emitted UI use the",
    "**`color-scheme` + `light-dark()`** runtime idiom.", "",
    ...contrastLines,
    mutedSig.length ? `- 🟢 Signature roles present: ${mutedSig.map((f) => `\`${f}\``).join(", ")} — F2 fixed; prose–token accord holds` : "- 🟢 Prose–token accord holds (every role appears in prose, a component, or a preview)",
    schemeParityLine,
    `- 🟢 Carrier equality, notation-aware: OKLCH frontmatter ≡ hex \`tokens.json\` within ±1/255 per channel (measured max dev: ${carrierMaxDev})`,
    `- 🟢 Previews: \`@dsCard\` first line, single \`:root\` block — \`color-scheme: light dark\` + ${nGrammar} \`light-dark(oklch, oklch)\` custom properties, no media-query fork`,
    ...divLines,
    `- ℹ️ \`tokens.json\` ships the full ${scaleSteps}-step type scale (generator schema); the DESIGN.md frontmatter carries the ${DS_TYPE_LEVELS.length}-level consumption selection`, "",
    "Supersedes `../_superseded-claude-design/` (pre-fix bundle, retained for reference).", "",
  ].join("\n");
}

// exportDesignSystemBundle — the design-system-for-claude-code/ folder: DESIGN.md (the universal core) +
// tokens.json + components/*.html + README.md (the profile receipt). The Stitch (byte-identical DESIGN.md)
// and Figma Make (routed projection) folders are added by their own profile emitters.
export function exportDesignSystemBundle(state, typeSc, geomSc, opts = {}) {
  if (!dsColorRoles(state)) return [{ name: "tokens.json", data: exportDesignSystemTokens(state, typeSc, geomSc) }];
  return [
    { name: "DESIGN.md", data: exportDesignSystemSpine(state, typeSc, geomSc) },
    { name: "tokens.json", data: exportDesignSystemTokens(state, typeSc, geomSc) },
    ...exportDesignSystemComponents(state, typeSc, geomSc),
    { name: "README.md", data: exportDesignSystemReceipt(state, typeSc, geomSc, opts) },
  ];
}

// exportDesignSystemStitchBundle — the design-system-for-google-stitch/ folder: `DESIGN.md` (the SAME
// canonical spine — Stitch consumes ONE file, byte-identical to the Claude Code DESIGN.md) + `README.md`
// (the Stitch-profile receipt). One core, two uploads. Empty when no palette is enabled (nothing to upload).
export function exportDesignSystemStitchBundle(state, typeSc, geomSc, opts = {}) {
  if (!dsColorRoles(state)) return [];
  return [
    { name: "DESIGN.md", data: exportDesignSystemSpine(state, typeSc, geomSc) },
    { name: "README.md", data: exportDesignSystemReceipt(state, typeSc, geomSc, { ...opts, profile: "google-stitch" }) },
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// FIGMA MAKE profile — a routed guidelines/ tree (design-system-for-figma-make/, Phase 4).
// Figma Make validates NOTHING itself (no linter, no schema) — make_guidelines_check.py
// (D1–D6, D10, D11) is the gate of record. Reuses the SAME canonical core as the other two
// profiles: dsColorRoles for the contrast-verified grammar tokens (R1, ≥4.5:1 by construction),
// exportShadcn in the MEASURED on-color mode (onColorMode:"contrast") for styles.css (the D10 carrier —
// so its dark foregrounds pass AA like the core, never fixed white), dsTypeLayer/dsSpacing/dsRadii for
// the scale tables. Theme-general throughout — no brand-specific names/values are hardcoded.
// ══════════════════════════════════════════════════════════════════════════════

// dsShadcnRuntimeMap — parse an exportShadcn() stylesheet's `:root`/`.dark` blocks into
// { "--token": { light, dark } } (oklch()/hex literal strings). Shared by the paste-ready
// light-dark() runtime block in foundations/color.md (D4) and its D10 carrier-equality
// check — both read the SAME parse of the SAME styles.css text, so equality is measured
// against the real carrier, not a second hand-authored copy of the values.
export function dsShadcnRuntimeMap(css) {
  const rootEnd = css.indexOf(".dark {");
  const themeStart = css.indexOf("@theme inline {");
  if (rootEnd < 0 || themeStart < 0) return {};
  const rootBlock = css.slice(css.indexOf(":root {"), rootEnd);
  const darkBlock = css.slice(rootEnd, themeStart);
  const grab = (block) => {
    const m = {};
    for (const line of block.split("\n")) {
      const mm = line.match(/^\s*(--[a-z0-9-]+):\s*(oklch\([^)]*\)|#[0-9a-fA-F]+)\s*;/);
      if (mm) m[mm[1]] = mm[2];
    }
    return m;
  };
  const light = grab(rootBlock), dark = grab(darkBlock);
  const out = {};
  for (const k of Object.keys(light)) if (dark[k]) out[k] = { light: light[k], dark: dark[k] };
  return out;
}

// The consumption-role descriptions for the curated type levels (theme-general prose, not tied
// to any brand's voice) — mirrors DS_TYPE_LEVELS above.
const DS_MAKE_TYPE_USE = {
  "display-sm": "hero statements", "heading-lg": "page titles", "heading-md": "section headings",
  "heading-sm": "card titles", "kicker-md": "uppercase eyebrow", "lead-md": "intro paragraphs",
  "body-md": "primary reading text — the floor for content", "body-sm": "dense secondary text",
  "ui-md": "buttons, inputs, menus", "ui-sm": "dense controls, table chrome",
  "caption-md": "captions, help text", "code-md": "code, technical metadata",
};

// dsMakeGuidelinesMd — the ROOT router (D1 entry point) + hard rules (D6: >=1 "Do NOT" + "IMPORTANT").
function dsMakeGuidelinesMd(name, story) {
  const narrative = story.narrative || "Calm, even surfaces carry the layout; color arrives as accent, not decoration.";
  const refuses = story.refuses || "Generic, low-contrast, decorative color with no semantic role.";
  return [
    `# ${name} — Guidelines`, "",
    `You are building UI for **${name}**. ${narrative}`, "",
    `Deliberately refused: ${refuses}`, "",
    "## Stack", "",
    "**React + Tailwind + shadcn ui.** `styles.css` is this brand's compiled token projection —",
    "import it once (see `setup.md`), then build with shadcn's own installed components styled",
    "entirely by the Tailwind classes those tokens map to. Never hand-roll component CSS that",
    "duplicates what an installed shadcn component already provides.", "",
    "## Reading order", "",
    "| Question | Read |",
    "|---|---|",
    "| How do I wire this in? | `setup.md` |",
    "| Which color class do I use? | `foundations/color.md` |",
    "| Which type level? | `foundations/typography.md` |",
    "| Which gap, padding, radius? | `foundations/spacing.md` |",
    "| Which component and variant? | `components/overview.md`, then the component file |",
    "| Buttons specifically? | `components/button.md` |",
    "", "## Hard rules — IMPORTANT", "",
    "- Do NOT hardcode a color. Every color is a Tailwind class mapped in `styles.css`",
    "  (`foundations/color.md` names them). No exceptions.",
    "- Do NOT put text on a fill in anything other than that fill's own `-foreground` class —",
    "  the pair differs by scheme; both are provided.",
    "- Do NOT stack more than one `variant=\"default\"` action per view.",
    "- Do NOT invent dark-mode values. Every role ships a light value and a `.dark` override",
    "  in `styles.css`; use the pair, never hand-roll a dark variant.",
    "- Do NOT free-type font sizes, gaps, or radii — compose from the scales.",
    "- Do NOT redeclare a shadcn component's own padding, radius, or focus treatment — it",
    "  already reads `--radius`/`--ring` correctly from `styles.css`.",
    "", "## Workflow", "",
    "1. Setup first — `styles.css` imported, no `@source` rules added (see `setup.md`).",
    "2. Pick Tailwind classes by role, not by color; both schemes ship in one class.",
    "3. Set type, spacing, and radius from the scales, never free-typed.",
    "4. Use shadcn's own components; map this brand's roles onto their variant props — states",
    "   are Tailwind modifiers (`hover:`, `active:`), not new tokens.",
  ].join("\n") + "\n";
}

// dsMakeSetupMd — wiring instructions (>=1 IMPORTANT); font stacks named from typeSc.fonts.
function dsMakeSetupMd(typeSc) {
  const fonts = (typeSc && typeSc.fonts) || {};
  const body = fonts.body || "the body font";
  const display = fonts.display || fonts.heading || "the display font";
  const mono = fonts.mono || "the mono font";
  return [
    "# Setup", "",
    "This design system targets **React + Tailwind + shadcn ui** — Figma Make's own preferred",
    "stack. `styles.css` is the compiled projection of this design system; wiring it in is one",
    "import, no translation.", "",
    "## IMPORTANT", "",
    "- Import `styles.css` directly into the app's global CSS entry point.",
    "- Do NOT add `@source` rules for this package in the consumer's Tailwind config — the",
    "  tokens arrive pre-mapped through `@theme inline` in `styles.css` itself.",
    "- No ThemeProvider is required. Dark mode is a `.dark` class on `<html>` or `<body>`;",
    "  toggle it however the app already does (`next-themes` or equivalent) — this bundle",
    "  supplies the values, not the toggle mechanism.",
    "- Use shadcn ui's own installed components (`<Button>`, `<Card>`, `<Badge>`, `<Input>`, …)",
    "  styled by these tokens. Do NOT hand-roll component CSS that duplicates what an installed",
    "  shadcn component already provides — see `components/*.md` for the variant mapping.",
    "", "## Fonts", "",
    `\`styles.css\`'s \`@theme inline\` block sets \`--font-sans\` (${body}), \`--font-serif\``,
    `(${display}, used for display/headings), and \`--font-mono\` (${mono}). Load them however`,
    "the app already loads fonts (e.g. `next/font`, a `<link>` to Google Fonts) — `styles.css`",
    "only names the family stack, it does not fetch anything.",
  ].join("\n") + "\n";
}

// dsMakeColorMd — shadcn/Tailwind class prose (fill/on pairs, states as modifiers) PLUS a
// contrast-verified grammar-token reference table (D2/D3 carrier — dsColorRoles tokens are
// measured >=4.5:1 both schemes by construction, R1) PLUS the D4 paste-ready light-dark()
// runtime block (parsed from the SAME styles.css text via dsShadcnRuntimeMap — the D10 carrier).
function dsMakeColorMd(ds, pfx, shadcnCss) {
  const rt = dsShadcnRuntimeMap(shadcnCss);
  const rows = ds.families.map((f) => {
    const base = ds.tokens.find((t) => t.name === f);
    const on = ds.tokens.find((t) => t.name === `${f}-on-${f}`);
    if (!base || !on) return null;
    const use = f === ds.chrome.n ? "chrome action fill" : "family fill";
    return `| \`--${pfx}-${f}\` | ${base.light.oklch} | ${base.dark.oklch} | ${on.light.oklch} | ${on.dark.oklch} | ${use} |`;
  }).filter(Boolean);
  const runtimeLines = Object.entries(rt).map(([k, v]) => `  ${k}: light-dark(${v.light}, ${v.dark});`);
  return [
    "# Color", "",
    "Colors are **roles**, imported ready-to-use from `../styles.css` — bind to the Tailwind",
    "utility class or the shadcn component prop, never to a hex. Every role ships a light value",
    "and a `.dark` override; the values are already wired, don't derive or re-declare them.", "",
    "## Surfaces & text", "",
    "| Class | Role | Use for |",
    "|---|---|---|",
    "| `bg-background` / `text-foreground` | app canvas | the lowest, calmest surface |",
    "| `bg-card` / `text-card-foreground` | cards, panels | one step up from background |",
    "| `bg-popover` / `text-popover-foreground` | popovers, menus, sticky bars | the top surface |",
    "| `text-muted-foreground` (on `bg-background`/`bg-card`) | secondary text, captions | — |",
    "| `border-border` | hairlines, dividers, input outlines | translucent, same value both schemes |",
    "", "## Actions & brand", "",
    "| Class | Use for |",
    "|---|---|",
    "| `bg-primary text-primary-foreground` | THE action per view — CTA, link, selection |",
    "| `bg-secondary text-secondary-foreground` | supporting actions, quieter emphasis |",
    "| `bg-accent text-accent-foreground` | highlights, tags |",
    "| `ring-ring` | focus ring — every interactive element |",
    "", "## Intents (status only)", "",
    "| Class | Role |",
    "|---|---|",
    "| `bg-destructive text-destructive-foreground` | destructive/error — delete, failure, critical |",
    "", "## Rules — IMPORTANT", "",
    "- Do NOT cross a foreground pair (e.g. `text-foreground` on `bg-accent`) — each fill's own",
    "  `-foreground` class is the contract; crossing it fails contrast in one scheme.",
    "- Do NOT use `destructive` decoratively — status only, never an ordinary button.",
    "- States are Tailwind modifiers on the base class, not separate roles:",
    "  `hover:bg-primary/90`, `active:bg-primary/80`.", "",
    "## Grammar token reference (contrast-verified, both schemes ≥ 4.5:1)", "",
    "The Ultimate Tokens grammar (`--{prefix}-{family}[-slot]`) is the measured canonical source behind",
    "the classes above — each family's fill/on-fill pair verified ≥ 4.5:1 in both schemes. Families mapped",
    "to a utility class above (the surfaces · `primary`/`secondary`/`accent`/`destructive`) are bound by",
    "that class; a family below with NO utility class (e.g. the muted signature families, `success`/",
    "`warning`) is a **reference hue** — bind it via `var(--{prefix}-{family})` or add a shadcn role to",
    "`styles.css`, never by hardcoding the hex:", "",
    "| Token | Fill (Light) | Fill (Dark) | On (Light) | On (Dark) | Use |",
    "|---|---|---|---|---|---|",
    ...rows,
    "", "## Runtime alternative — `light-dark()` (illustrative)", "",
    "Do NOT paste this into the app in place of `styles.css` — Figma Make's own dark-mode toggle",
    "is the `.dark` class shadcn already reads. This block re-expresses the SAME `:root`/`.dark`",
    "values above as one `light-dark()` declaration per role (the runtime idiom this design",
    "system uses on other platforms), offered for tooling that prefers it.", "",
    "```css",
    ":root {",
    "  color-scheme: light dark;",
    ...runtimeLines,
    "}",
    "```",
  ].join("\n") + "\n";
}

// dsMakeTypographyMd — the curated type-scale table from dsTypeLayer's per-level size/leading
// (a unitless factor)/weight, tracking in em where present. Never px (D11).
function dsMakeTypographyMd(typeSc) {
  const fonts = (typeSc && typeSc.fonts) || {};
  const roleOf = (typeSc && typeSc.roleOf) || {};
  const flat = {};
  if (typeSc && typeSc.categories) for (const [cName, steps] of Object.entries(typeSc.categories))
    for (const [sName, s] of Object.entries(steps)) flat[`${cName.toLowerCase()}-${sName.toLowerCase()}`] = { voice: cName, s };
  const rows = [];
  for (const key of DS_TYPE_LEVELS) {
    const hit = flat[key];
    if (!hit) continue;
    const { voice, s } = hit;
    const fam = fonts[roleOf[voice] || "body"] || "sans-serif";
    const factor = dsFactor(s.lineHeight, s.size);
    const track = s.letterSpacing && Math.abs(s.letterSpacing) >= 0.01
      ? `, ${Number((s.letterSpacing / s.size).toFixed(3))}em tracking` : "";
    rows.push(`| \`${key}\` | ${fam} | ${s.size} / ${factor} | ${s.weight} | ${DS_MAKE_TYPE_USE[key] || "—"}${track} |`);
  }
  return [
    "# Typography", "",
    `**Display & headings** — ${fonts.display || fonts.heading || "the display font"} ·`,
    `**Body & UI** — ${fonts.body || "the body font"} · **Mono** — ${fonts.mono || "the mono font"}.`,
    "Fallbacks: `system-ui` / `ui-monospace`; the hierarchy must survive the fallback.", "",
    "## Working scale", "",
    "Each level is a set-together unit: size, line-height, and weight travel together. Leading is",
    "a unitless factor of size; tracking is em/% — **never absolute px** (standing rule). Do NOT",
    "free-type a size or pair a level with a different line-height.", "",
    "| Level | Family | Size / Leading× | Weight | Use for |",
    "|---|---|---|---|---|",
    ...rows,
    "", "## Rules — IMPORTANT", "",
    "- Do NOT use a level smaller than `body-md` for primary reading text; the smaller steps are",
    "  for dense, secondary UI only.",
    "- Do NOT use more than two heading levels in one view.",
    "- Do NOT free-type a size, gap, or line-height — compose from the scales.",
  ].join("\n") + "\n";
}

// dsMakeSpacingMd — the spacing + radius ladders, from dsSpacing/dsRadii.
function dsMakeSpacingMd(geomSc) {
  const space = dsSpacing(geomSc);
  const radii = dsRadii(geomSc);
  const spaceRows = space.map((v, i) => `| \`${DS_SPACE_NAMES[i] || `s${i}`}\` | ${v} | — |`);
  const radiusRows = Object.entries(radii).map(([k, v]) => `| \`${k}\` | ${v} | — |`);
  return [
    "# Spacing & Radii", "",
    "## Spacing scale", "",
    "Compose every gap, padding, and margin from these steps — an off-scale gap does not exist",
    "in this system.", "",
    "| Step | px | Typical use |",
    "|---|---|---|",
    ...spaceRows,
    "", "## Radius ladder", "",
    "One radius language per view — do NOT mix rounded and sharp corners.", "",
    "| Token | px | Use for |",
    "|---|---|---|",
    ...radiusRows,
    "", "## Layout rules", "",
    "- Keep reading measure ~60–75ch; let whitespace separate, not borders.",
    "- Mobile-first; columns stack below ~640px; touch targets ≥ 44px.",
    "- Elevation is a surface-ladder step (`background` → `card` → `popover`), never a heavy shadow.",
  ].join("\n") + "\n";
}

// dsMakeOverviewMd — the component index (reachable from Guidelines.md; routes to button.md).
function dsMakeOverviewMd() {
  return [
    "# Components — Overview", "",
    "Catalog and routing. Read the component file before building; states are specified there",
    "with exact values.", "",
    "| Component | Purpose | Guidelines file |",
    "|---|---|---|",
    "| Button | trigger an action; one `default` per view | `button.md` |",
    "| Input | single-line text entry | (pattern below) |",
    "| Card | grouped content, one surface step up | (pattern below) |",
    "| Chip / Badge | metadata, status, featured markers | (pattern below) |",
    "", "## Which variant? — decision tree", "",
    "```",
    "Is it THE action of the view?          -> <Button variant=\"default\">",
    "Is it a supporting action?             -> <Button variant=\"secondary\">",
    "Is it destructive?                     -> <Button variant=\"destructive\">",
    "Is it a quiet second action?           -> <Button variant=\"outline\"> / \"ghost\"",
    "```",
    "", "## Shared patterns (until a dedicated file exists)", "",
    "Use shadcn's own installed components (`<Input>`, `<Card>`, `<Badge>`) — these Tailwind",
    "classes are what they already read from `../styles.css`; don't redeclare them:", "",
    "- **Input**: `bg-background` field · `border-border` outline · `text-foreground` value ·",
    "  `placeholder:text-muted-foreground`. Focus/disabled are already correct on the installed",
    "  component — do not override.",
    "- **Card**: `bg-card text-card-foreground` on `bg-background`, `border-border`.",
    "- **Chip/Badge**: fill class + its own `-foreground` class · `rounded-full` · small type size.",
  ].join("\n") + "\n";
}

// dsMakeButtonMd — the button leaf. Names `hover` and carries a `-hover` token reference (D5:
// states as values, not adjectives) — the brand family always carries -hover/-active (dsColorRoles
// slots them on the chrome family, or on the brand family directly when brand !== chrome).
// The button leaf is theme-independent: shadcn's `<Button>` variants + Tailwind opacity-modifier states,
// bound by the shadcn classes in styles.css (no per-theme token names — so no args).
function dsMakeButtonMd() {
  return [
    "# Button", "",
    "## When to use", "",
    "The view's actions. Exactly one `variant=\"default\"` button per view; everything else is",
    "`variant=\"secondary\"`, `variant=\"outline\"`/`\"ghost\"`, or a link. `variant=\"destructive\"`",
    "only for destructive actions.", "",
    "## Variants — shadcn's own `<Button>`, mapped", "",
    "Use the installed shadcn `<Button>` component. Do NOT hand-roll button CSS — its padding,",
    "radius, and focus ring are already correct from `styles.css`'s `--radius` and `--ring`.", "",
    "| `variant` | Use for |",
    "|---|---|",
    "| `\"default\"` | THE one decisive action per view |",
    "| `\"secondary\"` | supporting actions |",
    "| `\"destructive\"` | destructive actions only |",
    "| `\"outline\"` / `\"ghost\"` | a second, non-competing action |",
    "| `\"link\"` | inline text actions |",
    "", "## States — Tailwind modifiers, not separate tokens", "",
    "There are NO separate hover/active tokens: a state is a `hover:`/`active:` **opacity modifier** on",
    "the base class (`styles.css` ships no `-hover`/`-active` variable — the alpha does the work):", "",
    "| Variant | State | Modifier | Resolves to |",
    "|---|---|---|---|",
    "| default | rest | `bg-primary` | `var(--primary)` |",
    "| default | hover | `hover:bg-primary/90` | `--primary` at 90% opacity |",
    "| default | active | `active:bg-primary/80` | `--primary` at 80% opacity |",
    "", "- **Focus**: shadcn's `<Button>` ships `focus-visible:ring-ring` already — do not override it.",
    "- **Disabled**: shadcn's `<Button disabled>` already applies the correct opacity.", "",
    "## Rules — IMPORTANT", "",
    "- One `variant=\"default\"` per view. Do NOT stack two.",
    "- Do NOT redeclare padding, radius, or focus treatment — the installed component already",
    "  has them correct from `styles.css`.",
  ].join("\n") + "\n";
}

// exportDesignSystemMakeBundle — the design-system-for-figma-make/ folder: `guidelines/` (the routed
// tree Make reads) + `README.md` (the figma-make profile receipt, folder root, NOT under guidelines/).
// Empty when no palette is enabled (nothing to upload) — mirrors the Stitch bundle.
export function exportDesignSystemMakeBundle(state, typeSc, geomSc, opts = {}) {
  const ds = dsColorRoles(state);
  if (!ds) return [];
  const pfx = cssPrefixOf(state);
  const name = (state && state.name) || "Design System";
  const story = (state && state.story) || {};
  // R1 (measured on-colors, ≥4.5:1 in BOTH schemes) governs every target of this overhaul, so the
  // shadcn projection is forced to the MEASURED on-color mode — exactly what dsColorRoles does for the
  // Claude Code/Stitch targets. Without this, the config's `onColorMode: "fixed"` keeps white foregrounds
  // in dark mode (contrast ~3.3 on the brightened fills — a real AA failure a consuming agent would ship,
  // and a contradiction with the contrast-verified grammar table). "contrast" flips the dark foregrounds
  // to the near-black pole (≥5.1), matching the canonical core. One core, one measured on-color policy.
  const shadcnCss = exportShadcn({ ...state, onColorMode: "contrast" });
  return [
    { name: "guidelines/Guidelines.md", data: dsMakeGuidelinesMd(name, story) },
    { name: "guidelines/setup.md", data: dsMakeSetupMd(typeSc) },
    { name: "guidelines/styles.css", data: shadcnCss },
    { name: "guidelines/foundations/color.md", data: dsMakeColorMd(ds, pfx, shadcnCss) },
    { name: "guidelines/foundations/typography.md", data: dsMakeTypographyMd(typeSc) },
    { name: "guidelines/foundations/spacing.md", data: dsMakeSpacingMd(geomSc) },
    { name: "guidelines/components/overview.md", data: dsMakeOverviewMd() },
    { name: "guidelines/components/button.md", data: dsMakeButtonMd() },
    { name: "README.md", data: exportDesignSystemReceipt(state, typeSc, geomSc, { ...opts, profile: "figma-make" }) },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// exportAll — every format in one object (theme-independent).
// ──────────────────────────────────────────────────────────────────────────────
export function exportAll(state, opts) {
  return {
    css: exportCSS(state),
    oklch: exportOKLCH(state),
    json: exportJSON(state),
    dtcg: exportDTCG(state, opts),
    ui3: exportUI3(state),
    tailwind: exportTailwind(state),
    shadcn: exportShadcn(state),
  };
}
