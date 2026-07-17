// counts.mjs — named constants for the domain counts asserted repeatedly across the headless-boot
// shim (headless-boot.mjs) and the real-Chrome smoke test (../smoke/smoke.mjs). A legitimate count
// change (e.g. adding a semantic role or a named type voice) should be ONE edit here, not a
// hunt-and-replace through scattered literal numbers (TKT-0026).
//
// These are TEST-side constants, kept independent of the engine's own source of truth (e.g.
// src/engine/semantic.js's role table, src/engine/type.mjs's voice list) — a mismatch between a
// literal here and the engine's real count is exactly what the assertions below are meant to catch.

export const ROLES = 53;                   // semantic roles per palette (docs/reference/data/role-table.json)
export const DEFAULT_PALETTES = 8;          // palettes in a freshly opened/seeded set
export const CATEGORIES = 8;                // palette "categories" in the bundled gallery-hub index
export const CATEGORY_PRESETS = 48;         // presets per non-"brands" category (the uniform sourced/decorative scale)
export const BRAND_PRESETS = 7;             // presets in the small, real-identity "brands" category
export const CATEGORY_PRESET_PALETTES = 11; // palettes per category preset (a derived neutral + 6 sampled + 4 status)
export const CATEGORY_VOLUMES = 12;         // volume headers grouping a category's presets
export const CORE_RAMP_STOPS = 19;          // the core (display) ramp — 19 stops
export const EXTENDED_RAMP_STOPS = 25;      // the export-only extended ramp — core stops + half-steps
export const VOICES = 15;                   // named typography voices (Display … UI-widget)
export const TYPE_STEPS = 51;               // total specimen lines across all voices (13 voices × 3 + 2 interactive voices × 6)
export const GEOM_SIZES = 6;                // control-ramp sizes (XS..2XL)
