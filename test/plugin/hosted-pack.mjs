#!/usr/bin/env node
// hosted-pack.mjs — gates the PURE-NPM plugin distribution pack (scripts/gen-plugin-pack.mjs):
// the package IS the whole channel (plugin bytes + the CDN-served marketplace.json), so this gate
// holds the three load-bearing invariants:
//   1. VERSION LOCKSTEP — plugin.json == the npm package.json (the version is both the update
//      cache key and the publish-workflow trigger; drift = a release nobody receives).
//   2. THE CATALOG CONSTRAINT — the in-package marketplace.json's plugin source is the npm package
//      itself, UNPINNED (a remote-URL marketplace can't resolve relative paths — verified platform
//      fact; and a version pin would freeze every downloaded catalog to the release that carried it).
//   3. SURFACE COMPLETENESS — the plugin tree rides verbatim, the files whitelist carries it all,
//      no OS litter.
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPack, NPM_PACKAGE, NPM_DIR, MARKETPLACE_ADD_URL } from "../../scripts/gen-plugin-pack.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const scratch = join(ROOT, "test", "plugin", ".hosted-pack-scratch");
rmSync(scratch, { recursive: true, force: true });
const r = buildPack(scratch);
const pkgDir = join(scratch, "plugins/npm", NPM_DIR);

const pluginJson = JSON.parse(readFileSync(join(ROOT, "plugin/ultimate-tokens/.claude-plugin/plugin.json"), "utf8"));
const npmPkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(pkgDir, "marketplace.json"), "utf8"));

// ── 1. version lockstep + the scoped name ──
ok(r.version === pluginJson.version, `builder version ${r.version} != plugin.json ${pluginJson.version}`);
ok(npmPkg.version === pluginJson.version, `npm package.json ${npmPkg.version} != plugin.json ${pluginJson.version}`);
ok(npmPkg.name === NPM_PACKAGE && NPM_PACKAGE.startsWith("@ultimate-tokens/"), `npm package must be scoped to the org (got ${npmPkg.name})`);

// ── 2. the catalog: npm source, THIS package, unpinned; never a relative path ──
const src = catalog.plugins[0] && catalog.plugins[0].source;
ok(src && src.source === "npm" && src.package === NPM_PACKAGE, `catalog plugin source must be { source: "npm", package: "${NPM_PACKAGE}" } (got ${JSON.stringify(src)})`);
ok(src && !("version" in src), "the catalog's npm source must be UNPINNED (floating latest) — a pin freezes every downloaded catalog");
ok(!catalog.plugins.some((p) => typeof p.source === "string"), "a catalog entry uses a relative-path source — unreachable from a URL-added marketplace");
ok(catalog.plugins[0].name === pluginJson.name, `catalog plugin name ${catalog.plugins[0].name} != plugin.json name ${pluginJson.name}`);

// ── 3. the npm package IS the plugin: manifest + components + the catalog, whitelisted ──
for (const p of [".claude-plugin/plugin.json", "skills/color-tokens/SKILL.md", "skills/typography-tokens/SKILL.md", "skills/geometry-tokens/SKILL.md", "agents/token-integrator.md", "README.md", "marketplace.json"])
  ok(existsSync(join(pkgDir, p)), `npm package missing ${p}`);
ok(JSON.stringify(JSON.parse(readFileSync(join(pkgDir, ".claude-plugin/plugin.json"), "utf8"))) === JSON.stringify(pluginJson),
  "the packaged plugin.json is not byte-equal (parsed) to the source of truth");
ok(Array.isArray(npmPkg.files) && [".claude-plugin/", "skills/", "agents/", "marketplace.json"].every((f) => npmPkg.files.includes(f)),
  "npm files whitelist must carry the plugin surface + marketplace.json");
ok(!existsSync(join(pkgDir, "skills/.DS_Store")), ".DS_Store leaked into the npm package");

// ── the user-facing add URL derives from the package name (the exported constant is what the
//    docs/zip README will print — keep it honest) ──
ok(MARKETPLACE_ADD_URL === `https://unpkg.com/${NPM_PACKAGE}/marketplace.json`, `MARKETPLACE_ADD_URL drifted (${MARKETPLACE_ADD_URL})`);

rmSync(scratch, { recursive: true, force: true });
if (fails.length) { console.error(`hosted-pack FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log(`hosted-pack PASS — ${NPM_PACKAGE}@${r.version}: version lockstep, unpinned in-package catalog, plugin surface complete`);
process.exit(0);
