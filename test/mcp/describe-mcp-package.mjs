#!/usr/bin/env node
// describe-mcp-package.mjs — verifier for the DOWNLOADABLE Describe-Palette MCP package (app.js's
// downloadDescribePaletteMcp, #395's follow-on delivery surface). test/mcp/brand-kit-merged.mjs already
// proves the merged server works from the LIVE repo tree; this proves the exact file set
// DESCRIBE_MCP_FILES actually SHIPS is self-sufficient on its own — extracted to a bare temp directory
// with none of the repo's other files beside it, so a missing transitive import (a future edit to
// describe-kit-core.mjs that reaches for a new engine module, say) fails HERE with ERR_MODULE_NOT_FOUND
// instead of silently working in dev (where the whole repo happens to be on disk anyway) and only
// breaking for a real end user who unzipped the download.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { DESCRIBE_MCP_FILES, DESCRIBE_MCP_README, DESCRIBE_MCP_ENGINE_VERSION } from "../../src/ui/describe-mcp-assets.js";
import { brandKit, defaultDocument } from "../../src/ui/model.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── build the package on disk exactly as app.js's downloadDescribePaletteMcp would zip it ──
const pkgDir = mkdtempSync(join(tmpdir(), "describe-mcp-package-"));
for (const { path, data } of DESCRIBE_MCP_FILES) {
  const full = join(pkgDir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}
const seededKit = brandKit(defaultDocument());
mkdirSync(join(pkgDir, "mcp"), { recursive: true });
writeFileSync(join(pkgDir, "mcp", "brand-kit.json"), JSON.stringify(seededKit, null, 2)); // sibling of the server, per its own HERE-relative default lookup
writeFileSync(join(pkgDir, "README.md"), DESCRIBE_MCP_README);
// version is the REAL engine version (mirroring app.js's downloadDescribePaletteMcp exactly) — a
// generated kit's meta.engineVersion (spec §6.4) reads THIS file, not a placeholder.
writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "ultimate-tokens-describe-palette-mcp", version: DESCRIBE_MCP_ENGINE_VERSION, type: "module", private: true }, null, 2));

ok(DESCRIBE_MCP_FILES.some((f) => f.path === "mcp/brand-kit-merged-server.mjs"), "the shipped file set includes the server entry itself");
ok(DESCRIBE_MCP_FILES.some((f) => f.path === "docs/reference/data/role-table.json"), "the shipped file set includes the role-table data describe-kit-core.mjs reads at runtime");
ok(DESCRIBE_MCP_FILES.length >= 20, `the shipped file set is genuinely the whole engine closure, not a stub (got ${DESCRIBE_MCP_FILES.length} files)`);

// spawnClient() — drives the real extracted package's server over stdio, exactly like
// test/mcp/brand-kit-merged.mjs does against the live repo tree, but rooted at pkgDir with NOTHING else
// on disk beside it — no ../../src fallback to the real repo could paper over a missing file here.
function spawnClient() {
  const srv = spawn("node", ["mcp/brand-kit-merged-server.mjs"], { cwd: pkgDir, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  srv.stderr.setEncoding("utf8");
  srv.stderr.on("data", (c) => { stderr += c; });
  const pending = new Map();
  let buf = "";
  srv.stdout.setEncoding("utf8");
  srv.stdout.on("data", (c) => {
    buf += c; let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      const m = JSON.parse(line);
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  let idc = 0;
  const rpc = (method, params) => new Promise((res) => { const id = ++idc; pending.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const notify = (method) => srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  const callTool = async (name, toolArgs) => { const r = await rpc("tools/call", { name, arguments: toolArgs }); return JSON.parse(r.result.content[0].text); };
  const kill = () => { try { srv.stdin.end(); srv.kill(); } catch { /* */ } };
  return { rpc, notify, callTool, kill, exitCode: () => srv.exitCode, stderrText: () => stderr };
}

const c = spawnClient();
try {
  const init = await c.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  ok(init.result && init.result.serverInfo.name === "ultimate-tokens-brand-kit", `the extracted package boots and speaks MCP with no ERR_MODULE_NOT_FOUND (stderr: ${c.stderrText().slice(0, 300)})`);
  c.notify("notifications/initialized");

  // ── seeded read surface: "ships BESIDE, not instead of" — the read tools work off mcp/brand-kit.json
  // immediately, before generate_kit is ever called (spec §9's ruling, this ticket's packaging choice) ──
  const tools = (await c.rpc("tools/list")).result.tools.map((t) => t.name);
  ok(tools.includes("list_palettes") && tools.includes("generate_kit") && tools.includes("export_tokens"), `the seeded package lists BOTH the read tools and generate_kit/export_tokens from first boot (got ${tools.join(",")})`);
  const palettes = await c.callTool("list_palettes", {});
  ok(Array.isArray(palettes) && palettes.length === 8, `the seeded brand-kit.json's read surface is live: list_palettes returns all 8 families (got ${JSON.stringify(palettes)})`);

  // ── generate_kit end to end, entirely from the extracted package's own describe-kit-core.mjs/model.mjs ──
  const briefing = await c.callTool("generate_kit", { description: "a rainy Tokyo alley at night, neon reflections" });
  ok(briefing.rubric && briefing.schema && Array.isArray(briefing.exemplars), "step 1 (teach): description -> a real briefing payload, from the PACKAGED describe-rubric.mjs");

  const brief = { name: "Neon Alley", families: { Primary: { hue: 280, chroma: 55 } } };
  const genReply = (await c.rpc("tools/call", { name: "generate_kit", arguments: { brief } })).result;
  const generated = JSON.parse(genReply.content[0].text);
  ok(generated.kit && generated.kit.palettes.length === 8, "step 2 (generate): brief -> a real 8-palette kit, from the packaged describe-kit-core.mjs");
  ok(genReply.content.length === 2 && genReply.content[1].type === "image" && genReply.content[1].mimeType === "image/png", "the reply's SECOND content block is the PNG swatch board, from the packaged png-swatch-board.mjs (attachImageBlock)");
  // the downloaded package's own package.json carries the REAL engine version (app.js writes
  // DESCRIBE_MCP_ENGINE_VERSION there, not a placeholder) — a kit generated from the download must report
  // that same real version, not a stub like "0.1.0", in its reproducibility stamp (spec §6.4).
  ok(generated.meta && generated.meta.engineVersion === DESCRIBE_MCP_ENGINE_VERSION, `a kit generated from the extracted package reports the REAL engine version in meta.engineVersion, not a placeholder (want ${DESCRIBE_MCP_ENGINE_VERSION}, got ${generated.meta && generated.meta.engineVersion})`);

  // ── export_tokens rebinds to the JUST-generated kit (last generate wins) — proves the packaged
  // src/engine/exports.js + ds-export.js + model.mjs#projectView closure resolves with no missing import ──
  const exported = await c.callTool("export_tokens", { format: "css" });
  ok(Array.isArray(exported.files) && exported.files[0].text.includes("--c-"), "export_tokens (css) works against the packaged exports.js after a real generate_kit call");
} finally {
  c.kill();
  rmSync(pkgDir, { recursive: true, force: true });
}

if (fails.length) { console.error(`describe-mcp-package FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("describe-mcp-package PASS — the exact DESCRIBE_MCP_FILES closure extracted to a bare temp dir (no repo fallback) boots, serves the seeded read surface, teaches + generates + exports tokens over real spawned stdio");
process.exit(0);
