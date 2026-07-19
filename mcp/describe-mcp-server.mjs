#!/usr/bin/env node
// describe-mcp-server.mjs — the zero-dependency STDIO entry for the describe-palette generator MCP (#371).
// Unlike brand-kit-server.mjs, there is no sibling file to load — generate_kit is fully self-contained, so
// this server boots with NO argument. Frames newline-delimited JSON-RPC 2.0 over stdio around the PURE
// dispatch in describe-mcp-core.mjs. Pure Node, no `npm install` — just `node describe-mcp-server.mjs`.
// (All logging → STDERR; stdout is the protocol stream.)

import { buildSurface, handle } from "./describe-mcp-core.mjs";

const surface = buildSurface();

// newline-delimited JSON-RPC over stdin → the pure handle() → stdout (only when there's a response).
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const res = handle(JSON.parse(line), surface);
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (e) {
      process.stderr.write(`[describe-palette] bad message: ${e.message}\n`);
    }
  }
});
process.stdin.on("end", () => process.exit(0));

process.stderr.write("[describe-palette] serving generate_kit (self-teaching two-step) over MCP stdio\n");
