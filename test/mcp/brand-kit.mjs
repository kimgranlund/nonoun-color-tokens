#!/usr/bin/env node
// brand-kit.mjs — verifier for the downloadable Brand-Kit MCP server. Generates a kit from the default
// doc, spawns the (zero-dep) server, drives the MCP protocol over stdio, and asserts tools/resources/
// prompts. Proves the engine's tokens are servable to an agent end-to-end.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { brandKit, defaultDocument } from "../../src/ui/model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. generate a real brand kit from the default doc
const kit = brandKit(defaultDocument());
ok(kit.$schema === "nonoun-brand-kit/1" && kit.palettes.length === 8, `brandKit shape: ${kit.palettes.length} palettes (want 8)`);
ok(kit.roles.primary && typeof kit.roles.primary.primary.light === "string" && typeof kit.roles.primary.primary.dark === "string", "brandKit resolves the prime accent for light + dark");
const dir = mkdtempSync(join(tmpdir(), "nonoun-mcp-"));
const kitPath = join(dir, "brand-kit.json");
writeFileSync(kitPath, JSON.stringify(kit));

// 2. spawn the server + drive newline-delimited JSON-RPC over stdio
const srv = spawn("node", [resolve(ROOT, "mcp/brand-kit-server.mjs"), kitPath], { stdio: ["pipe", "pipe", "inherit"] });
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
const callTool = async (name, args) => { const r = await rpc("tools/call", { name, arguments: args }); return JSON.parse(r.result.content[0].text); };

try {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  ok(init.result && init.result.serverInfo.name === "nonoun-brand-kit" && !!init.result.capabilities.tools, "initialize → serverInfo + capabilities");
  notify("notifications/initialized");

  const tools = (await rpc("tools/list")).result.tools.map((t) => t.name);
  ok(["list_palettes", "get_ramp", "resolve_token", "get_semantic", "nearest_token"].every((n) => tools.includes(n)), `tools/list has all 5 (${tools})`);

  const pal = await callTool("list_palettes", {});
  ok(Array.isArray(pal) && pal.length === 8 && /^#|^oklch/.test(pal[0].key || ""), "list_palettes → 8 palettes with identity colours");

  const tl = await callTool("resolve_token", { role: "primary/primary", scheme: "light" });
  const td = await callTool("resolve_token", { role: "primary/primary", scheme: "dark" });
  ok(tl.hex === kit.roles.primary.primary.light && td.hex === kit.roles.primary.primary.dark, `resolve_token primary/primary matches the kit (light ${tl.hex} / dark ${td.hex})`);

  const ramp = await callTool("get_ramp", { palette: "primary" });
  ok(ramp.ramp && ramp.ramp.length >= 19 && !!ramp.ramp.find((s) => s.stop === 500), "get_ramp → the tonal ramp incl. stop 500");

  const exact = kit.palettes[1].ramp.find((s) => s.stop === 500).hex;
  const near = await callTool("nearest_token", { hex: exact });
  ok(near.hex === exact && near.distance === 0, `nearest_token of an exact stop hex → distance 0 (got ${near.distance})`);

  const sem = await callTool("get_semantic", { scheme: "dark" });
  ok(typeof sem["primary/surface"] === "string", "get_semantic flattens roles to palette/role hexes");

  const guide = (await rpc("resources/read", { uri: "brand://guide" })).result.contents[0].text;
  ok(typeof guide === "string" && guide.length > 50, "resources/read brand://guide returns the usage guide");

  const prm = await rpc("prompts/get", { name: "apply_brand" });
  ok(prm.result.messages && prm.result.messages[0].content.text.length > 20, "prompts/get apply_brand returns guidance");

  const bad = await rpc("nope/nope", {});
  ok(bad.error && bad.error.code === -32601, "unknown method → JSON-RPC -32601");
} catch (e) {
  fails.push("threw: " + e.message);
} finally {
  try { srv.stdin.end(); srv.kill(); } catch { /* */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

if (fails.length) { console.error("brand-kit MCP FAIL:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("brand-kit MCP PASS — server serves palettes/ramps/semantic/nearest over MCP stdio");
process.exit(0);
