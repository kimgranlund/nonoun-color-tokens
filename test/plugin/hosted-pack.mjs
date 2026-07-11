#!/usr/bin/env node
// hosted-pack.mjs — gates the HOSTED plugin distribution pack (scripts/gen-plugin-pack.mjs):
// the URL-marketplace + npm split obeys the verified platform constraint (a URL-hosted
// marketplace.json downloads only itself — plugin bytes must come from npm/git), and every
// artifact's VERSION is in lockstep with plugin.json (the update cache key — a drifted version
// ships a release nobody receives, or pins the site to a package that doesn't exist).
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPack, NPM_PACKAGE, MARKETPLACE_URL } from "../../scripts/gen-plugin-pack.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const scratch = join(ROOT, "test", "plugin", ".hosted-pack-scratch");
rmSync(scratch, { recursive: true, force: true });
const r = buildPack(scratch);

const pluginJson = JSON.parse(readFileSync(join(ROOT, "plugin/ultimate-tokens/.claude-plugin/plugin.json"), "utf8"));
const hosted = JSON.parse(readFileSync(join(scratch, "plugins/claude/marketplace.json"), "utf8"));
const npmPkg = JSON.parse(readFileSync(join(scratch, "plugins/npm", NPM_PACKAGE, "package.json"), "utf8"));

// ── the version lockstep: plugin.json == hosted catalog pin == npm package ──
ok(r.version === pluginJson.version, `builder version ${r.version} != plugin.json ${pluginJson.version}`);
ok(hosted.plugins[0].source && hosted.plugins[0].source.version === pluginJson.version, `hosted catalog pins ${hosted.plugins[0].source && hosted.plugins[0].source.version}, plugin.json is ${pluginJson.version}`);
ok(npmPkg.version === pluginJson.version, `npm package.json ${npmPkg.version} != plugin.json ${pluginJson.version}`);

// ── the platform constraint: the hosted catalog's plugin source MUST be npm (never a relative
//    path — a URL-hosted marketplace cannot resolve one; the docs' explicit failure mode) ──
ok(hosted.plugins[0].source && hosted.plugins[0].source.source === "npm" && hosted.plugins[0].source.package === NPM_PACKAGE,
  `hosted plugin source must be { source: "npm", package: "${NPM_PACKAGE}" } (got ${JSON.stringify(hosted.plugins[0].source)})`);
ok(!hosted.plugins.some((p) => typeof p.source === "string"), "a hosted catalog entry uses a relative-path source — unreachable from a URL-hosted marketplace");

// ── the npm package IS the plugin: manifest at .claude-plugin/, components at the root ──
for (const p of [".claude-plugin/plugin.json", "skills/color-tokens/SKILL.md", "skills/typography-tokens/SKILL.md", "skills/geometry-tokens/SKILL.md", "agents/token-integrator.md", "README.md"])
  ok(existsSync(join(scratch, "plugins/npm", NPM_PACKAGE, p)), `npm package missing ${p}`);
ok(JSON.stringify(JSON.parse(readFileSync(join(scratch, "plugins/npm", NPM_PACKAGE, ".claude-plugin/plugin.json"), "utf8"))) === JSON.stringify(pluginJson),
  "the packaged plugin.json is not byte-equal (parsed) to the source of truth");
ok(Array.isArray(npmPkg.files) && npmPkg.files.includes(".claude-plugin/") && npmPkg.files.includes("skills/"), "npm files whitelist must carry the plugin surface");

// ── the human page carries the real install commands ──
const index = readFileSync(join(scratch, "plugins/claude/index.md"), "utf8");
ok(index.includes(`/plugin marketplace add ${MARKETPLACE_URL}`) && index.includes(`/plugin install ${pluginJson.name}`), "index.md missing the install commands");
ok(index.includes(pluginJson.version), "index.md does not state the current version");

// ── no OS litter enters the pack ──
ok(!existsSync(join(scratch, "plugins/npm", NPM_PACKAGE, "skills/.DS_Store")), ".DS_Store leaked into the npm package");

rmSync(scratch, { recursive: true, force: true });
if (fails.length) { console.error(`hosted-pack FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log(`hosted-pack PASS — v${r.version} in lockstep (plugin.json · hosted catalog npm pin · npm package), URL-marketplace constraint honored, plugin surface complete`);
process.exit(0);
