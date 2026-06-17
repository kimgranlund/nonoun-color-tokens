// zip.mjs — a tiny, dependency-free ZIP writer (STORE / no compression). PURE: a file list -> a
// Uint8Array of a valid .zip. Used by the Export drawer's "Download all" to bundle every format into
// one foldered archive, fully offline (the app pulls no libraries and the Figma sandbox has no network).
// Store (method 0) keeps it lib-free — no DEFLATE — at a small size cost; the export text is tiny.
//
// Spec refs: PKWARE APPNOTE — local file header (PK\x03\x04), central directory (PK\x01\x02),
// end-of-central-directory (PK\x05\x06). All multi-byte fields are little-endian. Folders are IMPLIED
// by "/"-separated names (no explicit directory entries needed — unzippers create the paths).

// crc32 — standard CRC-32 (reflected, poly 0xEDB88320), table built once.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const toBytes = (d) => (typeof d === "string" ? enc.encode(d) : d);

// zipStore — files: [{ name, data }] (data: string | Uint8Array) -> Uint8Array (a complete .zip).
export function zipStore(files) {
  const items = files.map((f) => {
    const data = toBytes(f.data);
    return { name: enc.encode(f.name), data, crc: crc32(data) };
  });
  // Pre-size EXACTLY: per file local(30 + name + data) + central(46 + name), plus the 22-byte EOCD.
  let size = 22;
  for (const it of items) size += 30 + it.name.length + it.data.length + 46 + it.name.length;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  let off = 0;
  const u16 = (v) => { dv.setUint16(off, v & 0xffff, true); off += 2; };
  const u32 = (v) => { dv.setUint32(off, v >>> 0, true); off += 4; };
  const raw = (b) => { buf.set(b, off); off += b.length; };

  // 1) local file headers + raw data
  const offsets = [];
  for (const it of items) {
    offsets.push(off);
    u32(0x04034b50); // local file header signature
    u16(20);         // version needed to extract (2.0)
    u16(0);          // general-purpose flags
    u16(0);          // method = 0 (store)
    u16(0); u16(0);  // mod time, mod date (fixed 0 → reproducible archives)
    u32(it.crc);     // crc-32
    u32(it.data.length); // compressed size (== uncompressed for store)
    u32(it.data.length); // uncompressed size
    u16(it.name.length); // filename length
    u16(0);          // extra-field length
    raw(it.name);
    raw(it.data);
  }
  // 2) central directory
  const cdStart = off;
  items.forEach((it, i) => {
    u32(0x02014b50); // central directory header signature
    u16(20);         // version made by
    u16(20);         // version needed
    u16(0);          // flags
    u16(0);          // method
    u16(0); u16(0);  // mod time, date
    u32(it.crc);
    u32(it.data.length);
    u32(it.data.length);
    u16(it.name.length);
    u16(0);          // extra
    u16(0);          // comment length
    u16(0);          // disk number start
    u16(0);          // internal attributes
    u32(0);          // external attributes
    u32(offsets[i]); // relative offset of local header
    raw(it.name);
  });
  const cdSize = off - cdStart;
  // 3) end of central directory
  u32(0x06054b50); // EOCD signature
  u16(0); u16(0);  // disk number, disk with central dir
  u16(items.length); u16(items.length); // entries on this disk, total
  u32(cdSize);
  u32(cdStart);
  u16(0);          // archive comment length
  return buf;
}
