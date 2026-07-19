#!/usr/bin/env node
// run.mjs — the HCT test suite. Runs every engine/ui/figma verifier + the headless DOM boot,
// each as a child `node` process (they self-report + process.exit). Exit 0 = all pass.
//
// Prereq: the generated artifacts (figma/plugin/ui.html, src/ui/figma-plugin-assets.js, the
// offline bundle) must be current — `npm test` regenerates them first (see package.json).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = [
  "engine/hct.mjs", "engine/tonal.mjs", "engine/semantic.mjs", "engine/exports.mjs", "engine/okhsl.mjs", "engine/derive.mjs", "engine/type.mjs", "engine/geometry.mjs", "engine/flags.mjs", "engine/ds-gates.mjs", "engine/categories.mjs",
  "ui/persist.mjs", "ui/shell.mjs", "ui/zip.mjs", "ui/headless-boot.mjs",
  "figma/plugin.mjs", "figma/binder.mjs", "figma/mode-apply.mjs", "figma/style-plan.mjs", "figma/migrations.mjs", "figma/live-diff.mjs",
  "mcp/core.mjs", "mcp/brand-kit.mjs", "mcp/describe-kit-core.mjs", "mcp/describe-rubric.mjs", "mcp/png-swatch-board.mjs", "mcp/describe-mcp-core.mjs", "mcp/describe-mcp.mjs", "mcp/brand-kit-merged-core.mjs", "mcp/brand-kit-merged.mjs", "mcp/describe-eval.mjs",
  "plugin/manifest.mjs", "plugin/color-tokens.mjs", "plugin/typography-tokens.mjs", "plugin/geometry-tokens.mjs", "plugin/hosted-pack.mjs",
  "repo/branding.mjs",
];

let failed = 0;
for (const t of TESTS) {
  process.stdout.write(`▶ ${t.padEnd(24)} `);
  try {
    execFileSync("node", [join(HERE, t)], { stdio: "pipe" });
    console.log("pass");
  } catch (e) {
    failed++;
    console.log("FAIL");
    process.stdout.write((e.stdout?.toString() || "") + (e.stderr?.toString() || ""));
  }
}
console.log(failed ? `\n✗ ${failed}/${TESTS.length} test file(s) failed` : `\n✓ all ${TESTS.length} test files passed`);
process.exit(failed ? 1 : 0);
