#!/usr/bin/env node
// zip.mjs — verifier for the dependency-free ZIP writer (src/ui/zip.mjs). Pure, no DOM.
// Covers a structurally valid STORE archive AND that entries carry a REAL modification date — the fix for
// the export bug where a fixed-0 DOS datetime made every extracted file land in ~1979/1980.
import { zipStore, crc32 } from "../../src/ui/zip.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// ── a structurally valid archive (one stored entry) ──
const z = zipStore([{ name: "a.txt", data: "hello" }], { date: new Date(2026, 5, 29, 13, 45, 30) }); // Jun 29 2026 13:45:30
ok(u32(z, 0) === 0x04034b50, "local file header signature (PK\\x03\\x04)");
ok(u16(z, 8) === 0, "method is STORE (0)");

// ── the timestamp: NON-zero and the EXACT date passed (the 1979 regression guard) ──
const modTime = u16(z, 10), modDate = u16(z, 12); // local header: mod time @10, mod date @12
ok(modDate !== 0, "mod date is NOT zero (a zero DOS date is what unzippers render as ~1979)");
ok(modDate === (((2026 - 1980) << 9) | (6 << 5) | 29), `mod date encodes 2026-06-29 (got ${modDate})`);
ok(modTime === ((13 << 11) | (45 << 5) | (30 >> 1)), `mod time encodes 13:45:30 (got ${modTime})`);
ok(1980 + (modDate >> 9) === 2026 && ((modDate >> 5) & 0xf) === 6 && (modDate & 0x1f) === 29, "mod date decodes back to 2026-06-29");

// ── the central directory entry carries the SAME timestamp (located via the EOCD) ──
const eocd = z.length - 22;
ok(u32(z, eocd) === 0x06054b50, "EOCD signature (PK\\x05\\x06)");
const cdStart = u32(z, eocd + 16);
ok(u32(z, cdStart) === 0x02014b50, "central directory header signature (PK\\x01\\x02)");
// central header has an extra "version made by" u16 vs the local header → mod time @+12, mod date @+14
ok(u16(z, cdStart + 12) === modTime && u16(z, cdStart + 14) === modDate, "central directory timestamp matches the local header");

// ── default date = now → a real, post-1980 year (the exact bug: 0 → 1980/1979) ──
ok(1980 + (u16(zipStore([{ name: "b.txt", data: "x" }]), 12) >> 9) > 1980, "default (no date) stamps a real post-1980 year — not the zero/1979 bug");

// ── a pre-1980 date clamps to the DOS epoch floor (1980-01-01), never a zero/1979 date ──
const zOld = zipStore([{ name: "c.txt", data: "x" }], { date: new Date(1970, 0, 1) });
ok(u16(zOld, 12) === 0x21 && u16(zOld, 10) === 0, "a pre-1980 date clamps to 1980-01-01 (date=0x21, time=0)");

// ── crc-32 sanity (deterministic + the known vector for "hello") ──
ok(crc32(new TextEncoder().encode("hello")) === 0x3610a686, "crc32('hello') matches the known vector");

if (fails.length) { console.error(`zip FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("zip PASS — valid STORE archive · real mod timestamps (no 1979) · central↔local match · pre-1980 clamp · crc32");
process.exit(0);
