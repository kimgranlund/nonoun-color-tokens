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
// Claude Design (claude.ai/design) — a full generation bundle
// ──────────────────────────────────────────────────────────────────────────────
// A vision-capable Claude reads a Claude Design bundle as ITS INSTRUCTIONS and
// generates on-brand screens from it. Three layers: `tokens.json` (the token
// source) · `DESIGN.md` (the 9-section spine — the prompt) · `components/*.html`
// (self-contained @dsCard previews). `cdColorRoles` is the SINGLE colour source
// all three render from, so ds_check.py's D3 cross-layer consistency holds by
// construction (tokens.json canon == the spine table == every preview `:root`).
// Colours reduce the 59 roles to a small generation set via the SAME name-matcher
// shadcn uses. `typeSc` = typeScale(config); `geomSc` = model.geometryScale.
// ══════════════════════════════════════════════════════════════════════════════

// what each generation role is FOR (the "role, not just a hex" the format wants) — clean prose only
// (no `#hex` / `--var`, so a spine table row built from it stays one-var-one-hex for D3).
const CD_PURPOSE = {
  background: "the app canvas — the lowest, calmest surface",
  surface: "cards, panels, and raised content on the background",
  "surface-raised": "the top surfaces — popovers, menus, sticky bars",
  foreground: "primary text and icons on background or surface",
  muted: "secondary text, captions, and disabled labels",
  border: "hairlines, dividers, and input outlines",
  primary: "the one decisive action per view — CTAs, links, focus, selection",
  secondary: "supporting actions and quieter emphasis",
  accent: "a third brand accent for highlights and tags",
  ring: "the focus ring on interactive elements",
  danger: "destructive or error states — delete, failure, critical",
  success: "positive states — saved, complete, valid",
  warning: "caution states — needs attention, unsaved, at risk",
  info: "neutral-informational states — tips and notices",
};

// cdColorRoles — the reduced generation role set with light + dark ends + purpose. THE shared source
// for tokens.json, the spine table, and the previews. Returns null when no palette is enabled.
function cdColorRoles(state) {
  const palettes = derivedAll(state);
  const find = (re) => palettes.find((p) => re.test(p.name.toLowerCase()));
  const neutral = find(/neutral|gray|grey|slate|stone|zinc|mono/) || palettes[0];
  const primary = find(/primary|brand/) || palettes.find((p) => p !== neutral) || palettes[0];
  if (!neutral || !primary) return null;
  const danger = find(/danger|destruct|error|critical|red/);
  const success = find(/success|positive|green/);
  const warning = find(/warn|caution|amber|yellow|orange/);
  const info = find(/info|information/);
  const secondary = find(/secondary/);
  const accent = find(/tertiary|accent/);

  const rs = (p, sfx) => p && p.roles.find((r) => r.suffix === sfx);
  const prime = (p) => rs(p, "");
  const onAccent = (p) => p && p.roles.find((r) => r.suffix === "-on-" + p.n);

  // generation role -> the nonoun role whose light/dark ends drive it (null roles are skipped)
  const MAP = {
    background: rs(neutral, "-background"),
    surface: rs(neutral, "-surface"),
    "surface-raised": rs(neutral, "-surface-high"),
    foreground: rs(neutral, "-on-surface"),
    muted: rs(neutral, "-on-surface-variant"),
    border: rs(neutral, "-outline-variant"),
    primary: prime(primary), "primary-foreground": onAccent(primary),
    secondary: secondary ? prime(secondary) : rs(neutral, "-surface-high"),
    "secondary-foreground": secondary ? onAccent(secondary) : rs(neutral, "-on-surface"),
    ...(accent ? { accent: prime(accent), "accent-foreground": onAccent(accent) } : {}),
    ring: prime(primary),
    danger: prime(danger || primary), "danger-foreground": onAccent(danger || primary),
    ...(success ? { success: prime(success), "success-foreground": onAccent(success) } : {}),
    ...(warning ? { warning: prime(warning), "warning-foreground": onAccent(warning) } : {}),
    ...(info ? { info: prime(info), "info-foreground": onAccent(info) } : {}),
  };
  const out = [];
  for (const [role, r] of Object.entries(MAP)) {
    if (!r) continue;
    out.push({ role, light: r.light.hex, dark: r.dark.hex, purpose: CD_PURPOSE[role] || "" });
  }
  return out;
}

// cdTypeLayer / cdSpacing / cdRadii — the composed dimension layers, numeric px (the format's
// `spacing:[4,8,16]` convention; a spine/preview appends the unit).
function cdTypeLayer(typeSc) {
  const type = { fonts: { ...(typeSc && typeSc.fonts) }, scale: {} };
  if (typeSc && typeSc.categories) for (const [cName, steps] of Object.entries(typeSc.categories))
    for (const [sName, s] of Object.entries(steps))
      type.scale[`${cName.toLowerCase()}-${sName.toLowerCase()}`] = { size: s.size, lineHeight: s.lineHeight, weight: s.weight };
  return type;
}
const cdSpacing = (geomSc) => (geomSc && geomSc.space ? Object.keys(geomSc.space).sort((a, b) => a - b).map((k) => geomSc.space[k]) : []);
const cdRadii = (geomSc) => { const r = {}; if (geomSc && geomSc.radii) for (const [k, v] of Object.entries(geomSc.radii)) r[k] = v; return r; };

const cdHumanize = (role) => role.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const cdFontStack = (name, generic) => (name ? `'${name}', ${generic}` : generic);

// exportClaudeDesign — the tokens.json layer (`colors` light · `colorsDark` dark · numeric type/spacing/radii).
export function exportClaudeDesign(state, typeSc, geomSc) {
  const roles = cdColorRoles(state);
  if (!roles) return JSON.stringify({ $note: "Claude Design export needs at least one enabled palette." }, null, 2);
  const colors = {}, colorsDark = {};
  for (const r of roles) { colors[r.role] = r.light; colorsDark[r.role] = r.dark; }
  return JSON.stringify({
    $generator: "Ultimate Tokens by NONOUN",
    $note: "Claude Design tokens.json — `colors` is the generation role set (light scheme); `colorsDark` is the dark scheme. Dimensions (type sizes, spacing, radii) are px numbers; they feed the DESIGN.md spine's Typography/Layout sections.",
    colors, colorsDark,
    type: cdTypeLayer(typeSc), spacing: cdSpacing(geomSc), radii: cdRadii(geomSc),
  }, null, 2);
}

// cdRootCSS — the inline :root every preview shares: each role at its LIGHT hex (== tokens.json canon),
// dark in an @media block. ds_check strips @media (so dark ≠ light isn't read as drift) and only observes
// `--color-*` roles that exist in canon, so this single block keeps every preview D3-consistent.
function cdRootCSS(roles) {
  const light = roles.map((r) => `--color-${r.role}:${r.light}`).join(";");
  const dark = roles.map((r) => `--color-${r.role}:${r.dark}`).join(";");
  return `:root{color-scheme:light dark;${light}}@media(prefers-color-scheme:dark){:root{${dark}}}`;
}

// exportClaudeDesignComponents — the self-contained @dsCard previews. Returns [{name, data}] with names
// relative to the bundle root (components/*.html). Empty when no palette is enabled.
export function exportClaudeDesignComponents(state, typeSc, geomSc) {
  const roles = cdColorRoles(state);
  if (!roles) return [];
  const has = (role) => roles.some((r) => r.role === role);
  const root = cdRootCSS(roles);
  const fonts = (typeSc && typeSc.fonts) || {};
  const sans = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const bodyStack = cdFontStack(fonts.body, sans);
  const headStack = cdFontStack(fonts.heading || fonts.display, sans);
  const monoStack = cdFontStack(fonts.mono, "ui-monospace, SFMono-Regular, monospace");
  const rad = cdRadii(geomSc);
  const radMd = rad.md != null ? rad.md : 8;
  const radLg = rad.lg != null ? rad.lg : 12;

  // shell: the @dsCard marker MUST be the first line; then an inline <style> (root + base .cd canvas +
  // the card's own CSS) and the markup. No external loads (D2). Uses var() with NO fallback (no drift).
  const card = (group, title, subtitle, css, body) =>
    `<!-- @dsCard group="${group}" title="${title}" subtitle="${subtitle}" -->\n` +
    `<style>${root}*{box-sizing:border-box}` +
    `.cd{font-family:${bodyStack};background:var(--color-background);color:var(--color-foreground);padding:24px;line-height:1.5}` +
    `.cd h3{font-family:${headStack};margin:0 0 12px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-muted)}` +
    `.cd code{font-family:${monoStack};font-size:12px}${css}</style>\n<div class="cd">${body}</div>\n`;

  const files = [];

  // Colors — surfaces/text as labelled swatches, accents/intents as fills carrying their paired text.
  {
    const NEUTRAL = ["background", "surface", "surface-raised", "foreground", "muted", "border"].filter(has);
    const FILL = ["primary", "secondary", "accent", "danger", "success", "warning", "info"].filter(has);
    const nTiles = NEUTRAL.map((role) =>
      `<div style="border:1px solid var(--color-border);border-radius:8px;overflow:hidden"><div style="height:44px;background:var(--color-${role})"></div><div style="padding:8px 10px"><div style="font-weight:600;font-size:13px">${cdHumanize(role)}</div><code style="color:var(--color-muted)">--color-${role}</code></div></div>`).join("");
    const fTiles = FILL.map((role) =>
      `<div style="border-radius:8px;overflow:hidden;background:var(--color-${role})"><div style="padding:16px;color:var(--color-${role}-foreground)"><div style="font-weight:700">${cdHumanize(role)}</div><div style="font-size:12px;opacity:.85">Aa on --color-${role}-foreground</div></div></div>`).join("");
    const grid = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px";
    files.push({ name: "components/colors.html", data: card("Colors", "Color roles", "surfaces · accents · intents", "",
      `<h3>Surfaces &amp; text</h3><div style="${grid};margin-bottom:24px">${nTiles}</div><h3>Accents &amp; intents</h3><div style="${grid}">${fTiles}</div>`) });
  }

  // Typography — one specimen line per major voice, at its real size/leading/weight.
  {
    const scale = cdTypeLayer(typeSc).scale;
    const voiceFont = { display: "display", heading: "heading", body: "body", ui: "ui", caption: "ui" };
    const spec = ["display", "heading", "body", "ui", "caption"].map((needle) => {
      const key = [`${needle}-md`, `${needle}-lg`, `${needle}-sm`].find((k) => scale[k]) || Object.keys(scale).find((k) => k.startsWith(needle + "-"));
      if (!key) return "";
      const s = scale[key];
      const stack = cdFontStack(fonts[voiceFont[needle]] || fonts.body, sans);
      return `<div style="font-family:${stack};font-size:${s.size}px;line-height:${s.lineHeight}px;font-weight:${s.weight};margin-bottom:14px">${cdHumanize(needle)} — the spectrum of design <span style="font-family:${bodyStack};font-size:12px;font-weight:400;color:var(--color-muted)">${key} · ${s.size}/${s.lineHeight} · ${s.weight}</span></div>`;
    }).filter(Boolean).join("");
    files.push({ name: "components/typography.html", data: card("Type", "Type scale", "voices · sizes · weights", "", `<h3>Type scale</h3>${spec || "<p>No type scale.</p>"}`) });
  }

  // Spacing — the numeric-px scale as bars, the named radii as tiles.
  {
    const sp = cdSpacing(geomSc);
    const bars = sp.map((v, i) =>
      `<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><code style="width:72px;color:var(--color-muted)">[${i}] ${v}px</code><div style="height:14px;width:${Math.max(v, 2)}px;background:var(--color-primary);border-radius:3px"></div></div>`).join("");
    const tiles = Object.entries(rad).map(([k, v]) =>
      `<div style="text-align:center"><div style="width:60px;height:60px;background:var(--color-surface-raised);border:1px solid var(--color-border);border-radius:${Math.min(v, 30)}px;margin:0 auto"></div><div style="font-size:12px;margin-top:6px">${k}<br><span style="color:var(--color-muted)">${v}px</span></div></div>`).join("");
    files.push({ name: "components/spacing.html", data: card("Spacing", "Spacing &amp; radii", "the rhythm scale", "",
      `<h3>Spacing scale</h3><div style="margin-bottom:24px">${bars || "<p>No spacing scale.</p>"}</div><h3>Radii</h3><div style="display:flex;gap:16px;flex-wrap:wrap">${tiles}</div>`) });
  }

  // Buttons — every fill × default/hover/disabled, distinct so the render-check never sees identical variants.
  {
    const btnRoles = ["primary", "secondary", "accent", "danger"].filter(has);
    const css = `.brow{display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap}.blabel{width:88px;font-size:12px;color:var(--color-muted);text-transform:capitalize}` +
      `.btn{border:0;border-radius:${radMd}px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}.btn--hover{filter:brightness(1.12)}.btn--disabled{opacity:.45;filter:grayscale(.25);cursor:not-allowed}`;
    const rows = btnRoles.map((role) => {
      const base = `background:var(--color-${role});color:var(--color-${role}-foreground)`;
      return `<div class="brow"><span class="blabel">${role}</span><button class="btn" style="${base}">Button</button><button class="btn btn--hover" style="${base}">Hover</button><button class="btn btn--disabled" style="${base}">Disabled</button></div>`;
    }).join("");
    files.push({ name: "components/buttons.html", data: card("Components", "Buttons", "fills · hover · disabled", css,
      `<h3>Buttons</h3>${rows}<p style="font-size:12px;color:var(--color-muted);margin:8px 0 0">Each fill pairs with its <code>--color-{role}-foreground</code>. Hover brightens; disabled drops opacity.</p>`) });
  }

  // Inputs — default / focus (ring) / disabled, each visually distinct (the states §4 names get a preview).
  {
    const css = `.field{margin-bottom:14px;max-width:340px}.flabel{display:block;font-size:12px;color:var(--color-muted);margin-bottom:4px}` +
      `.in{display:block;width:100%;padding:9px 12px;border-radius:${radMd}px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-foreground);font:inherit}` +
      `.in::placeholder{color:var(--color-muted)}.in--focus{border-color:var(--color-ring);box-shadow:0 0 0 2px var(--color-ring);outline:none}.in--disabled{opacity:.5}`;
    const body = `<h3>Inputs</h3>` +
      `<div class="field"><span class="flabel">Default</span><input class="in" placeholder="you@example.com"></div>` +
      `<div class="field"><span class="flabel">Focus (--color-ring)</span><input class="in in--focus" value="typing…"></div>` +
      `<div class="field"><span class="flabel">Disabled</span><input class="in in--disabled" value="locked" disabled></div>` +
      `<p style="font-size:12px;color:var(--color-muted);margin:4px 0 0"><code>--color-surface</code> field, <code>--color-border</code> outline, <code>--color-ring</code> on focus, <code>--color-muted</code> placeholder.</p>`;
    files.push({ name: "components/inputs.html", data: card("Components", "Inputs", "default · focus · disabled", css, body) });
  }

  // Feedback — the intent palettes as chips + alert rows (each intent visually distinct).
  {
    const INTENT = ["info", "success", "warning", "danger"].filter(has);
    const msg = { danger: "something failed", success: "it worked", warning: "attention needed", info: "a neutral notice" };
    const chips = INTENT.map((role) =>
      `<span style="display:inline-block;background:var(--color-${role});color:var(--color-${role}-foreground);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;text-transform:capitalize;margin:0 8px 8px 0">${role}</span>`).join("");
    const alerts = INTENT.map((role) =>
      `<div style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--color-${role});border-radius:8px;padding:12px 14px;margin-bottom:10px"><span style="flex:none;width:22px;height:22px;border-radius:50%;background:var(--color-${role});color:var(--color-${role}-foreground);display:grid;place-items:center;font-weight:700;font-size:13px">!</span><div><div style="font-weight:600;text-transform:capitalize">${role}</div><div style="font-size:13px;color:var(--color-muted)">A ${role} message — this intent means ${msg[role]}.</div></div></div>`).join("");
    files.push({ name: "components/feedback.html", data: card("Components", "Status &amp; intents", "chips · alerts", "",
      `<h3>Status &amp; intents</h3><div style="margin-bottom:16px">${chips}</div>${alerts}`) });
  }

  // Card — a composed surface (elevation via the surface ladder, not a heavy shadow) with real actions.
  {
    const primaryLabel = has("primary") ? "primary" : "foreground";
    files.push({ name: "components/card.html", data: card("Components", "Content card", "surface · elevation · actions", "",
      `<h3>Card</h3><div style="max-width:360px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:${radLg}px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.06)">` +
      `<div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--color-${primaryLabel});font-weight:700;margin-bottom:8px">Featured</div>` +
      `<div style="font-family:${headStack};font-size:20px;font-weight:700;margin-bottom:8px">A composed surface</div>` +
      `<p style="margin:0 0 16px">Body copy sits on <code>--color-surface</code>, one step above the page. Detail text uses <code>--color-muted</code>.</p>` +
      `<div style="font-size:13px;color:var(--color-muted);margin-bottom:16px">Updated moments ago · 3 min read</div>` +
      `<div style="display:flex;gap:10px"><button style="border:0;border-radius:${radMd}px;padding:9px 16px;font:inherit;font-weight:600;background:var(--color-primary);color:var(--color-primary-foreground);cursor:pointer">Primary</button>` +
      `<button style="border:1px solid var(--color-border);border-radius:${radMd}px;padding:9px 16px;font:inherit;font-weight:600;background:transparent;color:var(--color-foreground);cursor:pointer">Secondary</button></div></div>`) });
  }

  return files;
}

// exportClaudeDesignSpine — the DESIGN.md spine: the 9-section generation PROMPT. The §2 Colour table
// is authoritative for ds_check D3 (one `--color-*` + one light hex per row, == tokens.json canon).
export function exportClaudeDesignSpine(state, typeSc, geomSc) {
  const roles = cdColorRoles(state);
  if (!roles) return "# Design System\n\n_Enable at least one palette to author the spine._\n";
  const brand = ((state && state.name) || "This").toString().trim() || "This";
  const has = (role) => roles.some((r) => r.role === role);
  const val = (role) => (roles.find((r) => r.role === role) || {}).light;

  const type = cdTypeLayer(typeSc), scale = type.scale, fonts = type.fonts;
  const sizes = Object.values(scale).map((s) => s.size);
  const minS = sizes.length ? Math.min(...sizes) : 0, maxS = sizes.length ? Math.max(...sizes) : 0;
  // weights PER VOICE (each carries its rule) rather than a bare set dump; the on-screen body floor.
  const voiceWeight = (needle) => { const k = [`${needle}-md`, `${needle}-lg`, `${needle}-sm`].find((x) => scale[x]) || Object.keys(scale).find((x) => x.startsWith(needle + "-")); return k ? scale[k].weight : null; };
  const weightLine = [["Body", "body"], ["Headings", "heading"], ["Display", "display"], ["UI", "ui"], ["Mono", "code"]].map(([lab, n]) => { const w = voiceWeight(n); return w ? `${lab} ${w}` : null; }).filter(Boolean).join(" · ");
  const bodyBase = (scale["body-md"] || scale["body-lg"] || {}).size || 16;
  const sp = cdSpacing(geomSc), rad = cdRadii(geomSc);

  // §2 — one authoritative row per NON-foreground role (foregrounds are prose-paired below, so no row
  // carries two colours). Each row: exactly one `--color-*` + one light `#hex` → ds_check D3 canon.
  const colorRows = roles.filter((r) => !r.role.endsWith("-foreground"))
    .map((r) => `| ${cdHumanize(r.role)} | \`--color-${r.role}\` | \`${r.light}\` | ${r.purpose} |`).join("\n");
  const fgPairs = roles.filter((r) => r.role.endsWith("-foreground")).map((r) => `\`--color-${r.role}\``).join(", ");
  const intents = ["info", "success", "warning", "danger"].filter(has);

  const fontLine = [fonts.heading && `**Display & headings** — \`${fonts.heading}\``, fonts.body && `**Body & UI** — \`${fonts.body}\``, fonts.mono && `**Mono** — \`${fonts.mono}\``].filter(Boolean).join(" · ");
  const spLine = sp.length ? sp.join(" · ") : "4 · 8 · 12 · 16 · 24";
  const RAD_USE = { none: "flush edges", xs: "chips & tags", sm: "inputs & small controls", md: "buttons & controls", lg: "cards & panels", xl: "modals & sheets", full: "pills & avatars" };
  const radLine = Object.entries(rad).map(([k, v]) => `\`${k}\` ${v}px (${RAD_USE[k] || "—"})`).join(" · ") || "`md` 12px (controls) · `lg` 16px (cards)";
  const surfaceLadder = ["background", "surface", "surface-raised"].filter(has).map((r) => `\`--color-${r}\``).join(" → ");

  return `# ${brand} — Design System

_**Read this file as your instructions — it is the prompt.** Generate screens that match this brand:
values live in \`tokens.json\`, and the \`components/\` previews are representative reference renderings.
(Generated by Ultimate Tokens · NONOUN.)_

## 1. Visual Theme & Atmosphere

Calm, legible, and perceptually even. ${has("primary") ? "A single decisive accent" : "A restrained accent"} does the
work; neutral surfaces carry the interface; the intent colours speak only when they mean something.
Every colour ships a **light and a dark** end — design once and both schemes hold. Favour restraint over
decoration: whitespace, hierarchy, and one clear action per view.

## 2. Color Palette & Roles

Reason over **roles**, never raw hexes. Each row is the light value; \`tokens.json\` → \`colors\` (light) and
\`colorsDark\` (dark) carry both schemes — do not invent per-colour dark overrides, the pair is provided.

| Role | Variable | Value | Use it for |
|---|---|---|---|
${colorRows}

**Pairing law.** Text on a fill uses that fill's paired \`-foreground\` (${fgPairs || "the matching text token"}) —
e.g. \`--color-primary-foreground\` on a \`--color-primary\` fill. Text on \`--color-background\`/\`--color-surface\`
uses \`--color-foreground\` (primary) or \`--color-muted\` (secondary). Never cross a pair.

**Intents carry meaning, not decoration.** ${intents.length ? intents.map((r) => `\`--color-${r}\``).join(", ") : "The status colours"}
signal status only — never reach for \`--color-danger\` for an ordinary button. Chrome (neutral surfaces) and
\`--color-primary\` carry everything else.

## 3. Typography Rules

${fontLine || "**Body** — system-ui"}. If a brand face isn't loaded in the render pane, it falls back to
\`system-ui\` (sans) / \`ui-monospace\` (mono) — design so the hierarchy still reads in the fallback.
Weight by role: ${weightLine || "body 400 · headings 600"} — use each weight for its voice, not
interchangeably. The scale spans **${minS}–${maxS}px** across ${Object.keys(scale).length} steps
(\`tokens.json\` → \`type.scale\`, keyed \`voice-step\`); set size **and** line-height together from it, never free-type.

## 4. Component Stylings

State the interactive states explicitly — generic output betrays itself in hover/focus/disabled.

- **Buttons.** Fill = \`--color-{role}\`, text = \`--color-{role}-foreground\`, radius \`${rad.md != null ? rad.md : 8}px\`.
  **Hover** brightens the fill slightly; **active** presses it a touch further; **focus** shows a 2px
  \`--color-ring\` outline; **disabled** drops opacity (~45%) and removes the pointer.
- **Inputs.** \`--color-surface\` field, \`1px --color-border\`, \`--color-foreground\` text,
  \`--color-muted\` placeholder; **focus** swaps the border to \`--color-ring\` (+ a 2px ring);
  **disabled** drops opacity.
- **Cards.** \`--color-surface\` on the \`--color-background\` page, \`1px --color-border\`, radius
  \`${rad.lg != null ? rad.lg : 12}px\`; an interactive card lifts one surface step on **hover**.
- **Badges / chips.** Intent fill + its \`-foreground\`, pill radius.

## 5. Layout Principles

Space on the numeric scale (px): ${spLine}. Compose gaps and padding from these steps — never invent a 7px
or 13px gap. Corner radii: ${radLine}. Keep a comfortable reading measure (~60–75ch) and align to a
consistent grid; let whitespace, not borders, do the separating.

## 6. Depth & Elevation

Elevation is a **surface step, not a drop shadow**: raise content along the ladder
${surfaceLadder || "`--color-surface`"}. A shadow is optional garnish on the top-most surfaces
(popovers, menus) — keep it soft (a single low-alpha layer), never a heavy glow on a flat card.

## 7. Do's & Don'ts

**Three hard rules — never break these:**

- ❌ **Never hardcode a colour.** Every colour is a \`--color-*\` role — ✅ bind to the role, so a re-theme flows everywhere.
- ❌ **Never break a foreground pair** (e.g. \`--color-foreground\` on a \`--color-primary\` fill) — ✅ use the fill's own \`-foreground\`, or contrast fails in one scheme.
- ❌ **Never stack competing primaries** — ✅ one \`--color-primary\` action per view, so the eye lands where you intend.

**Prefer:**

- Reach for an intent colour only for its meaning; don't decorate with \`--color-danger\` / \`--color-success\`.
- Elevate by stepping the surface ladder; don't fake depth with a heavy shadow on a flat surface.
- Compose spacing, radii, and type from the scales; don't free-type off-scale gaps or sizes.
- Express a state with its token (hover/disabled), not with raw \`opacity\` on an arbitrary colour.

## 8. Responsive Behavior

Design mobile-first and let columns **stack** below ~640px; reveal multi-column layouts as width allows.
Reduce display sizes on small screens, but keep primary reading text at the body base (**${bodyBase}px**)
or larger — the smaller body steps are for dense, secondary UI — and touch targets ≥44px. Let content
reflow; hide only genuinely secondary chrome. Both colour schemes must hold at every width.

## 9. Agent Prompt Guide

You are generating UI for **${brand}**. Work in this order:

1. **Tokens first** — take colours, type, spacing, and radii from \`tokens.json\`; never invent a value.
2. **Roles, then scheme** — pick the semantic \`--color-*\` role for each element; both light and dark ends
   are provided, so don't hand-roll a dark variant.
3. **Scale, then states** — size and space from the scales, then add the interactive states
   (hover / focus / disabled) — the states are where generic output shows.
4. **One focus per view** — a single \`--color-primary\` action; keep the rest neutral; let an intent
   colour speak only when it carries status.

When two rules conflict, the three hard rules in §7 win. Mirror the structure and pairing of the
\`components/\` previews.
`;
}

// exportClaudeDesignBundle — the whole bundle as [{name, data}] (names relative to the bundle root):
// tokens.json + DESIGN.md + components/*.html. One shared colour source ⇒ ds_check D3 holds across all three.
export function exportClaudeDesignBundle(state, typeSc, geomSc) {
  const files = [{ name: "tokens.json", data: exportClaudeDesign(state, typeSc, geomSc) }];
  if (cdColorRoles(state)) {
    files.push({ name: "DESIGN.md", data: exportClaudeDesignSpine(state, typeSc, geomSc) });
    files.push(...exportClaudeDesignComponents(state, typeSc, geomSc));
  }
  return files;
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
