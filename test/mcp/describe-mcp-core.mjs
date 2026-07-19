#!/usr/bin/env node
// describe-mcp-core.mjs — verifier for the PURE, transport-agnostic describe-palette MCP surface
// (mcp/describe-mcp-core.mjs, #371/#373): buildSurface + handle + the two-step generate_kit protocol +
// the swatch-board image block + the contrast/chroma-budget quality lint. No process spawn; the stdio
// end-to-end lives in test/mcp/describe-mcp.mjs.
import { buildSurface, handle, generateKitTool, attachImageBlock, contrastLint, chromaBudgetLint, CONTRAST_MIN, CHROMA_BUDGET_AVG_THRESHOLD, SERVER, PROTOCOL_VERSION } from "../../mcp/describe-mcp-core.mjs";
import { PALETTE_BRIEF_SCHEMA } from "../../mcp/describe-kit-core.mjs";
import { RUBRIC } from "../../mcp/describe-rubric.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const surface = buildSurface();
let idc = 0;
const req = (method, params) => handle({ jsonrpc: "2.0", id: ++idc, method, params }, surface);
const note = (method) => handle({ jsonrpc: "2.0", method }, surface); // no id → notification
const callTool = (name, args) => JSON.parse(req("tools/call", { name, arguments: args }).result.content[0].text);

// ── buildSurface: exactly one tool, no resources/prompts (self-teaching design — nothing relies on either) ──
ok(surface.TOOLS.length === 1 && surface.TOOLS[0].name === "generate_kit", `surface has exactly generate_kit (got ${surface.TOOLS.map((t) => t.name).join()})`);
ok(surface.RESOURCES.length === 0 && surface.PROMPTS.length === 0, "no resources or prompts — everything lives in the tool result");
ok(surface.SERVER === SERVER && surface.PROTOCOL_VERSION === PROTOCOL_VERSION && SERVER.name === "ultimate-tokens-describe-palette", "surface carries SERVER + PROTOCOL_VERSION");
ok(surface.TOOLS[0].inputSchema.properties.description && surface.TOOLS[0].inputSchema.properties.brief, "generate_kit's inputSchema declares both description and brief (neither required — the discriminator is at call time)");

// ── handle: the JSON-RPC dispatch ──
const init = req("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {} });
ok(init.result && init.result.serverInfo.name === "ultimate-tokens-describe-palette" && !!init.result.capabilities.tools && init.result.protocolVersion === PROTOCOL_VERSION, "initialize → serverInfo + capabilities + protocolVersion");
ok(note("notifications/initialized") === null, "a notification (no id) returns null — nothing to send");
ok(handle({ jsonrpc: "2.0", method: "ping" }, surface) === null && req("ping", {}).result && Object.keys(req("ping", {}).result).length === 0, "ping: notification → null, request → {}");
ok(req("tools/list").result.tools.map((t) => t.name).join() === "generate_kit", "tools/list mirrors the surface tools");
ok(req("resources/list").result.resources.length === 0 && req("prompts/list").result.prompts.length === 0, "resources/list and prompts/list are both empty");
ok(req("tools/call", { name: "nope" }).error.code === -32602, "unknown tool → -32602");
ok(req("nope/nope", {}).error.code === -32601, "unknown method (request) → -32601");

// ── the two-step protocol, over the real handle() dispatch ──
{
  const briefing = callTool("generate_kit", { description: "1980s at the Bel Air Hotel Pool Party" });
  ok(briefing.rubric === RUBRIC, "mode 1 (description only) returns the RUBRIC verbatim");
  ok(JSON.stringify(briefing.schema) === JSON.stringify(PALETTE_BRIEF_SCHEMA), "mode 1 returns the PaletteBrief schema verbatim");
  ok(Array.isArray(briefing.exemplars) && briefing.exemplars.length > 0 && briefing.exemplars.some((e) => /miami|disco/i.test(e.theme || e.id || "")), `mode 1's exemplars are theme-adjacent for the canonical Bel Air ask (got ${briefing.exemplars.map((e) => e.id)})`);
  ok(typeof briefing.research === "string" && briefing.research.length > 20, "mode 1 returns the research-tier note");
  ok(typeof briefing.instructions === "string" && briefing.instructions.length > 20, "mode 1 returns the round-trip instructions");
  ok(!("kit" in briefing) && !("doc" in briefing), "mode 1 NEVER generates — no kit/doc fields in the response");
}
{
  const kitResult = callTool("generate_kit", { brief: { families: { Primary: { hue: 220, chroma: 70 } } } });
  ok(kitResult.kit && kitResult.kit.palettes && kitResult.kit.palettes.length === 8, "mode 2 (brief) generates a real 8-palette kit");
  ok(Array.isArray(kitResult.lint) && kitResult.doc && kitResult.meta, "mode 2's result carries lint/doc/meta alongside kit");
  ok(!("rubric" in kitResult) && !("schema" in kitResult), "mode 2 does not also return the briefing fields");
}
{
  // brief WINS when both are given (spec §5) — never silently the wrong mode — and the description is
  // lint-noted as ignored, not silently dropped.
  const kitResult = callTool("generate_kit", { description: "irrelevant text", brief: { families: { Primary: { hue: 100, chroma: 60 } } } });
  ok(kitResult.kit && kitResult.kit.palettes.length === 8, "brief wins when both description and brief are given — still generates");
  ok(kitResult.lint.some((l) => l.code === "description-ignored"), "the ignored description is lint-noted (description-ignored)");
}
{
  // neither given → the self-teaching default: mode 1 with an empty description, never an error, never a
  // guessed kit.
  const briefing = callTool("generate_kit", {});
  ok(briefing.rubric && Array.isArray(briefing.exemplars), "an empty call ({}) still teaches (mode 1 with an empty description), never errors, never guesses a kit");
}
{
  // a brief-carrying call with NO description omits the ignored-description lint entirely (nothing was
  // ignored).
  const kitResult = callTool("generate_kit", { brief: { families: { Primary: { hue: 100, chroma: 60 } } } });
  ok(!kitResult.lint.some((l) => l.code === "description-ignored"), "no description-ignored lint when no description was given at all");
}
{
  // a WHITESPACE-only description alongside a brief is functionally "nothing to ignore" — the .trim()
  // guard must suppress the lint here too, not just for a truly absent description.
  const kitResult = callTool("generate_kit", { description: "   ", brief: { families: { Primary: { hue: 100, chroma: 60 } } } });
  ok(!kitResult.lint.some((l) => l.code === "description-ignored"), "a whitespace-only description alongside a brief emits no description-ignored lint");
}

{
  // §4.4: "only a non-object brief is a tool error" — validated at THIS boundary (the shape), distinct
  // from describe-kit-core.mjs's own content-level permissiveness (never rejects, only clamps).
  const badBrief = req("tools/call", { name: "generate_kit", arguments: { brief: "not an object" } });
  ok(badBrief.result && badBrief.result.isError === true && /brief must be an object/.test(badBrief.result.content[0].text), `a non-object brief is a tool error, not a silent fallback to teaching mode (got ${JSON.stringify(badBrief.result)})`);
  const arrayBrief = req("tools/call", { name: "generate_kit", arguments: { brief: ["not", "an", "object"] } });
  ok(arrayBrief.result && arrayBrief.result.isError === true, "an array brief is ALSO a tool error (typeof says object, but it isn't a plain brief shape)");
}
{
  // null/absent are both "not given" — fall through to teaching, not an error.
  const nullBrief = callTool("generate_kit", { brief: null });
  ok(nullBrief.rubric && !("kit" in nullBrief), "brief:null is treated as absent (teaches), not a malformed-shape error");
}

// ── generateKitTool is pure/deterministic (exported for direct testing, same function tools/call reaches) ──
{
  const a = generateKitTool({ brief: { families: { Primary: { hue: 40, chroma: 90 } } } });
  const b = generateKitTool({ brief: { families: { Primary: { hue: 40, chroma: 90 } } } });
  ok(JSON.stringify(a.kit) === JSON.stringify(b.kit), "generateKitTool is deterministic — the same brief generates a byte-identical kit both times");
}

// ── #373: the swatch-board image block, appended by attachImageBlock at dispatch time ──
{
  const res = req("tools/call", { name: "generate_kit", arguments: { brief: { families: { Primary: { hue: 40, chroma: 90 } } } } });
  ok(res.result.content.length === 2 && res.result.content[1].type === "image" && res.result.content[1].mimeType === "image/png", `a generating call's dispatch reply carries a SECOND content block (the PNG image) — got ${res.result.content.length} blocks, types ${res.result.content.map((c) => c.type).join()}`);
  ok(typeof res.result.content[1].data === "string" && res.result.content[1].data.length > 100, "the image block carries real (non-trivial) base64 data");
}
{
  // teaching mode (mode 1) never carries an image — there's no kit to preview.
  const res = req("tools/call", { name: "generate_kit", arguments: { description: "something" } });
  ok(res.result.content.length === 1, `a teaching-mode dispatch reply carries only the text block, no image (got ${res.result.content.length} blocks)`);
}
{
  // the RAW generateKitTool return value (bypassing handle/attachImageBlock entirely) never carries an
  // image field — image generation is a dispatch-layer concern, not baked into the pure tool function.
  const raw = generateKitTool({ brief: { families: { Primary: { hue: 40, chroma: 90 } } } });
  ok(!("image" in raw) && !("__image" in raw), "generateKitTool's own return value carries no image field — attachImageBlock computes it lazily, only at dispatch time");
}
{
  // attachImageBlock is a no-op for anything that isn't a successful generate_kit tools/call reply.
  const notGenerateKit = req("resources/list");
  ok(attachImageBlock(notGenerateKit, { method: "resources/list" }) === notGenerateKit, "attachImageBlock leaves a non-tools/call response untouched (same reference — true no-op)");
  const errorReply = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "error: brief must be an object" }], isError: true } };
  const msg = { method: "tools/call", params: { name: "generate_kit" } };
  ok(attachImageBlock(errorReply, msg) === errorReply, "attachImageBlock leaves an isError reply untouched (its text isn't parseable JSON with a kit)");
}

// ── #373: the contrast + chroma-budget quality lint, appended to the SAME lint array generateKit produces ──
{
  // reachable via a real brief: an explicit, deliberately near-peak-chroma-everywhere brief.
  const brief = { families: {
    Neutral: { chroma: 85 }, Primary: { hue: 40, chroma: 95 }, Secondary: { chroma: 90 }, Tertiary: { chroma: 90 },
    Info: { chroma: 85 }, Success: { chroma: 85 }, Warning: { chroma: 95 }, Danger: { chroma: 90 },
  } };
  const result = generateKitTool({ brief });
  const entry = result.lint.find((l) => l.code === "chroma-budget");
  ok(entry && entry.level === "info" && /chroma/.test(entry.message), `a genuinely near-peak-chroma-everywhere brief triggers the chroma-budget advisory (got ${JSON.stringify(entry)})`);
}
{
  // the app's own DEFAULT-shaped kit (avg ~63 chroma per role-table.json) must NOT trigger the advisory —
  // it exists for genuinely bold themes, not ordinary ones.
  const result = generateKitTool({ brief: { families: { Primary: { hue: 267, chroma: 95 } } } }); // near-default Primary, everything else defaults
  ok(!result.lint.some((l) => l.code === "chroma-budget"), "an ordinary, mostly-defaulted brief does NOT trigger the chroma-budget advisory");
}
{
  // contrastLint/chromaBudgetLint are exported for direct testing — proving the CHECK's own logic is
  // correct even though a fine sweep of the brief's exposed parameters never reaches CONTRAST_MIN's floor
  // via any REAL generated kit (worst found: ~3.028, still above 3.0, but only just — see the regression
  // guard below). A synthetic kit with a deliberately bad on-color pair proves the check itself fires.
  const fakeKit = { palettes: [{ name: "Primary" }], roles: { primary: { primary: { light: "#101010", dark: "#101010" }, onPrimary: { light: "#1A1A1A", dark: "#1A1A1A" } } } };
  const entries = contrastLint(fakeKit);
  ok(entries.length === 1 && entries[0].code === "contrast" && entries[0].level === "warn" && entries[0].family === "Primary", `contrastLint fires for a synthetic near-identical prime/on-prime pair (got ${JSON.stringify(entries)})`);
  const fineKit = { palettes: [{ name: "Primary" }], roles: { primary: { primary: { light: "#000000", dark: "#000000" }, onPrimary: { light: "#FFFFFF", dark: "#FFFFFF" } } } };
  ok(contrastLint(fineKit).length === 0, "contrastLint is silent for a genuinely high-contrast pair (black on white)");
  ok(CONTRAST_MIN === 3.0 && CHROMA_BUDGET_AVG_THRESHOLD === 80, "the two named thresholds are the documented values");
  const fakeDoc = { palettes: [{ chroma: 90 }, { chroma: 90 }, { chroma: 90 }, { chroma: 90 }, { chroma: 90 }, { chroma: 90 }, { chroma: 90 }, { chroma: 90 }] };
  ok(chromaBudgetLint(fakeDoc).length === 1, "chromaBudgetLint fires directly for a synthetic all-90-chroma doc");
  ok(chromaBudgetLint({ palettes: [{ chroma: 10 }] }).length === 0, "chromaBudgetLint is silent for a low-chroma doc");
}
{
  // REGRESSION GUARD: a fine sweep of the brief's exposed per-family parameters (hue/chroma/skew/lift)
  // found this the tightest reachable config — worst contrast ~3.028, THIN headroom above CONTRAST_MIN.
  // Pinning it here means a future engine retune that pushes this exact config under 3.0 fails a test
  // immediately, instead of silently shipping on-color pairs the system no longer actually guarantees.
  const result = generateKitTool({ brief: { families: { Primary: { hue: 150, chroma: 100, skew: -100, lift: -40 } } } });
  ok(!result.lint.some((l) => l.code === "contrast"), "the known tightest reachable config still clears CONTRAST_MIN (no contrast lint fires) — if this ever fails, the engine's on-color guarantee has genuinely regressed under 3.0");
}

if (fails.length) { console.error(`describe-mcp-core FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("describe-mcp-core PASS — buildSurface (one tool, no resources/prompts) + handle (JSON-RPC dispatch) + the two-step generate_kit protocol (teach/generate, brief-wins precedence, self-teaching default) + the swatch-board image block + contrast/chroma-budget quality lint");
process.exit(0);
