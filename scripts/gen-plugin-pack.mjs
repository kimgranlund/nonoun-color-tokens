#!/usr/bin/env node
// gen-plugin-pack.mjs — the PURE-NPM distribution pack for the consumption plugin.
//
// The repo is going private, retiring the GitHub marketplace channel. The replacement (ratified
// 2026-07-11, superseding the same-day ultimate-tokens.com hosting plan): NOTHING is hosted —
// the plugin publishes to npm as @ultimate-tokens/claude (the org Kim created), and the
// marketplace.json rides INSIDE the package, served by the npm CDNs as a remote-URL marketplace:
//
//   /plugin marketplace add https://unpkg.com/@ultimate-tokens/claude/marketplace.json
//   /plugin install ultimate-tokens
//
// Verified platform facts shaping this (code.claude.com/docs, 2026-07-11):
//   - there is NO direct-from-npm plugin install — a marketplace is always the entry point;
//   - a remote-URL marketplace downloads ONLY marketplace.json, so its plugin source must be an
//     npm/git source — here the npm package itself, UNPINNED (floating latest: releases only ever
//     touch npm; `/plugin marketplace update` + auto-update deliver new versions).
//
// Emits dist/plugins/npm/ultimate-tokens-claude/ — the publishable package:
//   .claude-plugin/plugin.json + skills/ + agents/ + README.md   (the plugin tree, verbatim)
//   marketplace.json                                             (the CDN-served catalog)
//   package.json                                                 (name @ultimate-tokens/claude)
//
// Publishing is AUTOMATED: .github/workflows/publish-plugin.yml publishes on every version bump
// that lands on main (the version is the update cache key — bump on every plugin change).
// Runbook: plugin/HOSTING.md. Version lockstep gate: test/plugin/hosted-pack.mjs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NPM_PACKAGE = "@ultimate-tokens/claude";
export const NPM_DIR = "ultimate-tokens-claude"; // the on-disk dist dir (no @/ in paths)
export const MARKETPLACE_ADD_URL = `https://unpkg.com/${NPM_PACKAGE}/marketplace.json`;
export const MARKETPLACE_ADD_URL_ALT = `https://cdn.jsdelivr.net/npm/${NPM_PACKAGE}/marketplace.json`;

// buildPack(outDir) — importable so the test gate can build into a scratch dir.
export function buildPack(outDir) {
  const pluginDir = join(ROOT, "plugin", "ultimate-tokens");
  const manifest = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  const version = manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`plugin.json version "${version}" is not semver`);

  const npmDir = join(outDir, "plugins", "npm", NPM_DIR);
  rmSync(join(outDir, "plugins"), { recursive: true, force: true });
  mkdirSync(npmDir, { recursive: true });

  // 1) the plugin tree, verbatim (OS litter filtered)
  cpSync(pluginDir, npmDir, { recursive: true, filter: (src) => !/\.DS_Store$/.test(src) });

  // 2) the in-package marketplace.json — the CDN-served catalog. The plugin source is THIS package,
  //    deliberately UNPINNED: a version pin here would freeze every marketplace copy to the release
  //    that carried it; floating latest means the catalog never needs to change.
  const marketplace = {
    name: "ultimate-tokens",
    owner: { name: "Ultimate Tokens" },
    metadata: {
      description:
        "The consumption-side toolchain for Ultimate Tokens — skills that teach coding agents to use an exported design-token kit (colour · type · geometry) correctly in their own projects. Parity-gated against the generator's engines.",
    },
    plugins: [
      {
        name: manifest.name,
        source: { source: "npm", package: NPM_PACKAGE },
        description: manifest.description,
        category: "developer-tools",
        tags: ["design-tokens", "css-variables", "semantic-colors", "type-scale", "geometry", "material-3", "oklch", "consumption"],
      },
    ],
  };
  writeFileSync(join(npmDir, "marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");

  // 3) package.json — npm installs this package root AS the plugin root.
  const pkg = {
    name: NPM_PACKAGE,
    version,
    description: manifest.description,
    license: manifest.license || "MIT",
    keywords: manifest.keywords || [],
    // `files` whitelists the surface — the plugin tree + the CDN-served catalog, nothing else.
    files: [".claude-plugin/", "skills/", "agents/", "README.md", "marketplace.json"],
  };
  writeFileSync(join(npmDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  const count = (dir) => {
    let n = 0;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) n += count(p);
      else n++;
    }
    return n;
  };
  return { version, files: count(npmDir), marketplace, npmDir };
}

// CLI: build into dist/
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = buildPack(join(ROOT, "dist"));
  console.log(`plugin pack v${r.version} → dist/plugins/npm/${NPM_DIR}/ (${r.files} files)`);
  console.log(`  publish:  npm publish dist/plugins/npm/${NPM_DIR} --access public`);
  console.log(`  users:    /plugin marketplace add ${MARKETPLACE_ADD_URL}`);
}
