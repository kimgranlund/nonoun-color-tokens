#!/usr/bin/env node
// gen-plugin-pack.mjs — the HOSTED distribution pack for the consumption plugin.
//
// The repo is going private, so the GitHub marketplace channel
// (`/plugin marketplace add kimgranlund/ultimate-tokens`) retires. The replacement (ratified
// 2026-07-11): a URL-hosted marketplace at https://ultimate-tokens.com/plugins/claude/marketplace.json
// backed by an npm package — a VERIFIED platform constraint forces the split: a URL-hosted
// marketplace downloads ONLY marketplace.json; plugin files must come from an npm / GitHub / git
// source (code.claude.com/docs/en/plugin-marketplaces, "Plugins with relative paths fail in
// URL-based marketplaces").
//
// Emits, from the ONE source of truth (plugin/ultimate-tokens/):
//   dist/plugins/claude/marketplace.json   — the hosted catalog (plugin source = npm, version-pinned)
//   dist/plugins/claude/index.md           — the human page for the URL (install commands)
//   dist/plugins/npm/ultimate-tokens-claude/ — the npm-publishable package (plugin tree + package.json)
//
// Deploy = `npm run gen:plugin-pack` → `npm publish dist/plugins/npm/ultimate-tokens-claude`
// → upload dist/plugins/claude/ to the site. Full runbook: plugin/HOSTING.md.
// The version in ALL THREE artifacts is read from plugin.json — the update cache key; the
// test/plugin/hosted-pack.mjs gate keeps them in lockstep.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NPM_PACKAGE = "ultimate-tokens-claude";
export const MARKETPLACE_URL = "https://ultimate-tokens.com/plugins/claude/marketplace.json";

// buildPack(outDir) — pure-ish (fs only); importable so the test gate can build into a scratch dir.
export function buildPack(outDir) {
  const pluginDir = join(ROOT, "plugin", "ultimate-tokens");
  const manifest = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  const version = manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`plugin.json version "${version}" is not semver`);

  const claudeDir = join(outDir, "plugins", "claude");
  const npmDir = join(outDir, "plugins", "npm", NPM_PACKAGE);
  rmSync(join(outDir, "plugins"), { recursive: true, force: true });
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(npmDir, { recursive: true });

  // 1) the hosted marketplace.json — plugin source = the npm package, PINNED to this version
  //    (the npm `version` field makes each site deploy an exact release, not a floating tag).
  const marketplace = {
    name: "ultimate-tokens",
    owner: { name: "Ultimate Tokens", url: "https://ultimate-tokens.com" },
    metadata: {
      description:
        "The consumption-side toolchain for Ultimate Tokens — skills that teach coding agents to use an exported design-token kit (colour · type · geometry) correctly in their own projects. Parity-gated against the generator's engines.",
    },
    plugins: [
      {
        name: manifest.name,
        source: { source: "npm", package: NPM_PACKAGE, version },
        description: manifest.description,
        category: "developer-tools",
        tags: ["design-tokens", "css-variables", "semantic-colors", "type-scale", "geometry", "material-3", "oklch", "consumption"],
      },
    ],
  };
  writeFileSync(join(claudeDir, "marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");

  // 2) the human page for the hosted URL
  writeFileSync(join(claudeDir, "index.md"), [
    "# Ultimate Tokens — Claude Code plugin", "",
    "Teach a coding agent to consume an exported Ultimate Tokens kit correctly — the right semantic",
    "color role per surface, the right type voice/step per text, the right control size — instead of",
    "guessing values. Three skills + the `token-integrator` agent, free and MIT.", "",
    "```",
    `/plugin marketplace add ${MARKETPLACE_URL}`,
    `/plugin install ${manifest.name}`,
    "```", "",
    `Current version: **${version}**. Update with \`/plugin marketplace update ultimate-tokens\` +`,
    "`/plugin update " + manifest.name + "`.", "",
  ].join("\n"));

  // 3) the npm-publishable package — the plugin tree verbatim + a package.json wrapper.
  //    npm installs the package root AS the plugin root, so .claude-plugin/ + skills/ + agents/
  //    sit at the package top level. OS litter is excluded by copy filter.
  cpSync(pluginDir, npmDir, { recursive: true, filter: (src) => !/\.DS_Store$/.test(src) });
  const pkg = {
    name: NPM_PACKAGE,
    version,
    description: manifest.description,
    license: manifest.license || "MIT",
    homepage: "https://ultimate-tokens.com",
    keywords: manifest.keywords || [],
    // `files` whitelists the plugin surface — no accidental extras enter the tarball.
    files: [".claude-plugin/", "skills/", "agents/", "README.md"],
  };
  writeFileSync(join(npmDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // inventory (for the gate + the deploy log)
  const count = (dir) => {
    let n = 0;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) n += count(p);
      else n++;
    }
    return n;
  };
  return { version, files: count(join(outDir, "plugins")), marketplace, npmDir, claudeDir };
}

// CLI: build into dist/
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = buildPack(join(ROOT, "dist"));
  console.log(`plugin pack v${r.version} → dist/plugins/ (${r.files} files)`);
  console.log(`  hosted catalog: dist/plugins/claude/marketplace.json (source: npm ${NPM_PACKAGE}@${r.version})`);
  console.log(`  npm package:    dist/plugins/npm/${NPM_PACKAGE}/ — publish with: npm publish dist/plugins/npm/${NPM_PACKAGE}`);
}
