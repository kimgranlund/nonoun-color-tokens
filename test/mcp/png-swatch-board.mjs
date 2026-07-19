#!/usr/bin/env node
// png-swatch-board.mjs — verifier for the zero-dependency PNG encoder (mcp/png-swatch-board.mjs, #373).
// Decodes the encoder's OWN output with Node's built-in zlib.inflateSync (a real, independent decoder —
// this only proves the SHIPPED encoder produces standards-valid bytes; the shipped code itself stays
// zero-dependency) and checks every swatch's pixels deep-match the kit's own ramp hexes, the margins/gaps
// carry the kit's surface color, and the Button · Select · Switch mock strip paints from the kit's real
// semantic roles. Geometry (positions) comes from the shared boardLayout; COLORS are resolved here,
// independently, straight from the kit — the deep-match cannot pass by both sides agreeing with themselves.
import zlib from "node:zlib";
import { swatchBoardPNG, swatchBoardImageBlock, boardLayout, SWATCH_SIZE, GRID_COLS, GRID_ROWS, GAP, MARGIN } from "../../mcp/png-swatch-board.mjs";
import { brandKit, defaultDocument } from "../../src/ui/model.mjs";
import { FAMILY_NAMES } from "../../mcp/describe-kit-core.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// an INDEPENDENT CRC-32 (not imported from the module under test — a regression in the shipped encoder's
// own CRC must not be able to pass just because both sides agree with themselves).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function parseChunks(png) {
  let offset = 8;
  const chunks = [];
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + len);
    const crc = png.readUInt32BE(offset + 8 + len);
    chunks.push({ type, data, crc });
    offset += 8 + len + 4;
  }
  return chunks;
}
const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));

const kit = brandKit(defaultDocument());
const png = swatchBoardPNG(kit, FAMILY_NAMES);

// ── structural validity ──
ok(png.subarray(0, 8).equals(SIGNATURE), "the encoded file starts with the real PNG signature");
const chunks = parseChunks(png);
ok(chunks.map((c) => c.type).join() === "IHDR,IDAT,IEND", `chunk order is IHDR, IDAT, IEND (got ${chunks.map((c) => c.type).join()})`);
for (const c of chunks) {
  const expected = crc32(Buffer.concat([Buffer.from(c.type, "ascii"), c.data]));
  ok(c.crc === expected, `${c.type}'s CRC-32 is correct — recomputed independently, not just trusted (got 0x${c.crc.toString(16)}, want 0x${expected.toString(16)})`);
}

const L = boardLayout(kit);
const ihdr = chunks[0].data;
const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
ok(width === L.width && height === L.height, `IHDR declares the layout's ${L.width}x${L.height} (got ${width}x${height})`);
ok(ihdr[8] === 8 && ihdr[9] === 2, `IHDR declares 8-bit RGB (color type 2) — got bitdepth=${ihdr[8]} colortype=${ihdr[9]}`);

// ── decode via Node's REAL zlib (independent of our hand-rolled encoder) ──
const raw = zlib.inflateSync(chunks[1].data);
const rowBytes = 1 + width * 3;
ok(raw.length === height * rowBytes, `inflated data is exactly height*(1+width*3) bytes (got ${raw.length}, want ${height * rowBytes})`);
for (let y = 0; y < height; y++) ok(raw[y * rowBytes] === 0, `scanline ${y}'s filter-type byte is 0 (None)`);

// ── every swatch's pixels deep-match the kit's own 500-stop hex, at its correct grid position ──
// Sample the CENTER *and* all 4 CORNERS of each swatch — a center-only check would still pass a
// grid-fill off-by-one that left a swatch's edges wrong while its middle happened to be right.
const pixelAt = (x, y) => { const o = y * rowBytes + 1 + x * 3; return [raw[o], raw[o + 1], raw[o + 2]]; };
// the mock strip's role colors, resolved INDEPENDENTLY from the kit's own roles tree (light mode).
const role = (key) => hexToRgb(kit.roles.primary[key].light);
const SURFACE = role("surface");
FAMILY_NAMES.forEach((name, i) => {
  const col = i % GRID_COLS, row = Math.floor(i / GRID_COLS);
  const p = kit.palettes.find((x) => x.name === name);
  const [r, g, b] = hexToRgb(p.ramp.find((s) => s.stop === 500).hex);
  const { x: x0, y: y0 } = L.swatch(i);
  const x1 = x0 + SWATCH_SIZE - 1, y1 = y0 + SWATCH_SIZE - 1;
  const points = {
    center: [x0 + Math.floor(SWATCH_SIZE / 2), y0 + Math.floor(SWATCH_SIZE / 2)],
    "top-left": [x0, y0], "top-right": [x1, y0], "bottom-left": [x0, y1], "bottom-right": [x1, y1],
  };
  for (const [label, [x, y]] of Object.entries(points)) {
    const [pr, pg, pb] = pixelAt(x, y);
    ok(pr === r && pg === g && pb === b, `${name}'s swatch (grid ${col},${row}) at its ${label} pixel matches its ramp 500-stop hex exactly (want [${r},${g},${b}], got [${pr},${pg},${pb}])`);
  }
});
// margins + gaps carry the kit's SURFACE color: the board corner, the gap between the first two swatches
// (both sides of it must be surface — a swatch bleeding INTO the gap is the off-by-one this catches),
// and the band between the grid and the control strip.
{
  const gapMidX = L.swatch(1).x - GAP / 2; // between Neutral (col 0) and Primary (col 1)
  const gapMidY = L.swatch(0).y + Math.floor(SWATCH_SIZE / 2);
  const points = {
    "board corner": [2, 2],
    "swatch gap (col 0/1)": [gapMidX, gapMidY],
    "gap left edge": [L.swatch(0).x + SWATCH_SIZE, gapMidY],
    "gap right edge": [L.swatch(1).x - 1, gapMidY],
    "grid/strip band": [Math.floor(L.width / 2), L.swatch(4).y + SWATCH_SIZE + Math.floor(MARGIN / 2)],
  };
  for (const [label, [x, y]] of Object.entries(points)) {
    ok(pixelAt(x, y).join() === SURFACE.join(), `the ${label} pixel is the kit's own surface color (want [${SURFACE}], got [${pixelAt(x, y)}])`);
  }
}
// ── the mock control strip: Button · Select · Switch, painted from the kit's real semantic roles ──
{
  const b = L.button;
  const midY = Math.floor(b.y + b.h / 2);
  ok(pixelAt(b.x + Math.round(b.w * 0.15), midY).join() === role("primary").join(), `the button's fill is the kit's primary role (got [${pixelAt(b.x + Math.round(b.w * 0.15), midY)}])`);
  ok(pixelAt(b.bar.x + Math.floor(b.bar.w / 2), midY).join() === role("onPrimary").join(), `the button's label bar is the kit's onPrimary role (got [${pixelAt(b.bar.x + Math.floor(b.bar.w / 2), midY)}])`);

  const s = L.select;
  ok(pixelAt(s.x + Math.floor(s.w / 2), s.y + 1).join() === role("outlineVariant").join(), `the select's border is the kit's outlineVariant role (got [${pixelAt(s.x + Math.floor(s.w / 2), s.y + 1)}])`);
  ok(pixelAt(s.bar.x + Math.floor(s.bar.w / 2), midY).join() === role("placeholder").join(), `the select's placeholder bar is the kit's placeholder role (got [${pixelAt(s.bar.x + Math.floor(s.bar.w / 2), midY)}])`);
  const interiorX = Math.floor((s.bar.x + s.bar.w + s.caret.cx - s.caret.w / 2) / 2); // between bar end and caret start
  ok(pixelAt(interiorX, midY).join() === SURFACE.join(), `the select's interior (between bar and caret) is unfilled — the surface color (got [${pixelAt(interiorX, midY)}])`);
  ok(pixelAt(Math.floor(s.caret.cx), s.caret.top).join() === role("onSurface").join(), `the select's caret is the kit's onSurface role (got [${pixelAt(Math.floor(s.caret.cx), s.caret.top)}])`);

  const w = L.switchCtl;
  ok(pixelAt(w.x + Math.floor(w.h / 4), midY).join() === role("primary").join(), `the switch's track is the kit's primary role (got [${pixelAt(w.x + Math.floor(w.h / 4), midY)}])`);
  ok(pixelAt(Math.floor(w.thumb.cx), Math.floor(w.thumb.cy)).join() === role("onPrimary").join(), `the switch's thumb is the kit's onPrimary role (got [${pixelAt(Math.floor(w.thumb.cx), Math.floor(w.thumb.cy))}])`);
}

// ── determinism: the SAME kit encodes to byte-identical PNG bytes every time (spec §6.4) ──
ok(swatchBoardPNG(kit, FAMILY_NAMES).equals(swatchBoardPNG(kit, FAMILY_NAMES)), "encoding the same kit twice produces byte-identical PNG bytes");

// ── a DIFFERENT kit encodes to different bytes (sanity: not a static/cached image) ──
{
  const otherKit = brandKit({ ...defaultDocument(), palettes: defaultDocument().palettes.map((p) => ({ ...p, hue: (p.hue + 60) % 360 })) });
  ok(!swatchBoardPNG(kit, FAMILY_NAMES).equals(swatchBoardPNG(otherKit, FAMILY_NAMES)), "a differently-hued kit encodes to different PNG bytes");
}

// ── the MCP image content block shape ──
{
  const block = swatchBoardImageBlock(kit, FAMILY_NAMES);
  ok(block.type === "image" && block.mimeType === "image/png" && typeof block.data === "string", `swatchBoardImageBlock returns the MCP image content block shape (got ${JSON.stringify({ ...block, data: block.data.slice(0, 10) + "..." })})`);
  ok(Buffer.from(block.data, "base64").equals(png), "the block's base64 data decodes to the exact same PNG bytes swatchBoardPNG produces directly");
}

if (fails.length) { console.error(`png-swatch-board FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("png-swatch-board PASS — a real PNG (verified via Node's own zlib.inflateSync), every swatch deep-matching the kit's ramp hexes, surface-colored margins/gaps, the Button·Select·Switch mock strip painting from the kit's real roles, deterministic, and the MCP image-block shape");
process.exit(0);
