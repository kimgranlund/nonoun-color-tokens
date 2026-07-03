#!/usr/bin/env node
// dimension-parity.mjs — the DRIFT GATE between geometry-tokens and the product's geometry engine.
// Every --size-* / --radius-* / --space-* / --inset-* / --gap-* / --border-* / --focus-* token and
// .control-* class named in the skill must be a REAL dimension the engine emits. Runs in the product
// repo's npm test; outside the repo it exits 0. Sibling of color-tokens' role-parity + type's
// voice-parity — the same anti-drift mechanization.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, "..");
const ENGINE = join(HERE, "../../../../../src/engine/geometry.mjs");
if (!existsSync(ENGINE)) { console.log("dimension-parity: geometry engine not found (outside the product repo) — skipping"); process.exit(0); }

const { geomScale } = await import(ENGINE);
const s = geomScale({ baseHeight: 28 });
const camel = (k) => k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const STEPS = new Set(Object.keys(s.sizes).map((x) => x.toLowerCase())); // xs..2xl
const SIZE_FIELDS = new Set(["height", "icon", "caret", "font", "gap", "pad", "pad-edge", "radius", "min"]); // the CSS field names
const RADII = new Set(Object.keys(s.radii)); // none sm md lg full
const SPACE = new Set(Object.keys(s.space)); // 0..9
const INSETS = new Set(Object.keys(s.insets).map(camel));
const GAPS = new Set(Object.keys(s.gaps).map(camel));
const BORDERS = new Set(Object.keys(s.borders).map(camel));
const FOCUS = new Set(Object.keys(s.focus).map(camel)); // ring-width, ring-offset

const files = ["SKILL.md", ...readdirSync(join(SKILL_DIR, "references")).filter((f) => f.endsWith(".md")).map((f) => "references/" + f)];
let failed = false;
const err = (f, tok, why) => { console.error(`✗ ${f}: ${tok} — ${why}`); failed = true; };

// match a whole token including a trailing `}` (a plain \b would stop before the brace).
const each = (text, re, fn) => { for (const m of text.matchAll(re)) fn(m); };

for (const f of files) {
  const text = readFileSync(join(SKILL_DIR, f), "utf8");
  // --size-<step>-<field>  (+ the {step} placeholder form)
  each(text, /--size-([a-z0-9{}-]*[a-z0-9}])/g, (m) => {
    let rest = m[1];
    let step, field;
    if (rest === "{step}") return; // the bare grammar form "--size-{step}-*" (the class-of-fields shorthand)
    if (rest.startsWith("{step}-")) { field = rest.slice("{step}-".length); }
    else {
      const st = [...STEPS].sort((a, b) => b.length - a.length).find((x) => rest === x || rest.startsWith(x + "-"));
      if (!st) return err(f, m[0], "unknown size step");
      step = st; field = rest.slice(st.length + 1);
    }
    if (field && field !== "{field}" && !SIZE_FIELDS.has(field)) err(f, m[0], `unknown size field "${field}"`);
  });
  each(text, /--radius-([a-z]+)\b/g, (m) => { if (m[1] !== "default" && !RADII.has(m[1])) err(f, m[0], `unknown radius (engine: ${[...RADII].join("/")}, +default alias)`); });
  each(text, /--space-(\d+)\b/g, (m) => { if (!SPACE.has(m[1])) err(f, m[0], `space step ${m[1]} out of range (0–${SPACE.size - 1})`); });
  each(text, /--inset-([a-z-]+)\b/g, (m) => { if (m[1] !== "{name}" && !INSETS.has(m[1])) err(f, m[0], `unknown inset (engine: ${[...INSETS].join("/")})`); });
  each(text, /--gap-([a-z-]+)\b/g, (m) => { if (m[1] !== "{name}" && !GAPS.has(m[1])) err(f, m[0], `unknown gap (engine: ${[...GAPS].join("/")})`); });
  each(text, /--border-([a-z-]+)\b/g, (m) => { if (!BORDERS.has(m[1])) err(f, m[0], `unknown border (engine: ${[...BORDERS].join("/")})`); });
  each(text, /--focus-([a-z-]+)\b/g, (m) => { if (!FOCUS.has(m[1])) err(f, m[0], `unknown focus token (engine: ${[...FOCUS].join("/")})`); });
  // .control-<step>
  each(text, /\.control-([a-z0-9-]+)\b/g, (m) => { const st = m[1]; if (st !== "{step}" && !STEPS.has(st)) err(f, m[0], `unknown control step "${st}"`); });
}

console.log(failed ? "dimension-parity FAIL" : `dimension-parity PASS — every dimension token/class in ${files.length} files matches the engine`);
process.exit(failed ? 1 : 0);
