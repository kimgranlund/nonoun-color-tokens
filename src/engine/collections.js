// collections.js — THE canonical Figma collection names (ADR-016, one shared constant pair ending the
// three-way split the 2026-07-17 librarian review found: exportUI3 said "Color / Primitives" while the
// plugin created "Color Primitives"). Every engine emitter + the app import from HERE; the two sandbox
// runtimes (figma/plugin/code.js, figma/binder/.../code.js) cannot import ESM and carry literals that a
// parity gate diffs against these values (test/figma/plugin.mjs `collnames` family).
// "Color Semantic" (was "Color Modes") names the content — the Light/Dark axis is self-evident;
// "Breakpoints" (was "Geometry") names the mode axis — the collection hosts box geometry AND type/.
// Renames ride FIGMA_MIGRATIONS (TKT-0012) so existing user files adopt by id, never by prune.
export const COLLECTIONS = {
  colorRaw: "Color Primitives",
  colorSemantic: "Color Semantic",
  breakpoints: "Breakpoints",
  fontPrimitives: "Font Primitives",
};
