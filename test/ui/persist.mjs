#!/usr/bin/env node
// verify.mjs — ui-persistence validation adapter (CRITIC side; deny-on-write to the advancer).
import * as U from "../../src/ui/persist.js";
import * as X from "../../src/engine/exports.js";   // theme-invariance tests the exporters against state.theme
import * as Ty from "../../src/engine/type.mjs";     // allowlist-parity: canonical TYPE_TREATMENTS ids + voice set
import * as Ge from "../../src/engine/geometry.mjs"; // allowlist-parity: canonical GEOMETRY_TREATMENTS ids

let _s = 0x1234abcd >>> 0;
const rnd = () => { _s = (Math.imul(_s, 1103515245) + 12345) >>> 0; return _s / 0x100000000; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const deepEq = (a, b) => JSON.stringify(srt(a)) === JSON.stringify(srt(b));
const srt = (v) => Array.isArray(v) ? v.map(srt) : (v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, srt(v[k])])) : v);
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

const inDomainState = () => {
  const n = 1 + Math.floor(rnd() * 4);
  const palettes = Array.from({ length: n }, (_, i) => {
    const p = { name: "P" + i, hue: rnd() * 360, chroma: rnd() * 100, skew: -100 + rnd() * 200, lift: -40 + rnd() * 80, hueShift: -60 + rnd() * 120, hueSameDir: rnd() > 0.5, on: rnd() > 0.3 };
    if (rnd() > 0.5) p.cuspPull = rnd() * 100; // OPTIONAL per-palette override — must round-trip when present, and stay absent when not
    return p;
  });
  // per-doc semantic-mapping overrides: a random, shape-valid subset re-points some roles.
  const roleOverrides = {};
  for (const [k, v] of [["onSurface", { light: "900", dark: "100" }], ["primary", { light: "500-300" }], ["outline", { dark: "550" }]])
    if (rnd() > 0.5) roleOverrides[k] = v;
  // per-cell SIZE/HEIGHT token overrides (Tokens-matrix Phase 3): a random in-domain subset. Keys carry
  // the modeKey suffix; values are in-domain integers so they must round-trip byte-for-byte when present.
  const tyTok = {}; for (const [k, v] of [["Body|MD|base", 40], ["Display|XL|base", 90], ["UI|SM|base", 13]]) if (rnd() > 0.5) tyTok[k] = v;
  const geTok = {}; for (const [k, v] of [["MD|base", 30], ["2XL|base", 72], ["XS|base", 18]]) if (rnd() > 0.5) geTok[k] = v;
  return { curve: pick(["linear", "sine", "cubic", "logistic", "exp"]), tension: rnd() * 100, lmin: rnd() * 40, lmax: 60 + rnd() * 40,
    damp: rnd() * 100, dampCurve: 0.5 + rnd() * 3.5, dampAmp: rnd() * 100, dampBias: -100 + rnd() * 200,
    hueSpace: pick(["cam16", "oklch"]), relChroma: rnd() > 0.5, chromaFloor: rnd() * 100, toneMode: pick(["even", "perceptual", "peak"]), vibrancy: rnd() * 100, onColorMode: pick(["fixed", "contrast"]), accentRef: pick(["mode", "single"]), type: { treatment: pick(["product", "luxury", "editorial", "technical", "statement"]), bodyBase: 10 + Math.floor(rnd() * 22), ...(rnd() > 0.5 ? { modes: [{ id: "tm-" + Math.floor(rnd() * 1e6).toString(36), name: pick(["Mobile", "Desktop", "Mode 2"]), bodyBase: 10 + Math.floor(rnd() * 22), ...(rnd() > 0.5 ? { minWidth: 320 + Math.floor(rnd() * 1200) } : {}) }] } : {}), ...(Object.keys(tyTok).length ? { tokenOverrides: tyTok } : {}) }, geometry: { treatment: pick(["comfortable", "compact", "spacious", "touch", "pill"]), baseHeight: 20 + Math.floor(rnd() * 29), ...(rnd() > 0.5 ? { rampContrast: Math.round(rnd() * 95) / 100 } : {}), ...(rnd() > 0.5 ? { modes: [{ id: "gm-" + Math.floor(rnd() * 1e6).toString(36), name: pick(["Mobile", "Desktop", "Mode 2"]), baseHeight: 20 + Math.floor(rnd() * 29), ...(rnd() > 0.5 ? { minWidth: 320 + Math.floor(rnd() * 1200) } : {}), ...(rnd() > 0.5 ? { rampContrast: Math.round(rnd() * 95) / 100 } : {}) }] } : {}), ...(Object.keys(geTok).length ? { tokenOverrides: geTok } : {}) }, theme: pick(["auto", "light", "dark"]), selected: Math.floor(rnd() * n), roleOverrides, palettes };
};

// ── hpg-persistence-roundtrip: in-domain identity ─────────────────────────────────────────
for (let i = 0; i < 200; i++) {
  const S = inDomainState();
  const R = U.hydrate(U.serialize(S));
  if (!deepEq(R, S)) { FAIL("roundtrip", `hydrate(serialize(S)) != S (e.g. ${JSON.stringify(S).slice(0, 90)})`); break; }
}
// ── per-field clamp: only the violated field changes, in-domain siblings preserved ────────
const base = inDomainState(); base.palettes = base.palettes.length ? base.palettes : [{ name: "P0", hue: 100, chroma: 50, skew: 0, lift: 0, on: true }];
const mut = JSON.parse(JSON.stringify(base)); mut.lmax = 45;                 // out of [60,100]
const hyd = U.hydrate(U.serialize(mut));
if (hyd.lmax !== 60) FAIL("clamp", `lmax 45 -> ${hyd.lmax}, want 60 (nearest bound)`);
for (const k of ["curve", "tension", "lmin", "damp", "hueSpace", "selected"]) if (!deepEq(hyd[k], base[k])) FAIL("clamp", `clamping lmax disturbed ${k}: ${JSON.stringify(base[k])} -> ${JSON.stringify(hyd[k])}`);
const mut2 = JSON.parse(JSON.stringify(base)); mut2.palettes[0].hue = 410;   // out of [0,360]
const hyd2 = U.hydrate(U.serialize(mut2));
if (hyd2.palettes[0].hue !== 360) FAIL("clamp", `palette hue 410 -> ${hyd2.palettes[0].hue}, want 360`);
if (!deepEq(hyd2.palettes[0].chroma, base.palettes[0].chroma)) FAIL("clamp", "clamping palette hue disturbed sibling chroma");
// export-format prefs (doc.export = { unit, colorPrefix, … }) — each valid key round-trips; absent stays
// absent; invalid keys drop; an all-invalid object drops the whole `export`. (colorFormat was REMOVED —
// Download-All now emits BOTH css-hex/ and css-oklch/, so a legacy colorFormat key is simply dropped.)
{
  const both = JSON.parse(JSON.stringify(base)); both.export = { unit: "rem", colorPrefix: "brand" };
  const r = U.hydrate(U.serialize(both)).export;
  if (!r || r.unit !== "rem" || r.colorPrefix !== "brand") FAIL("export", `doc.export {unit,colorPrefix} did not round-trip (got ${JSON.stringify(r)})`);
  if ("export" in U.hydrate(U.serialize(base))) FAIL("export", "absent export must stay absent (identity gate)");
  // a legacy/unknown colorFormat key is ignored — never re-appears; the valid `unit` is kept.
  const legacy = JSON.parse(JSON.stringify(base)); legacy.export = { unit: "rem", colorFormat: "oklch" };
  const lr = U.hydrate(U.serialize(legacy)).export;
  if (!lr || lr.unit !== "rem" || "colorFormat" in lr) FAIL("export", `a legacy colorFormat key must drop, keeping unit (got ${JSON.stringify(lr)})`);
  const mixed = JSON.parse(JSON.stringify(base)); mixed.export = { unit: "furlong", colorPrefix: "brand" };
  if (JSON.stringify(U.hydrate(U.serialize(mixed)).export) !== JSON.stringify({ colorPrefix: "brand" })) FAIL("export", "an invalid unit must drop only that key, keeping the valid colorPrefix");
  const bad = JSON.parse(JSON.stringify(base)); bad.export = { unit: "furlong", colorFormat: "cmyk" };
  if ("export" in U.hydrate(U.serialize(bad))) FAIL("export", "an all-invalid export object must drop entirely");
  // colorPrefix (the configurable --{prefix}-* colour naming): a sanitized non-default value persists;
  // the default "c" drops (identity); junk sanitizes; a leading digit is repaired.
  const pfx = JSON.parse(JSON.stringify(base)); pfx.export = { colorPrefix: "md-sys-color" };
  if (U.hydrate(U.serialize(pfx)).export.colorPrefix !== "md-sys-color") FAIL("export", "colorPrefix must round-trip");
  const defp = JSON.parse(JSON.stringify(base)); defp.export = { colorPrefix: "c" };
  if ("export" in U.hydrate(U.serialize(defp))) FAIL("export", "the default colorPrefix 'c' must drop (identity gate)");
  const junk = JSON.parse(JSON.stringify(base)); junk.export = { colorPrefix: "MD Sys!!" };
  if (U.hydrate(U.serialize(junk)).export.colorPrefix !== "md-sys") FAIL("export", `colorPrefix must sanitize to a legal ident core (got ${JSON.stringify(U.hydrate(U.serialize(junk)).export)})`);
  const dig = JSON.parse(JSON.stringify(base)); dig.export = { colorPrefix: "3x" };
  if (U.hydrate(U.serialize(dig)).export.colorPrefix !== "c3x") FAIL("export", "a leading-digit colorPrefix must be repaired (CSS idents can't start with a digit)");
  // typePrefix (default "type" drops) + geomPrefix (default "" absent) — the type/geometry naming scheme.
  const sch = JSON.parse(JSON.stringify(base)); sch.export = { typePrefix: "md-sys-typescale", geomPrefix: "md-sys" };
  const rs = U.hydrate(U.serialize(sch)).export;
  if (rs.typePrefix !== "md-sys-typescale" || rs.geomPrefix !== "md-sys") FAIL("export", `type/geom prefixes must round-trip (got ${JSON.stringify(rs)})`);
  const dflt = JSON.parse(JSON.stringify(base)); dflt.export = { typePrefix: "type", geomPrefix: "" };
  if ("export" in U.hydrate(U.serialize(dflt))) FAIL("export", "default typePrefix 'type' + empty geomPrefix must drop (identity gate)");
}

// clamp-to-default hydrator would fail the above (it discards in-domain values) — that's the anti-hack

// ── hpg-persistence-field-default: a doc PREDATING the differential-damping fields hydrates
//    to the legacy-equivalent defaults (1.5/0/0) — the 0.6 byte-unchanged-reload promise ─────
{
  const canon = inDomainState();
  canon.dampCurve = 1.5; canon.dampAmp = 0; canon.dampBias = 0;     // explicit legacy defaults
  const pre = U.serialize(canon);
  delete pre.dampCurve; delete pre.dampAmp; delete pre.dampBias;     // a pre-0.6 persisted doc
  const h = U.hydrate(pre);
  if (h.dampCurve !== 1.5 || h.dampAmp !== 0 || h.dampBias !== 0)
    FAIL("field-default", `absent damping fields hydrated to ${h.dampCurve}/${h.dampAmp}/${h.dampBias}, want 1.5/0/0`);
  // and the whole hydrated doc is byte-identical to hydrating the explicit-defaults doc
  if (!deepEq(h, U.hydrate(U.serialize(canon))))
    FAIL("field-default", "pre-0.6 doc did not hydrate byte-identically to the explicit-defaults doc");

  // a config OMITTING lmin/lmax/damp (e.g. a hand-authored / partial import) hydrates to their sensible
  // DEFAULTS (5/100/80), NOT the domain floors (0/60/0) which would cap the ramp dark.
  const partial = U.serialize(inDomainState());
  delete partial.lmin; delete partial.lmax; delete partial.damp;
  const hp = U.hydrate(partial);
  if (hp.lmin !== 5 || hp.lmax !== 100 || hp.damp !== 80)
    FAIL("field-default", `absent lmin/lmax/damp hydrated to ${hp.lmin}/${hp.lmax}/${hp.damp}, want 5/100/80 (not the domain floors)`);
}

// ── token-overrides (Tokens-matrix Phase 3): round-trip + clamp into range + drop invalid ────────────────
{
  // an in-domain map round-trips byte-for-byte (covered broadly by the fuzz above; spot-checked here).
  const S = inDomainState();
  S.type = { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": 40, "UI|SM|tm-x": 13 } };
  S.geometry = { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": 30, "2XL|gm-y": 72 } };
  const R = U.hydrate(U.serialize(S));
  if (!deepEq(R.type.tokenOverrides, S.type.tokenOverrides)) FAIL("token-overrides", `type tokenOverrides did not round-trip: ${JSON.stringify(R.type.tokenOverrides)}`);
  if (!deepEq(R.geometry.tokenOverrides, S.geometry.tokenOverrides)) FAIL("token-overrides", `geom tokenOverrides did not round-trip: ${JSON.stringify(R.geometry.tokenOverrides)}`);
  // per-role custom font overrides round-trip; junk role keys / blank families drop.
  const Rf = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "luxury", bodyBase: 16, fonts: { body: "Custom Sans", ui: "My Mono", bogus: "x", display: "  " } } }));
  if (!deepEq(Rf.type.fonts, { body: "Custom Sans", ui: "My Mono" })) FAIL("type-fonts", `type.fonts did not round-trip / didn't drop junk: ${JSON.stringify(Rf.type.fonts)}`);
  const Rf0 = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "product", bodyBase: 16 } }));
  if ("fonts" in Rf0.type) FAIL("type-fonts", "an absent fonts override must NOT materialize a fonts key (round-trip identity)");
  // per-voice shaping overrides round-trip; unknown voices drop; out-of-range fields clamp. `ratio` is
  // RETIRED (2026-07-13 — size is now a fixed table, not base×ratio^n) and no longer a recognized field.
  const Rv = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "product", bodyBase: 16, voices: { Body: { weight: 600, leading: 1.8, ratio: 1.3, tracking: 0.01 }, Bogus: { weight: 500 }, Display: { weight: 99999 } } } }));
  if (!deepEq(Rv.type.voices.Body, { weight: 600, leading: 1.8, tracking: 0.01 })) FAIL("type-voices", `type.voices.Body did not round-trip (and 'ratio' should be silently dropped, not a recognized field): ${JSON.stringify(Rv.type.voices.Body)}`);
  if ("Bogus" in Rv.type.voices) FAIL("type-voices", "an unknown voice name must drop");
  if (Rv.type.voices.Display.weight !== 1000) FAIL("type-voices", `weight 99999 should clamp to 1000, got ${Rv.type.voices.Display.weight}`);
  // SIBLING WEIGHTS round-trip: valid entries survive (name trimmed/capped, weight clamped); invalid drop;
  // an ABSENT list never materializes a weights key (the hydrate identity gate) — but an EXPLICIT empty
  // array `weights: []` DOES materialize (as `[]`), since it's a deliberate opt-out (typeScale treats
  // undefined vs [] differently: undefined auto-populates via siblingWeightDefaults, [] stays bare) —
  // dropping it here would silently un-opt-out a voice on the very next hydrate (found live via a
  // real-font preset's Display voice, whose only real weight left no real sibling to offer).
  const Rw = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "product", bodyBase: 16, voices: { Display: { weights: [{ name: "Bold", weight: 700 }, { name: "  Medium ", weight: 99999 }, { name: "", weight: 500 }, { weight: 400 }] }, Body: { weights: [] } } } }));
  if (!deepEq(Rw.type.voices.Display.weights, [{ name: "Bold", weight: 700 }, { name: "Medium", weight: 1000 }])) FAIL("type-voices", `sibling weights did not round-trip: ${JSON.stringify(Rw.type.voices.Display.weights)}`);
  if (!Rw.type.voices.Body || !Array.isArray(Rw.type.voices.Body.weights) || Rw.type.voices.Body.weights.length !== 0) FAIL("type-voices", `an EXPLICIT empty weights list must round-trip as [] (an opt-out), not drop (got ${JSON.stringify(Rw.type.voices.Body && Rw.type.voices.Body.weights)})`);
  const Rw0 = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "product", bodyBase: 16, voices: { Body: { weight: 600 } } } }));
  if ("weights" in Rw0.type.voices.Body) FAIL("type-voices", "a voice with NO weights key at all must still round-trip with no weights key (absent stays absent, only [] is the opt-out)");
  if ("voices" in Rf0.type) FAIL("type-voices", "an absent voices override must NOT materialize a voices key (round-trip identity)");

  // ── icons: the icon-system facet. Identity-gated (default system+variant ⇒ absent); unknown id drops;
  // a non-default choice round-trips; custom needs a name and keeps it verbatim.
  const Ri0 = U.hydrate(U.serialize(inDomainState()));
  if ("icons" in Ri0) FAIL("icons", "an absent icons facet must NOT materialize an icons key (round-trip identity)");
  if ("icons" in U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "phosphor", variant: "regular" } }))) FAIL("icons", "the DEFAULT system at its default variant must round-trip as ABSENT (identity gate)");
  if ("icons" in U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "bogus-set" } }))) FAIL("icons", "an unknown icon-system id must drop");
  const Ri1 = U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "phosphor", variant: "duotone" } }));
  if (!deepEq(Ri1.icons, { id: "phosphor", variant: "duotone" })) FAIL("icons", `a non-default variant did not round-trip: ${JSON.stringify(Ri1.icons)}`);
  const Ri2 = U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "lucide", variant: "nonsense" } }));
  if (!deepEq(Ri2.icons, { id: "lucide" })) FAIL("icons", `a variant-less library must drop the variant: ${JSON.stringify(Ri2.icons)}`);
  const Ri3 = U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "material-symbols", variant: "nonsense" } }));
  if (!deepEq(Ri3.icons, { id: "material-symbols", variant: "outlined" })) FAIL("icons", `an invalid variant must fall back to the library default: ${JSON.stringify(Ri3.icons)}`);
  if ("icons" in U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "custom", name: "  " } }))) FAIL("icons", "a custom system with no name must drop");
  const Ri4 = U.hydrate(U.serialize({ ...inDomainState(), icons: { id: "custom", name: "  Streamline  ", variantName: " Core " } }));
  if (!deepEq(Ri4.icons, { id: "custom", name: "Streamline", variantName: "Core" })) FAIL("icons", `custom name/variant did not round-trip trimmed: ${JSON.stringify(Ri4.icons)}`);

  // OUT-OF-RANGE values clamp to the nearest bound (type size [1,512], geom height [8,256]).
  const C = U.hydrate(U.serialize({ ...inDomainState(),
    type: { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": 9999, "Body|SM|base": 0.4 } },
    geometry: { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": 9999, "XS|base": 2 } } }));
  if (C.type.tokenOverrides["Body|MD|base"] !== 512) FAIL("token-overrides", `type size 9999 -> ${C.type.tokenOverrides["Body|MD|base"]}, want 512`);
  if (C.type.tokenOverrides["Body|SM|base"] !== 1) FAIL("token-overrides", `type size 0.4 -> ${C.type.tokenOverrides["Body|SM|base"]}, want 1 (floor)`);
  if (C.geometry.tokenOverrides["MD|base"] !== 256) FAIL("token-overrides", `geom height 9999 -> ${C.geometry.tokenOverrides["MD|base"]}, want 256`);
  if (C.geometry.tokenOverrides["XS|base"] !== 8) FAIL("token-overrides", `geom height 2 -> ${C.geometry.tokenOverrides["XS|base"]}, want 8 (floor)`);

  // INVALID entries (NaN / non-number / ≤0) are DROPPED; if nothing valid remains the key is ABSENT.
  const D = U.hydrate(U.serialize({ ...inDomainState(),
    type: { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": "nope", "Body|LG|base": -7, "Body|XL|base": 0 } },
    geometry: { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": NaN } } }));
  if (D.type.tokenOverrides !== undefined && Object.keys(D.type.tokenOverrides).length !== 0) FAIL("token-overrides", `invalid type overrides not dropped: ${JSON.stringify(D.type.tokenOverrides)}`);
  if ("tokenOverrides" in D.type) FAIL("token-overrides", "an all-invalid type tokenOverrides must hydrate ABSENT (not an empty object)");
  if ("tokenOverrides" in D.geometry) FAIL("token-overrides", "an all-invalid geom tokenOverrides must hydrate ABSENT (not an empty object)");

  // MALFORMED keys are DROPPED defensively (type requires 3 "|"-segments, geom 2, non-empty modeKey) — a
  // valid sibling key survives, proving only the junk is stripped (forward-safe persisted maps).
  const M = U.hydrate(U.serialize({ ...inDomainState(),
    type: { treatment: "product", bodyBase: 16, tokenOverrides: { "Body|MD|base": 40, "Body|MD": 30, "too|many|parts|here": 22, "Body|MD|": 18 } },
    geometry: { treatment: "comfortable", baseHeight: 28, tokenOverrides: { "MD|base": 30, "MD": 24, "MD|sm|extra": 26, "MD|": 20 } } }));
  if (!deepEq(M.type.tokenOverrides, { "Body|MD|base": 40 })) FAIL("token-overrides", `malformed type keys not dropped (kept only the well-formed): ${JSON.stringify(M.type.tokenOverrides)}`);
  if (!deepEq(M.geometry.tokenOverrides, { "MD|base": 30 })) FAIL("token-overrides", `malformed geom keys not dropped (kept only the well-formed): ${JSON.stringify(M.geometry.tokenOverrides)}`);

  // ABSENT stays absent — a config without tokenOverrides round-trips identically (the identity gate).
  const A = U.hydrate(U.serialize({ ...inDomainState(), type: { treatment: "product", bodyBase: 16 }, geometry: { treatment: "comfortable", baseHeight: 28 } }));
  if ("tokenOverrides" in A.type || "tokenOverrides" in A.geometry) FAIL("token-overrides", "absent tokenOverrides must stay absent after hydrate");
}

// ── voice styleName (the Figma weight-style string): non-empty persists trimmed/capped; empty/junk drops ──
{
  const seed = inDomainState();
  const R = U.hydrate(U.serialize({ ...seed, type: { treatment: "product", bodyBase: 16,
    voices: { Display: { weight: 900, styleName: "  Condensed Black Italic  " }, Body: { styleName: "" }, Label: { styleName: 42 } } } }));
  if (R.type.voices.Display.styleName !== "Condensed Black Italic") FAIL("voice-style", `styleName must round-trip trimmed (got ${JSON.stringify(R.type.voices.Display.styleName)})`);
  if (R.type.voices.Body || (R.type.voices.Label && R.type.voices.Label.styleName)) FAIL("voice-style", "empty/non-string styleName must drop (and an emptied voice with it)");
  const long = U.hydrate(U.serialize({ ...seed, type: { treatment: "product", bodyBase: 16, voices: { Display: { styleName: "x".repeat(200) } } } }));
  if (long.type.voices.Display.styleName.length !== 60) FAIL("voice-style", "styleName caps at 60 chars");
}

// ── geometry rampContrast (the responsive-ramp knob): <1 persists (2-decimal), 1/absent/invalid drop ──
{
  const seed = inDomainState();
  const R = U.hydrate(U.serialize({ ...seed, geometry: { treatment: "comfortable", baseHeight: 24, rampContrast: 0.5,
    modes: [{ id: "gm-rc", name: "1540", baseHeight: 28, minWidth: 1540, rampContrast: 1 }, { id: "gm-rc2", name: "992", baseHeight: 26, minWidth: 992, rampContrast: 0.25 }] } }));
  if (R.geometry.rampContrast !== 0.5) FAIL("ramp-contrast", `doc-level rampContrast 0.5 must round-trip (got ${R.geometry.rampContrast})`);
  if ("rampContrast" in R.geometry.modes[0]) FAIL("ramp-contrast", "a mode's rampContrast of 1 (the default) must be DROPPED on persist");
  if (R.geometry.modes[1].rampContrast !== 0.25) FAIL("ramp-contrast", `a mode's rampContrast 0.25 must round-trip (got ${R.geometry.modes[1].rampContrast})`);
  const N = U.hydrate(U.serialize({ ...seed, geometry: { treatment: "comfortable", baseHeight: 28 } }));
  if ("rampContrast" in N.geometry) FAIL("ramp-contrast", "absent rampContrast must stay absent (the identity gate)");
  const X = U.hydrate(U.serialize({ ...seed, geometry: { treatment: "comfortable", baseHeight: 28, rampContrast: "nope" } }));
  if ("rampContrast" in X.geometry) FAIL("ramp-contrast", "a non-numeric rampContrast must drop");
}

// ── huespace-default (OKLCH-native flip): a doc PERSISTED with hueSpace:"cam16" round-trips as cam16
//    (legacy preserved); a doc WITHOUT a hueSpace hydrates to "oklch" (the new default). ────────────
{
  const seed = inDomainState();
  const cam = U.hydrate(U.serialize({ ...seed, hueSpace: "cam16" }));
  if (cam.hueSpace !== "cam16") FAIL("huespace-default", `a doc saved hueSpace:"cam16" hydrated to ${cam.hueSpace}, want cam16 (legacy preserved)`);
  const pre = U.serialize(seed); delete pre.hueSpace;          // a doc with NO hueSpace field
  const none = U.hydrate(pre);
  if (none.hueSpace !== "oklch") FAIL("huespace-default", `a doc without hueSpace hydrated to ${none.hueSpace}, want oklch (new default)`);
}

// ── schema-rename (TKT-0016): serialize() stamps schemaVersion; hydrate() runs versioned rename maps
//    BEFORE the allowlist clamp, so a PRE-2026-07-13 doc's OLD voice names (Heading/UI/Quote/Caption/
//    Legal) survive translated onto their current names (Headline/Label/Lead/Tiny/Body) instead of
//    being silently dropped. ─────────────────────────────────────────────────────────────────────────
{
  // serialize() always stamps the current schemaVersion.
  const stamped = U.serialize(inDomainState());
  if (stamped.schemaVersion !== U.CURRENT_SCHEMA_VERSION) FAIL("schema-rename", `serialize() must stamp schemaVersion ${U.CURRENT_SCHEMA_VERSION}, got ${JSON.stringify(stamped.schemaVersion)}`);
  // schemaVersion is a bookkeeping field for hydrate's rename maps, NOT part of the runtime State — it
  // must never leak into hydrate()'s return value (would break the roundtrip-identity gate elsewhere).
  if ("schemaVersion" in U.hydrate(stamped)) FAIL("schema-rename", "hydrate() must not carry schemaVersion into the returned State");

  // A pre-2026-07-13 fixture: no schemaVersion field at all (predates the ticket that introduced it),
  // OLD voice names carrying real per-voice overrides a user tuned.
  const legacyDoc = {
    ...U.serialize(inDomainState()),
    type: { treatment: "product", bodyBase: 16, voices: {
      Heading: { weight: 750, tracking: 0.02 },   // -> Headline
      UI: { weight: 500, leading: 1.3 },          // -> Label
      Quote: { weight: 300 },                     // -> Lead
      Caption: { weight: 480 },                   // -> Tiny
      Legal: { weight: 420 },                     // -> Body
    } },
  };
  delete legacyDoc.schemaVersion; // a doc saved before schemaVersion existed has no such field

  const hydrated = U.hydrate(legacyDoc);
  const v = hydrated.type.voices;
  if (!v || !deepEq(v.Headline, { weight: 750, tracking: 0.02 })) FAIL("schema-rename", `Heading's overrides must survive renamed onto Headline (got ${JSON.stringify(v && v.Headline)})`);
  if (!v || !deepEq(v.Label, { weight: 500, leading: 1.3 })) FAIL("schema-rename", `UI's overrides must survive renamed onto Label (got ${JSON.stringify(v && v.Label)})`);
  if (!v || !deepEq(v.Lead, { weight: 300 })) FAIL("schema-rename", `Quote's overrides must survive renamed onto Lead (got ${JSON.stringify(v && v.Lead)})`);
  if (!v || !deepEq(v.Tiny, { weight: 480 })) FAIL("schema-rename", `Caption's overrides must survive renamed onto Tiny (got ${JSON.stringify(v && v.Tiny)})`);
  if (!v || !deepEq(v.Body, { weight: 420 })) FAIL("schema-rename", `Legal's overrides must survive renamed onto Body (got ${JSON.stringify(v && v.Body)})`);
  // the OLD keys must not survive alongside the new ones (a real rename, not a copy).
  for (const old of ["Heading", "UI", "Quote", "Caption", "Legal"]) if (v && old in v) FAIL("schema-rename", `the OLD voice key '${old}' must not survive the rename (found in ${JSON.stringify(Object.keys(v))})`);

  // re-serializing the hydrated (now-current) doc stamps the current schemaVersion, so a round-trip
  // through the app doesn't keep re-applying the rename on every subsequent save/load.
  const resaved = U.serialize(hydrated);
  if (resaved.schemaVersion !== U.CURRENT_SCHEMA_VERSION) FAIL("schema-rename", "re-serializing a hydrated legacy doc must stamp the CURRENT schemaVersion");
  if (!deepEq(U.hydrate(resaved).type.voices, v)) FAIL("schema-rename", "a doc already on the current schemaVersion must hydrate identically on a second pass (no double-rename)");

  // COLLISION: a legacy doc that (implausibly, but possibly, e.g. hand-edited) carries BOTH the old
  // AND the new key — the already-current new-name override must NOT be clobbered by the stale old one.
  const collideDoc = { ...U.serialize(inDomainState()), type: { treatment: "product", bodyBase: 16, voices: { Heading: { weight: 300 }, Headline: { weight: 900 } } } };
  delete collideDoc.schemaVersion;
  const cv = U.hydrate(collideDoc).type.voices;
  if (!cv || cv.Headline.weight !== 900) FAIL("schema-rename", `an already-current Headline override must win over the stale Heading one (got ${JSON.stringify(cv && cv.Headline)})`);
  if (cv && "Heading" in cv) FAIL("schema-rename", "the stale old key must still drop even when the new key already existed");

  // a doc with only the NEW voice names (any doc saved since 2026-07-13, before schemaVersion existed)
  // is completely unaffected by the rename — nothing to translate, nothing spuriously created.
  const modernDoc = { ...U.serialize(inDomainState()), type: { treatment: "product", bodyBase: 16, voices: { Headline: { weight: 800 } } } };
  delete modernDoc.schemaVersion;
  const mv = U.hydrate(modernDoc).type.voices;
  if (!deepEq(mv, { Headline: { weight: 800 } })) FAIL("schema-rename", `a modern-only doc's voices must be untouched by the rename (got ${JSON.stringify(mv)})`);

  // tokenOverrides (Tokens-matrix Phase 3): a per-cell SIZE override keyed "<voice>|<step>|<modeKey>"
  // under an OLD voice name must migrate its leading segment too — clampTokenOverrides only checks key
  // ARITY, not voice membership, so an un-migrated stale key would otherwise survive as an inert orphan
  // (never dropped, never applied) instead of visibly carrying the user's override forward. Also covers
  // the collision case: a stale key AND its already-current renamed sibling both present.
  const tokDoc = { ...U.serialize(inDomainState()), type: { treatment: "product", bodyBase: 16,
    tokenOverrides: { "Heading|MD|base": 40, "UI|SM|tm-x": 13, "Heading|LG|base": 111, "Headline|LG|base": 200 } } };
  delete tokDoc.schemaVersion;
  const tov = U.hydrate(tokDoc).type.tokenOverrides;
  if (!tov || "Heading|MD|base" in tov) FAIL("schema-rename", `the stale 'Heading|MD|base' key must not survive (got ${JSON.stringify(tov)})`);
  if (!tov || tov["Headline|MD|base"] !== 40) FAIL("schema-rename", `'Heading|MD|base' must migrate to 'Headline|MD|base' (got ${JSON.stringify(tov)})`);
  if (!tov || tov["Label|SM|tm-x"] !== 13) FAIL("schema-rename", `'UI|SM|tm-x' must migrate to 'Label|SM|tm-x' (got ${JSON.stringify(tov)})`);
  if (!tov || tov["Headline|LG|base"] !== 200) FAIL("schema-rename", `an already-current 'Headline|LG|base' key must win over the colliding stale 'Heading|LG|base' (got ${JSON.stringify(tov && tov["Headline|LG|base"])})`);
  if (tov && "Heading|LG|base" in tov) FAIL("schema-rename", "the stale colliding key must still drop even when the renamed key already existed");
}

// ── hpg-export-theme-invariant: exporters ignore state.theme ──────────────────────────────
const st = { palettes: [{ name: "Primary", hue: 267, chroma: 95, skew: -20, lift: 0, on: true }], curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" };
const out = (theme) => JSON.stringify({ css: X.exportCSS({ ...st, theme }), json: X.exportJSON({ ...st, theme }), dtcg: X.exportDTCG({ ...st, theme }, {}) });
const oL = out("light"), oD = out("dark"), oA = out("auto");
if (!(oL === oD && oD === oA)) FAIL("theme-invariant", "export output differs across theme light/dark/auto");

// ── allowlist-parity (TKT-0017): persist.js hand-tracks TYPE_TREATMENTS / VOICES / GEOMETRY_TREATMENTS
// as copies of what type.mjs / geometry.mjs already define canonically — nothing enforced they stay in
// sync until now. A voice/treatment renamed in the engine and not mirrored here has its hydrate-time
// clamp silently reject every doc using it (VOICES) or fall the whole facet back to its default
// (TYPE_TREATMENTS/GEOMETRY_TREATMENTS) — the same failure class the role-table↔semanticRoles parity gate
// guards elsewhere, generalized to this file. Compared as SETS (sorted), not literal array order, since
// persist.js only ever consults these via `.includes()`. ────────────────────────────────────────────────
{
  const sorted = (a) => [...a].sort();
  const eqSet = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

  const engineTypeIds = Ty.TYPE_TREATMENTS.map((t) => t.id);
  if (!eqSet(U.TYPE_TREATMENTS, engineTypeIds))
    FAIL("allowlist-parity", `persist.js TYPE_TREATMENTS ${JSON.stringify(sorted(U.TYPE_TREATMENTS))} != type.mjs TYPE_TREATMENTS ids ${JSON.stringify(sorted(engineTypeIds))}`);

  const engineGeomIds = Ge.GEOMETRY_TREATMENTS.map((t) => t.id);
  if (!eqSet(U.GEOMETRY_TREATMENTS, engineGeomIds))
    FAIL("allowlist-parity", `persist.js GEOMETRY_TREATMENTS ${JSON.stringify(sorted(U.GEOMETRY_TREATMENTS))} != geometry.mjs GEOMETRY_TREATMENTS ids ${JSON.stringify(sorted(engineGeomIds))}`);

  // the voice set: every treatment's `categories` carries the same 15 keys (asserted in test/engine/
  // type.mjs), so any one treatment's categories is the canonical voice list.
  const engineVoices = Object.keys(Ty.TYPE_TREATMENTS[0].categories);
  if (!eqSet(U.VOICES, engineVoices))
    FAIL("allowlist-parity", `persist.js VOICES ${JSON.stringify(sorted(U.VOICES))} != type.mjs voice set ${JSON.stringify(sorted(engineVoices))}`);
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["roundtrip", "clamp", "field-default", "token-overrides", "huespace-default", "schema-rename", "theme-invariant", "allowlist-parity"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: ui-persistence clears all [gate] predicates");
process.exit(0);
