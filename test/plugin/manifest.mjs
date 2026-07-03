// plugin/manifest.mjs — the ultimate-tokens PLUGIN packaging gate: the manifest + marketplace entry
// must stay valid and coherent with the skills on disk, so a broken plugin.json (or a skill removed
// without updating the package) reddens the suite. Structural only — the skill CONTENT gates are the
// per-skill parity legs.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const manifestPath = join(ROOT, "plugin/ultimate-tokens/.claude-plugin/plugin.json");
const marketPath = join(ROOT, "plugin/.claude-plugin/marketplace.json");
ok(existsSync(manifestPath), "plugin/ultimate-tokens/.claude-plugin/plugin.json exists");
ok(existsSync(marketPath), "plugin/.claude-plugin/marketplace.json exists");

let manifest, market;
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (e) { fails.push("plugin.json is not valid JSON: " + e.message); }
try { market = JSON.parse(readFileSync(marketPath, "utf8")); } catch (e) { fails.push("marketplace.json is not valid JSON: " + e.message); }

if (manifest) {
  ok(manifest.name === "ultimate-tokens", `plugin.json name is "ultimate-tokens" (got ${manifest.name})`);
  ok(/^\d+\.\d+\.\d+$/.test(manifest.version || ""), `plugin.json version is semver (got ${manifest.version})`);
  ok(typeof manifest.description === "string" && manifest.description.length > 40, "plugin.json has a substantive description");
}
if (market) {
  ok(Array.isArray(market.plugins) && market.plugins.length >= 1, "marketplace.json lists ≥1 plugin");
  const entry = (market.plugins || []).find((p) => p.name === "ultimate-tokens");
  ok(entry, "marketplace.json has the ultimate-tokens entry");
  if (entry) {
    // the source path resolves to the plugin dir, and its manifest name matches
    const srcDir = join(ROOT, "plugin", entry.source.replace(/^\.\//, ""));
    ok(existsSync(join(srcDir, ".claude-plugin/plugin.json")), `marketplace source "${entry.source}" resolves to a plugin with a manifest`);
    if (manifest) ok(entry.name === manifest.name, "marketplace entry name matches the plugin.json name");
  }
}

// every skill dir on disk carries a SKILL.md (a package that ships a broken/empty skill folder is a defect).
const skillsDir = join(ROOT, "plugin/ultimate-tokens/skills");
if (existsSync(skillsDir)) {
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."));
  ok(dirs.length >= 3, `at least the three token-consumption skills are present (got ${dirs.length})`);
  for (const d of dirs) ok(existsSync(join(skillsDir, d.name, "SKILL.md")), `skill "${d.name}" has a SKILL.md`);
}

// any bundled agents must carry a name + description frontmatter (a broken agent shouldn't ship).
const agentsDir = join(ROOT, "plugin/ultimate-tokens/agents");
if (existsSync(agentsDir)) {
  for (const f of readdirSync(agentsDir).filter((n) => n.endsWith(".md"))) {
    const src = readFileSync(join(agentsDir, f), "utf8");
    ok(/^---[\s\S]*?\nname:\s*\S/.test(src) && /\ndescription:\s*\S|\ndescription:\s*>/.test(src), `agent "${f}" has name + description frontmatter`);
  }
}

if (fails.length) { console.error("plugin FAIL:\n  ✗ " + fails.join("\n  ✗ ")); process.exit(1); }
console.log("plugin PASS — ultimate-tokens manifest + marketplace coherent with the skills (+ agents) on disk");
process.exit(0);
