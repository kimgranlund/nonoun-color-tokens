#!/usr/bin/env node
// brand-kit-merged-server.mjs — the zero-dependency STDIO entry for the MERGED brand-kit read server +
// describe-palette generator MCP (#374). Unlike brand-kit-server.mjs, a sibling brand-kit.json is
// OPTIONAL — this server boots kitless (serving just generate_kit + export_tokens) and the read surface
// (list_palettes, resolve_token, ...) appears once a kit exists, either from the optional sibling file or
// from a generate_kit call (last generate wins). Pure Node, no `npm install`. (All logging → STDERR;
// stdout is the protocol stream.)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createSession } from "./brand-kit-merged-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// load an OPTIONAL sibling kit: argv[2] → $BRAND_KIT → ./brand-kit.json (next to this server). Unlike
// brand-kit-server.mjs, a missing or unparsable file is NOT fatal — this server boots kitless instead.
const KIT_PATH = process.argv[2] || process.env.BRAND_KIT || resolve(HERE, "brand-kit.json");
let initialKit = null;
if (existsSync(KIT_PATH)) {
  try { initialKit = JSON.parse(readFileSync(KIT_PATH, "utf8")); }
  catch (e) { process.stderr.write(`[brand-kit] could not parse ${KIT_PATH}: ${e.message} — booting kitless\n`); }
}

const session = createSession(initialKit);

// newline-delimited JSON-RPC over stdin → the session's handle() → stdout (only when there's a response).
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
      const res = session.handle(JSON.parse(line));
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (e) {
      process.stderr.write(`[brand-kit] bad message: ${e.message}\n`);
    }
  }
});
process.stdin.on("end", () => process.exit(0));

process.stderr.write(`[brand-kit] serving ${initialKit ? `"${initialKit.name || "Brand Kit"}"` : "kitless (generate_kit to begin)"} + the describe-palette generator over MCP stdio\n`);
