#!/usr/bin/env node
// okhsl.mjs — validation for src/engine/okhsl.js (Ottosson OKHSL ⇄ sRGB), the foundation for an
// OKHSL palette-generation mode. Verified against the canonical reference during the port (forward
// matched 0/255 over 1008 samples); these gates lock the contract WITHOUT the external reference:
// round-trip identity, gamut bijection (s=1 ⇒ on the sRGB boundary), neutrals, and a canonical anchor.
import { okhslToRgb, rgbToOkhsl } from "../../src/engine/okhsl.js";

const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };
const inByte = (v) => Number.isInteger(v) && v >= 0 && v <= 255;

// ── roundtrip: rgb -> okhsl -> rgb is identity within ±1 (8-bit rounding) across an RGB grid ──
for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
  const o = rgbToOkhsl([r, g, b]);
  const rt = okhslToRgb(o.h, o.s, o.l);
  if (!rt.every(inByte)) { FAIL("roundtrip", `okhslToRgb returned a non-byte for #${r},${g},${b}: ${rt}`); break; }
  for (let i = 0; i < 3; i++) if (Math.abs(rt[i] - [r, g, b][i]) > 1) { FAIL("roundtrip", `#${r},${g},${b} -> ${JSON.stringify(o)} -> ${rt} (Δ>1)`); break; }
}

// ── gamut bijection: s=1 lands ON the sRGB boundary (≥1 channel at 0 or 255) and stays in-gamut,
//    for EVERY hue × a lightness sweep. This is the cross-hue "equal saturation" property. ─────────
for (let hd = 0; hd < 360; hd += 10) for (const l of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
  const rgb = okhslToRgb(hd, 1, l);
  if (!rgb.every(inByte)) FAIL("boundary", `s=1 hue ${hd} l ${l} not in-gamut: ${rgb}`);
  const onFace = rgb.some((c) => c <= 1 || c >= 254);
  if (!onFace) FAIL("boundary", `s=1 hue ${hd} l ${l} = ${rgb} is NOT on the gamut boundary (no channel near 0/255)`);
}

// ── monotone saturation: at fixed (h,l) more s ⇒ chroma grows (s=0 is the neutral, s=1 the max) ──
for (let hd = 0; hd < 360; hd += 60) {
  const l = 0.5;
  const chroma = (rgb) => Math.max(...rgb) - Math.min(...rgb);
  let prev = -1, ok = true;
  for (const s of [0, 0.25, 0.5, 0.75, 1]) { const c = chroma(okhslToRgb(hd, s, l)); if (c < prev - 1) ok = false; prev = c; }
  if (!ok) FAIL("monotone-s", `hue ${hd}: chroma not non-decreasing in s`);
}

// ── neutrals + extremes: s=0 ⇒ achromatic gray; l=1 ⇒ white; l=0 ⇒ black (any hue) ──────────────
for (let hd = 0; hd < 360; hd += 45) {
  const gray = okhslToRgb(hd, 0, 0.5);
  if (Math.abs(gray[0] - gray[1]) > 1 || Math.abs(gray[1] - gray[2]) > 1) FAIL("neutral", `s=0 hue ${hd} not gray: ${gray}`);
  const w = okhslToRgb(hd, 0.7, 1), k = okhslToRgb(hd, 0.7, 0);
  if (!(w[0] === 255 && w[1] === 255 && w[2] === 255)) FAIL("neutral", `l=1 hue ${hd} not white: ${w}`);
  if (!(k[0] === 0 && k[1] === 0 && k[2] === 0)) FAIL("neutral", `l=0 hue ${hd} not black: ${k}`);
}

// ── canonical anchor: sRGB red is the OKHSL reference point h≈29.23° s≈1 l≈0.568, and round-trips ─
{
  const red = rgbToOkhsl([255, 0, 0]);
  if (Math.abs(red.h - 29.23) > 0.5) FAIL("anchor", `red hue ${red.h.toFixed(2)}° != 29.23° (canonical OKHSL red)`);
  if (Math.abs(red.s - 1) > 0.01) FAIL("anchor", `red s ${red.s.toFixed(3)} != 1`);
  if (Math.abs(red.l - 0.568) > 0.005) FAIL("anchor", `red l ${red.l.toFixed(3)} != 0.568`);
  const back = okhslToRgb(red.h, red.s, red.l);
  if (back.join(",") !== "255,0,0") FAIL("anchor", `red did not round-trip: ${back}`);
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["roundtrip", "boundary", "monotone-s", "neutral", "anchor"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: okhsl ⇄ sRGB clears all [gate] predicates");
process.exit(0);
