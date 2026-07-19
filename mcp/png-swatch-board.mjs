// png-swatch-board.mjs — a zero-dependency PNG encoder for the describe-palette generator's swatch-board
// preview (#373). Hand-rolled rather than depending on a real PNG/zlib library, per the ticket's own
// scope: flat-color shapes need no real compression, and staying this minimal keeps the encoder auditable
// in one file. The board is the 4×2 family grid (gapped, on the kit's own surface color) plus a mock
// CONTROL STRIP — Button · Select · Switch, flat shapes sized from the kit's own geometry LG tokens and
// painted from its real semantic roles (the PNG sibling of the app's Geometry ramp mocks, #383). Resist
// the urge to add text, gradients, anti-aliasing, or real compression — the zero-dep constraint is
// load-bearing (spec §13). Deterministic: the same kit always encodes to byte-identical PNG bytes (no
// timestamps, no randomness, no ancillary chunks) — spec §6.4's "byte-identical PNG" replay guarantee.

// ── CRC-32 (IEEE 802.3 / zlib's polynomial) — every PNG chunk is trailed by one ──
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

// ── Adler-32 — the checksum a zlib stream's trailer carries over the UNCOMPRESSED data ──
function adler32(bytes) {
  let a = 1, b = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

// deflateStored(data) — DEFLATE's "stored" (uncompressed) block type (RFC 1951 §3.2.4): no Huffman coding,
// just literal bytes framed for the format. Each block's header is a single byte (1-bit BFINAL + 2-bit
// BTYPE=00, padded to the byte with zero bits — BTYPE 00 contributes nothing itself), then LEN/NLEN (2
// bytes each, little-endian; NLEN is LEN's one's complement) and the literal bytes. Split into <=65535-byte
// blocks — the format's own per-block cap.
function deflateStored(data) {
  const MAX = 65535;
  const blocks = Math.max(1, Math.ceil(data.length / MAX)); // at least one block, even for empty data
  const parts = [];
  for (let i = 0; i < blocks; i++) {
    const start = i * MAX;
    const slice = data.subarray(start, Math.min(start + MAX, data.length));
    const isFinal = i === blocks - 1;
    const len = slice.length;
    const nlen = (~len) & 0xffff;
    parts.push(Buffer.from([isFinal ? 1 : 0, len & 0xff, (len >>> 8) & 0xff, nlen & 0xff, (nlen >>> 8) & 0xff]));
    parts.push(Buffer.from(slice));
  }
  return Buffer.concat(parts);
}

// zlibStore(data) — the zlib wrapper a PNG IDAT chunk needs: a 2-byte header (0x78 0x01 — deflate, 32K
// window, "fastest" level; the level is only a hint, meaningless over stored blocks) + the deflate stream
// + a 4-byte BIG-ENDIAN Adler-32 of the uncompressed data.
function zlibStore(data) {
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(adler32(data), 0);
  return Buffer.concat([Buffer.from([0x78, 0x01]), deflateStored(data), trailer]);
}

// chunk(type, data) — one PNG chunk: 4-byte big-endian length + 4-byte ASCII type + data + a CRC-32 over
// (type + data).
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// hexToRgb("#RRGGBB") -> [r, g, b] (0..255 each).
function hexToRgb(hex) {
  const m = String(hex).replace("#", "");
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
}

// encodePNG(pixels, width, height) — pixels: a flat Buffer of width*height*3 RGB bytes. Color type 2 (RGB,
// 8-bit, no palette, no alpha) — the simplest shape for solid swatches. Filter type 0 (None) on every
// scanline — filtering only helps REAL compression, which stored blocks skip entirely.
function encodePNG(pixels, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression method (deflate — the only value the spec defines)
  ihdr[11] = 0; // filter method (adaptive filtering — but every scanline below uses filter type 0/None)
  ihdr[12] = 0; // interlace method (none)

  const rowBytes = width * 3;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + rowBytes);
    raw[rowStart] = 0; // filter type: None
    pixels.copy(raw, rowStart + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlibStore(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// SWATCH_SIZE / GRID_COLS / GRID_ROWS — a 4×2 grid, one solid swatch per family, in FAMILY_NAMES order
// (the 4 brand-ish families — Neutral/Primary/Secondary/Tertiary — top row; the 4 status families bottom
// row). MARGIN pads the whole board, GAP separates swatches, CONTROL_STRIP_H reserves a fixed-height band
// under the grid for the mock controls (fixed so the board's dimensions never depend on the kit's
// geometry treatment). Named constants so a future build can retune the board without hunting literals.
export const SWATCH_SIZE = 80;
export const GRID_COLS = 4;
export const GRID_ROWS = 2;
export const MARGIN = 16;
export const GAP = 8;
export const CONTROL_STRIP_H = 48;

// ── flat-shape rasterizers — pixel-center point tests, no anti-aliasing (AA would smuggle in blending
// math for zero visual payoff at swatch scale; hard edges keep the deep-match tests exact) ──
function fillRect(px, W, x, y, w, h, [r, g, b]) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const o = (j * W + i) * 3;
      px[o] = r; px[o + 1] = g; px[o + 2] = b;
    }
  }
}

// fillRoundRect — the rounded-rect SDF test: a pixel center's distance to the radius-inset core rect
// must be ≤ rad. rad is clamped to the half-extent so a pill (rad = h/2) is just the degenerate case.
function fillRoundRect(px, W, x, y, w, h, rad, [r, g, b]) {
  rad = Math.min(rad, Math.floor(Math.min(w, h) / 2));
  const cx0 = x + rad, cx1 = x + w - rad, cy0 = y + rad, cy1 = y + h - rad;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const pxc = i + 0.5, pyc = j + 0.5;
      const dx = pxc < cx0 ? cx0 - pxc : pxc > cx1 ? pxc - cx1 : 0;
      const dy = pyc < cy0 ? cy0 - pyc : pyc > cy1 ? pyc - cy1 : 0;
      if (dx * dx + dy * dy <= rad * rad) {
        const o = (j * W + i) * 3;
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
      }
    }
  }
}

function fillCircle(px, W, cx, cy, radius, [r, g, b]) {
  const x0 = Math.floor(cx - radius), x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius), y1 = Math.ceil(cy + radius);
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const o = (j * W + i) * 3;
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
      }
    }
  }
}

// fillCaretDown — the select's disclosure triangle: rows of shrinking half-width, apex at the bottom.
function fillCaretDown(px, W, cx, top, w, h, rgb) {
  for (let t = 0; t < h; t++) {
    const half = (w / 2) * (1 - t / h);
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) fillRect(px, W, x0, top + t, x1 - x0, 1, rgb);
  }
}

// boardLayout(kit) — every rect the renderer paints, shared with the verifier so the test samples the
// exact geometry the renderer used (colors stay independently resolved from the kit). The control strip's
// mocks are sized from the kit's OWN geometry LG tokens — height, pill radius, icon (the switch thumb,
// per the app's centering law: inset = paddingNarrow), caret — so the preview shows the kit's real
// geometry, not an invented one. Widths derive from the remaining row space so any treatment fits.
export function boardLayout(kit) {
  const width = MARGIN * 2 + GRID_COLS * SWATCH_SIZE + (GRID_COLS - 1) * GAP;
  const gridH = GRID_ROWS * SWATCH_SIZE + (GRID_ROWS - 1) * GAP;
  const stripY = MARGIN + gridH + MARGIN;
  const height = stripY + CONTROL_STRIP_H + MARGIN;
  const g = (kit.geometry && kit.geometry.sizes && kit.geometry.sizes.LG) || {};
  const ctlH = Math.min(Math.round(g.height || 36), CONTROL_STRIP_H);
  const ctlY = stripY + Math.round((CONTROL_STRIP_H - ctlH) / 2);
  const radius = Math.round(g.radiusPill != null ? Math.min(g.radiusPill, ctlH / 2) : ctlH / 2);
  const thumb = Math.min(Math.round(g.icon || 20), ctlH - 2);
  const inset = Math.max(1, Math.round(g.paddingNarrow != null ? g.paddingNarrow : (ctlH - thumb) / 2));
  const caretW = Math.round(g.caret || 14);

  const gapX = GAP * 2;
  const innerW = width - MARGIN * 2;
  const swW = Math.round(ctlH * 1.75);
  const rest = innerW - swW - gapX * 2;
  const btnW = Math.round(rest * 0.45);
  const selW = rest - btnW;

  const button = { x: MARGIN, y: ctlY, w: btnW, h: ctlH, r: radius };
  button.bar = { x: button.x + Math.round((btnW - Math.round(btnW * 0.45)) / 2), y: ctlY + Math.round(ctlH / 2) - 3, w: Math.round(btnW * 0.45), h: 6 };

  const select = { x: button.x + btnW + gapX, y: ctlY, w: selW, h: ctlH, r: Math.min(radius, 10), stroke: 2 };
  const pad = Math.round(ctlH * 0.35);
  select.bar = { x: select.x + pad, y: ctlY + Math.round(ctlH / 2) - 3, w: Math.round(selW * 0.38), h: 6 };
  const caretH = Math.round(caretW * 0.5);
  select.caret = { cx: select.x + selW - pad - caretW / 2, top: ctlY + Math.round((ctlH - caretH) / 2), w: caretW, h: caretH };

  const switchCtl = { x: select.x + selW + gapX, y: ctlY, w: swW, h: ctlH, r: Math.floor(ctlH / 2) };
  switchCtl.thumb = { cx: switchCtl.x + swW - inset - thumb / 2, cy: ctlY + ctlH / 2, d: thumb };

  const swatch = (i) => ({
    x: MARGIN + (i % GRID_COLS) * (SWATCH_SIZE + GAP),
    y: MARGIN + Math.floor(i / GRID_COLS) * (SWATCH_SIZE + GAP),
  });
  return { width, height, swatch, button, select, switchCtl };
}

// _kitColors(kit, familyNames) — the semantic roles the mocks paint from, in LIGHT mode (a preview has one
// scheme; light is the app's own canvas default). Every color is the kit's real resolved role — surface
// grounds the board, primary/onPrimary fill the button + switch (exactly what the app's Geometry ramp
// mocks use), outlineVariant borders the select (the app's own input-border mapping), placeholder colors
// its text bar. Fallbacks only guard a kit missing its roles tree (not a shape generateKit ever emits).
function _kitColors(kit, familyNames) {
  const tree = (kit.roles && kit.roles.primary) || {};
  const primaryFallback = (() => {
    const p = kit.palettes && kit.palettes.find((x) => x.name === familyNames[1]);
    const s = p && p.ramp && p.ramp.find((s) => s.stop === 500);
    return s ? s.hex : "#808080";
  })();
  const light = (key, fb) => hexToRgb((tree[key] && tree[key].light) || fb);
  return {
    surface: light("surface", "#ffffff"),
    onSurface: light("onSurface", "#1f1f1f"),
    outline: light("outlineVariant", "#9e9e9e"),
    placeholder: light("placeholder", "#767676"),
    prime: light("primary", primaryFallback),
    onPrime: light("onPrimary", "#ffffff"),
  };
}

// swatchBoardPNG(kit, familyNames) → a Buffer (the PNG bytes). One flat-color swatch per family, sourced
// from that palette's OWN ramp 500-stop hex (the identity color) — the exact value #373's acceptance
// checks against ("swatch colors deep-match the kit") — on the kit's surface color, gapped and margined,
// with the Button · Select · Switch mock strip underneath. A missing palette (shouldn't happen for a real
// generated kit, which always carries all 8) falls back to a neutral grey rather than throwing.
export function swatchBoardPNG(kit, familyNames) {
  const L = boardLayout(kit);
  const C = _kitColors(kit, familyNames);
  const { width, height } = L;
  const pixels = Buffer.alloc(width * height * 3);
  fillRect(pixels, width, 0, 0, width, height, C.surface);

  familyNames.forEach((name, i) => {
    const p = kit.palettes && kit.palettes.find((x) => x.name === name);
    const stop500 = p && p.ramp && p.ramp.find((s) => s.stop === 500);
    const { x, y } = L.swatch(i);
    fillRect(pixels, width, x, y, SWATCH_SIZE, SWATCH_SIZE, hexToRgb(stop500 ? stop500.hex : "#808080"));
  });

  // Button — a filled pill (primary/onPrimary), its label a flat bar (shapes, never text — spec §13).
  const b = L.button;
  fillRoundRect(pixels, width, b.x, b.y, b.w, b.h, b.r, C.prime);
  fillRoundRect(pixels, width, b.bar.x, b.bar.y, b.bar.w, b.bar.h, 3, C.onPrime);

  // Select — an outlined, unfilled field (outlineVariant border on the surface ground, matching the
  // app's own input-border mapping) + a placeholder bar + the disclosure caret.
  const s = L.select;
  fillRoundRect(pixels, width, s.x, s.y, s.w, s.h, s.r, C.outline);
  fillRoundRect(pixels, width, s.x + s.stroke, s.y + s.stroke, s.w - 2 * s.stroke, s.h - 2 * s.stroke, Math.max(0, s.r - s.stroke), C.surface);
  fillRoundRect(pixels, width, s.bar.x, s.bar.y, s.bar.w, s.bar.h, 3, C.placeholder);
  fillCaretDown(pixels, width, s.caret.cx, s.caret.top, s.caret.w, s.caret.h, C.onSurface);

  // Switch (ON) — primary track, onPrimary thumb inset per the centering law (thumb = icon, inset =
  // paddingNarrow — the same literal rendering the app's Geometry ramp shows).
  const w = L.switchCtl;
  fillRoundRect(pixels, width, w.x, w.y, w.w, w.h, w.r, C.prime);
  fillCircle(pixels, width, w.thumb.cx, w.thumb.cy, w.thumb.d / 2, C.onPrime);

  return encodePNG(pixels, width, height);
}

// swatchBoardImageBlock(kit, familyNames) → the MCP image content block shape: { type:"image", data
// (base64), mimeType }.
export function swatchBoardImageBlock(kit, familyNames) {
  const png = swatchBoardPNG(kit, familyNames);
  return { type: "image", data: png.toString("base64"), mimeType: "image/png" };
}
