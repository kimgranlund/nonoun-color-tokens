// icon-systems.mjs — the ICON SYSTEM facet of a brand kit. Pure, no DOM (an engine module).
//
// An icon system is a BRAND decision, exactly like a font family: the kit names the library and its
// stroke/fill variant so a consuming agent binds to it instead of inventing one. It is NOT a token
// ladder — icon SIZES already live in the geometry ramp (`geomScale().sizes.<size>.icon` → 14/16/18/
// 20/24/28px, composed with control heights by the centering law). So this module carries the
// registry + the resolver only, and the exports/MCP read the resolved value.
//
// The registry is metadata about real, permissively-licensed libraries; `variants` are the library's
// OWN style names (not ours). A library with no style variants (Lucide, Feather, Bootstrap Icons)
// has an empty list — the UI hides the variant control and the resolved variant is null.

export const DEFAULT_ICON_SYSTEM = "phosphor"; // the app dogfoods Phosphor (see src/ui/icons.js)

export const ICON_SYSTEMS = [
  { id: "phosphor", name: "Phosphor", license: "MIT", url: "https://phosphoricons.com",
    note: "6 weights, 9k+ glyphs", variants: ["thin", "light", "regular", "bold", "fill", "duotone"], defaultVariant: "regular" },
  { id: "lucide", name: "Lucide", license: "ISC", url: "https://lucide.dev",
    note: "one stroke style; width is a prop", variants: [], defaultVariant: null },
  { id: "material-symbols", name: "Material Symbols", license: "Apache-2.0", url: "https://fonts.google.com/icons",
    note: "variable axes (fill · weight · grade)", variants: ["outlined", "rounded", "sharp"], defaultVariant: "outlined" },
  { id: "heroicons", name: "Heroicons", license: "MIT", url: "https://heroicons.com",
    note: "24px outline/solid · 20px mini · 16px micro", variants: ["outline", "solid", "mini", "micro"], defaultVariant: "outline" },
  { id: "tabler", name: "Tabler Icons", license: "MIT", url: "https://tabler.io/icons",
    note: "outline + filled", variants: ["outline", "filled"], defaultVariant: "outline" },
  { id: "feather", name: "Feather", license: "MIT", url: "https://feathericons.com",
    note: "one stroke style", variants: [], defaultVariant: null },
  { id: "remix", name: "Remix Icon", license: "Apache-2.0", url: "https://remixicon.com",
    note: "line + fill", variants: ["line", "fill"], defaultVariant: "line" },
  { id: "bootstrap", name: "Bootstrap Icons", license: "MIT", url: "https://icons.getbootstrap.com",
    note: "one set", variants: [], defaultVariant: null },
  // CUSTOM — the escape hatch (mirrors the Fonts panel, where any family name may be typed). The kit
  // carries the user's own `name`/`variant` strings verbatim; no metadata to keep current.
  { id: "custom", name: "Custom", license: null, url: null, note: "name any set", variants: [], defaultVariant: null },
];

export const iconSystemById = (id) => ICON_SYSTEMS.find((s) => s.id === id) || null;

// iconSystem(config) — resolve `doc.icons` ({ id, variant?, name?, variantName? }) to the value every
// consumer reads: { id, name, variant, license, url, note }. Unknown/absent id ⇒ the default system;
// an invalid variant ⇒ that library's default. `custom` carries the user's typed name/variant verbatim
// (falling back to the label when empty), so a kit always names SOMETHING an agent can bind to.
export function iconSystem(config = {}) {
  const c = config && typeof config === "object" ? config : {};
  const sys = iconSystemById(c.id) || iconSystemById(DEFAULT_ICON_SYSTEM);
  if (sys.id === "custom") {
    const name = typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 60) : "Custom";
    const variant = typeof c.variantName === "string" && c.variantName.trim() ? c.variantName.trim().slice(0, 40) : null;
    return { id: "custom", name, variant, license: null, url: null, note: null };
  }
  const variant = sys.variants.includes(c.variant) ? c.variant : sys.defaultVariant;
  return { id: sys.id, name: sys.name, variant, license: sys.license, url: sys.url, note: sys.note };
}

// iconSystemLabel — "Phosphor · regular" / "Lucide" (a variant-less library) — the one-line form the
// DESIGN.md prose, the tokens.json note, and the MCP guide all use.
export const iconSystemLabel = (resolved) => (resolved.variant ? `${resolved.name} · ${resolved.variant}` : resolved.name);
