// png-swatch-board.mjs — a zero-dependency PNG encoder for the describe-palette generator's swatch-board
// preview (#373). Hand-rolled rather than depending on a real PNG/zlib library, per the ticket's own
// scope: a flat-color grid needs no real compression, and staying this minimal keeps the encoder auditable
// in one file. Resist the urge to add gradients, labels, or real compression — the zero-dep constraint is
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
// row). Named constants so a future build can retune the board's size without hunting for a literal.
export const SWATCH_SIZE = 80;
export const GRID_COLS = 4;
export const GRID_ROWS = 2;

// swatchBoardPNG(kit, familyNames) → a Buffer (the PNG bytes). One flat-color swatch per family, sourced
// from that palette's OWN ramp 500-stop hex (the identity color) — the exact value #373's acceptance
// checks against ("swatch colors deep-match the kit"). A missing palette (shouldn't happen for a real
// generated kit, which always carries all 8) falls back to a neutral grey rather than throwing.
export function swatchBoardPNG(kit, familyNames) {
  const width = GRID_COLS * SWATCH_SIZE;
  const height = GRID_ROWS * SWATCH_SIZE;
  const pixels = Buffer.alloc(width * height * 3);
  familyNames.forEach((name, i) => {
    const p = kit.palettes && kit.palettes.find((x) => x.name === name);
    const stop500 = p && p.ramp && p.ramp.find((s) => s.stop === 500);
    const [r, g, b] = hexToRgb(stop500 ? stop500.hex : "#808080");
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    for (let y = row * SWATCH_SIZE; y < (row + 1) * SWATCH_SIZE; y++) {
      const rowOffset = y * width * 3;
      for (let x = col * SWATCH_SIZE; x < (col + 1) * SWATCH_SIZE; x++) {
        const offset = rowOffset + x * 3;
        pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b;
      }
    }
  });
  return encodePNG(pixels, width, height);
}

// swatchBoardImageBlock(kit, familyNames) → the MCP image content block shape: { type:"image", data
// (base64), mimeType }.
export function swatchBoardImageBlock(kit, familyNames) {
  const png = swatchBoardPNG(kit, familyNames);
  return { type: "image", data: png.toString("base64"), mimeType: "image/png" };
}
