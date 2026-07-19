#!/usr/bin/env node
// brand-kit-merged.mjs — verifier for the downloadable MERGED brand-kit + describe-palette generator MCP
// server (#374). Spawns the real (zero-dep) server TWICE — once kitless, once with a sibling brand-kit.json
// — and drives the full MCP protocol over stdio, proving a generated kit never dead-ends end to end.
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

// spawnClient(args) → { rpc, notify, callTool, kill }. `args` is the argv passed to the server (empty for
// a kitless boot, or [kitPath] to load a sibling kit).
function spawnClient(args) {
  const srv = spawn("node", [resolve(ROOT, "mcp/brand-kit-merged-server.mjs"), ...args], { stdio: ["pipe", "pipe", "inherit"] });
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
  return { rpc, notify, callTool, kill };
}

// ── 1. kitless boot: generate_kit end to end, over a REAL spawned process ──
{
  const c = spawnClient([]);
  try {
    const init = await c.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    ok(init.result && init.result.serverInfo.name === "ultimate-tokens-brand-kit", "kitless boot succeeds with NO file argument (unlike brand-kit-server.mjs)");
    c.notify("notifications/initialized");

    const tools = (await c.rpc("tools/list")).result.tools.map((t) => t.name);
    ok(tools.join() === "generate_kit,export_tokens", `a real kitless boot lists only generate_kit + export_tokens (got ${tools})`);

    const briefing = await c.callTool("generate_kit", { description: "1980s at the Bel Air Hotel Pool Party" });
    ok(briefing.rubric && briefing.schema && Array.isArray(briefing.exemplars), "step 1: description → a real briefing payload");

    const brief = { name: "Poolside", families: { Primary: { hue: 340, chroma: 60 } } };
    const generated = await c.callTool("generate_kit", { brief });
    ok(generated.kit && generated.kit.palettes.length === 8, "step 2: brief → a real 8-palette kit");

    // #373: the MERGED server's own generate_kit reply carries the PNG image block too, over its own
    // real spawned stdio — attachImageBlock threads through handleRead's reply, not just in-process.
    const rawGenerated = await c.rpc("tools/call", { name: "generate_kit", arguments: { brief } });
    ok(rawGenerated.result.content.length === 2 && rawGenerated.result.content[1].type === "image" && rawGenerated.result.content[1].mimeType === "image/png", `the merged server's real stdio reply for generate_kit carries a PNG image block (got ${rawGenerated.result.content.map((c) => c.type).join()})`);

    const toolsAfter = (await c.rpc("tools/list")).result.tools.map((t) => t.name);
    ok(toolsAfter.includes("list_palettes") && toolsAfter.includes("resolve_token") && toolsAfter.includes("export_tokens"), `post-generate, the FULL read surface appears over the real stdio connection (got ${toolsAfter})`);

    const pal = await c.callTool("list_palettes", {});
    ok(pal.length === 8 && pal.some((p) => p.name === "Primary"), "list_palettes serves the just-generated kit over real stdio");

    const css = await c.callTool("export_tokens", { format: "css" });
    ok(css.files && css.files.length === 1 && typeof css.files[0].text === "string" && css.files[0].text.length > 20, "export_tokens('css') returns real CSS content over real stdio");
    const all = await c.callTool("export_tokens", { format: "all" });
    ok(all.files && all.files.length === 7, `export_tokens('all') returns all 7 formats over real stdio (got ${all.files && all.files.length})`);

    const guide = (await c.rpc("resources/read", { uri: "brand://guide" })).result.contents[0].text;
    ok(typeof guide === "string" && guide.length > 50, "resources/read brand://guide serves the generated kit's guide");

    const bad = await c.rpc("nope/nope", {});
    ok(bad.error && bad.error.code === -32601, "unknown method → JSON-RPC -32601, same as the other servers");
  } catch (e) {
    fails.push("kitless E2E threw: " + e.message);
  } finally {
    c.kill();
  }
}

// ── 2. booting WITH a sibling kit file: read tools available immediately, export_tokens still gated ──
{
  const kit = brandKit(defaultDocument());
  const dir = mkdtempSync(join(tmpdir(), "ultimate-tokens-mcp-merged-"));
  const kitPath = join(dir, "brand-kit.json");
  writeFileSync(kitPath, JSON.stringify(kit));
  const c = spawnClient([kitPath]);
  try {
    await c.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    c.notify("notifications/initialized");

    const tools = (await c.rpc("tools/list")).result.tools.map((t) => t.name);
    ok(tools.includes("list_palettes") && tools.includes("generate_kit"), `loading a sibling kit surfaces the read tools immediately, alongside the generator (got ${tools})`);

    const pal = await c.callTool("list_palettes", {});
    ok(pal.length === 8, "the read tools serve the LOADED kit before any generate call");

    const exp = await c.callTool("export_tokens", { format: "css" });
    ok(exp.error, "export_tokens is still gated for a loaded-kit-only session (no doc exists for a raw brand-kit.json)");

    // now generate — the surface REBINDS off the generated kit, not the loaded one.
    const generated = await c.callTool("generate_kit", { brief: { name: "Rebind", families: { Primary: { hue: 100, chroma: 50 } } } });
    const exp2 = await c.callTool("export_tokens", { format: "json" });
    ok(exp2.files && exp2.files.length === 1, "export_tokens works immediately once a real generate call happens, even after booting with a loaded kit");
  } catch (e) {
    fails.push("loaded-kit E2E threw: " + e.message);
  } finally {
    c.kill();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
}

if (fails.length) { console.error("brand-kit-merged MCP FAIL:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("brand-kit-merged MCP PASS — kitless boot (no file argument needed) + loaded-kit boot, generate_kit rebinding, the full read surface + export_tokens serving a generated kit, all over real stdio");
process.exit(0);
