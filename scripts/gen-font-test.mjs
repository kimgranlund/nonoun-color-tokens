// gen-font-test.mjs — emit a SELF-CONTAINED font-loading isolation page (font-test.html) that renders
// Source Serif 4 (a SERIF) seven ways, each with a sans-serif fallback, so a working method shows a SERIF
// and a broken one shows SANS. Open it in the browser/context where fonts fail and report which rows work.
//   node scripts/gen-font-test.mjs   →   open font-test.html
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync(new URL("../src/ui/type-fonts.js", import.meta.url), "utf8");
const b64 = (css.match(/font-family:'Source Serif 4';[^}]*?base64,([^)]+)\)/) || [])[1];
if (!b64) throw new Error("could not extract Source Serif 4 base64 from type-fonts.js");
// the same gstatic latin woff2 the gen-type-fonts script downloads (for the CDN methods)
const GSTATIC = "https://fonts.gstatic.com/s/sourceserif4/v14/vEFF2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6kDXr4.woff2";
const CDNCSS = "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400..900&display=swap";
const DATAURI = `data:font/woff2;base64,${b64}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Font loading isolation — Source Serif 4</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background:#0d1117; color:#e6edf3; margin:0; padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; }
  .meta { font-size:12px; color:#8b949e; margin-bottom:18px; line-height:1.6; }
  .meta b { color:#e6edf3; }
  .row { border:1px solid #30363d; border-radius:8px; padding:12px 16px; margin:10px 0; background:#161b22; }
  .row .hd { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
  .row h2 { font-size:13px; margin:0; color:#c9d1d9; font-weight:600; }
  .row .desc { font-size:11px; color:#6e7681; margin:2px 0 10px; font-family:ui-monospace, monospace; }
  .sample { font-size:46px; line-height:1.05; color:#fff; min-height:52px; }
  .badge { font-size:11px; font-weight:700; padding:2px 9px; border-radius:20px; }
  .ok { background:#1a7f37; color:#fff; } .fail { background:#b62324; color:#fff; }
  .pending { background:#444c56; color:#c9d1d9; } .ref { background:#30363d; color:#8b949e; }
  .status { font-size:11px; color:#8b949e; margin-top:6px; font-family:ui-monospace, monospace; word-break:break-all; }
  button { font:inherit; font-size:13px; background:#21262d; color:#e6edf3; border:1px solid #30363d; border-radius:6px; padding:6px 12px; cursor:pointer; }
  /* the methods that must be declared in CSS (link + @font-face) */
  @font-face { font-family:'m-cdnface'; font-weight:400 900; src:url(${GSTATIC}) format('woff2'); }
  @font-face { font-family:'m-dataface'; font-weight:400 900; src:url(${DATAURI}) format('woff2'); }
  @font-face { font-family:'Source Serif 4'; font-weight:400 900; src:url(${DATAURI}) format('woff2'); }
  .f-serif    { font-family: serif; }
  .f-sans     { font-family: sans-serif; }
  .f-cdnlink  { font-family: 'Source Serif 4', sans-serif; }
  .f-cdnface  { font-family: 'm-cdnface', sans-serif; }
  .f-dataface { font-family: 'm-dataface', sans-serif; }
  .f-dataapi  { font-family: 'm-dataapi', sans-serif; }
  .f-cdnapi   { font-family: 'm-cdnapi', sans-serif; }
  .f-quoted   { font-family: 'Source Serif 4', sans-serif; }
  .f-unquoted { font-family: Source Serif 4, sans-serif; }
</style>
<link id="cdnlink" rel="stylesheet" href="${CDNCSS}">
</head><body>
<h1>Font loading isolation — Source Serif 4 <span style="font-weight:400;color:#8b949e;font-size:13px">(a serif)</span></h1>
<div class="meta">
  A working method renders <b>Yao Ming</b> as a <b>serif</b>; a broken one falls back to <b>sans-serif</b>.
  Each badge is auto-computed (rendered width vs the sans-serif fallback).<br>
  <span id="ua"></span><br><span id="online"></span> · <span id="origin"></span>
  &nbsp; <button id="copy">Copy results JSON</button>
</div>
<div id="rows"></div>
<script>
const METHODS = [
  { id:"serif",    cls:"f-serif",    label:"Control — system serif",        code:"font-family: serif",                                   ctrl:true },
  { id:"sans",     cls:"f-sans",     label:"Control — system sans",         code:"font-family: sans-serif",                              ctrl:"sans" },
  { id:"cdnlink",  cls:"f-cdnlink",  label:"A · CDN <link rel=stylesheet>", code:"Google Fonts css2 stylesheet" },
  { id:"cdnface",  cls:"f-cdnface",  label:"B · @font-face + CDN url()",    code:"src: url(fonts.gstatic.com/…woff2)" },
  { id:"dataface", cls:"f-dataface", label:"C · @font-face + data: base64   [APP — lazy <style>]", code:"src: url(data:font/woff2;base64,…)" },
  { id:"dataapi",  cls:"f-dataapi",  label:"D · FontFace API + data: + add+load   [APP FIX — eager]", code:"new FontFace(…data…); document.fonts.add; .load()" },
  { id:"cdnapi",   cls:"f-cdnapi",   label:"E · FontFace API + CDN url + add+load", code:"new FontFace(…gstatic url…); add; .load()" },
  { id:"quoted",   cls:"f-quoted",   label:"F · real name, QUOTED", code:"font-family: 'Source Serif 4', sans-serif" },
  { id:"unquoted", cls:"f-unquoted", label:"G · real name, UNQUOTED  [THE APP BUG — Safari]", code:"font-family: Source Serif 4, sans-serif   (the digit '4' is invalid unquoted in Safari)" },
];
document.getElementById("ua").textContent = "UA: " + navigator.userAgent;
document.getElementById("online").textContent = "navigator.onLine: " + navigator.onLine;
document.getElementById("origin").textContent = "origin: " + location.origin;
const rowsEl = document.getElementById("rows");
// build rows with the DOM API + textContent — the labels contain literal "<link>"/"<style>" text that
// innerHTML would parse as real elements and corrupt the layout.
for (const m of METHODS) {
  const row = document.createElement("div"); row.className = "row";
  const hd = document.createElement("div"); hd.className = "hd";
  const h2 = document.createElement("h2"); h2.textContent = m.label;
  const b = document.createElement("span"); b.className = "badge pending"; b.id = "b-" + m.id; b.textContent = "…";
  hd.append(h2, b);
  const desc = document.createElement("div"); desc.className = "desc"; desc.textContent = m.code;
  const sample = document.createElement("div"); sample.className = "sample " + m.cls; sample.textContent = "Yao Ming Featured";
  const status = document.createElement("div"); status.className = "status"; status.id = "s-" + m.id;
  row.append(hd, desc, sample, status);
  rowsEl.appendChild(row);
}
function measure(ff) { const s = document.createElement("span"); s.style.cssText = "position:fixed;left:-9999px;top:0;font-size:64px;font-family:" + ff; s.textContent = "Yao Ming Featured"; document.body.append(s); const w = s.offsetWidth; s.remove(); return w; }
const sansBase = () => measure("sans-serif");
function badge(id, state, text) { const b = document.getElementById("b-" + id); b.className = "badge " + state; b.textContent = text; if (text===undefined){} const s = document.getElementById("s-" + id); if (s && arguments.length>3) s.textContent = arguments[3]; }
function detect() {
  const base = sansBase();
  const result = {};
  for (const m of METHODS) {
    const fam = getComputedStyle(document.querySelector("." + m.cls)).fontFamily;
    const w = measure(fam);
    const applied = Math.abs(w - base) > 1;
    if (m.ctrl === true) { badge(m.id, applied ? "ok" : "fail", applied ? "serif ✓" : "no serif?!"); result[m.id] = applied; }
    else if (m.ctrl === "sans") { badge(m.id, "ref", "baseline (sans)"); result[m.id] = "baseline"; }
    else { badge(m.id, applied ? "ok" : "fail", applied ? "SERIF — works ✓" : "sans — FAILED ✗"); result[m.id] = applied; }
  }
  return result;
}
// FontFace API methods D + E
const apiStatus = {};
async function loadApi() {
  const tries = [
    { id:"dataapi", fam:"m-dataapi", src:"url(${DATAURI})" },
    { id:"cdnapi",  fam:"m-cdnapi",  src:"url(${GSTATIC})" },
  ];
  for (const t of tries) {
    try {
      const ff = new FontFace(t.fam, t.src, { weight:"400 900", display:"swap" });
      document.fonts.add(ff);
      await ff.load();
      apiStatus[t.id] = "FontFace.load() → loaded";
    } catch (e) { apiStatus[t.id] = "FontFace.load() → ERROR: " + (e && e.message || e); }
    const s = document.getElementById("s-" + t.id); if (s) s.textContent = apiStatus[t.id];
  }
}
let lastResult = {};
async function run() {
  await loadApi();
  try { await document.fonts.ready; } catch (e) {}
  // a couple of passes as faces settle
  for (let i = 0; i < 4; i++) { lastResult = detect(); await new Promise(r => setTimeout(r, 400)); }
  // surface document.fonts registry
  const reg = [...document.fonts].map(f => f.family + ":" + f.status);
  document.getElementById("origin").textContent += " · fonts: " + reg.join(", ");
}
document.getElementById("copy").onclick = () => {
  const out = { ua: navigator.userAgent, online: navigator.onLine, origin: location.origin,
    methods: lastResult, api: apiStatus, registered: [...document.fonts].map(f => f.family + ":" + f.status) };
  const txt = JSON.stringify(out, null, 2);
  navigator.clipboard && navigator.clipboard.writeText(txt).then(() => alert("Copied results JSON — paste it back."), () => prompt("Copy this:", txt)) || prompt("Copy this:", txt);
};
run();
</script>
</body></html>`;

writeFileSync(new URL("../font-test.html", import.meta.url), html);
console.log("wrote font-test.html  (" + (html.length / 1024).toFixed(0) + " KB) — open it in the browser/context where fonts fail");
