// describe-kit-core.mjs — the PURE, deterministic core of the describe-palette generator (#369). An LLM
// (the calling agent, or the hosted flavor's demoted interpreter, #376) only ever decides SEEDS — numbers
// and hexes, never colors. This module turns a PaletteBrief into a full brand kit through the SAME engine
// path the app uses: brief -> clamp (reusing src/ui/persist.js's own clampPalette/clampStory — not a
// duplicated domain table, resolving the contract's own §12.1 open item) -> a doc (State, 8 palettes,
// toneMode "perceptual") -> brandKit(doc). The contract this implements: docs/site/describe-palette-spec.md.
//
// Scope: this module builds the schema + the core generation pipeline + §4.1's absent-family defaulting
// (Neutral-follows-Primary, the Secondary/Tertiary harmony recipe, the role-table status defaults). It does
// NOT YET apply the brand-hue nudge or the status-distinctness gate (§4.2), or the referent-count mapping
// rules (§4.3) — those are #372's follow-on ticket, so a status family can currently collide with a theme's
// brand hue (the tiger-orange case) until #372 lands. No server, no MCP framing, no I/O beyond reading the
// two static JSON answer-keys (role-table.json, package.json) — that lands in #371.

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

// defaultHueChroma(name, resolved) — §4.1's absent-family hue/chroma default. `resolved` is a name->{hue}
// map of already-resolved EARLIER families in RESOLUTION_ORDER (Primary before Neutral/Secondary; Secondary
// before Tertiary) — the dependency the harmony/follow recipes need.
function defaultHueChroma(name, resolved) {
  const rt = ROLE_DEFAULTS.get(name);
  if (name === "Neutral") return { hue: resolved.get("Primary").hue, chroma: rt.chroma };
  if (name === "Secondary") return { hue: wrapHue(resolved.get("Primary").hue + SECONDARY_HARMONY_OFFSET), chroma: rt.chroma };
  if (name === "Tertiary") return { hue: wrapHue(resolved.get("Secondary").hue + TERTIARY_ANALOGOUS_OFFSET), chroma: rt.chroma };
  // Primary and the 4 status families (Info/Success/Warning/Danger) fall back to their OWN role-table row.
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
  return { palettes: FAMILY_NAMES.map((n) => byName.get(n)), lint };
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
  if (typeof global.vibrancy === "number") {
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
    brief: b,
  };
  return { kit, doc: serialize(doc), lint, meta };
}

// Re-exported so a caller (or a test) can round-trip the emitted `doc` through the app's own hydrate() —
// the open-in-app off-ramp's actual mechanism (#369's other §12 open item: the exact IMPORT path is still
// open; that hydrate() is the RIGHT function is not).
export { hydrate };
