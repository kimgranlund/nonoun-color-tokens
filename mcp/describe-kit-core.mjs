// describe-kit-core.mjs — the PURE, deterministic core of the describe-palette generator (#369). An LLM
// (the calling agent, or the hosted flavor's demoted interpreter, #376) only ever decides SEEDS — numbers
// and hexes, never colors. This module turns a PaletteBrief into a full brand kit through the SAME engine
// path the app uses: brief -> clamp (reusing src/ui/persist.js's own clampPalette/clampStory — not a
// duplicated domain table, resolving the contract's own §12.1 open item) -> a doc (State, 8 palettes,
// toneMode "perceptual") -> brandKit(doc). The contract this implements: docs/site/describe-palette-spec.md.
//
// Scope: this module builds the schema + the core generation pipeline + §4.1's absent-family defaulting
// (Neutral-follows-Primary, the Secondary/Tertiary harmony recipe, the role-table status defaults) + the
// brand-hue nudge and the status-distinctness gate (§4.2, #372) — so a theme whose brand hue lands on a
// status convention (the tiger-orange case: Primary ~27-50° sitting on Danger 27° / near Warning 70°)
// still resolves to visually distinguishable roles. The referent-count mapping rules (§4.3) turn out to
// need no NEW code here: "fewer referents than families" IS §4.1's absent-family defaulting (already
// built), and "more referents than families never become a 9th family" is already structural — the
// PaletteBrief schema's `families.additionalProperties: false` makes a 9th family unconstructable, not
// just discouraged. No server, no MCP framing, no I/O beyond reading the two static JSON answer-keys
// (role-table.json, package.json) — that lands in #371.

import { readFileSync } from "node:fs";
import { DOMAINS, clampPalette, clampStory, serialize, hydrate } from "../src/ui/persist.js";
import { brandKit, defaultDocument, hexToOklch, seedFromKeyColor, camHueToOklch } from "../src/ui/model.mjs";

const HERE = new URL(".", import.meta.url);
const ROLE_TABLE = JSON.parse(readFileSync(new URL("../docs/reference/data/role-table.json", HERE), "utf8"));
const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", HERE), "utf8"));
const ROLE_DEFAULTS = new Map(ROLE_TABLE.defaults.map((d) => [d.name, d]));

// The 8 canonical family names, role-table order (Neutral, Primary, then the 6 accents/status families).
export const FAMILY_NAMES = ROLE_TABLE.defaults.map((d) => d.name);

// SECONDARY_HARMONY_OFFSET / TERTIARY_ANALOGOUS_OFFSET — resolves the spec's §12 item 7 open decision: no
// source ruled which recipe governs an absent Secondary (only Tertiary's — analogous of Secondary, #372 —
// was ruled). Secondary (absent) is the COMPLEMENT of Primary (180°, the classic two-color brand pairing);
// Tertiary (absent) is the ANALOGOUS of Secondary (a 30° step, a soft neighbor). Named constants, mirroring
// #372's STATUS_BANDS/MIN_HUE_SEP/BRAND_NUDGE precedent, so a build that wants to retune finds one literal.
export const SECONDARY_HARMONY_OFFSET = 180;
export const TERTIARY_ANALOGOUS_OFFSET = 30;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const wrapHue = (h) => ((h % 360) + 360) % 360;

// roleHueOklch(name) — a role-table family's OWN hue, converted CAM16→OKLCH exactly like
// model.mjs#defaultDocument does for the app's starter palettes (role-table.json is a CAM16 answer key;
// every brief hue is OKLCH per the schema, §3.2 — so a role-table fallback must convert, or it lands on
// the wrong visual hue).
function roleHueOklch(name) {
  const rt = ROLE_DEFAULTS.get(name);
  return camHueToOklch(rt.hue, (rt.chroma ?? 0) / 100);
}

// hueDist(a, b) → the shortest circular distance between two OKLCH hues, in [0, 180].
function hueDist(a, b) {
  const d = Math.abs(wrapHue(a) - wrapHue(b)) % 360;
  return d > 180 ? 360 - d : d;
}

const STATUS_FAMILIES = ["Info", "Success", "Warning", "Danger"];
const BRAND_FAMILIES = ["Primary", "Secondary", "Tertiary"];

// STATUS_BANDS / MIN_HUE_SEP / BRAND_NUDGE (§4.2, #372) — the three named constants the spec promises.
// STATUS_BANDS[name] = {center, halfWidth}: `center` is the family's OWN role-table hue (OKLCH-converted,
// §4.1's default); `halfWidth` bounds how far the gate below may shift that hue before it stops reading as
// that status color. MIN_HUE_SEP is the minimum circular separation a status family must keep from EVERY
// brand family (Primary/Secondary/Tertiary — Neutral excluded, per the ticket's own stated scope). BRAND_NUDGE
// is the max pull toward Primary's hue applied only when DEFAULTING an absent status family (§4.1) — always
// starting exactly at `center`, so BRAND_NUDGE ≤ halfWidth keeps every nudge inside the band by construction.
// Numbers are centered on the role-table defaults and tuned against the tiger-orange acceptance case below.
const STATUS_BAND_HALF_WIDTH = 20;
export const STATUS_BANDS = Object.fromEntries(STATUS_FAMILIES.map((name) => [name, { center: roleHueOklch(name), halfWidth: STATUS_BAND_HALF_WIDTH }]));
export const MIN_HUE_SEP = 25;
export const BRAND_NUDGE = 8;

// nudgeTowardBrand(band, brandHue) — pull a status family's band CENTER toward brandHue by up to
// BRAND_NUDGE degrees (a small cohesion pull for an absent status family, §4.1 — NOT the distinctness
// gate below, which runs regardless of provenance and can shift much farther).
function nudgeTowardBrand(band, brandHue) {
  let delta = wrapHue(brandHue - band.center);
  if (delta > 180) delta -= 360; // signed shortest rotation from center toward brandHue, in (-180, 180]
  const pull = Math.max(-BRAND_NUDGE, Math.min(BRAND_NUDGE, delta));
  return wrapHue(band.center + pull);
}

// applyDistinctnessGate(palettes, lint) — mutates the status palettes IN PLACE so each stays MIN_HUE_SEP
// degrees from every brand family's hue, regardless of whether that hue was given or defaulted (§4.2's
// resolution order): (1) shift the status hue to whichever of its OWN band's two edges maximizes its
// worst-case distance to any brand hue; (2) band exhausted (still short of MIN_HUE_SEP even at the best
// edge) → keep that best-effort hue and differentiate by chroma instead (push to the domain max — a
// status role reads as vivid/saturated anyway, so this rarely reads as a compromise).
function applyDistinctnessGate(palettes, lint) {
  const byName = new Map(palettes.map((p) => [p.name, p]));
  const brandHues = BRAND_FAMILIES.map((n) => byName.get(n)).filter(Boolean).map((p) => p.hue);
  if (!brandHues.length) return;
  const worstDist = (hue) => Math.min(...brandHues.map((h) => hueDist(hue, h)));
  for (const name of STATUS_FAMILIES) {
    const status = byName.get(name);
    if (!status || worstDist(status.hue) >= MIN_HUE_SEP) continue;
    const band = STATUS_BANDS[name];
    const edgeA = wrapHue(band.center - band.halfWidth);
    const edgeB = wrapHue(band.center + band.halfWidth);
    const best = worstDist(edgeA) >= worstDist(edgeB) ? edgeA : edgeB;
    const bestDist = worstDist(best);
    const fromHue = status.hue;
    status.hue = best;
    if (bestDist >= MIN_HUE_SEP) {
      lint.push({ level: "info", code: "status-distinctness", family: name, message: `${name}: hue shifted from ${Math.round(fromHue)} to ${Math.round(best)} within its own band to stay ${MIN_HUE_SEP}° from every brand family.` });
    } else {
      status.chroma = DOMAINS.palette.chroma.max;
      lint.push({ level: "warn", code: "status-distinctness", family: name, message: `${name}: hue alone can't clear ${MIN_HUE_SEP}° within its band (best ${Math.round(bestDist)}° at hue ${Math.round(best)}) — chroma boosted to ${status.chroma} to stay visually distinct.` });
    }
  }
}

// defaultHueChroma(name, resolved) — §4.1's absent-family hue/chroma default. `resolved` is a name->{hue}
// map of already-resolved EARLIER families in RESOLUTION_ORDER (Primary before Neutral/Secondary; Secondary
// before Tertiary) — the dependency the harmony/follow recipes need.
function defaultHueChroma(name, resolved) {
  const rt = ROLE_DEFAULTS.get(name);
  if (name === "Neutral") return { hue: resolved.get("Primary").hue, chroma: rt.chroma };
  if (name === "Secondary") return { hue: wrapHue(resolved.get("Primary").hue + SECONDARY_HARMONY_OFFSET), chroma: rt.chroma };
  if (name === "Tertiary") return { hue: wrapHue(resolved.get("Secondary").hue + TERTIARY_ANALOGOUS_OFFSET), chroma: rt.chroma };
  if (STATUS_BANDS[name]) {
    // an absent status family: its own role-table hue, NUDGED toward Primary's resolved hue — a small
    // cohesion pull (§4.1), bounded within its own band. An EXPLICITLY given status hue skips this
    // function entirely (seedOf only calls it for the missing half) and is taken as-is, per §4.1 — only
    // the distinctness gate (applyDistinctnessGate, below) may still move it, regardless of provenance.
    const primary = resolved.get("Primary");
    const hue = primary ? nudgeTowardBrand(STATUS_BANDS[name], primary.hue) : STATUS_BANDS[name].center;
    return { hue, chroma: rt.chroma };
  }
  // Primary itself falls back to its own role-table row.
  return { hue: roleHueOklch(name), chroma: rt.chroma };
}

// RESOLUTION_ORDER — the dependency order defaultHueChroma needs (Primary resolves before anything that
// follows/harmonizes off it; Secondary before Tertiary). Independent of FAMILY_NAMES' OUTPUT order.
const RESOLUTION_ORDER = ["Primary", "Neutral", "Secondary", "Tertiary", "Info", "Success", "Warning", "Danger"];

// seedOf(name, families, resolved, lint) — the per-family seed, in resolution priority: keyColor wins over
// hue/chroma (a `key-color-precedence` lint note when both are given, §3.2); otherwise any GIVEN hue/chroma
// is honored, with only the missing half defaulted; otherwise (family absent, or present but carrying
// neither) the full §4.1 default applies. skew/lift default independently, from the family's OWN role-table
// row, regardless of which hue/chroma path was taken (they don't inherit through a harmony/follow recipe).
function seedOf(name, families, resolved, lint) {
  const s = (families && families[name]) || {};
  const rt = ROLE_DEFAULTS.get(name);
  let hue, chroma, keyColors;
  if (typeof s.keyColor === "string" && HEX_RE.test(s.keyColor)) {
    const oklch = hexToOklch(s.keyColor);
    const derived = seedFromKeyColor(oklch, "oklch");
    hue = derived.hue;
    chroma = derived.chroma;
    keyColors = [{ role: "dominant", oklch }];
    if (typeof s.hue === "number" || typeof s.chroma === "number") {
      lint.push({ level: "info", code: "key-color-precedence", family: name, message: `${name}: keyColor takes precedence over the given hue/chroma.` });
    }
  } else if (typeof s.hue === "number" || typeof s.chroma === "number") {
    const d = defaultHueChroma(name, resolved);
    hue = typeof s.hue === "number" ? s.hue : d.hue;
    chroma = typeof s.chroma === "number" ? s.chroma : d.chroma;
  } else {
    const d = defaultHueChroma(name, resolved);
    hue = d.hue;
    chroma = d.chroma;
  }
  if (typeof s.supportColor === "string" && HEX_RE.test(s.supportColor)) {
    keyColors = [...(keyColors || []), { role: "supportive", oklch: hexToOklch(s.supportColor) }];
  }
  const skew = typeof s.skew === "number" ? s.skew : rt.skew;
  const lift = typeof s.lift === "number" ? s.lift : rt.lift;
  return { hue, chroma, skew, lift, keyColors, raw: s };
}

// buildPalettes(families) → { palettes (FAMILY_NAMES order, each clampPalette-clamped), lint }. Runs every
// family through persist.js's OWN clampPalette — no duplicated domain table (resolves §12.1): the effective
// domains are persist's by construction, not by restatement.
function buildPalettes(families) {
  const lint = [];
  const resolved = new Map();
  const byName = new Map();
  for (const name of RESOLUTION_ORDER) {
    const seed = seedOf(name, families, resolved, lint);
    const s = seed.raw;
    const raw = {
      name,
      hue: seed.hue, chroma: seed.chroma, skew: seed.skew, lift: seed.lift,
      hueShift: 0, hueSameDir: false, on: true,
      ...(s.cuspPull != null ? { cuspPull: s.cuspPull } : {}),
      ...(seed.keyColors && seed.keyColors.length ? { keyColors: seed.keyColors } : {}),
      ...(typeof s.colorName === "string" && s.colorName ? { colorName: s.colorName } : {}),
      ...(typeof s.description === "string" && s.description ? { description: s.description } : {}),
      ...(s.colorRole === "dominant" || s.colorRole === "supporting" || s.colorRole === "accent" ? { colorRole: s.colorRole } : {}),
    };
    const clamped = clampPalette(raw);
    for (const field of ["hue", "chroma", "skew", "lift"]) {
      if (typeof raw[field] === "number" && raw[field] !== clamped[field]) {
        lint.push({ level: "warn", code: "clamped", family: name, message: `${name}: ${field} ${raw[field]} clamped to ${clamped[field]} (domain ${DOMAINS.palette[field].min}..${DOMAINS.palette[field].max}).` });
      }
    }
    // the CLAMPED hue/chroma feed the harmony chain (Neutral/Secondary/Tertiary's defaults, below) — a
    // given-but-out-of-domain hue must not carry an unclamped value into a sibling's derived default.
    resolved.set(name, { hue: clamped.hue, chroma: clamped.chroma });
    byName.set(name, clamped);
  }
  const palettes = FAMILY_NAMES.map((n) => byName.get(n));
  // the distinctness gate runs LAST, over every fully-resolved+clamped palette — it doesn't care whether
  // a status hue was given, defaulted, or already nudged; only the final resolved values matter (§4.2).
  applyDistinctnessGate(palettes, lint);
  return { palettes, lint };
}

// buildDoc(brief) → a full State (defaultDocument()'s shape, every non-palette control at its persist
// default — toneMode "perceptual" / hueSpace "oklch" ARE the persist defaults, so nothing needs forcing —
// with .name/.palettes/.story/.vibrancy replaced from the brief). Plus the lint collected while building
// the palettes.
function buildDoc(brief) {
  const doc = defaultDocument();
  const { palettes, lint } = buildPalettes(brief.families);
  doc.palettes = palettes;
  const name = typeof brief.name === "string" && brief.name.trim() ? brief.name.trim() : undefined;
  if (name !== undefined) doc.name = name;
  else delete doc.name;
  const story = clampStory(brief.story);
  if (story) doc.story = story;
  const global = (brief && typeof brief.global === "object" && brief.global) || {};
  // Number.isFinite, not typeof: typeof NaN === "number" and Math.min/max PROPAGATE NaN — the one numeric
  // path here that doesn't ride clampPalette's NaN-safe clampNumber. Unreachable over JSON-RPC (JSON has
  // no NaN) but an in-process importer must not be able to plant NaN in the doc. A non-finite vibrancy is
  // dropped (the persist default stands), not clamped.
  if (Number.isFinite(global.vibrancy)) {
    doc.vibrancy = Math.min(DOMAINS.vibrancy.max, Math.max(DOMAINS.vibrancy.min, global.vibrancy));
    if (doc.vibrancy !== global.vibrancy) lint.push({ level: "warn", code: "clamped", family: null, message: `global.vibrancy ${global.vibrancy} clamped to ${doc.vibrancy} (domain ${DOMAINS.vibrancy.min}..${DOMAINS.vibrancy.max}).` });
  }
  return { doc, lint };
}

// The PaletteBrief JSON Schema — verbatim per docs/site/describe-palette-spec.md §3. Published inside every
// briefing payload (#371); the schema an agent constructs against.
export const PALETTE_BRIEF_SCHEMA = {
  $id: "ultimate-tokens-palette-brief/1",
  type: "object",
  required: ["families"],
  properties: {
    name: { type: "string" },
    story: { $ref: "#/$defs/story" },
    families: {
      type: "object",
      required: ["Primary"],
      properties: Object.fromEntries(FAMILY_NAMES.map((n) => [n, { $ref: "#/$defs/familySeed" }])),
      additionalProperties: false,
    },
    global: {
      type: "object",
      properties: { vibrancy: { type: "number", minimum: DOMAINS.vibrancy.min, maximum: DOMAINS.vibrancy.max } },
      additionalProperties: false,
    },
  },
  $defs: {
    familySeed: {
      type: "object",
      properties: {
        hue: { type: "number", minimum: DOMAINS.palette.hue.min, maximum: DOMAINS.palette.hue.max },
        chroma: { type: "number", minimum: DOMAINS.palette.chroma.min, maximum: DOMAINS.palette.chroma.max },
        skew: { type: "number", minimum: DOMAINS.palette.skew.min, maximum: DOMAINS.palette.skew.max },
        lift: { type: "number", minimum: DOMAINS.palette.lift.min, maximum: DOMAINS.palette.lift.max },
        cuspPull: { type: "number", minimum: 0, maximum: 100 },
        keyColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        supportColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        colorName: { type: "string" },
        description: { type: "string" },
        colorRole: { enum: ["dominant", "supporting", "accent"] },
      },
      additionalProperties: false,
    },
    story: {
      type: "object",
      properties: {
        title: { type: "string" },
        kicker: { type: "string" },
        narrative: { type: "string" },
        refuses: { type: "string" },
        groups: {
          type: "array",
          items: {
            type: "object",
            required: ["hier", "pct"],
            properties: { hier: { enum: ["d", "s", "a"] }, pct: { type: "number" }, note: { type: "string" } },
          },
        },
      },
    },
  },
};

// generateKit(brief) → { kit, doc, lint, meta }. Per §4.4: any object generates (a non-object brief is the
// only tool error, left to #371's tool wrapper — this core just needs a families-bearing object; an absent
// `families` defaults every family, same as an absent individual family).
export function generateKit(brief) {
  const b = brief && typeof brief === "object" ? brief : {};
  const { doc, lint } = buildDoc(b);
  const kit = brandKit(doc);
  const meta = {
    generator: "Ultimate Tokens",
    engineVersion: PACKAGE.version,
    kitSchema: "ultimate-tokens-brand-kit/1",
    briefSchema: PALETTE_BRIEF_SCHEMA.$id,
    // a JSON snapshot, not the caller's live reference — an in-process importer mutating its brief after
    // the call must not be able to corrupt the replay handle (§6.4). Identity for anything that arrived
    // over JSON-RPC (JSON round-trips itself), so "verbatim as received" still holds on the product path.
    brief: JSON.parse(JSON.stringify(b)),
  };
  return { kit, doc: serialize(doc), lint, meta };
}

// Re-exported so a caller (or a test) can round-trip the emitted `doc` through the app's own hydrate() —
// the open-in-app off-ramp's actual mechanism (#369's other §12 open item: the exact IMPORT path is still
// open; that hydrate() is the RIGHT function is not).
export { hydrate };
