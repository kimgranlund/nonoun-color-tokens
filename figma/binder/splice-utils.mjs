// splice-utils.mjs — shared brace-matched source-extraction helpers (TKT-0019).
//
// Both scripts/gen-figma-binder-code.mjs (the SPLICE — writes the extracted text into the binder at
// build time) and test/figma/binder.mjs's `floatparity` gate (the TRIPWIRE — proves the splice
// actually matches the flagship) need to pull ONE named function's exact source text out of a file.
// That extraction logic used to live only inline in the test; it now lives here once so the generator
// and its gate can never quietly diverge on what "the same function" means.
//
// Pure text surgery, no parsing: a function's SOURCE begins at its `function name(...)` signature
// (optionally `export`/`async`-prefixed) and ends at the `}` that closes its opening brace — found by
// counting brace depth character-by-character, which is exactly what `node --check`-safe JS files
// permit here since these are plain top-level declarations, not template-literal-embedded braces.

/**
 * The exact source text of a top-level function declaration, signature through closing brace.
 * @param {string} src the file's full text
 * @param {string} name the function's declared name
 * @returns {string|null} the function's source, or null if not found
 */
export function extractFunctionSource(src, name) {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  let depth = 0;
  let i = src.indexOf("{", m.index);
  const start = m.index;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}

/**
 * Same lookup as extractFunctionSource, but returns only the text BETWEEN the outer braces (no
 * signature) — for re-wrapping a function's body under a different name/parameter list.
 * @param {string} src the file's full text
 * @param {string} name the function's declared name
 * @returns {string|null} the body text, or null if not found
 */
export function extractFunctionBody(src, name) {
  const full = extractFunctionSource(src, name);
  if (!full) return null;
  const open = full.indexOf("{");
  const close = full.lastIndexOf("}");
  return full.slice(open + 1, close);
}

/**
 * The exact source text of a top-level `const NAME = [ ... ];` array declaration. Non-greedy up to the
 * first `];` — safe here because these are flat string/number arrays with no nested `[`.
 * @param {string} src the file's full text
 * @param {string} name the const's declared name
 * @returns {string|null} the declaration's source (including the `const NAME = ` prefix and `;`), or null
 */
export function extractConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[[\\s\\S]*?\\];`);
  const m = re.exec(src);
  return m ? m[0] : null;
}
