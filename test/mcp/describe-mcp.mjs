#!/usr/bin/env node
// describe-mcp.mjs — verifier for the downloadable describe-palette generator MCP server (#371). Spawns
// the (zero-dep) server — no sibling file needed, unlike brand-kit-server.mjs — drives the MCP protocol
// over stdio, and proves the self-teaching two-step round trip end to end: description → briefing → a
// constructed brief → a real kit.
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

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

  // #373: the generating call's REAL stdio response carries a decodable PNG image block, over the wire.
  const genRes = await rpc("tools/call", { name: "generate_kit", arguments: { brief } });
  ok(genRes.result.content.length === 2 && genRes.result.content[1].type === "image" && genRes.result.content[1].mimeType === "image/png", `the real dispatch reply carries a PNG image block alongside the text digest (got ${genRes.result.content.map((c) => c.type).join()})`);
  const pngBytes = Buffer.from(genRes.result.content[1].data, "base64");
  ok(pngBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "the image block's base64 data decodes to a real PNG signature");
  { // parse chunks properly (don't hardcode byte offsets) to find IDAT and inflate it with Node's own zlib
    let offset = 8, idat = null;
    while (offset < pngBytes.length) {
      const len = pngBytes.readUInt32BE(offset);
      const type = pngBytes.subarray(offset + 4, offset + 8).toString("ascii");
      if (type === "IDAT") idat = pngBytes.subarray(offset + 8, offset + 8 + len);
      offset += 8 + len + 4;
    }
    ok(idat && zlib.inflateSync(idat).length > 0, "the PNG's IDAT zlib stream inflates cleanly with Node's own zlib (independent verification, over real stdio bytes)");
  }

  // teaching mode over real stdio carries no image block.
  const teachRes = await rpc("tools/call", { name: "generate_kit", arguments: { description: "x" } });
  ok(teachRes.result.content.length === 1, "a teaching-mode reply over real stdio carries only the text block");
} catch (e) {
  fails.push("threw: " + e.message);
} finally {
  try { srv.stdin.end(); srv.kill(); } catch { /* */ }
}

if (fails.length) { console.error("describe-palette MCP FAIL:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("describe-palette MCP PASS — self-teaching two-step generate_kit round trip over MCP stdio (description → briefing → brief → kit → refine)");
process.exit(0);
