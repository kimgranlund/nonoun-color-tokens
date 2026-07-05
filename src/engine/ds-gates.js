// ds-gates.js — the platform-agnostic §8 verification gates for a Claude Design /
// Claude Code design-system export bundle (DESIGN.md + tokens.json + component
// previews). Vanilla ESM, zero deps, NO DOM. A faithful port of the reference
// Python gate script (design-system-author-claude-code/scripts/bundle_gates.py);
// the color math, the SLOTS registry, and the derive_pairs grammar are replicated
// verbatim so this module and the Python script agree pair-for-pair.
//
// Unlike the Python (which reads a bundle directory), this takes the three carriers
// in memory so it can run inside the engine or a browser:
//
//   dsBundleGates({ designMd, tokensJson, previews })
//     designMd  : string   — the DESIGN.md text (frontmatter + body)
//     tokensJson: string | object — the tokens.json (raw text or already parsed)
//     previews  : Array<{ name: string, html: string }> — the components/*.html cards
//   → { fails, warns, findings: [{ level, gate, msg }] }
//
// Levels: PASS · ERROR · WARN · SKIP · INFO · DIVERGENCE. Only ERROR counts toward
// `fails`; only WARN toward `warns`. SKIP/INFO/DIVERGENCE never gate.
//
// Gates ported (bundle_gates.py G0–G8, W, DIV):
//   G0 preconditions     DESIGN.md present, tokens.json present, all colors parseable
//   G1 contrast          every derivable on/fill pair >= 4.5:1 in BOTH schemes
//                        (skip -disabled fills; skip alpha<1 pairs — not text pairs)
//   G2 scheme parity     frontmatter light-keys == -dark-keys; colors == colorsDark
//   G3 carrier equality  frontmatter OKLCH == tokens.json hex, per scheme, <= 1/255
//                        per channel (alpha compared as round(a*255))
//   G4 previews          @dsCard first-line marker; no external fetch;
//                        light-dark() requires color-scheme
//   G5 references        every {(colors|typography|spacing|rounded).key} resolves
//   G6 sections          canonical ## names in canonical order, no dupes; the two
//                        EXTRAS required
//   G7 required roles    every family base has an on-partner (value-equal alias→INFO);
//                        primary/primary-base present (WARN if absent)
//   G8 relative leading  leading/tracking never absolute px in any carrier
//   W  orphans           color roles never referenced in prose/previews → WARN
//   DIV divergence       on-colors constant across schemes → info line (never gates)
//
// NOT ported: G9 (pill/chip padding consistency). It is outside the requested §8
// set and is a cross-preview stylistic-consistency heuristic rather than a
// carrier-integrity gate; see the delivery note.

const AA = 4.5;

// ----------------------------------------------------------------- small utils

// Python3 round(): round-half-to-even. Used everywhere the reference uses round()
// so the 8-bit quantization (and the +-1/255 carrier comparison) match exactly.
export function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

// Python str.strip(chars): trim any of `chars` from both ends.
function stripChars(s, chars) {
  let a = 0, b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

// Python re.escape: backslash every char that is not [A-Za-z0-9_].
function reEscape(s) {
  return s.replace(/[^A-Za-z0-9_]/g, (m) => "\\" + m);
}

function rgbEq(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

// ---------------------------------------------------------------- color math

function _f(x) {
  x = x.trim();
  return x.endsWith("%") ? parseFloat(x.slice(0, -1)) / 100 : parseFloat(x);
}

const OKLCH_RE =
  /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

// 'oklch(L C H [/ A])' -> [[r,g,b] 8-bit, alpha] or null.
export function oklchToSrgb8(s) {
  const m = OKLCH_RE.exec(s.trim());
  if (!m) return null;
  const L = _f(m[1]);
  const C = _f(m[2]);
  const H = parseFloat(m[3]);
  const alpha = m[4] != null ? _f(m[4]) : 1.0;
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const enc = (c) => {
    c = Math.min(1, Math.max(0, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  return [lin.map((c) => pyRound(enc(c) * 255)), alpha];
}

// '#RGB' / '#RGBA' / '#RRGGBB' / '#RRGGBBAA' -> [[r,g,b], alpha] or null.
export function hexToSrgb8(s) {
  s = s.trim().replace(/^#/, "");
  if (s.length === 3 || s.length === 4) s = s.split("").map((c) => c + c).join("");
  if (s.length === 6) s += "FF";
  if (s.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(s)) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const a = parseInt(s.slice(6, 8), 16);
  return [[r, g, b], a / 255];
}

export function parseColor(s) {
  return s.trim().startsWith("#") ? hexToSrgb8(s) : oklchToSrgb8(s);
}

function relLum(rgb) {
  const lin = (u) => {
    u /= 255;
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function contrast(c1, c2) {
  const a = relLum(c1), b = relLum(c2);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// ------------------------------------------------------- DESIGN.md parsing

function splitDesign(text) {
  const m = /^\s*---\s*\n([\s\S]*?)\n---\s*\n/.exec(text);
  return m ? [m[1], text.slice(m[0].length)] : ["", text];
}

// Top-level frontmatter keys -> {child-key: scalar} (2-space children; deeper
// nesting recorded as key with '' value; comment lines skipped). Mirrors fm_blocks.
function fmBlocks(fm) {
  const blocks = {};
  let current = null;
  for (const line of fm.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    if (/^[A-Za-z][\w-]*:/.test(line)) {
      current = line.split(":")[0];
      if (!(current in blocks)) blocks[current] = {};
    } else if (current !== null) {
      const m = /^ {2}([A-Za-z0-9][\w-]*):\s*(.*)$/.exec(line);
      if (m) blocks[current][m[1]] = stripChars(stripChars(m[2].trim(), '"'), "'");
    }
  }
  return blocks;
}

// --------------------------------------------------- grammar-driven pairing

// longest-first for family stripping (Ultimate Tokens slot registry) — verbatim.
const SLOTS = [
  "surface-brightest", "surface-highest", "surface-dimmest", "surface-lowest",
  "scrim-strongest", "scrim-weakest", "inverse-surface", "outline-variant",
  "surface-variant", "container-high", "container-low", "surface-bright",
  "scrim-strong", "surface-high", "surface-dim", "surface-low", "background",
  "placeholder", "scrim-weak", "container", "disabled", "outline", "surface",
  "active", "bright", "hover", "scrim", "dim", "high", "low",
];

function familyOf(key) {
  if (key.includes("-on-")) return null;
  let k = key, changed = true;
  while (changed) {
    changed = false;
    for (const suf of SLOTS) {
      if (k.endsWith("-" + suf)) {
        k = k.slice(0, -(suf.length + 1));
        changed = true;
        break;
      }
    }
  }
  return k || null;
}

// From one scheme's key set, derive (on_key, fill_key) pairs by grammar.
// Returns { pairs, unfillable }. Verbatim port of derive_pairs.
function derivePairs(keyIter) {
  const keys = new Set(keyIter);
  const pairs = [], unfillable = [];
  for (const k of [...keys].sort()) {
    if (!k.includes("-on-")) continue;
    const idx = k.indexOf("-on-");
    const stem = k.slice(0, idx);
    const tail = k.slice(idx + 4);
    const tailBase = tail.replace(/-(hover|active|disabled)$/, "");
    let fills;
    if (tailBase === "surface" || tailBase === "surface-variant") {
      const re = new RegExp("^" + reEscape(stem) + "-(background|surface(-[a-z]+)*)$");
      fills = [...keys].filter(
        (f) => !f.includes("-on-") && re.test(f) && !f.endsWith("-disabled")
      );
    } else {
      fills = [tailBase, tailBase + "-hover", tailBase + "-active"].filter((f) =>
        keys.has(f)
      );
    }
    if (fills.length) for (const f of fills) pairs.push([k, f]);
    else unfillable.push(k);
  }
  return { pairs, unfillable };
}

// ------------------------------------------------------------------ reporting

class Report {
  constructor() {
    this.findings = [];
    this.fails = 0;
    this.warns = 0;
  }
  emit(level, gate, msg) {
    this.findings.push({ level, gate, msg });
    if (level === "ERROR") this.fails++;
    else if (level === "WARN") this.warns++;
  }
  ok(cond, gate, okMsg, failMsg) {
    this.emit(cond ? "PASS" : "ERROR", gate, cond ? okMsg : failMsg);
  }
}

// ------------------------------------------------------------------- gates

const CANON = [
  "overview", "colors", "typography", "layout", "elevation and depth",
  "shapes", "components", "do's and don'ts",
];
const ALIASES = {
  "brand and style": "overview",
  "layout and spacing": "layout",
  "elevation": "elevation and depth",
};
const EXTRAS = ["responsive behavior", "agent prompt guide"];

function normHeading(h) {
  return h.replace(/’/g, "'").replace(/&/g, "and").replace(/\s+/g, " ").trim().toLowerCase();
}

export function dsBundleGates({ designMd, tokensJson, previews } = {}) {
  const rep = new Report();

  // G0 — DESIGN.md must be present (fatal: nothing else is parseable without it).
  if (typeof designMd !== "string") {
    rep.emit("ERROR", "G0", "missing DESIGN.md");
    return { fails: rep.fails, warns: rep.warns, findings: rep.findings };
  }

  const text = designMd;
  const [fm, body] = splitDesign(text);
  const blocks = fmBlocks(fm);
  const colors = blocks.colors || {};
  const lights = {}, darks = {};
  for (const [k, v] of Object.entries(colors)) {
    if (k.endsWith("-dark")) darks[k.slice(0, -5)] = v;
    else lights[k] = v;
  }

  // tokens.json (string or already-parsed object).
  let tj = {};
  if (tokensJson == null) {
    rep.emit("ERROR", "G0", "missing tokens.json");
  } else if (typeof tokensJson === "string") {
    try {
      tj = JSON.parse(tokensJson);
    } catch (e) {
      rep.emit("ERROR", "G0", "tokens.json is not valid JSON: " + e.message);
    }
  } else {
    tj = tokensJson;
  }

  const cards = (Array.isArray(previews) ? previews.slice() : []).sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );

  // G2 scheme parity ------------------------------------------------------
  const lk = Object.keys(lights), dk = Object.keys(darks);
  const lkS = new Set(lk), dkS = new Set(dk);
  const onlyLight = lk.filter((k) => !dkS.has(k)).sort();
  const onlyDark = dk.filter((k) => !lkS.has(k)).sort();
  rep.ok(
    onlyLight.length === 0 && onlyDark.length === 0,
    "G2",
    `frontmatter parity: ${lk.length} roles x 2 schemes`,
    `frontmatter parity broken: only-light=${JSON.stringify(onlyLight)} only-dark=${JSON.stringify(onlyDark)}`
  );
  const tjl = tj.colors || {}, tjd = tj.colorsDark || {};
  const tjlK = Object.keys(tjl), tjdK = Object.keys(tjd);
  const tjlS = new Set(tjlK), tjdS = new Set(tjdK);
  const onlyC = tjlK.filter((k) => !tjdS.has(k)).sort();
  const onlyCD = tjdK.filter((k) => !tjlS.has(k)).sort();
  rep.ok(
    onlyC.length === 0 && onlyCD.length === 0 && tjlK.length > 0,
    "G2",
    `tokens.json parity: ${tjlK.length} roles x 2 schemes`,
    `tokens.json parity broken: only-colors=${JSON.stringify(onlyC)} only-colorsDark=${JSON.stringify(onlyCD)}`
  );

  // resolve every carrier value to sRGB8 ----------------------------------
  const resolve = (d, label) => {
    const out = {};
    for (const [k, v] of Object.entries(d)) {
      const c = parseColor(v);
      if (c === null) rep.emit("ERROR", "G0", `unparseable color ${label}.${k} = ${JSON.stringify(v)}`);
      else out[k] = c;
    }
    return out;
  };
  const L8 = resolve(lights, "fm.light");
  const D8 = resolve(darks, "fm.dark");
  const TL8 = resolve(tjl, "tokens.colors");
  const TD8 = resolve(tjd, "tokens.colorsDark");

  // G3 carrier equality (notation-aware, +-1/255 incl. alpha) --------------
  if (tjlK.length) {
    const fmOnly = lk.filter((k) => !tjlS.has(k)).sort();
    const tokOnly = tjlK.filter((k) => !lkS.has(k)).sort();
    rep.ok(
      fmOnly.length === 0 && tokOnly.length === 0,
      "G3",
      "carrier inventories match (frontmatter == tokens.json)",
      `carrier inventories differ: fm-only=${JSON.stringify(fmOnly)} tokens-only=${JSON.stringify(tokOnly)}`
    );
    const bad = [];
    let maxdev = 0;
    for (const [scheme, A, B] of [["light", L8, TL8], ["dark", D8, TD8]]) {
      const shared = Object.keys(A).filter((k) => k in B).sort();
      for (const k of shared) {
        const [ra, aa] = A[k], [rb, ab] = B[k];
        let dev = Math.max(...ra.map((x, i) => Math.abs(x - rb[i])));
        dev = Math.max(dev, Math.abs(pyRound(aa * 255) - pyRound(ab * 255)));
        maxdev = Math.max(maxdev, dev);
        if (dev > 1) bad.push(`${scheme}.${k} (dev ${dev}/255)`);
      }
    }
    rep.ok(
      bad.length === 0,
      "G3",
      `carrier equality within +-1/255 (max dev ${maxdev})`,
      "carrier values diverge beyond 1/255: " + bad.join(", ")
    );
  }

  // G1 contrast — all derivable pairs, both schemes -------------------------
  for (const [scheme, S] of [["light", L8], ["dark", D8]]) {
    const { pairs, unfillable } = derivePairs(Object.keys(S));
    for (const k of unfillable)
      rep.emit("ERROR", "G1", `${scheme}: on-color '${k}' has no fill to pair with`);
    if (!pairs.length) {
      rep.emit(
        "ERROR",
        "G1",
        `${scheme}: no on-pairs derivable — grammar violated or the reduction dropped every on-color`
      );
      continue;
    }
    let fails = 0, skips = 0;
    let worst = [99.0, ""];
    for (const [onK, fillK] of pairs) {
      const [rgb1, a1] = S[onK], [rgb2, a2] = S[fillK];
      if (fillK.endsWith("-disabled")) {
        skips++;
        continue;
      }
      if (a1 < 1.0 || a2 < 1.0) {
        rep.emit("SKIP", "G1", `${scheme}: ${onK} / ${fillK} — alpha < 1, not a text pair`);
        skips++;
        continue;
      }
      const ratio = contrast(rgb1, rgb2);
      if (ratio < worst[0]) worst = [ratio, `${onK} / ${fillK}`];
      if (ratio < AA) {
        fails++;
        rep.emit("ERROR", "G1", `${scheme}: ${onK} / ${fillK} = ${ratio.toFixed(2)}:1 < ${AA}:1`);
      }
    }
    if (!fails)
      rep.emit(
        "PASS",
        "G1",
        `${scheme}: ${pairs.length - skips} pairs >= ${AA}:1 (worst ${worst[0].toFixed(2)}:1 ${worst[1]})`
      );
  }

  // G7 required roles ------------------------------------------------------
  const famBases = new Set(Object.keys(L8).filter((k) => familyOf(k) === k));
  const l8keys = Object.keys(L8);
  const missingOn = [];
  for (const fam of [...famBases].sort()) {
    const hasOn = l8keys.some((k) => k.startsWith(fam + "-on-") || k.endsWith("-on-" + fam));
    if (!hasOn) {
      const aliasOf = [...famBases].filter(
        (o) => o !== fam && rgbEq(L8[o][0], L8[fam][0]) && l8keys.some((k) => k.startsWith(o + "-on-"))
      );
      if (aliasOf.length)
        rep.emit("INFO", "G7", `'${fam}' is a value-equal alias of '${aliasOf[0]}' (compat alias — document in receipt)`);
      else missingOn.push(fam);
    }
  }
  rep.ok(
    missingOn.length === 0,
    "G7",
    `every family base has an on-partner (${famBases.size} fills)`,
    "fills without an on-partner: " + missingOn.join(", ")
  );
  if (!["primary", "primary-base"].some((k) => k in L8))
    rep.emit("WARN", "G7", "no 'primary'/'primary-base' role — Stitch lints missing-primary; ship a compat alias");

  // G5 reference resolution -----------------------------------------------
  const refRe = /\{(colors|typography|spacing|rounded)\.([A-Za-z0-9-]+)\}/g;
  let refCount = 0;
  const danglingSet = new Set();
  for (const m of text.matchAll(refRe)) {
    refCount++;
    const g = m[1], k = m[2];
    if (!((blocks[g] || {})[k] !== undefined)) danglingSet.add(`{${g}.${k}}`);
  }
  const dangling = [...danglingSet].sort();
  rep.ok(
    dangling.length === 0,
    "G5",
    `all ${refCount} {group.token} references resolve`,
    "dangling references: " + dangling.join(", ")
  );

  // G6 section grammar ------------------------------------------------------
  const rawHeads = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => normHeading(m[1]));
  const heads = rawHeads.map((h) => ALIASES[h] || h);
  const dupes = [...new Set(heads.filter((h) => heads.filter((x) => x === h).length > 1))].sort();
  rep.ok(dupes.length === 0, "G6", "no duplicate section headings", "duplicate headings: " + dupes.join(", "));
  const present = heads.filter((h) => CANON.includes(h));
  const ordered = present.slice().sort((a, b) => CANON.indexOf(a) - CANON.indexOf(b));
  rep.ok(
    JSON.stringify(present) === JSON.stringify(ordered),
    "G6",
    "canonical sections in canonical order",
    `canonical sections out of order: ${JSON.stringify(present)}`
  );
  for (const miss of CANON.filter((c) => !heads.includes(c)))
    rep.emit("WARN", "G6", `canonical section missing: '${miss}' (Stitch-omissible; the authored dialect ships all 8)`);
  for (const ex of EXTRAS)
    rep.ok(heads.includes(ex), "G6", `'${ex}' present`, `'${ex}' missing — required by the Claude profile`);

  // G4 previews --------------------------------------------------------------
  rep.ok(cards.length > 0, "G4", `${cards.length} preview card(s) found`, "no preview cards");
  for (const card of cards) {
    const t = String(card.html == null ? "" : card.html);
    const first = t.trim() ? t.replace(/^\s+/, "").split("\n")[0] : "";
    const okm =
      first.startsWith("<!--") && first.includes("@dsCard") && first.includes("group=") && first.includes("title=");
    rep.ok(okm, "G4", `${card.name}: @dsCard marker on line 1`, `${card.name}: first line is not an @dsCard marker with group/title`);
    const ext =
      /(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//.test(t) || t.includes("url(http") || t.includes("@import");
    rep.ok(!ext, "G4", `${card.name}: self-contained (no external fetches)`, `${card.name}: external fetch found — previews must be self-contained`);
    if (t.includes("light-dark("))
      rep.ok(
        t.includes("color-scheme"),
        "G4",
        `${card.name}: color-scheme present with light-dark()`,
        `${card.name}: uses light-dark() without color-scheme — the dark end never fires`
      );
  }

  // G8 relative leading/tracking — never absolute px, in any carrier ----------
  const pxLt = [];
  for (const m of fm.matchAll(/(lineHeight|letterSpacing)\s*:\s*["']?\s*(-?[\d.]+\s*px)/g))
    pxLt.push(`frontmatter ${m[1]} = ${m[2]}`);
  const scale = (tj.type && tj.type.scale) || {};
  if (scale && typeof scale === "object" && !Array.isArray(scale)) {
    for (const [level, entry] of Object.entries(scale)) {
      if (!entry || typeof entry !== "object") continue;
      for (const field of ["lineHeight", "letterSpacing"]) {
        const v = entry[field];
        if (typeof v === "string" && v.trim().endsWith("px"))
          pxLt.push(`tokens.json type.scale.${level}.${field} = ${JSON.stringify(v)}`);
        else if (field === "lineHeight" && typeof v === "number" && v > 4)
          pxLt.push(`tokens.json type.scale.${level}.${field} = ${v} (> 4 — a px length, not a factor)`);
      }
    }
  }
  for (const card of cards) {
    const t = String(card.html == null ? "" : card.html);
    for (const m of t.matchAll(/(?:line-height|letter-spacing)\s*:\s*[^;\n]*?\d[\d.]*px/gi))
      pxLt.push(`${card.name}: \`${m[0].trim()}\``);
  }
  rep.ok(
    pxLt.length === 0,
    "G8",
    "leading/tracking relative (unitless/em/%, never px)",
    "leading/tracking are always relative — unitless factor, em, or % (standing rule); px found: " + pxLt.join("; ")
  );

  // W orphans (never gates) ---------------------------------------------------
  const cardText = cards.map((c) => String(c.html == null ? "" : c.html)).join("");
  for (const k of Object.keys(lights).sort())
    if (!text.includes(`{colors.${k}}`) && !cardText.includes(k))
      rep.emit("WARN", "W", `orphan role '${k}' — never referenced in prose, components, or previews`);

  // DIV divergence (never gates) -----------------------------------------------
  for (const k of tjlK.filter((k) => tjdS.has(k)).sort())
    if (k.includes("-on-") && tjl[k] === tjd[k])
      rep.emit("DIVERGENCE", "DIV", `on-color constant across schemes: ${k} = ${tjl[k]} — upstream authorial decision; record in the receipt, do not silently override`);

  return { fails: rep.fails, warns: rep.warns, findings: rep.findings };
}
// NB: named exports ONLY. The single-file bundler (scripts/bundle.mjs) inlines this module with a naive
// transform that does not support a default export — it would leak into the module IIFE as a syntax
// error, break the whole script, and surface only in the Chrome smoke leg. Every consumer imports by name.
