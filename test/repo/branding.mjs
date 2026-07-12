#!/usr/bin/env node
// branding.mjs — the debrand is a GATE, not a one-time sweep.
//
// The product shipped as "Ultimate Tokens by NONOUN" with a nonoun.io support/docs/account surface and an
// "N" monogram mark. All of it was removed. A find-and-replace decays: the next person to write a toast, an
// og: tag, or a README line reintroduces the maker by muscle memory. So the absence is asserted.
//
// TWO shapes are banned, and one is deliberately allowed:
//   BANNED  `NONOUN` (any case-exact uppercase run) — the maker name, in code, copy, or metadata.
//   BANNED  `nonoun.io` — every URL and the support email; nothing there resolves anymore.
//   ALLOWED `nonoun-color-tokens` — the pre-rename localStorage PREFIXES only. That is DATA compatibility:
//           migrateStorageKeys() uses them to carry a user's saved palettes across the rename, and dropping
//           it deletes their work. The pre-rename element TAG was COSMETIC compatibility and is gone
//           (ADR-015) — a tag is a name the DOM says out loud. The allowlist below is the boundary, and it
//           is the point: a NEW file may not quietly acquire the old identifier.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const FAIL = (file, msg) => { failed++; console.log(`  ✗ ${file}: ${msg}`); };

// Files permitted to name the pre-rename identifier, each because it IMPLEMENTS back-compat.
const LEGACY_TAG_ALLOWLIST = new Set([
  "src/ui/app.js",              // LEGACY_STORAGE_PREFIXES — migrateStorageKeys() carries saved palettes
  "src/ui/persist.js",          // the storage-key rename comment
  "figma/plugin/code.js",       // the ADR-014 orphaning comment
  "test/ui/headless-boot.mjs",  // the (mig) storage-migration assertions + the alias-is-gone assertion
  "test/figma/plugin.mjs",      // the orphaned-pluginData gate
]);

// Generated artifacts mirror their sources; gating the source is what matters. This file must NAME the
// banned strings to ban them, so it exempts itself.
const SKIP_FILES = new Set([
  "figma/plugin/ui.html", "src/ui/figma-plugin-assets.js", "src/ui/mcp-assets.js",
  "test/repo/branding.mjs",
]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "other"]); // .claude/docs/other/ is local-only
// RECORDS: files whose job is to say what the product used to be. A changelog entry keeps the name it
// shipped under; ADR-014 records the rename and ADR-015 records the debrand — each must NAME the thing it
// retired to be worth reading. Rewriting them would be the one dishonest way to pass this gate, so they
// are exempt rather than swept.
const RECORDS = new Set([
  "CHANGELOG.md",
  "docs/reference/CHANGELOG.md",
  "docs/reference/references/decision-records.md",
]);

const TEXT = /\.(js|mjs|ts|json|html|css|md|yml|yaml|svg|webmanifest)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) yield* walk(abs);
    else yield abs;
  }
}

let scanned = 0;
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  if (!TEXT.test(rel) || SKIP_FILES.has(rel) || RECORDS.has(rel)) continue;
  let src;
  try { src = readFileSync(abs, "utf8"); } catch { continue; }
  scanned++;

  if (/NONOUN/.test(src))
    FAIL(rel, 'contains "NONOUN" — the product is unattributed; it is "Ultimate Tokens", full stop');
  if (/nonoun\.io/.test(src))
    FAIL(rel, 'contains a nonoun.io URL or email — support is the repo issue tracker, docs are the README, billing is Lemon Squeezy');
  if (/nonoun-color-tokens/.test(src) && !LEGACY_TAG_ALLOWLIST.has(rel))
    FAIL(rel, 'names the pre-rename identifier outside the back-compat allowlist (test/repo/branding.mjs) — new code uses ultimate-tokens');
}

console.log(failed ? `\nFAIL: ${failed} branding violation(s) across ${scanned} files` : `branding: clean (${scanned} files scanned)`);
process.exit(failed ? 1 : 0);
