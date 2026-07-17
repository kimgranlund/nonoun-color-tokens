#!/usr/bin/env node
// gen-figma-binder-code.mjs — splice the Figma-sandbox binder's duplicated executable bodies FROM
// their canonical sources at build time (TKT-0019), instead of hand-copy-pasting them.
//
// figma/binder/figma-semantic-binder/code.js (the standalone binder) runs inside Figma's plugin
// sandbox, which cannot `import` a .mjs module at runtime — the same constraint FLOAT_PLANS already
// works around with a download-time string-replace anchor (see src/ui/app.js's downloadFigmaPlugin()).
// This generator proves the SAME anchor-splice technique at BUILD time, for pieces that used to be
// hand-copied and only diff-tested against drift:
//
//   1. the five float-executor functions (readFloatRegistry/writeFloatRegistry/ensureFloatCollection/
//      varsByName/applyFloatPlans) — spliced VERBATIM from the flagship figma/plugin/code.js.
//   2. roleTable(paletteName) — the binder's role table has the EXACT same row shape as
//      src/engine/semantic.js's semanticRoles() ({key,suffix,light,dark}), so instead of a hand-copy,
//      this splices semanticRoles()'s own function BODY verbatim (plus its 3 supporting SCRIM_* consts)
//      and re-wraps it under the name roleTable — no reimplementation, no reverse-templating.
//   3. the three color-provenance functions (readColorRegistry/writeColorRegistry/ensureCollection,
//      TKT-0024) — spliced VERBATIM from the flagship figma/plugin/code.js, same discipline as (1): the
//      binder's own "Color Semantic" collection creation used to adopt a same-named collection by NAME
//      alone (the exact bug the float path's registry already closed) until this splice back-ported it.
//
// Anchored: the checked-in code.js carries `// === GENERATED:<NAME> START/END ===` marker comments;
// this script replaces ONLY the text between a marker pair, leaving every hand-authored line (the
// manifest/PALETTES/refKey/targetName/main() and all surrounding comments) untouched. Idempotent —
// re-running with no source changes reproduces byte-identical output.
//
// Wired into `npm test` / `npm run build` via the gen:figma-binder-code script (runs BEFORE
// gen:figma-assets, which embeds this file's post-splice content into the download). The `parity`,
// `floatparity`, and `colorparity` gates in test/figma/binder.mjs are now a TRIPWIRE over this
// generator's output — they prove the splice actually matches the canonical source, not the mechanism
// preventing drift.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractFunctionSource, extractFunctionBody, extractConst } from "../figma/binder/splice-utils.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FLAGSHIP_PATH = join(ROOT, "figma/plugin/code.js");
const SEMANTIC_PATH = join(ROOT, "src/engine/semantic.js");
const BINDER_PATH = join(ROOT, "figma/binder/figma-semantic-binder/code.js");

const FLOAT_FNS = ["readFloatRegistry", "writeFloatRegistry", "ensureFloatCollection", "varsByName", "applyFloatPlans"];
const COLOR_FNS = ["readColorRegistry", "writeColorRegistry", "ensureCollection"];

// spliceBlock — replace the text between a `// === GENERATED:<name> START ===` / `... END ===` marker
// pair (both lines are kept verbatim; only what's between the START line and the END line changes).
function spliceBlock(src, name, replacement) {
  const startMarker = `// === GENERATED:${name} START`;
  const endMarker = `// === GENERATED:${name} END`;
  const si = src.indexOf(startMarker);
  const ei = src.indexOf(endMarker);
  if (si === -1 || ei === -1 || ei < si) {
    throw new Error(`gen-figma-binder-code: missing or misordered ${name} markers in ${BINDER_PATH}`);
  }
  const afterStartLine = src.indexOf("\n", si) + 1;
  return src.slice(0, afterStartLine) + replacement + "\n" + src.slice(ei);
}

const flagshipSrc = readFileSync(FLAGSHIP_PATH, "utf8");
const semanticSrc = readFileSync(SEMANTIC_PATH, "utf8");
let binderSrc = readFileSync(BINDER_PATH, "utf8");

// 1) the five float-executor functions, verbatim from the flagship.
const floatBlock = FLOAT_FNS.map((fn) => {
  const text = extractFunctionSource(flagshipSrc, fn);
  if (!text) throw new Error(`gen-figma-binder-code: flagship figma/plugin/code.js is missing ${fn}()`);
  return text;
}).join("\n\n");
binderSrc = spliceBlock(binderSrc, "FLOAT_EXECUTOR", floatBlock);

// 2) the three color-provenance functions, verbatim from the flagship (TKT-0024).
const colorBlock = COLOR_FNS.map((fn) => {
  const text = extractFunctionSource(flagshipSrc, fn);
  if (!text) throw new Error(`gen-figma-binder-code: flagship figma/plugin/code.js is missing ${fn}()`);
  return text;
}).join("\n\n");
binderSrc = spliceBlock(binderSrc, "COLOR_EXECUTOR", colorBlock);

// 3) roleTable(paletteName) — semanticRoles()'s body, re-wrapped; plus its 3 supporting SCRIM_* consts,
//    all extracted verbatim (semanticRoles' body references them as free variables in its closure).
const scrimSteps = extractConst(semanticSrc, "SCRIM_STRENGTH_STEPS");
const scrimSuffixes = extractConst(semanticSrc, "SCRIM_SUFFIXES");
const scrimKeys = extractConst(semanticSrc, "SCRIM_KEYS");
const rolesBody = extractFunctionBody(semanticSrc, "semanticRoles");
if (!scrimSteps || !scrimSuffixes || !scrimKeys || !rolesBody) {
  throw new Error("gen-figma-binder-code: could not extract semanticRoles() or its SCRIM_* consts from src/engine/semantic.js");
}
const roleTableBlock = `${scrimSteps}\n${scrimSuffixes}\n${scrimKeys}\n\nfunction roleTable(paletteName) {${rolesBody}}`;
binderSrc = spliceBlock(binderSrc, "ROLE_TABLE", roleTableBlock);

writeFileSync(BINDER_PATH, binderSrc);
console.log("wrote figma/binder/figma-semantic-binder/code.js (spliced FLOAT_EXECUTOR + COLOR_EXECUTOR + ROLE_TABLE from canonical sources)");
