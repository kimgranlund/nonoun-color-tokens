#!/usr/bin/env node
// store-drift-check.mjs — the DEPLOYED half of the marketing gate (fact-sheet rule 4: deployed
// surfaces don't grep). Reads the LIVE Lemon Squeezy store over the main API and checks it against
// the corpus's pinned reality: the product set matches the app's product pin, names/copy carry the
// canon, and the live text passes the same voice-check the repo copy must pass. Read-only; it never
// writes to the store (products/variants have no write API anyway — fixes are a dashboard walk,
// store-copy.md §10).
//
// Usage: LEMONSQUEEZY_API_KEY=<live-mode key> node store-drift-check.mjs
// Exit 1 on any ERROR. The key is a full-access secret — keep it in .claude/settings.local.json.
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const KEY = process.env.LEMONSQUEEZY_API_KEY;
if (!KEY) { console.error("✗ LEMONSQUEEZY_API_KEY not set (live-mode key; see .claude/settings.local.json)"); process.exit(2); }

// The pinned store reality (mirrors src/main.ts + the fact sheet — update together).
const STORE_ID = 420293;
const PINNED_PRODUCTS = { 1182548: "Pro", 1182535: "Studio" }; // app's LEMON_PRODUCT_IDS
const PINNED_VARIANTS = { 1849393: 1182548, 1849376: 1182535 };
// Copy the live store must carry once the §10 dashboard walk is done. Presence probes, not diffs —
// robust to LS's HTML formatting. Per product: the thesis heading lives only in Pro's body (§2.1);
// "53 semantic roles" reaches both via the shared §2.3 blocks appended to each description.
const PRODUCT_NAME = { 1182548: "Ultimate Tokens — Pro", 1182535: "Ultimate Tokens — Studio" };
const VARIANT_NAME = { 1849393: "Annual, per user", 1849376: "Annual, 5 seats" };
const DESC_PROBES = {
  1182548: ["53 semantic roles", "derived — not guessed"],
  1182535: ["53 semantic roles", "Everything in Pro"],
};

let failed = false;
const err = (m) => { console.log("✗ ERROR: " + m); failed = true; };
const warn = (m) => { console.log("! WARN: " + m); };
const ok = (m) => { console.log("✓ " + m); };

const get = async (path) => {
  const r = await fetch(`https://api.lemonsqueezy.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
  return r.json();
};
const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();

const products = (await get(`products?filter[store_id]=${STORE_ID}&page[size]=100`)).data;
const variants = (await get(`variants?page[size]=100`)).data
  .filter((v) => products.some((p) => p.id === String(v.attributes.product_id)));

// 1 · The published product set must equal the app's pin — a published product outside the pin is
// BUYABLE but its license keys are REJECTED by productPinFails (a paying customer the app locks out).
for (const p of products) {
  const id = Number(p.id), a = p.attributes;
  if (a.status === "published" && !PINNED_PRODUCTS[id])
    err(`product ${id} "${a.name}" is PUBLISHED but not in the app's product pin — its keys are rejected by the app; archive it (or extend LEMON_PRODUCT_IDS deliberately)`);
  if (PINNED_PRODUCTS[id] && a.status !== "published")
    err(`pinned product ${id} "${a.name}" is ${a.status}, not published`);
}
for (const id of Object.keys(PINNED_PRODUCTS))
  if (!products.some((p) => p.id === id)) err(`pinned product ${id} missing from the live store`);

// 2 · Names + copy fingerprints on the pinned products.
const liveTexts = [];
for (const p of products.filter((q) => PINNED_PRODUCTS[Number(q.id)])) {
  const id = Number(p.id), a = p.attributes, desc = strip(a.description);
  if (PRODUCT_NAME[id] && a.name !== PRODUCT_NAME[id])
    warn(`product ${id} name is "${a.name}" — corpus says "${PRODUCT_NAME[id]}" (store-copy §2)`);
  for (const probe of DESC_PROBES[id] || [])
    if (!desc.includes(probe))
      warn(`product ${id} description lacks the corpus fingerprint "${probe}" — the §10 re-paste hasn't landed (desc is ${desc.length} chars)`);
  liveTexts.push({ label: `product-${id}`, text: `${a.name}\n${desc}` });
}
for (const v of variants) {
  const id = Number(v.id), a = v.attributes;
  if (!PINNED_VARIANTS[id]) { if (a.status === "published") warn(`variant ${id} "${a.name}" published on an unpinned product`); continue; }
  if (VARIANT_NAME[id] && a.name !== VARIANT_NAME[id])
    warn(`variant ${id} name is "${a.name}" — corpus says "${VARIANT_NAME[id]}" (store-copy §3)`);
  const vd = strip(a.description);
  if (!vd) warn(`variant ${id} description is empty — corpus copy (store-copy §3) not pasted`);
  liveTexts.push({ label: `variant-${id}`, text: `${a.name}\n${vd}` });
}

// 3 · The live text must pass the same voice gate as the repo copy (stale facts, banned lexicon,
// hosted-MCP-in-present-tense). Dump to temp files and run voice-check on them.
const HERE = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "ls-live-"));
try {
  const files = liveTexts.map(({ label, text }) => {
    const f = join(tmp, `${label}.md`); writeFileSync(f, text); return f;
  });
  const r = spawnSync(process.execPath, [join(HERE, "voice-check.mjs"), ...files], { encoding: "utf8" });
  const out = (r.stdout || "").replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "live");
  if (out.trim()) console.log(out.trim());
  if (r.status !== 0) { err("live store copy fails the voice gate (above)"); }
  else ok("live store copy passes the voice gate");
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log(failed ? "\n✗ live store has blocking drift — walk store-copy.md §10" : "\n✓ live store consistent with the pinned corpus (warnings above are the remaining §10 walk)");
process.exit(failed ? 1 : 0);
