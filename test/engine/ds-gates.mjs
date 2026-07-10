#!/usr/bin/env node
// ds-gates.mjs — verifier for the §8 design-system export gates (src/engine/ds-gates.js).
// Pure, no DOM. Faithful port of design-system-author-claude-code/scripts/bundle_gates.py.
//
// Two fixtures:
//   1. an EMBEDDED mini-bundle (built in-file from hex color maps → G2/G3 parity holds
//      by construction) — always runs, CI-safe, no external files. Asserts 0 fails, then
//      three mutations each fire the expected gate.
//   2. the golden Studio-54 bundle in ~/Downloads — validated when present, skipped
//      (never failed) when absent, so this test is portable to CI.
import { dsBundleGates } from "../../src/engine/ds-gates.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
// distinct FAIL gates in a result
const failGates = (r) => [...new Set(r.findings.filter((f) => f.level === "ERROR").map((f) => f.gate))].sort();
const hasFail = (r, gate) => r.findings.some((f) => f.level === "ERROR" && f.gate === gate);

// ── the embedded, CI-safe mini-bundle ─────────────────────────────────────────
// hex in BOTH the frontmatter and tokens.json → carrier equality (G3) is exact by
// construction; the key list is shared → scheme parity (G2) holds by construction.
// Contrast (G1) is the only thing under test on the color side.
const LIGHT = {
  "primary-base-background": "#F0F0F1",
  "primary-base-surface": "#E9E9EA",
  "primary-base-on-surface": "#111111",
  "primary-base-on-surface-variant": "#424148",
  "primary-base-outline-variant": "#807F904D",
  "primary-base": "#737282",
  "primary-base-hover": "#5A5964",
  "primary-base-on-primary-base": "#FFFFFF",
  "accent": "#8E4CCF",
  "accent-on-accent": "#FFFFFF",
  "danger": "#DB000D",
  "danger-on-danger": "#FFFFFF",
  "primary": "#737282",
};
const DARK = {
  "primary-base-background": "#1E1E1F",
  "primary-base-surface": "#242425",
  "primary-base-on-surface": "#FFFFFF",
  "primary-base-on-surface-variant": "#C5C5CB",
  "primary-base-outline-variant": "#807F904D",
  "primary-base": "#8E8D9C",
  "primary-base-hover": "#A9A8B4",
  "primary-base-on-primary-base": "#111111",
  "accent": "#A76DE5",
  "accent-on-accent": "#111111",
  "danger": "#FF322C",
  "danger-on-danger": "#111111",
  "primary": "#8E8D9C",
};

const PREVIEW_HTML = [
  '<!-- @dsCard group="Components" title="Buttons" subtitle="states" -->',
  "<style>:root{color-scheme:light dark;--c-primary-base:light-dark(#737282,#8E8D9C);--c-on:light-dark(#FFFFFF,#111111);}",
  ".b{background:var(--c-primary-base);color:var(--c-on);line-height:1.5;padding:12px;border-radius:12px}</style>",
  '<div class="b">Button</div>',
].join("\n");

function buildEmbedded() {
  const colorLines = [];
  for (const k of Object.keys(LIGHT)) {
    colorLines.push(`  ${k}: "${LIGHT[k]}"`);
    colorLines.push(`  ${k}-dark: "${DARK[k]}"`);
  }
  const fm = [
    "---",
    "version: alpha",
    "name: Embedded fixture",
    "description: CI-safe embedded mini-bundle for the ds-gates self-test.",
    "colors:",
    ...colorLines,
    "typography:",
    "  body-md:",
    "    fontFamily: Inter",
    "    fontSize: 16px",
    "    fontWeight: 500",
    "    lineHeight: 1.5",
    "  ui-md:",
    "    fontFamily: Inter",
    "    fontSize: 14px",
    "    fontWeight: 550",
    "    lineHeight: 1.429",
    "spacing:",
    "  sm: 8px",
    "  md: 12px",
    "  lg: 16px",
    "  xl: 24px",
    "rounded:",
    "  sm: 8px",
    "  md: 12px",
    "  full: 9999px",
    "---",
  ].join("\n");
  const body = [
    "",
    "# Embedded fixture — Design System",
    "",
    "## Overview",
    "Reason over roles: {colors.primary-base}, {colors.accent}, {colors.danger}.",
    "",
    "## Colors",
    "Background {colors.primary-base-background}, surface {colors.primary-base-surface}, text {colors.primary-base-on-surface}, muted {colors.primary-base-on-surface-variant}, border {colors.primary-base-outline-variant}, on-fill {colors.primary-base-on-primary-base}, hover {colors.primary-base-hover}, on-accent {colors.accent-on-accent}, on-danger {colors.danger-on-danger}.",
    "",
    "## Typography",
    "Body {typography.body-md}, UI {typography.ui-md}.",
    "",
    "## Layout",
    "Compose gaps from {spacing.sm} … {spacing.md} … {spacing.lg} … {spacing.xl}.",
    "",
    "## Elevation & Depth",
    "Elevation is a surface step, not a shadow.",
    "",
    "## Shapes",
    "Buttons {rounded.md}, inputs {rounded.sm}, pills {rounded.full}.",
    "",
    "## Components",
    "Buttons use {colors.primary-base}; hover {colors.primary-base-hover}.",
    "",
    "## Do's and Don'ts",
    "Never hardcode a color; never cross an on-pair.",
    "",
    "## Responsive Behavior",
    "Mobile-first; both schemes hold at every width.",
    "",
    "## Agent Prompt Guide",
    "Tokens first; color-scheme on :root is required or the dark end never fires.",
    "",
  ].join("\n");
  const tokens = {
    colors: LIGHT,
    colorsDark: DARK,
    type: {
      scale: {
        "body-md": { size: 16, lineHeight: 1.5, weight: 500 },
        "ui-md": { size: 14, lineHeight: 1.429, weight: 550 },
      },
    },
  };
  return {
    designMd: fm + "\n" + body,
    tokensJson: JSON.stringify(tokens),
    previews: [{ name: "preview.html", html: PREVIEW_HTML }],
  };
}

// A reusable conformance check: golden and embedded run the identical asserts.
function checkBundle(tag, base, onDarkKeyLine, dropColorsDarkKey, previewLineHeightNeedle) {
  // (0) conformant → 0 fails
  {
    const r = dsBundleGates(base);
    ok(r.fails === 0, `[${tag}] conformant bundle → 0 fails (got ${r.fails}: ${failGates(r).join(",")} · ${r.findings.filter((f) => f.level === "ERROR").map((f) => f.gate + " " + f.msg).join(" | ")})`);
    // sanity: the color gates actually ran (not vacuously green)
    ok(r.findings.some((f) => f.gate === "G1" && f.level === "PASS" && f.msg.startsWith("light")), `[${tag}] G1 light ran`);
    ok(r.findings.some((f) => f.gate === "G1" && f.level === "PASS" && f.msg.startsWith("dark")), `[${tag}] G1 dark ran`);
    ok(r.findings.some((f) => f.gate === "G3" && f.level === "PASS"), `[${tag}] G3 ran`);
  }
  // (a) dark on-color → constant white in the FRONTMATTER only → G1 (+G3)
  {
    const designMd = base.designMd.replace(onDarkKeyLine.from, onDarkKeyLine.to);
    ok(designMd !== base.designMd, `[${tag}] mutation (a) applied (found the on-dark line)`);
    const r = dsBundleGates({ ...base, designMd });
    ok(r.fails > 0 && hasFail(r, "G1"), `[${tag}] (a) white dark on-color → G1 fires (gates ${failGates(r).join(",")})`);
    ok(hasFail(r, "G3"), `[${tag}] (a) frontmatter≠tokens → G3 fires`);
    ok(r.findings.some((f) => f.gate === "G1" && f.level === "ERROR" && f.msg.startsWith("dark")), `[${tag}] (a) it is the DARK scheme that fails G1`);
  }
  // (b) delete a colorsDark key → G2
  {
    const tj = JSON.parse(typeof base.tokensJson === "string" ? base.tokensJson : JSON.stringify(base.tokensJson));
    ok(dropColorsDarkKey in tj.colorsDark, `[${tag}] mutation (b) target key '${dropColorsDarkKey}' exists`);
    delete tj.colorsDark[dropColorsDarkKey];
    const r = dsBundleGates({ ...base, tokensJson: JSON.stringify(tj) });
    ok(r.fails > 0 && hasFail(r, "G2"), `[${tag}] (b) dropped colorsDark key → G2 fires (gates ${failGates(r).join(",")})`);
  }
  // (c) inject line-height:24px into a preview → G8
  {
    const previews = base.previews.map((p, i) =>
      i === 0 ? { ...p, html: p.html.replace(previewLineHeightNeedle, "line-height:24px") } : p
    );
    ok(previews[0].html !== base.previews[0].html, `[${tag}] mutation (c) applied (found line-height in preview 0)`);
    const r = dsBundleGates({ ...base, previews });
    ok(r.fails > 0 && hasFail(r, "G8"), `[${tag}] (c) px line-height in preview → G8 fires (gates ${failGates(r).join(",")})`);
  }
}

// ── 1. embedded fixture (always) ──────────────────────────────────────────────
checkBundle(
  "embedded",
  buildEmbedded(),
  { from: 'primary-base-on-primary-base-dark: "#111111"', to: 'primary-base-on-primary-base-dark: "#FFFFFF"' },
  "primary-base-surface",
  "line-height:1.5"
);

// ── 2. golden Studio-54 bundle (when present) ─────────────────────────────────
const GOLDEN = join(
  homedir(),
  "Downloads",
  "ultimate-tokens-studio-54-the-dancefloor",
  "design-system-for-claude-code"
);
let goldenRan = false;
if (existsSync(join(GOLDEN, "DESIGN.md")) && existsSync(join(GOLDEN, "tokens.json"))) {
  goldenRan = true;
  const cdir = join(GOLDEN, "components");
  const previews = existsSync(cdir)
    ? readdirSync(cdir).filter((f) => f.endsWith(".html")).map((f) => ({ name: f, html: readFileSync(join(cdir, f), "utf8") }))
    : [];
  const base = {
    designMd: readFileSync(join(GOLDEN, "DESIGN.md"), "utf8"),
    tokensJson: readFileSync(join(GOLDEN, "tokens.json"), "utf8"),
    previews,
  };
  checkBundle(
    "golden",
    base,
    { from: 'primary-base-on-primary-base-dark: "oklch(0.1776 0 89.88)"', to: 'primary-base-on-primary-base-dark: "#FFFFFF"' },
    "primary-base-surface",
    "line-height:1.5"
  );
}

if (fails.length) {
  console.error(`ds-gates FAIL (${fails.length}):\n  ` + fails.join("\n  "));
  process.exit(1);
}
console.log(
  `ds-gates PASS — G0–G8/W/DIV port; embedded fixture green + 3 mutations red` +
    (goldenRan ? "; golden Studio-54 bundle green + 3 mutations red" : "; golden bundle absent (skipped — CI-safe)")
);
process.exit(0);
