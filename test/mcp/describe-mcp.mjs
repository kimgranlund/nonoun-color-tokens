#!/usr/bin/env node
// describe-mcp.mjs — verifier for the downloadable describe-palette generator MCP server (#371). Spawns
// the (zero-dep) server — no sibling file needed, unlike brand-kit-server.mjs — drives the MCP protocol
// over stdio, and proves the self-teaching two-step round trip end to end: description → briefing → a
// constructed brief → a real kit.
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const srv = spawn("node", [resolve(ROOT, "mcp/describe-mcp-server.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
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
  ok(init.result && init.result.serverInfo.name === "ultimate-tokens-describe-palette" && !!init.result.capabilities.tools, "initialize → serverInfo + capabilities (no sibling file needed to boot)");
  notify("notifications/initialized");

  const tools = (await rpc("tools/list")).result.tools.map((t) => t.name);
  ok(tools.join() === "generate_kit", `tools/list has exactly generate_kit (got ${tools})`);

  // step 1: description → briefing (never generates)
  const briefing = await callTool("generate_kit", { description: "Siberian Tigers on Parade" });
  ok(briefing.rubric && briefing.schema && Array.isArray(briefing.exemplars) && briefing.exemplars.length > 0, "generate_kit({description}) → a briefing payload (rubric + schema + exemplars)");
  ok(briefing.exemplars.some((e) => /tiger|siberia|taiga/i.test(JSON.stringify(e))), `the briefing's exemplars are theme-adjacent for the canonical tiger ask (got ${briefing.exemplars.map((e) => e.id)})`);
  ok(!("kit" in briefing), "step 1 does not generate a kit");

  // step 2: construct a brief per the returned schema, call again → a real kit
  const brief = { name: "Siberian Tigers on Parade", families: { Primary: { hue: 30, chroma: 70, colorName: "Amur tiger orange" } } };
  const generated = await callTool("generate_kit", { brief });
  ok(generated.kit && generated.kit.$schema === "ultimate-tokens-brand-kit/1" && generated.kit.palettes.length === 8, "generate_kit({brief}) → a real 8-palette kit");
  ok(generated.meta && generated.meta.briefSchema === briefing.schema.$id && JSON.stringify(generated.meta.brief) === JSON.stringify(brief), "the result's meta echoes the brief schema id + the originating brief verbatim (the replay handle)");

  // step 3 (refine): patch the brief and resend — determinism means re-sending the SAME brief reproduces
  // the SAME kit; changing it changes the result predictably.
  const replay = await callTool("generate_kit", { brief });
  ok(JSON.stringify(replay.kit) === JSON.stringify(generated.kit), "resending the identical brief reproduces a byte-identical kit (determinism keeps the refine loop stable)");
  const patched = { ...brief, families: { ...brief.families, Primary: { ...brief.families.Primary, hue: 200 } } };
  const refined = await callTool("generate_kit", { brief: patched });
  ok(JSON.stringify(refined.kit) !== JSON.stringify(generated.kit), "patching the brief and resending changes the generated kit");

  const bad = await rpc("nope/nope", {});
  ok(bad.error && bad.error.code === -32601, "unknown method → JSON-RPC -32601");
} catch (e) {
  fails.push("threw: " + e.message);
} finally {
  try { srv.stdin.end(); srv.kill(); } catch { /* */ }
}

if (fails.length) { console.error("describe-palette MCP FAIL:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("describe-palette MCP PASS — self-teaching two-step generate_kit round trip over MCP stdio (description → briefing → brief → kit → refine)");
process.exit(0);
