#!/usr/bin/env node
// voice-parity.mjs — the DRIFT GATE between typography-tokens and the product's type engine. Every
// --type-* / --font-* token and .type-* class named in the skill must be a REAL voice·step·prop the
// engine emits, and the claimed voice count must match. Runs in the product repo's npm test; outside
// the repo it exits 0 (a maintainer gate, not a consumer tool). Sibling of color-tokens' role-parity.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, "..");
const ENGINE = join(HERE, "../../../../../src/engine/type.mjs");
if (!existsSync(ENGINE)) { console.log("voice-parity: type engine not found (outside the product repo) — skipping"); process.exit(0); }

const { typeScale } = await import(ENGINE);
const scale = typeScale({ treatment: "product" });
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const VOICES = new Set(Object.keys(scale.categories).map(kebab)); // display, heading, kicker, eyebrow, …
const STEPS = new Set(Object.values(scale.categories).flatMap((c) => Object.keys(c).map(kebab))); // 3xs..2xl
const FONT_ROLES = new Set(Object.keys(scale.fonts)); // display heading body ui mono
const PROPS = new Set(["size", "line", "tracking", "weight", "para", "line-single"]);
const VOICE_COUNT = Object.keys(scale.categories).length;

const files = ["SKILL.md", ...readdirSync(join(SKILL_DIR, "references")).filter((f) => f.endsWith(".md")).map((f) => "references/" + f)];
let failed = false;
const err = (f, tok, why) => { console.error(`✗ ${f}: ${tok} — ${why}`); failed = true; };

// a voice ref may be one or two segments; try longest match against VOICES.
const matchVoice = (rest) => {
  for (const v of [...VOICES].sort((a, b) => b.length - a.length)) if (rest === v || rest.startsWith(v + "-")) return v;
  return null;
};

for (const f of files) {
  const text = readFileSync(join(SKILL_DIR, f), "utf8");
  // --font-<role>
  for (const m of text.matchAll(/--font-([a-z]+)\b/g))
    if (!FONT_ROLES.has(m[1])) err(f, m[0], `unknown font role (engine roles: ${[...FONT_ROLES].join("/")})`);
  // --type-<voice>-<step>-<prop>  and the {voice}/{step} placeholder forms. End the match on an
  // alphanumeric or a closing brace so "…-{prop}" captures whole (a trailing \b would stop at "}").
  for (const m of text.matchAll(/--type-[a-z0-9{}-]*[a-z0-9}]/g)) {
    let rest = m[0].slice("--type-".length);
    if (rest === "{voice}-{step}-{prop}") continue; // the grammar-explanation form in SKILL.md §3
    if (rest.startsWith("{voice}-{step}-")) { const p = rest.slice("{voice}-{step}-".length); if (!PROPS.has(p)) err(f, m[0], `unknown prop "${p}"`); continue; }
    const v = matchVoice(rest);
    if (!v) { err(f, m[0], "unknown voice"); continue; }
    let tail = rest.slice(v.length + 1); // step-prop  (or "{step}-prop")
    if (tail.startsWith("{step}-")) { const p = tail.slice("{step}-".length); if (!PROPS.has(p)) err(f, m[0], `unknown prop "${p}"`); continue; }
    const parts = tail.split("-");
    const prop = parts.slice(1).join("-") || parts[0];
    const step = parts[0];
    if (!STEPS.has(step)) err(f, m[0], `unknown step "${step}"`);
    if (parts.length > 1 && !PROPS.has(prop)) err(f, m[0], `unknown prop "${prop}"`);
  }
  // .type-<voice>-<step> utility classes
  for (const m of text.matchAll(/\.type-([a-z0-9-]+)\b/g)) {
    const v = matchVoice(m[1]);
    if (!v) { err(f, m[0], "unknown voice in class"); continue; }
    const step = m[1].slice(v.length + 1);
    if (step && !STEPS.has(step)) err(f, m[0], `unknown step "${step}" in class`);
  }
  // the voice count claim
  for (const m of text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)[-\s]+voices?\b/gi)) {
    const NW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    if (NW[m[1].toLowerCase()] !== VOICE_COUNT) err(f, m[0], `voice count drift — engine has ${VOICE_COUNT}`);
  }
}

// SEMANTIC parity (not just token existence): the set of voices the skill says carry -line-single
// must EQUAL the set the engine actually emits it for. Token-existence checks can't catch a false
// NEGATIVE ("line-single exists only on ui/code") — this closes that drift class. The engine emits
// singleLineHeight for the ui + mono roles; mono backs Code AND Heading-Eyebrow.
{
  const engineSingleLine = new Set(Object.entries(scale.categories)
    .filter(([, steps]) => Object.values(steps).some((s) => s.singleLineHeight != null))
    .map(([v]) => kebab(v)));
  const blob = files.map((f) => readFileSync(join(SKILL_DIR, f), "utf8")).join("\n");
  // Every engine single-line voice must be POSITIVELY ASSOCIATED with -line-single: its name must
  // appear within ~240 chars of a "line-single" mention at least once. This catches the exact
  // false-negative class the reviewer found (a single-line voice — Heading-Eyebrow — that the skill
  // omits from every single-line statement), which a plain name-anywhere check would miss (the
  // voice's name also shows up in class tables for unrelated reasons).
  const near = (voice) => {
    const vre = voice.replace(/-/g, "[- ]");
    return new RegExp(`${vre}[\\s\\S]{0,240}line-single|line-single[\\s\\S]{0,240}${vre}`, "i").test(blob);
  };
  for (const v of engineSingleLine) if (!near(v)) err("(semantic)", v, `engine emits -line-single for "${v}" but the skill never associates it with -line-single (a single-line voice must be named where -line-single is described)`);
  // the reading voices must NOT be told they have -line-single: flag a "<reading-voice>-<step>-line-single" token.
  const reading = [...VOICES].filter((v) => !engineSingleLine.has(v));
  for (const v of reading) {
    if (new RegExp(`--type-${v}-[a-z0-9]+-line-single`).test(blob) || new RegExp(`\\.type-${v}[^\\n]*line-single`).test(blob))
      err("(semantic)", v, `"${v}" is a reading voice with NO -line-single, but the skill references it`);
  }
}

console.log(failed ? "voice-parity FAIL" : `voice-parity PASS — every type token/class in ${files.length} files matches the engine (${VOICE_COUNT} voices; -line-single voices verified)`);
process.exit(failed ? 1 : 0);
