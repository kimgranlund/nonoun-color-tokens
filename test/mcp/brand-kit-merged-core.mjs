#!/usr/bin/env node
// brand-kit-merged-core.mjs — verifier for the PURE merged MCP surface (mcp/brand-kit-merged-core.mjs,
// #374): kitless boot, generate_kit rebinding, the read tools serving a GENERATED kit, and export_tokens.
// No process spawn; the stdio end-to-end lives in test/mcp/brand-kit-merged.mjs.
import { createSession } from "../../mcp/brand-kit-merged-core.mjs";
import { brandKit, defaultDocument, projectView } from "../../src/ui/model.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

let idc = 0;
const req = (session, method, params) => session.handle({ jsonrpc: "2.0", id: ++idc, method, params });
const callTool = (session, name, args) => JSON.parse(req(session, "tools/call", { name, arguments: args }).result.content[0].text);

// ── kitless boot: only generate_kit + export_tokens; no read tools/resources yet (spec §7) ──
{
  const session = createSession();
  const toolNames = req(session, "tools/list").result.tools.map((t) => t.name);
  ok(toolNames.join() === "generate_kit,export_tokens", `kitless boot has ONLY generate_kit + export_tokens (got ${toolNames.join()})`);
  const resUris = req(session, "resources/list").result.resources.map((r) => r.uri);
  ok(resUris.join() === "brand://kit,brand://guide", `kitless boot has only the two ALWAYS-served resources (brand://kit for the empty {} kit, brand://guide) — no palette/type/geometry resources (got ${resUris.join()})`);
  const exp = callTool(session, "export_tokens", { format: "css" });
  ok(exp.error && /generated kit first/.test(exp.error), `export_tokens before any generate is a graceful error, not a crash (got ${JSON.stringify(exp)})`);
}
{
  // createSession(null) and createSession() (no argument) must both boot kitless without throwing.
  const a = req(createSession(null), "tools/list").result.tools.map((t) => t.name).join();
  const b = req(createSession(), "tools/list").result.tools.map((t) => t.name).join();
  ok(a === "generate_kit,export_tokens" && b === "generate_kit,export_tokens", `createSession(null) and createSession() both boot kitless (got "${a}" / "${b}")`);
}

// ── booting WITH an initial kit: read tools present immediately, export_tokens still unavailable (no doc) ──
{
  const initialKit = brandKit(defaultDocument());
  const session = createSession(initialKit);
  const toolNames = req(session, "tools/list").result.tools.map((t) => t.name);
  ok(toolNames.includes("list_palettes") && toolNames.includes("generate_kit") && toolNames.includes("export_tokens"), `an initial kit surfaces the read tools immediately alongside the generator tools (got ${toolNames.join()})`);
  const pal = callTool(session, "list_palettes", {});
  ok(Array.isArray(pal) && pal.length === 8, "the read tools serve the LOADED initial kit correctly");
  const exp = callTool(session, "export_tokens", { format: "css" });
  ok(exp.error, "export_tokens is STILL unavailable for a loaded-kit-only session — no doc exists for it (spec §7)");
}

// ── generate_kit rebinds the surface — the read tools + export_tokens immediately serve the GENERATED kit ──
{
  const session = createSession(); // kitless
  const brief = { name: "Generated Kit", families: { Primary: { hue: 210, chroma: 70 } } };
  const generated = callTool(session, "generate_kit", { brief });
  ok(generated.kit && generated.kit.palettes.length === 8, "generate_kit returns the real kit");

  const toolNames = req(session, "tools/list").result.tools.map((t) => t.name);
  ok(toolNames.includes("list_palettes") && toolNames.includes("resolve_token"), `post-generate, tools/list gains the full read surface (got ${toolNames.join()})`);

  const pal = callTool(session, "list_palettes", {});
  ok(pal.length === 8 && pal.some((p) => p.name === "Primary"), "list_palettes now serves the GENERATED kit, not an empty one");
  const primaryHex = generated.kit.palettes.find((p) => p.name === "Primary").ramp.find((s) => s.stop === 500).hex;
  const nearest = callTool(session, "nearest_token", { hex: primaryHex });
  ok(nearest.distance === 0, "nearest_token resolves against the generated kit's own ramp (distance 0 for an exact stop)");

  const resUris = req(session, "resources/list").result.resources.map((r) => r.uri);
  ok(resUris.includes("brand://kit") && resUris.includes("brand://guide"), "resources/list now serves the generated kit's resources too");
  const prompt = req(session, "prompts/get", { name: "apply_brand" });
  ok(prompt.result && prompt.result.messages[0].content.text.length > 20, "the apply_brand prompt serves guidance for the generated kit");
}

// ── "last generate wins": a second generate_kit call rebinds again, off the LATEST brief ──
{
  const session = createSession();
  const first = callTool(session, "generate_kit", { brief: { families: { Primary: { hue: 30, chroma: 90 } } } });
  const second = callTool(session, "generate_kit", { brief: { families: { Primary: { hue: 260, chroma: 40 } } } });
  ok(JSON.stringify(first.kit) !== JSON.stringify(second.kit), "two different briefs generate two different kits");
  const pal = callTool(session, "list_palettes", {});
  const primaryStop500 = pal && callTool(session, "get_ramp", { palette: "Primary" }).ramp.find((s) => s.stop === 500).hex;
  const secondStop500 = second.kit.palettes.find((p) => p.name === "Primary").ramp.find((s) => s.stop === 500).hex;
  ok(primaryStop500 === secondStop500, `the read surface reflects the SECOND (latest) generate, not the first — last generate wins (got ${primaryStop500} vs ${secondStop500})`);
}
{
  // teaching mode (mode 1) must NOT rebind — exploring the method mid-session doesn't clobber a bound kit.
  const session = createSession();
  const generated = callTool(session, "generate_kit", { brief: { families: { Primary: { hue: 30, chroma: 90 } } } });
  callTool(session, "generate_kit", { description: "something else entirely" }); // mode 1 — must not rebind
  const pal = callTool(session, "list_palettes", {});
  const stillBound = pal.find((p) => p.name === "Primary");
  ok(!!stillBound, "a teaching-mode (description-only) call after a generate does NOT clear/replace the bound kit");
}

// ── export_tokens — content matches projectView(doc).exports exactly, for every named format + "all" ──
{
  const session = createSession();
  const brief = { name: "Export Check", families: { Primary: { hue: 40, chroma: 90 } } };
  const generated = callTool(session, "generate_kit", { brief });
  const view = projectView(generated.doc);
  for (const format of ["css", "oklch", "json", "dtcg", "ui3", "tailwind", "shadcn"]) {
    const result = callTool(session, "export_tokens", { format });
    ok(result.files && result.files.length === 1, `export_tokens({format:"${format}"}) returns exactly one file (got ${result.files && result.files.length})`);
    ok(result.files[0].text === view.exports[format], `export_tokens("${format}")'s content matches projectView(doc).exports.${format} exactly`);
    ok(typeof result.files[0].name === "string" && result.files[0].name.length > 0 && typeof result.files[0].mimeType === "string", `export_tokens("${format}") carries a real filename + mimeType`);
  }
  const all = callTool(session, "export_tokens", { format: "all" });
  ok(all.files.length === 7, `export_tokens({format:"all"}) returns all 7 named formats in one multi-file response (got ${all.files.length})`);
  ok(all.files.every((f) => ["css", "oklch", "json", "dtcg", "ui3", "tailwind", "shadcn"].some((fmt) => f.text === view.exports[fmt])), "every file in the \"all\" response matches one of the 7 named format exports");
  const bad = callTool(session, "export_tokens", { format: "nope" });
  ok(bad.error && /unknown format/.test(bad.error), "an unknown format is a graceful error naming the valid enum, not a crash");
  // "figma" is a REAL key in projectView(doc).exports (model.mjs) but is NOT one of the 8 documented
  // export_tokens enum values — the trickiest rejection case, since a naive `format in view.exports` check
  // would have silently served it. The enum guard must run BEFORE any projectView read.
  const figma = callTool(session, "export_tokens", { format: "figma" });
  ok(figma.error && /unknown format/.test(figma.error), `"figma" is rejected even though it's a real projectView().exports key — not one of the 8 documented formats (got ${JSON.stringify(figma)})`);
}

// ── #373's attachImageBlock threads through the MERGED server too (it post-processes handleRead's own
// reply, entirely outside brand-kit-core.mjs, so this proves the composition actually works end to end) ──
{
  const session = createSession();
  const res = req(session, "tools/call", { name: "generate_kit", arguments: { brief: { families: { Primary: { hue: 40, chroma: 90 } } } } });
  ok(res.result.content.length === 2 && res.result.content[1].type === "image" && res.result.content[1].mimeType === "image/png", `the merged server's generate_kit reply ALSO carries the PNG image block (got ${res.result.content.map((c) => c.type).join()})`);
}
{
  const session = createSession();
  const res = req(session, "tools/call", { name: "generate_kit", arguments: { description: "x" } });
  ok(res.result.content.length === 1, "a teaching-mode reply through the merged server carries no image block");
}
{
  // a READ-surface tool's reply (unrelated to generate_kit) is untouched by attachImageBlock.
  const session = createSession(brandKit(defaultDocument()));
  const res = req(session, "tools/call", { name: "list_palettes", arguments: {} });
  ok(res.result.content.length === 1, "a non-generate_kit tool's reply is never touched by the image-attachment step");
}

if (fails.length) { console.error(`brand-kit-merged-core FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("brand-kit-merged-core PASS — kitless boot · generate_kit rebinding (last-generate-wins, teach-never-rebinds) · the read surface serving a GENERATED kit · export_tokens (7 named formats + all, matching projectView exactly) · the #373 image block threading through the merged dispatch");
process.exit(0);
