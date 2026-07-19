// describe-mcp-core.mjs — the PURE, transport-agnostic MCP surface for the describe-palette generator
// (#371). Mirrors mcp/brand-kit-core.mjs's shape (buildSurface + handle, the same JSON-RPC 2.0 dispatch)
// so the eventual merge with the read-only brand-kit surface (#374) is a straightforward concat, not a
// redesign — but is NOT shared code with it; merging the two dispatchers is #374's explicit job, not
// this module's, so this stays self-contained like brand-kit-core.mjs already is.
//
// Exposes exactly ONE tool — generate_kit — the self-teaching two-step protocol (spec §5): MCP prompts
// are unreliable delivery (uneven host support; agents call tools directly without reading prompts), so
// the TOOL RESULT itself teaches. { description } returns a briefing payload and NEVER generates — the
// method is guaranteed in context at the moment of use, on any host, with zero installed skills. { brief }
// generates deterministically via describe-kit-core.mjs. No server-side LLM anywhere in this flavor — the
// calling agent is the interpreter (spec §1's local-flavor constraint).

import { generateKit, PALETTE_BRIEF_SCHEMA } from "./describe-kit-core.mjs";
import { RUBRIC, RESEARCH_TIER_NOTE, ROUND_TRIP_INSTRUCTIONS, retrieveExemplars } from "./describe-rubric.mjs";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER = { name: "ultimate-tokens-describe-palette", version: "0.1.0" };

// generateKitTool(args) → the briefing payload (mode 1, "teach") or the generation result (mode 2,
// "generate"). Precedence: `brief` wins (spec §5) — an agent that resends its description alongside a
// constructed brief still gets a kit, never silently the wrong mode; the description is lint-noted as
// ignored, not silently dropped. Neither given → mode 1 with an empty description, the self-teaching
// default (never guesses at a kit; always teaches when the call is ambiguous or empty). A `brief` that IS
// given but isn't a plain object is a TOOL ERROR (spec §4.4: "only a non-object brief is a tool error") —
// this boundary validates the top-level SHAPE; describe-kit-core.mjs's own §4.4 permissiveness (never
// rejecting on CONTENT — clamping instead) only ever applies to an already-shape-valid object.
export function generateKitTool(args) {
  const a = args && typeof args === "object" ? args : {};
  if (a.brief != null) {
    if (typeof a.brief !== "object" || Array.isArray(a.brief)) {
      throw new Error(`brief must be an object (got ${Array.isArray(a.brief) ? "an array" : typeof a.brief})`);
    }
    const result = generateKit(a.brief);
    if (typeof a.description === "string" && a.description.trim()) {
      result.lint = [...result.lint, { level: "info", code: "description-ignored", family: null, message: "Both `description` and `brief` were given — generated from `brief`; `description` was ignored (brief wins)." }];
    }
    return result;
  }
  const description = typeof a.description === "string" ? a.description : "";
  return {
    rubric: RUBRIC,
    schema: PALETTE_BRIEF_SCHEMA,
    exemplars: retrieveExemplars(description, 3),
    research: RESEARCH_TIER_NOTE,
    instructions: ROUND_TRIP_INSTRUCTIONS,
  };
}

// buildSurface() → { TOOLS, RESOURCES, PROMPTS, SERVER, PROTOCOL_VERSION }. Unlike the read-only brand-kit
// surface, nothing is pre-loaded — every generate_kit call is self-contained, so this takes no argument.
// RESOURCES/PROMPTS are deliberately empty: the design goal is that NOTHING here relies on a host reading
// a resource or a prompt (both are unreliable delivery, per spec §1) — everything lives in the tool result.
export function buildSurface() {
  const TOOLS = [
    {
      name: "generate_kit",
      description: "Turn a plain-language palette description into a brand kit, or learn the method first. Call with { description } to receive the interpretation rubric + PaletteBrief schema + theme-adjacent exemplars (this NEVER generates a kit). Call with { brief } — an object matching that schema — to generate deterministically. To refine, patch the brief and resend; never hand-edit the output's hex values.",
      inputSchema: { type: "object", properties: { description: { type: "string" }, brief: { type: "object" } } },
      run: generateKitTool,
    },
  ];
  return { TOOLS, RESOURCES: [], PROMPTS: [], SERVER, PROTOCOL_VERSION };
}

// handle(msg, surface) → a JSON-RPC 2.0 response OBJECT, or null when nothing should be sent (a
// notification, or a notification-shaped ping). Pure: the caller writes the returned object to its
// transport. Self-contained dispatch (mirrors brand-kit-core.mjs's shape; not imported from it).
export function handle(msg, surface) {
  const { TOOLS } = surface;
  const m = msg || {};
  const { id, method, params } = m;
  const isRequest = id !== undefined && id !== null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  const textResult = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

  switch (method) {
    case "initialize":
      return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER, instructions: "Describe-palette generator. Call generate_kit with { description } to learn the method, or { brief } (per the schema the briefing returns) to generate a kit." });
    case "notifications/initialized": return null; // notification, no reply
    case "ping": return isRequest ? reply({}) : null;
    case "tools/list": return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const t = TOOLS.find((x) => x.name === (params && params.name));
      if (!t) return fail(-32602, `unknown tool: ${params && params.name}`);
      try { return reply(textResult(t.run((params && params.arguments) || {}))); }
      catch (e) { return reply({ ...textResult(`error: ${e.message}`), isError: true }); }
    }
    case "resources/list": return reply({ resources: [] });
    case "prompts/list": return reply({ prompts: [] });
    default:
      return isRequest ? fail(-32601, `method not found: ${method}`) : null;
  }
}
