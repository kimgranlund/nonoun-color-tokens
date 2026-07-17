// migrations.mjs — the ACTIVE rename/retire migration maps (TKT-0012 capability; TKT-0013 will carry
// the ADR-016 kebab wave here). One module, imported by the app (float plans, color apply message,
// style plans) so every executor path receives the same maps. EMPTY maps = every pass is a no-op and
// the apply output is byte-identical (the identity gate in test/figma/plugin.mjs).
//
// Shape:
//   floats.collections — keyed by CURRENT moded-collection name:
//     { "Breakpoints": { renameFrom: ["Geometry"], vars: { "size/MD/paddingNarrow": "size/md/padding-narrow", … } } }
//   color — variable renames per color collection + collection renames (name-adopted, not registry):
//     { raw: { "<old>": "<new>" }, semantic: { … }, collections: { "<newName>": ["<oldName>", …] } }
//   styles — registry re-keys for renamed style names:
//     { paints: { "<old>": "<new>" }, texts: { … } }
//
// CONVENTION (recorded in TKT-0012): every ticket that renames an emitted variable, collection, or
// style name adds its map HERE in the same change — a rename without a map is a binding-breaking
// prune for every existing user file.
export const FIGMA_MIGRATIONS = {
  floats: { collections: {} },
  color: { raw: {}, semantic: {}, collections: {} },
  styles: { paints: {}, texts: {} },
};
